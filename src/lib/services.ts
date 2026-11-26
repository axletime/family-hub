import 'server-only';
import { getConfig, type ArrKind } from './config';
import * as arr from './arr';
import * as mock from './mock';
import { plexStatus } from './plex';
import { getEntities, haStatus, toggleEntity, CONTROLLABLE_DOMAINS } from './ha';
import { getSettings } from './db';
import type { HaEntity, MediaOverview, ServiceStatus } from './types';

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

/* ---------------- *arr wrappers ---------------- */

export const lookup = (k: ArrKind, term: string) => (demo() ? Promise.resolve(mock.demoLookup(k, term)) : arr.lookup(k, term));
export const getLibrary = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoLibrary(k)) : arr.getLibrary(k));
export const getQueuedArrIds = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoQueuedIds(k)) : arr.getQueuedArrIds(k));
export const getOptions = (k: ArrKind) => (demo() ? Promise.resolve(mock.demoOptions(k)) : arr.getOptions(k));
export const addToArr = (k: ArrKind, externalId: string) =>
  demo() ? Promise.resolve(mock.demoAdd(k, externalId)) : arr.addToArr(k, externalId, getSettings());
export const isArrAvailable = (k: ArrKind) => demo() || arr.isConfigured(k);
