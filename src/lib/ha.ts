import 'server-only';
import { getConfig } from './config';
import { fetchJson, ServiceError } from './http';
import type { HaEntity, HaKind } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONTROLLABLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean']);

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
  };
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
  await ha(`/services/${domain}/toggle`, { method: 'POST', body: JSON.stringify({ entity_id: entityId }) });
}
