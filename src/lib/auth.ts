import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb, type UserRow } from './db';
import { getConfig } from './config';
import { verifyPin } from './pin';

export const SESSION_COOKIE = 'fh_session';
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface SessionUser {
  id: number;
  name: string;
  role: 'admin' | 'member';
  colour: string;
}

function sha256(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

function toSessionUser(u: UserRow): SessionUser {
  return { id: u.id, name: u.name, role: u.role, colour: u.colour };
}

/** Returns minutes remaining on a lockout, or 0 if the user may attempt to sign in. */
export function lockoutMinutes(userId: number): number {
  const db = getDb();
  const since = Date.now() - LOCKOUT_MS;
  db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(since);
  const rows = db
    .prepare('SELECT attempted_at FROM login_attempts WHERE user_id = ? AND attempted_at >= ? ORDER BY attempted_at ASC')
    .all(userId, since) as { attempted_at: number }[];
  if (rows.length < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((rows[0].attempted_at + LOCKOUT_MS - Date.now()) / 60000));
}

export type LoginResult =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; error: string; status: number };

export function attemptLogin(userId: number, pin: string): LoginResult {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!user) return { ok: false, error: 'Unknown profile.', status: 400 };
  const locked = lockoutMinutes(user.id);
  if (locked > 0) {
    return { ok: false, error: `Too many incorrect PINs. Try again in ${locked} minute${locked === 1 ? '' : 's'}.`, status: 429 };
  }
  if (!verifyPin(pin, user.pin_hash)) {
    db.prepare('INSERT INTO login_attempts (user_id, attempted_at) VALUES (?, ?)').run(user.id, Date.now());
    return { ok: false, error: 'Incorrect PIN.', status: 401 };
  }
  db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(user.id);
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + getConfig().sessionDays * 86400000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), user.id, expires);
  return { ok: true, token, user: toSessionUser(user) };
}

export function setSessionCookie(res: NextResponse, token: string) {
  const cfg = getConfig();
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.cookieSecure,
    path: '/',
    maxAge: cfg.sessionDays * 86400,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: getConfig().cookieSecure, path: '/', maxAge: 0 });
}

export function destroySession(token: string | undefined) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function destroyUserSessions(userId: number) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
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
  return row ? toSessionUser(row) : null;
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
