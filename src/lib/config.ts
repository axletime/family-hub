import 'server-only';

/**
 * Central configuration. Everything is read from environment variables at
 * runtime (never at build time) so the same Docker image works on any server.
 * Nothing in this file is ever sent to the browser.
 */

/**
 * Values saved on the Admin › Connections page override the environment.
 * They live in SQLite (see connections.ts) and are mirrored here in memory,
 * on globalThis so every route bundle in the process sees the same copy.
 */
type OverrideState = { __fhOverrides?: Record<string, string>; __fhOverrideLoader?: () => void; __fhOverrideBusy?: boolean };
const og = globalThis as unknown as OverrideState;

function overrides(): Record<string, string> {
  if (og.__fhOverrides) return og.__fhOverrides;
  if (og.__fhOverrideLoader && !og.__fhOverrideBusy) {
    og.__fhOverrideBusy = true;
    try {
      og.__fhOverrideLoader();
    } catch (e) {
      console.error('[family-hub] could not load saved connection settings', e);
    } finally {
      og.__fhOverrideBusy = false;
    }
  }
  return og.__fhOverrides ?? {};
}

/** Replace the in-memory copy of saved connection values (called after every save). */
export function setConnectionOverrides(values: Record<string, string>) {
  og.__fhOverrides = values;
}

export function registerOverrideLoader(fn: () => void) {
  og.__fhOverrideLoader = fn;
}

/** The raw environment value, ignoring anything saved in the hub. */
export function envValue(name: string): string {
  const v = process.env[name];
  return v === undefined ? '' : v.trim();
}

function str(name: string, fallback = ''): string {
  const o = overrides()[name];
  if (o) return o.trim();
  const v = envValue(name);
  return v === '' ? fallback : v;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function int(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export type ArrKind = 'sonarr' | 'radarr' | 'lidarr';

export interface ArrConfig {
  kind: ArrKind;
  url: string;
  publicUrl: string;
  apiKey: string;
  apiVersion: 'v3' | 'v1';
  rootFolder?: string;
  qualityProfileId?: number;
  metadataProfileId?: number;
}

export function getConfig() {
  const arr = (kind: ArrKind, defUrl: string, apiVersion: 'v3' | 'v1'): ArrConfig => {
    const prefix = kind.toUpperCase();
    const url = stripSlash(str(`${prefix}_URL`, defUrl));
    return {
      kind,
      url,
      publicUrl: stripSlash(str(`${prefix}_PUBLIC_URL`, url)),
      apiKey: str(`${prefix}_API_KEY`),
      apiVersion,
      rootFolder: str(`${prefix}_ROOT_FOLDER`) || undefined,
      qualityProfileId: int(`${prefix}_QUALITY_PROFILE_ID`),
      metadataProfileId: int(`${prefix}_METADATA_PROFILE_ID`),
    };
  };

  const plexUrl = stripSlash(str('PLEX_URL', 'http://192.168.1.202:32400'));
  const haUrl = stripSlash(str('HA_URL', 'http://homeassistant.local:8123'));

  return {
    demoMode: bool('DEMO_MODE', false),
    dataDir: str('DATA_DIR', '/data'),
    cookieSecure: bool('COOKIE_SECURE', false),
    sessionDays: int('SESSION_DAYS') ?? 30,
    adminName: str('ADMIN_NAME', 'Andrew'),
    adminPin: str('ADMIN_PIN'),
    requireApprovalDefault: bool('REQUIRE_APPROVAL', false),
    sonarr: arr('sonarr', 'http://192.168.1.200:8989', 'v3'),
    radarr: arr('radarr', 'http://192.168.1.200:7878', 'v3'),
    lidarr: arr('lidarr', 'http://192.168.1.200:8686', 'v1'),
    plex: {
      url: plexUrl,
      publicUrl: stripSlash(str('PLEX_PUBLIC_URL', `${plexUrl}/web`)),
      token: str('PLEX_TOKEN'),
    },
    ha: {
      url: haUrl,
      publicUrl: stripSlash(str('HA_PUBLIC_URL', haUrl)),
      token: str('HA_TOKEN'),
      entities: str('HA_ENTITIES')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    },
    tmdb: { apiKey: str('TMDB_API_KEY'), region: str('TMDB_REGION', 'GB'), language: str('TMDB_LANGUAGE', 'en-GB') },
    publicUrl: stripSlash(str('PUBLIC_URL', 'http://192.168.1.201:3000')),
    ntfy: {
      enabled: bool('NOTIFICATIONS_ENABLED', true),
      url: stripSlash(str('NTFY_URL', 'https://ntfy.sh')),
      token: str('NTFY_TOKEN'),
      topicPrefix: str('NTFY_TOPIC_PREFIX', 'familyhub'),
      pollMinutes: int('NOTIFY_POLL_MINUTES') ?? 5,
    },
    go2rtc: { url: stripSlash(str('GO2RTC_URL', 'http://192.168.1.201:1984')) },
    webhookSecret: str('WEBHOOK_SECRET'),
    recCacheHours: int('REC_CACHE_HOURS') ?? 6,
    requestTimeoutMs: int('SERVICE_TIMEOUT_MS') ?? 8000,
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
