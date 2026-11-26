import 'server-only';
import { getDb } from './db';
import type { ClientInfo } from './network';

/**
 * Sign-in brute-force protection.
 *
 * - Per address: 10 wrong PINs (any profile) lock that address out.
 * - Per profile: 5 wrong PINs lock that profile out — counted separately for
 *   home-network and internet attempts, so someone hammering a profile from
 *   outside cannot lock the family out at home.
 * - Each further block of failures doubles the lockout (15 min, 30, 60 … max 24 h).
 * - Counters reset after a successful sign-in (or an admin PIN reset).
 * - Wrong PINs are answered slowly, and more slowly each time.
 */

const IP_LIMIT = 10;
const USER_LIMIT = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthReason = 'ok' | 'bad_pin' | 'unknown_profile' | 'locked_ip' | 'locked_user' | 'admin_reset' | 'pin_changed';

interface Fails {
  count: number;
  last: number;
}

function failuresSince(where: string, args: unknown[]): Fails {
  const db = getDb();
  const now = Date.now();
  const lastOk = (db.prepare(`SELECT MAX(at) AS at FROM auth_events WHERE success = 1 AND ${where}`).get(...args) as { at: number | null }).at ?? 0;
  const since = Math.max(lastOk, now - WINDOW_MS);
  const row = db
    .prepare(`SELECT COUNT(*) AS c, MAX(at) AS last FROM auth_events WHERE success = 0 AND reason IN ('bad_pin','unknown_profile') AND at > ? AND ${where}`)
    .get(since, ...args) as { c: number; last: number | null };
  return { count: row.c, last: row.last ?? 0 };
}

function lockedUntil(f: Fails, limit: number): number {
  const steps = Math.floor(f.count / limit);
  if (steps < 1) return 0;
  const ms = Math.min(BASE_LOCK_MS * 2 ** (steps - 1), MAX_LOCK_MS);
  const until = f.last + ms;
  return until > Date.now() ? until : 0;
}

export interface LockStatus {
  until: number;
  scope: 'ip' | 'user';
}

export function checkLock(client: ClientInfo, userId: number | null): LockStatus | null {
  const ipUntil = lockedUntil(failuresSince('ip = ?', [client.ip]), IP_LIMIT);
  if (ipUntil) return { until: ipUntil, scope: 'ip' };
  if (userId !== null) {
    const uUntil = lockedUntil(failuresSince('user_id = ? AND network = ?', [userId, client.network]), USER_LIMIT);
    if (uUntil) return { until: uUntil, scope: 'user' };
  }
  return null;
}

/** Milliseconds to wait before answering a wrong PIN (grows with recent failures). */
export function failureDelayMs(client: ClientInfo): number {
  const n = failuresSince('ip = ?', [client.ip]).count;
  return Math.min(400 + n * 400, 4000);
}

export function recordAuthEvent(client: ClientInfo, user: { id: number; name: string } | null, success: boolean, reason: AuthReason) {
  const db = getDb();
  db.prepare('INSERT INTO auth_events (at, ip, network, user_id, user_name, success, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    Date.now(),
    client.ip,
    client.network,
    user?.id ?? null,
    user?.name ?? null,
    success ? 1 : 0,
    reason,
  );
  db.prepare('DELETE FROM auth_events WHERE at < ?').run(Date.now() - KEEP_MS);
}

/** Clear a profile's lockout (both networks) — used when an admin resets the PIN. */
export function clearUserLock(user: { id: number; name: string }) {
  const db = getDb();
  const ins = db.prepare("INSERT INTO auth_events (at, ip, network, user_id, user_name, success, reason) VALUES (?, '-', ?, ?, ?, 1, 'admin_reset')");
  ins.run(Date.now(), 'home', user.id, user.name);
  ins.run(Date.now(), 'away', user.id, user.name);
}

export interface AuthEventView {
  id: number;
  at: number;
  ip: string;
  network: string;
  userName: string | null;
  success: boolean;
  reason: AuthReason;
}

export function recentAuthEvents(limit = 100): AuthEventView[] {
  const rows = getDb()
    .prepare('SELECT id, at, ip, network, user_name, success, reason FROM auth_events ORDER BY id DESC LIMIT ?')
    .all(limit) as { id: number; at: number; ip: string; network: string; user_name: string | null; success: number; reason: AuthReason }[];
  return rows.map((r) => ({ id: r.id, at: r.at, ip: r.ip, network: r.network, userName: r.user_name, success: r.success === 1, reason: r.reason }));
}

/** Addresses and profiles that are locked out right now. */
export function activeLocks(): { kind: 'ip' | 'user'; label: string; network?: string; until: number }[] {
  const db = getDb();
  const since = Date.now() - WINDOW_MS;
  const out: { kind: 'ip' | 'user'; label: string; network?: string; until: number }[] = [];
  const ips = db.prepare("SELECT DISTINCT ip FROM auth_events WHERE success = 0 AND at > ? AND ip != '-'").all(since) as { ip: string }[];
  for (const { ip } of ips) {
    const until = lockedUntil(failuresSince('ip = ?', [ip]), IP_LIMIT);
    if (until) out.push({ kind: 'ip', label: ip, until });
  }
  const users = db.prepare('SELECT DISTINCT user_id, user_name, network FROM auth_events WHERE success = 0 AND at > ? AND user_id IS NOT NULL').all(since) as { user_id: number; user_name: string; network: string }[];
  for (const u of users) {
    const until = lockedUntil(failuresSince('user_id = ? AND network = ?', [u.user_id, u.network]), USER_LIMIT);
    if (until) out.push({ kind: 'user', label: u.user_name, network: u.network, until });
  }
  return out;
}

/** Admin "unlock": forget recent failures for an address. */
export function clearIpLock(ip: string) {
  getDb().prepare("INSERT INTO auth_events (at, ip, network, user_id, user_name, success, reason) VALUES (?, ?, 'away', NULL, NULL, 1, 'admin_reset')").run(Date.now(), ip);
}
