import 'server-only';
import crypto from 'node:crypto';
import { envValue, getConfig } from './config';
import { CONNECTIONS, type ConnectionDef, type ConnectionId } from './connectionFields';
import { saveConnectionValues, savedConnectionVars, unreadableConnectionVars } from './db';
import { fetchJson } from './http';
import { invalidateLibrary } from './arr';
import { clearRecommendationCache } from './recommend';
import { restartStatusPoller } from './requests';
import { describeError, ntfyAuthHeader } from './notify';
import { HttpError } from './auth';

export type Source = 'hub' | 'env' | 'none';

export interface FieldView {
  name: string;
  source: Source;
  /** Plain value (addresses only — never secrets). */
  value?: string;
  /** "••••••••abcd" for secrets that are set. */
  masked?: string;
  envSet: boolean;
  /** Saved in the hub but cannot be decrypted with the current key. */
  unreadable?: boolean;
}

export interface ConnectionView {
  id: ConnectionId;
  name: string;
  help: string;
  testable: boolean;
  url?: FieldView & { label: string; placeholder?: string };
  secret?: FieldView & { label: string };
}

export function mask(secret: string): string {
  return '••••••••' + (secret.length > 8 ? secret.slice(-4) : '');
}

/** The value currently in force for an environment-style name (saved value, then .env). */
function effective(def: ConnectionDef, kind: 'url' | 'secret'): string {
  const cfg = getConfig();
  const map: Record<ConnectionId, { url?: string; secret?: string }> = {
    sonarr: { url: cfg.sonarr.url, secret: cfg.sonarr.apiKey },
    radarr: { url: cfg.radarr.url, secret: cfg.radarr.apiKey },
    lidarr: { url: cfg.lidarr.url, secret: cfg.lidarr.apiKey },
    plex: { url: cfg.plex.url, secret: cfg.plex.token },
    homeassistant: { url: cfg.ha.url, secret: cfg.ha.token },
    tmdb: { secret: cfg.tmdb.apiKey },
    ntfy: { url: cfg.ntfy.url, secret: cfg.ntfy.token },
    go2rtc: { url: cfg.go2rtc.url },
    webhook: { secret: cfg.webhookSecret },
    public: { url: cfg.publicUrl },
  };
  return map[def.id][kind] ?? '';
}

export function connectionsView(): ConnectionView[] {
  const saved = savedConnectionVars();
  const unreadable = unreadableConnectionVars();
  const sourceOf = (name: string): Source => {
    if (saved.has(name) && !unreadable.has(name)) return 'hub';
    return envValue(name) ? 'env' : 'none';
  };
  return CONNECTIONS.map((def) => {
    const v: ConnectionView = { id: def.id, name: def.name, help: def.help, testable: def.testable };
    if (def.urlVar) {
      const source = sourceOf(def.urlVar);
      v.url = {
        name: def.urlVar,
        label: def.urlLabel ?? 'Address',
        placeholder: def.defaultUrl,
        source,
        // Show the default address as "Not set" but still pre-fill it, as that is what is used.
        value: effective(def, 'url'),
        envSet: Boolean(envValue(def.urlVar)),
      };
    }
    if (def.secretVar) {
      const source = sourceOf(def.secretVar);
      const secret = effective(def, 'secret');
      v.secret = {
        name: def.secretVar,
        label: def.secretLabel ?? 'Secret',
        source,
        masked: secret ? mask(secret) : undefined,
        envSet: Boolean(envValue(def.secretVar)),
        unreadable: unreadable.has(def.secretVar) || undefined,
      };
    }
    return v;
  });
}

const URL_RE = /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;

export function normaliseUrl(raw: string, label: string): string {
  const v = raw.trim().replace(/\/+$/, '');
  if (v && !URL_RE.test(v)) throw new HttpError(400, `${label}: "${v.slice(0, 80)}" is not a valid http(s) address, e.g. http://192.168.1.200:8989`);
  return v.slice(0, 300);
}

function normaliseSecret(raw: string, label: string): string {
  const v = raw.trim();
  if (/\s/.test(v)) throw new HttpError(400, `${label} cannot contain spaces.`);
  if (v.length > 2000) throw new HttpError(400, `${label} is too long.`);
  return v;
}

export interface SavePatch {
  /** Map of variable name → new value. For addresses "" means "revert to .env". For secrets "" means "keep". */
  values?: Record<string, unknown>;
  /** Variable names to remove from the hub (reverting to .env). */
  clear?: unknown[];
}

/** Validate and save, then refresh everything that depends on these values. Returns the names changed. */
export function saveConnections(patch: SavePatch): string[] {
  const out: Record<string, string | null> = {};
  for (const def of CONNECTIONS) {
    const vals = patch.values ?? {};
    if (def.urlVar && vals[def.urlVar] !== undefined && vals[def.urlVar] !== null) {
      const url = normaliseUrl(String(vals[def.urlVar]), `${def.name} ${def.urlLabel ?? 'address'}`);
      // Saving the .env (or default) value again is the same as not overriding it.
      out[def.urlVar] = url && url !== (envValue(def.urlVar).replace(/\/+$/, '') || def.defaultUrl) ? url : null;
    }
    if (def.secretVar && typeof vals[def.secretVar] === 'string') {
      const secret = normaliseSecret(vals[def.secretVar] as string, `${def.name} ${def.secretLabel ?? 'secret'}`);
      if (secret) out[def.secretVar] = secret; // blank = keep existing
    }
  }
  const allowed = new Set(CONNECTIONS.flatMap((c) => [c.urlVar, c.secretVar].filter(Boolean) as string[]));
  for (const name of patch.clear ?? []) {
    if (typeof name !== 'string' || !allowed.has(name)) throw new HttpError(400, `Unknown setting "${String(name).slice(0, 40)}".`);
    out[name] = null;
  }
  if (!Object.keys(out).length) return [];
  saveConnectionValues(out);
  refreshAfterChange();
  return Object.keys(out);
}

/** Drop anything built from the old values so the next request uses the new ones. */
export function refreshAfterChange() {
  for (const k of ['sonarr', 'radarr', 'lidarr'] as const) invalidateLibrary(k);
  clearRecommendationCache();
  try {
    restartStatusPoller();
  } catch (e) {
    console.error('[family-hub] could not restart the status poller', e);
  }
}

/* ---------------- Test connection ---------------- */

export interface TestResult {
  ok: boolean;
  message: string;
  version?: string;
}

function readable(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 401|HTTP 403/.test(msg)) return `${msg} — the key or token was rejected.`;
  if (/HTTP 404/.test(msg)) return `${msg} — is the address right (including any URL base)?`;
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return `${msg} — the host name could not be found.`;
  if (/ECONNREFUSED/.test(msg)) return `${msg} — nothing is listening at that address and port.`;
  return msg;
}

/**
 * Check a service using the values typed into the form (if any), falling back
 * to the saved/.env values. A blank secret means "use the current one".
 */
export async function testConnection(id: string, input: { url?: unknown; secret?: unknown }): Promise<TestResult> {
  const def = CONNECTIONS.find((c) => c.id === id);
  if (!def) throw new HttpError(400, 'Unknown service.');
  if (!def.testable) throw new HttpError(400, `${def.name} cannot be tested.`);

  const typedUrl = typeof input.url === 'string' ? input.url.trim() : '';
  const typedSecret = typeof input.secret === 'string' ? input.secret.trim() : '';
  let url = '';
  if (def.urlVar) {
    url = typedUrl ? normaliseUrl(typedUrl, def.name) : effective(def, 'url');
    if (!url) return { ok: false, message: 'Enter an address first.' };
  }
  const secret = typedSecret || (def.secretVar ? effective(def, 'secret') : '');

  if (getConfig().demoMode) {
    return { ok: true, version: 'demo', message: `Demo mode: ${def.name} was not contacted.` };
  }

  const timeoutMs = 8000;
  try {
    switch (def.id) {
      case 'sonarr':
      case 'radarr':
      case 'lidarr': {
        if (!secret) return { ok: false, message: 'Enter the API key first.' };
        const v = def.id === 'lidarr' ? 'v1' : 'v3';
        const s = await fetchJson<{ version?: string; appName?: string }>(def.name, `${url}/api/${v}/system/status`, {
          headers: { 'X-Api-Key': secret, Accept: 'application/json' },
          timeoutMs,
        });
        if (!s?.version) return { ok: false, message: `Something answered at ${url}, but it does not look like ${def.name}.` };
        return { ok: true, version: s.version, message: `Connected to ${s.appName ?? def.name} ${s.version}.` };
      }
      case 'plex': {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (secret) headers['X-Plex-Token'] = secret;
        const d = await fetchJson<{ MediaContainer?: { version?: string } }>('Plex', `${url}/identity`, { headers, timeoutMs });
        const version = d?.MediaContainer?.version;
        if (!version) return { ok: false, message: `Something answered at ${url}, but it does not look like Plex.` };
        if (secret) {
          // /identity answers without a token, so check the token separately.
          await fetchJson('Plex', `${url}/library/sections`, { headers, timeoutMs });
          return { ok: true, version, message: `Connected to Plex ${version}; token accepted.` };
        }
        return { ok: true, version, message: `Reached Plex ${version}. No token set, so "Now playing" and library details are unavailable.` };
      }
      case 'homeassistant': {
        if (!secret) return { ok: false, message: 'Enter a long-lived access token first.' };
        const headers = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
        await fetchJson('Home Assistant', `${url}/api/`, { headers, timeoutMs });
        const c = await fetchJson<{ version?: string; location_name?: string }>('Home Assistant', `${url}/api/config`, { headers, timeoutMs });
        return { ok: true, version: c?.version, message: `Connected to Home Assistant ${c?.version ?? ''}${c?.location_name ? ` (${c.location_name})` : ''}.`.replace(' .', '.') };
      }
      case 'tmdb': {
        if (!secret) return { ok: false, message: 'Enter a TMDB API key first.' };
        const headers: Record<string, string> = { Accept: 'application/json' };
        const qs = new URLSearchParams();
        if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`;
        else qs.set('api_key', secret);
        await fetchJson('TMDB', `https://api.themoviedb.org/3/configuration?${qs}`, { headers, timeoutMs });
        return { ok: true, message: 'TMDB accepted the key.' };
      }
      case 'ntfy': {
        const topic = `familyhub-test-${crypto.randomBytes(6).toString('hex')}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const auth = ntfyAuthHeader(secret);
        if (auth) headers.Authorization = auth;
        try {
          const res = await fetch(`${url}/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ topic, title: 'Family Hub', message: 'Connection test from Family Hub.', priority: 1 }),
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
          });
          if (!res.ok) {
            let detail = res.statusText;
            try {
              detail = ((await res.json()) as { error?: string }).error || detail;
            } catch {
              /* keep statusText */
            }
            throw new Error(`ntfy: HTTP ${res.status} ${detail}`.trim());
          }
        } catch (e) {
          throw new Error(describeError(e).replace(/^ntfy /, 'ntfy: '));
        }
        let version: string | undefined;
        try {
          version = (await fetchJson<{ version?: string }>('ntfy', `${url}/v1/version`, { headers: auth ? { Authorization: auth } : {}, timeoutMs }))?.version;
        } catch {
          /* ntfy.sh and older servers do not expose this */
        }
        return { ok: true, version, message: `Test message published to ${url.replace(/^https?:\/\//, '')}${version ? ` (ntfy ${version})` : ''}.` };
      }
      case 'go2rtc': {
        const streams = await fetchJson<Record<string, unknown>>('go2rtc', `${url}/api/streams`, { timeoutMs });
        if (!streams || typeof streams !== 'object') return { ok: false, message: `Something answered at ${url}, but it does not look like go2rtc.` };
        let version: string | undefined;
        try {
          version = (await fetchJson<{ version?: string }>('go2rtc', `${url}/api`, { timeoutMs }))?.version;
        } catch {
          /* older versions */
        }
        const n = Object.keys(streams).length;
        return { ok: true, version, message: `Connected to go2rtc${version ? ` ${version}` : ''}; ${n} stream${n === 1 ? '' : 's'} registered.` };
      }
      case 'public': {
        const h = await fetchJson<{ ok?: boolean }>('Family Hub', `${url}/api/health`, { timeoutMs });
        return h?.ok === false
          ? { ok: false, message: `${url} answered, but reported a problem.` }
          : { ok: true, message: `Family Hub answered at ${url}. Check this is also the address family members use.` };
      }
      default:
        return { ok: false, message: 'Nothing to test.' };
    }
  } catch (e) {
    return { ok: false, message: readable(e) };
  }
}
