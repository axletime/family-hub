import 'server-only';
import { getConfig } from './config';
import { fetchJson, ServiceError } from './http';
import type { HaClimate, HaEntity, HaKind, HaWaterHeater } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONTROLLABLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean']);
/** Domains shown as heating / hot water cards rather than readings. */
export const HEATING_DOMAINS = new Set(['climate', 'water_heater']);

/**
 * The only Home Assistant services the hub will ever call. Anything else is
 * refused before a request is made, whatever the browser sends.
 */
export const ALLOWED_SERVICES = new Set([
  'light.toggle',
  'switch.toggle',
  'fan.toggle',
  'input_boolean.toggle',
  'climate.set_temperature',
  'climate.set_hvac_mode',
  'climate.set_preset_mode',
  'water_heater.set_operation_mode',
  'hive.boost_heating_on',
  'hive.boost_heating_off',
  'hive.boost_hot_water',
]);

function ha<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = getConfig().ha;
  if (!token) throw new ServiceError('Home Assistant', 'HA_TOKEN not configured');
  return fetchJson<T>('Home Assistant', `${url}/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

export async function haStatus(): Promise<{ version?: string }> {
  const cfg = await ha<{ version?: string }>('/config');
  return { version: cfg?.version };
}

export function classify(entityId: string, attrs: Record<string, any> = {}): HaKind {
  const domain = entityId.split('.')[0];
  if (domain === 'light') return 'light';
  if (domain === 'switch' || domain === 'fan' || domain === 'input_boolean') return 'switch';
  if (domain === 'person' || domain === 'device_tracker') return 'presence';
  if (domain === 'climate' || attrs.device_class === 'temperature' || /°[CF]/.test(attrs.unit_of_measurement ?? '')) return 'temperature';
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensor';
  return 'other';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function climateDetails(s: any): HaClimate {
  const a = s.attributes ?? {};
  const presetMode = a.preset_mode != null ? String(a.preset_mode) : null;
  const step = num(a.target_temp_step) ?? 0.5;
  return {
    currentTemperature: num(a.current_temperature),
    targetTemperature: num(a.temperature),
    minTemp: num(a.min_temp) ?? 5,
    maxTemp: num(a.max_temp) ?? 32,
    step: step > 0 ? step : 0.5,
    mode: String(s.state),
    modes: strList(a.hvac_modes),
    action: a.hvac_action != null ? String(a.hvac_action) : null,
    presetMode,
    presetModes: strList(a.preset_modes),
    boostActive: presetMode === 'boost',
  };
}

export function waterDetails(s: any): HaWaterHeater {
  const a = s.attributes ?? {};
  return { mode: String(a.current_operation ?? s.state), modes: strList(a.operation_list) };
}

export function toEntity(s: any): HaEntity {
  const attrs = s.attributes ?? {};
  const domain = s.entity_id.split('.')[0];
  const kind = classify(s.entity_id, attrs);
  let state = String(s.state);
  let unit = attrs.unit_of_measurement as string | undefined;
  if (domain === 'climate') {
    state = attrs.current_temperature !== undefined ? String(attrs.current_temperature) : state;
    unit = unit ?? '°C';
  }
  return {
    entityId: s.entity_id,
    name: attrs.friendly_name ?? s.entity_id,
    domain,
    state,
    unit,
    kind,
    controllable: CONTROLLABLE_DOMAINS.has(domain),
    available: !['unavailable', 'unknown'].includes(String(s.state)),
    ...(domain === 'climate' ? { climate: climateDetails(s) } : {}),
    ...(domain === 'water_heater' ? { water: waterDetails(s) } : {}),
  };
}

/** Raw state of one entity. */
export async function getState(entityId: string): Promise<any | null> {
  try {
    return await ha(`/states/${entityId}`);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) return null;
    throw e;
  }
}

/** Entities in the given domains, for the admin picker. */
export async function listEntities(domains: string[]): Promise<{ entityId: string; name: string }[]> {
  const all: any[] = await ha('/states');
  return all
    .filter((s) => domains.includes(String(s.entity_id).split('.')[0]))
    .map((s) => ({ entityId: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id }))
    .sort((a, b) => a.entityId.localeCompare(b.entityId));
}

/** Call an allowlisted Home Assistant service. */
export async function callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
  if (!ALLOWED_SERVICES.has(`${domain}.${service}`)) throw new ServiceError('Home Assistant', `${domain}.${service} is not allowed`);
  await ha(`/services/${domain}/${service}`, { method: 'POST', body: JSON.stringify(data) });
}

export async function getEntities(ids: string[]): Promise<HaEntity[]> {
  if (!ids.length) return [];
  const all: any[] = await ha('/states');
  const byId = new Map(all.map((s) => [s.entity_id, s]));
  return ids.map((id) =>
    byId.has(id)
      ? toEntity(byId.get(id))
      : { entityId: id, name: id, domain: id.split('.')[0], state: 'not found', kind: classify(id), controllable: false, available: false },
  );
}

export async function toggleEntity(entityId: string): Promise<void> {
  const domain = entityId.split('.')[0];
  if (!CONTROLLABLE_DOMAINS.has(domain)) throw new ServiceError('Home Assistant', `${domain} entities cannot be toggled`);
  await callService(domain, 'toggle', { entity_id: entityId });
}
