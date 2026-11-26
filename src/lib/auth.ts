import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb, getGroupAccess, type UserRow } from './db';
import { getConfig } from './config';
import { verifyPin } from './pin';
import { canUse, denyReason, groupLabel, type AccessInfo, type FeatureId, type GroupAccess, type GroupId } from './features';
import { getClient, type ClientInfo } from './network';
import { checkLock, failureDelayMs, recordAuthEvent } from './loginGuard';

export const SESSION_COOKIE = 'fh_session';

export interface SessionUser extends AccessInfo {
  id: number;
  name: string;
  role: 'admin' | 'member';
  colour: string;
}

function sha256(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

function toSessionUser(u: UserRow, client: ClientInfo, ga: GroupAccess = getGroupAccess()): SessionUser {
  // Admin role and Admin group always go together; Admin always has everything (bar network limits).
  const group: GroupId = u.role === 'admin' ? 'admin' : u.user_group === 'outside' ? 'outside' : 'home';
  return { id: u.id, name: u.name, role: u.role, colour: u.colour, group, groupName: groupLabel(group, ga.names), network: client.network, access: ga[group] };
}

export type LoginResult =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; error: string; status: number; delayMs?: number };

function lockMessage(until: number, scope: 'ip' | 'user') {
  const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  const when = mins >= 90 ? `${Math.ceil(mins / 60)} hours` : `${mins} minute${mins === 1 ? '' : 's'}`;
  return scope === 'ip' ? `Too many incorrect PINs from this device. Try again in ${when}.` : `Too many incorrect PINs for this profile. Try again in ${when}.`;
}

export function attemptLogin(userId: number, pin: string, client: ClientInfo): LoginResult {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  const lock = checkLock(client, user ? user.id : null);
  if (lock) {
    recordAuthEvent(client, user ? { id: user.id, name: user.name } : null, false, lock.scope === 'ip' ? 'locked_ip' : 'locked_user');
    return { ok: false, error: lockMessage(lock.until, lock.scope), status: 429 };
  }
  if (!user) {
    recordAuthEvent(client, null, false, 'unknown_profile');
    return { ok: false, error: 'Unknown profile.', status: 400, delayMs: failureDelayMs(client) };
  }
  if (!verifyPin(pin, user.pin_hash)) {
    recordAuthEvent(client, { id: user.id, name: user.name }, false, 'bad_pin');
    const after = checkLock(client, user.id);
    if (after) return { ok: false, error: lockMessage(after.until, after.scope), status: 429, delayMs: failureDelayMs(client) };
    return { ok: false, error: 'Incorrect PIN.', status: 401, delayMs: failureDelayMs(client) };
  }
  recordAuthEvent(client, { id: user.id, name: user.name }, true, 'ok');
  if (user.pin_len !== pin.length) db.prepare('UPDATE users SET pin_len = ? WHERE id = ?').run(pin.length, user.id);
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + getConfig().sessionDays * 86400000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), user.id, expires);
  return { ok: true, token, user: toSessionUser(user, client) };
}

/** Secure cookies when COOKIE_SECURE is set, or automatically when this request arrived over HTTPS. */
export function setSessionCookie(res: NextResponse, token: string, client?: ClientInfo) {
  const cfg = getConfig();
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.cookieSecure || Boolean(client?.https),
    path: '/',
    maxAge: cfg.sessionDays * 86400,
  });
}

export function clearSessionCookie(res: NextResponse, client?: ClientInfo) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: getConfig().cookieSecure || Boolean(client?.https), path: '/', maxAge: 0 });
}

export function destroySession(token: string | undefined) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Sign a user out everywhere (optionally keeping the current session). */
export function destroyUserSessions(userId: number, exceptToken?: string) {
  if (exceptToken) getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(exceptToken));
  else getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Resolve the signed-in user from the session cookie (server components and route handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as UserRow | undefined;
  return row ? toSessionUser(row, await getClient()) : null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== 'admin') throw new HttpError(403, 'Admins only.');
  return u;
}

/** Signed in, in a group allowed to use this feature, and on an allowed network. */
export async function requireFeature(f: FeatureId): Promise<SessionUser> {
  const u = await requireUser();
  const reason = denyReason(u, f);
  if (reason) throw new HttpError(403, reason);
  return u;
}

/** Signed in and allowed at least one of these features. */
export async function requireAnyFeature(fs: FeatureId[]): Promise<SessionUser> {
  const u = await requireUser();
  if (fs.some((f) => canUse(u, f))) return u;
  throw new HttpError(403, denyReason(u, fs[0]) ?? 'Not allowed.');
}

/**
 * Wrap a route handler: converts thrown HttpErrors into JSON responses, and
 * enforces a JSON content type on state-changing requests (a simple CSRF guard
 * on top of SameSite=Lax cookies — browsers cannot send cross-site JSON
 * without a CORS pre-flight, which we never allow).
 */
export function handler<Ctx = unknown>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
        const ct = req.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) throw new HttpError(415, 'Expected application/json.');
      }
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error('[family-hub] route error', e);
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}
