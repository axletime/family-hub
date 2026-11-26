import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfig, registerOverrideLoader, setConnectionOverrides } from './config';
import { hashPin } from './pin';
import { decryptSecret, encryptSecret } from './secretbox';
import { CONNECTION_VARS, SECRET_VARS } from './connectionFields';
import { defaultGroupAccess, FEATURE_IDS, type Access, type GroupAccess, type GroupId } from './features';

export type Role = 'admin' | 'member';
export type MediaType = 'movie' | 'tv' | 'music';
export type RequestStatus = 'pending' | 'approved' | 'downloading' | 'available' | 'declined' | 'failed';

export interface UserRow {
  id: number;
  name: string;
  pin_hash: string;
  role: Role;
  colour: string;
  created_at: string;
  notify_topic: string | null;
  notify_prefs: string | null;
  user_group: GroupId;
  /** Length of the current PIN, learnt when it is set or used to sign in (null = not known yet). */
  pin_len: number | null;
}

export interface RequestRow {
  id: number;
  user_id: number;
  media_type: MediaType;
  external_id: string;
  title: string;
  year: number | null;
  poster: string | null;
  overview: string | null;
  status: RequestStatus;
  arr_id: number | null;
  note: string | null;
  decided_by: number | null;
  created_at: string;
  updated_at: string;
}

const globalForDb = globalThis as unknown as { __familyHubDb?: Database.Database };

const PALETTE = ['#1B4F8A', '#2E7D5B', '#8A3B1B', '#6B3FA0', '#A0346B', '#B07D1A', '#2B7A8C', '#5A6B7D'];

export function randomColour(): string {
  return PALETTE[crypto.randomInt(PALETTE.length)];
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      colour TEXT NOT NULL DEFAULT '#1B4F8A',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS login_attempts (
      user_id INTEGER NOT NULL,
      attempted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(user_id, attempted_at);
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv','music')),
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      poster TEXT,
      overview TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      arr_id INTEGER,
      note TEXT,
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_requests_media ON requests(media_type, external_id);
    CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      request_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
  `);
  // Columns added after the first release: add them to existing databases in place.
  const cols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('notify_topic')) db.exec('ALTER TABLE users ADD COLUMN notify_topic TEXT');
  if (!cols.has('notify_prefs')) db.exec('ALTER TABLE users ADD COLUMN notify_prefs TEXT');
  if (!cols.has('user_group')) {
    // Groups: existing admins join Admin, everyone else joins Home.
    db.exec("ALTER TABLE users ADD COLUMN user_group TEXT NOT NULL DEFAULT 'home'");
    db.exec("UPDATE users SET user_group = CASE role WHEN 'admin' THEN 'admin' ELSE 'home' END");
  }
  if (!cols.has('pin_len')) db.exec('ALTER TABLE users ADD COLUMN pin_len INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      ip TEXT NOT NULL,
      network TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      success INTEGER NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events(ip, at);
    CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, at);
    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      main_url TEXT NOT NULL,
      sub_url TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedAdmin(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) return;
  const cfg = getConfig();
  let pin = cfg.adminPin;
  if (!/^\d{4,8}$/.test(pin)) {
    pin = String(crypto.randomInt(100000, 999999));
    console.warn(
      `[family-hub] ADMIN_PIN not set (or not 4-8 digits). Generated a one-off admin PIN for "${cfg.adminName}": ${pin}\n` +
        '[family-hub] Sign in and change it from Admin > Family members.',
    );
  }
  db.prepare("INSERT INTO users (name, pin_hash, role, colour, user_group, pin_len) VALUES (?, ?, ?, ?, 'admin', ?)").run(
    cfg.adminName,
    hashPin(pin),
    'admin',
    '#1B4F8A',
    pin.length,
  );
  console.log(`[family-hub] Seeded admin account "${cfg.adminName}".`);
}

export function getDb(): Database.Database {
  if (globalForDb.__familyHubDb) return globalForDb.__familyHubDb;
  const dataDir = (process.env.DATA_DIR || '').trim() || '/data';
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'family-hub.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  globalForDb.__familyHubDb = db;
  migrateLegacyConnectionSettings(db);
  loadConnectionOverrides(db);
  seedAdmin(db);
  return db;
}

/* ---------- Connection settings (Admin › Settings › Connections) ---------- */

const CONN = 'conn:';
const connState = globalThis as unknown as { __fhConnUnreadable?: Set<string> };

/** Names of saved secrets that could not be decrypted (e.g. APP_SECRET was changed). */
export function unreadableConnectionVars(): Set<string> {
  return connState.__fhConnUnreadable ?? new Set();
}

/** Read every saved connection value, decrypting secrets, and publish them to getConfig(). */
export function loadConnectionOverrides(db: Database.Database = getDb()) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'conn:%'").all() as { key: string; value: string }[];
  const values: Record<string, string> = {};
  const unreadable = new Set<string>();
  for (const { key, value } of rows) {
    const name = key.slice(CONN.length);
    if (!CONNECTION_VARS.includes(name)) continue;
    if (SECRET_VARS.includes(name)) {
      const plain = decryptSecret(value);
      if (plain === null) {
        unreadable.add(name);
        console.warn(`[family-hub] The saved ${name} could not be decrypted (has APP_SECRET or /data/.secret-key changed?). Falling back to .env; re-enter it on Admin › Settings › Connections.`);
      } else if (plain) values[name] = plain;
    } else if (value) values[name] = value;
  }
  connState.__fhConnUnreadable = unreadable;
  setConnectionOverrides(values);
}

/** Has a value been saved in the hub (even if it is currently unreadable)? */
export function savedConnectionVars(): Set<string> {
  const rows = getDb().prepare("SELECT key FROM settings WHERE key LIKE 'conn:%'").all() as { key: string }[];
  return new Set(rows.map((r) => r.key.slice(CONN.length)));
}

/** Save (string) or remove (null) connection values in one transaction, then reload them. */
export function saveConnectionValues(patch: Record<string, string | null>) {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare('DELETE FROM settings WHERE key = ?');
  db.transaction(() => {
    for (const [name, v] of Object.entries(patch)) {
      if (!CONNECTION_VARS.includes(name)) continue;
      if (v === null || v === '') del.run(CONN + name);
      else upsert.run(CONN + name, SECRET_VARS.includes(name) ? encryptSecret(v) : v);
    }
  })();
  loadConnectionOverrides(db);
}

/**
 * Earlier versions kept the ntfy server, public URL and a plain-text ntfy token
 * in the general settings. Move them into the (encrypted) connection store once.
 */
function migrateLegacyConnectionSettings(db: Database.Database) {
  const legacy: [string, string, boolean][] = [
    ['secret:ntfyToken', 'NTFY_TOKEN', true],
    ['ntfyUrl', 'NTFY_URL', false],
    ['publicUrl', 'PUBLIC_URL', false],
  ];
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING');
  const del = db.prepare('DELETE FROM settings WHERE key = ?');
  db.transaction(() => {
    for (const [oldKey, name, secret] of legacy) {
      const row = get.get(oldKey) as { value: string } | undefined;
      if (!row) continue;
      const v = secret ? row.value.trim() : row.value.trim().replace(/\/+$/, '');
      if (v) upsert.run(CONN + name, secret ? encryptSecret(v) : v);
      del.run(oldKey);
    }
  })();
}

registerOverrideLoader(() => {
  if (globalForDb.__familyHubDb) loadConnectionOverrides(globalForDb.__familyHubDb);
  else getDb();
});

/* ---------- Settings (admin-editable, override env defaults) ---------- */

export interface Settings {
  requireApproval: boolean;
  sonarrRootFolder: string;
  sonarrQualityProfileId: number | null;
  radarrRootFolder: string;
  radarrQualityProfileId: number | null;
  lidarrRootFolder: string;
  lidarrQualityProfileId: number | null;
  lidarrMetadataProfileId: number | null;
  haEntities: string[];
  /** Legacy (pre-groups) switch; now seeds the Home group's "haControl" permission. */
  familyCanControlHeating: boolean;
  /** New and changed PINs must be at least 6 digits (default on). */
  requireLongPins: boolean;
  /** IPs / CIDRs of reverse proxies whose X-Forwarded-* headers are trusted ("private" = any private address). */
  trustedProxies: string;
  notificationsEnabled: boolean;
  /** From the Connections page (or .env); read-only here. */
  ntfyUrl: string;
  ntfyTopicPrefix: string;
  /** From the Connections page (or .env); read-only here. */
  publicUrl: string;
}

export function getSettings(): Settings {
  const cfg = getConfig();
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (k: string, fb?: number) => (s[k] !== undefined && s[k] !== '' ? Number(s[k]) : fb ?? null);
  return {
    requireApproval: s.requireApproval !== undefined ? s.requireApproval === 'true' : cfg.requireApprovalDefault,
    sonarrRootFolder: s.sonarrRootFolder ?? cfg.sonarr.rootFolder ?? '',
    sonarrQualityProfileId: num('sonarrQualityProfileId', cfg.sonarr.qualityProfileId),
    radarrRootFolder: s.radarrRootFolder ?? cfg.radarr.rootFolder ?? '',
    radarrQualityProfileId: num('radarrQualityProfileId', cfg.radarr.qualityProfileId),
    lidarrRootFolder: s.lidarrRootFolder ?? cfg.lidarr.rootFolder ?? '',
    lidarrQualityProfileId: num('lidarrQualityProfileId', cfg.lidarr.qualityProfileId),
    lidarrMetadataProfileId: num('lidarrMetadataProfileId', cfg.lidarr.metadataProfileId),
    haEntities: s.haEntities !== undefined ? JSON.parse(s.haEntities) : cfg.ha.entities,
    familyCanControlHeating: s.familyCanControlHeating !== undefined ? s.familyCanControlHeating === 'true' : true,
    requireLongPins: s.requireLongPins !== undefined ? s.requireLongPins === 'true' : true,
    trustedProxies: s.trustedProxies ?? (process.env.TRUST_PROXY ?? '').trim(),
    notificationsEnabled: s.notificationsEnabled !== undefined ? s.notificationsEnabled === 'true' : cfg.ntfy.enabled,
    ntfyUrl: cfg.ntfy.url,
    ntfyTopicPrefix: s.ntfyTopicPrefix || cfg.ntfy.topicPrefix,
    publicUrl: cfg.publicUrl,
  };
}

export function saveSettings(patch: Partial<Settings>) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || k === 'ntfyUrl' || k === 'publicUrl') continue;
      stmt.run(k, k === 'haEntities' ? JSON.stringify(v) : v === null ? '' : String(v));
    }
  });
  tx();
}

/* ---------- Groups & permissions ---------- */

const ACCESS_VALUES: Access[] = ['off', 'on', 'lan'];

/** Saved group permissions merged over the defaults (so new features get sensible values). */
export function getGroupAccess(): GroupAccess {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'groupAccess'").get() as { value: string } | undefined;
  const def = defaultGroupAccess(getSettings().familyCanControlHeating);
  if (!row) return def;
  let saved: Partial<GroupAccess> = {};
  try {
    saved = JSON.parse(row.value);
  } catch {
    return def;
  }
  const merge = (g: 'admin' | 'home' | 'outside') => {
    const out = { ...def[g] };
    for (const f of FEATURE_IDS) {
      const v = saved[g]?.[f];
      if (v && ACCESS_VALUES.includes(v)) out[f] = g === 'admin' && v === 'off' ? 'on' : v;
    }
    return out;
  };
  const name = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 24) : fb);
  return {
    names: { home: name(saved.names?.home, def.names.home), outside: name(saved.names?.outside, def.names.outside) },
    admin: merge('admin'),
    home: merge('home'),
    outside: merge('outside'),
  };
}

export function saveGroupAccess(next: GroupAccess) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('groupAccess', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(next));
}
