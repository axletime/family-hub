import 'server-only';
import { getConfig, type ArrKind } from './config';
import * as arr from './arr';
import * as mock from './mock';
import { plexStatus } from './plex';
import { callService, climateDetails, getEntities, getState, haStatus, listEntities, toggleEntity, waterDetails, CONTROLLABLE_DOMAINS, HEATING_DOMAINS } from './ha';
import { ServiceError } from './http';
import { getSettings } from './db';
import type { HaEntity, HeatingAction, MediaOverview, ServiceStatus } from './types';

/**
 * Facade over the real integrations and demo mode. Route handlers only ever
 * call these functions, so switching DEMO_MODE on/off is transparent.
 */

const demo = () => getConfig().demoMode;
const ARR_KINDS: ArrKind[] = ['sonarr', 'radarr', 'lidarr'];

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getStatuses(): Promise<ServiceStatus[]> {
  const cfg = getConfig();
  if (demo()) {
    return [
      { id: 'sonarr', name: 'Sonarr', online: true, configured: true, version: '4.0.11', link: cfg.sonarr.publicUrl },
      { id: 'radarr', name: 'Radarr', online: true, configured: true, version: '5.16.3', link: cfg.radarr.publicUrl },
      { id: 'lidarr', name: 'Lidarr', online: true, configured: true, version: '2.8.2', link: cfg.lidarr.publicUrl },
      { id: 'plex', name: 'Plex', online: true, configured: true, version: '1.41.3', link: cfg.plex.publicUrl },
      { id: 'homeassistant', name: 'Home Assistant', online: false, configured: true, message: 'Demo: shown offline as an example', link: cfg.ha.publicUrl },
    ];
  }
  const names: Record<ArrKind, string> = { sonarr: 'Sonarr', radarr: 'Radarr', lidarr: 'Lidarr' };
  const [s, r, l, p, h] = await Promise.all([
    ...ARR_KINDS.map((k) => (arr.isConfigured(k) ? settle(arr.arrStatus(k)) : Promise.resolve(null))),
    settle(plexStatus()),
    cfg.ha.token ? settle(haStatus()) : Promise.resolve(null),
  ]);
  const build = (id: ServiceStatus['id'], name: string, link: string, res: Awaited<ReturnType<typeof settle<{ version?: string }>>> | null): ServiceStatus =>
    res === null
      ? { id, name, link, online: false, configured: false, message: 'Not configured' }
      : res.ok
        ? { id, name, link, online: true, configured: true, version: res.value.version }
        : { id, name, link, online: false, configured: true, message: res.error };
  return [
    build('sonarr', names.sonarr, cfg.sonarr.publicUrl, s),
    build('radarr', names.radarr, cfg.radarr.publicUrl, r),
    build('lidarr', names.lidarr, cfg.lidarr.publicUrl, l),
    build('plex', 'Plex', cfg.plex.publicUrl, p),
    build('homeassistant', 'Home Assistant', cfg.ha.publicUrl, h),
  ];
}

export async function getMediaOverview(): Promise<MediaOverview> {
  if (demo()) {
    return {
      queue: mock.demoQueue(),
      recent: mock.demoRecent(),
      upcomingTv: mock.demoCalendarTv(),
      upcomingMovies: mock.demoCalendarMovies(),
      errors: [],
    };
  }
  const kinds = ARR_KINDS.filter(arr.isConfigured);
  const errors: string[] = [];
  const collect = <T,>(results: Awaited<ReturnType<typeof settle<T>>>[]): T[] =>
    results.flatMap((r) => {
      if (r.ok) return [r.value];
      if (!errors.includes(r.error)) errors.push(r.error);
      return [];
    });
  const [queues, recents, tv, movies] = await Promise.all([
    Promise.all(kinds.map((k) => settle(arr.getQueue(k)))),
    Promise.all(kinds.map((k) => settle(arr.getRecent(k, 8)))),
    kinds.includes('sonarr') ? settle(arr.getSonarrCalendar(14)) : Promise.resolve(null),
    kinds.includes('radarr') ? settle(arr.getRadarrCalendar(60)) : Promise.resolve(null),
  ]);
  return {
    queue: collect(queues).flat(),
    recent: collect(recents)
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12),
    upcomingTv: tv ? collect([tv]).flat() : [],
    upcomingMovies: movies ? collect([movies]).flat() : [],
    errors,
  };
}

export function haEntityIds(): string[] {
  const ids = getSettings().haEntities;
  return demo() && !ids.length ? mock.DEMO_HA_ENTITIES : ids;
}

export async function getHaEntities(): Promise<{ entities: HaEntity[]; error?: string }> {
  const ids = haEntityIds();
  if (demo()) return { entities: mock.demoHaEntities(ids) };
  if (!getConfig().ha.token) return { entities: [], error: 'Home Assistant is not configured (set HA_URL and HA_TOKEN).' };
  try {
    return { entities: await getEntities(ids) };
  } catch (e) {
    return { entities: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleHaEntity(entityId: string): Promise<void> {
  // Only entities on the configured list can be controlled from the hub.
  if (!haEntityIds().includes(entityId)) throw new Error('That entity is not on the dashboard list.');
  if (!CONTROLLABLE_DOMAINS.has(entityId.split('.')[0])) throw new Error('Only lights and switches can be toggled.');
  if (demo()) return mock.demoHaToggle(entityId);
  await toggleEntity(entityId);
}

/* ---------------- Heating & hot water (e.g. Hive) ---------------- */

const CLIMATE_MODES = ['heat', 'auto', 'off'];
const WATER_MODES = ['on', 'off', 'eco'];
const HEATING_BOOST_MINUTES = [30, 60, 120];
const WATER_BOOST_MINUTES = [30, 60];

const timePeriod = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
const isMissingService = (e: unknown) => e instanceof ServiceError && (e.status === 400 || e.status === 404);

/** Admin picker: climate.* / water_heater.* entities that exist in Home Assistant. */
export async function listHeatingEntities(): Promise<{ entities: { entityId: string; name: string }[]; error?: string }> {
  const domains = [...HEATING_DOMAINS];
  if (demo()) return { entities: mock.demoHaList(domains) };
  if (!getConfig().ha.token) return { entities: [], error: 'Home Assistant is not connected yet (add it on Connections).' };
  try {
    return { entities: await listEntities(domains) };
  } catch (e) {
    return { entities: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Change a heating / hot water entity. The entity must be on the admin's list,
 * every value is validated against the entity's own limits and only allowlisted
 * services are called. Returns a note when a fallback was used.
 */
export async function controlHeating(entityId: string, req: HeatingAction): Promise<{ note?: string }> {
  const domain = entityId.split('.')[0];
  if (!HEATING_DOMAINS.has(domain)) throw new Error('Only heating and hot water entities can be controlled here.');
  if (!haEntityIds().includes(entityId)) throw new Error('That entity is not on the dashboard list.');
  const state = demo() ? mock.demoHaState(entityId) : await getState(entityId);
  if (!state) throw new Error(`${entityId} was not found in Home Assistant.`);
  if (['unavailable', 'unknown'].includes(String(state.state))) throw new Error(`${state.attributes?.friendly_name ?? entityId} is unavailable right now.`);
  const call = (d: string, svc: string, data: Record<string, unknown>) => (demo() ? Promise.resolve(mock.demoHaCall(d, svc, data)) : callService(d, svc, data));

  if (domain === 'climate') {
    const c = climateDetails(state);
    const clamp = (t: number) => Math.min(c.maxTemp, Math.max(c.minTemp, Math.round(t * 2) / 2));
    switch (req.action) {
      case 'set_temperature': {
        if (typeof req.temperature !== 'number' || !Number.isFinite(req.temperature)) throw new Error('Invalid temperature.');
        await call('climate', 'set_temperature', { entity_id: entityId, temperature: clamp(req.temperature) });
        return {};
      }
      case 'set_mode': {
        if (!CLIMATE_MODES.includes(req.mode) || (c.modes.length && !c.modes.includes(req.mode))) throw new Error('That mode is not supported by this thermostat.');
        await call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: req.mode });
        return {};
      }
      case 'boost_on': {
        if (!HEATING_BOOST_MINUTES.includes(req.minutes)) throw new Error('Boost can be 30 minutes, 1 hour or 2 hours.');
        const base = c.targetTemperature ?? c.currentTemperature ?? 20;
        const temperature = clamp(typeof req.temperature === 'number' && Number.isFinite(req.temperature) ? req.temperature : base + 1);
        try {
          await call('hive', 'boost_heating_on', { entity_id: entityId, time_period: timePeriod(req.minutes), temperature });
          return {};
        } catch (e) {
          if (!isMissingService(e)) throw e;
          if (!c.presetModes.includes('boost')) throw new Error('Boost is not available: the Hive boost service was not found in Home Assistant and this thermostat has no boost preset.');
          await call('climate', 'set_preset_mode', { entity_id: entityId, preset_mode: 'boost' });
          return { note: 'The Hive boost service was not available, so the thermostat’s own boost preset was used (its default length and temperature).' };
        }
      }
      case 'boost_off': {
        try {
          await call('hive', 'boost_heating_off', { entity_id: entityId });
          return {};
        } catch (e) {
          if (!isMissingService(e)) throw e;
          if (!c.presetModes.includes('none')) throw new Error('Could not cancel the boost: the Hive boost service was not found in Home Assistant.');
          await call('climate', 'set_preset_mode', { entity_id: entityId, preset_mode: 'none' });
          return {};
        }
      }
    }
  } else {
    const w = waterDetails(state);
    switch (req.action) {
      case 'set_mode': {
        if (!WATER_MODES.includes(req.mode) || (w.modes.length && !w.modes.includes(req.mode))) throw new Error('That hot water mode is not supported.');
        await call('water_heater', 'set_operation_mode', { entity_id: entityId, operation_mode: req.mode });
        return {};
      }
      case 'boost_on':
      case 'boost_off': {
        if (req.action === 'boost_on' && !WATER_BOOST_MINUTES.includes(req.minutes)) throw new Error('Hot water boost can be 30 minutes or 1 hour.');
        const minutes = req.action === 'boost_on' ? req.minutes : 30;
        try {
          await call('hive', 'boost_hot_water', { entity_id: entityId, time_period: timePeriod(minutes), on_off: req.action === 'boost_on' ? 'on' : 'off' });
          return {};
        } catch (e) {
          if (isMissingService(e)) throw new Error('Hot water boost is not available: the Hive boost service was not found in Home Assistant.');
          throw e;
        }
      }
    }
  }
  throw new Error('Unsupported action.');
}

/* ---------------- *arr wrappers ---------------- */

export const lookup = (k: ArrKind, term: string) => (demo() ? Promise.resolve(mock.demoLookup(k, term)) : arr.lookup(k, term));
export const getLibrary = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoLibrary(k)) : arr.getLibrary(k));
export const getQueuedArrIds = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoQueuedIds(k)) : arr.getQueuedArrIds(k));
export const getOptions = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoOptions(k)) : arr.getOptions(k));
export const addToArr = (k: ArrKind, externalId: string) =>
  demo() ? Promise.resolve(mock.demoAdd(k, externalId)) : arr.addToArr(k, externalId, getSettings());
export const isArrAvailable = (k: ArrKind) => demo() || arr.isConfigured(k);
