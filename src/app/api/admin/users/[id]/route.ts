import { NextResponse } from 'next/server';
import { currentSessionToken, destroyUserSessions, handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getDb, getSettings, type UserRow } from '@/lib/db';
import { hashPin, newPinError } from '@/lib/pin';
import { clearUserLock } from '@/lib/loginGuard';
import { groupFrom } from '@/lib/users';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function load(id: number) {
  const u = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!u) throw new HttpError(404, 'Family member not found.');
  return u;
}

function adminCount() {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }).c;
}

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const user = load(Number((await ctx.params).id));
  const body = await readJson<{ name?: string; pin?: string; role?: string; group?: string; colour?: string }>(req);
  const db = getDb();
  let signOut = false;
  const group = groupFrom(body);
  const pinErr = body.pin !== undefined && body.pin !== '' ? newPinError(body.pin, getSettings().requireLongPins) : null;
  if (pinErr) throw new HttpError(400, pinErr);
  if (group !== undefined && user.role === 'admin' && group !== 'admin' && adminCount() <= 1) throw new HttpError(400, 'There must always be at least one admin.');

  db.transaction(() => {
    if (body.name !== undefined) {
      const n = body.name.trim();
      if (n.length < 1 || n.length > 30) throw new HttpError(400, 'Name must be 1–30 characters.');
      try {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, user.id);
      } catch (e) {
        if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Someone with that name already exists.');
        throw e;
      }
    }
    if (group !== undefined && group !== user.user_group) {
      db.prepare('UPDATE users SET user_group = ?, role = ? WHERE id = ?').run(group, group === 'admin' ? 'admin' : 'member', user.id);
      signOut = true;
    }
    if (body.colour !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.colour)) throw new HttpError(400, 'Invalid colour.');
      db.prepare('UPDATE users SET colour = ? WHERE id = ?').run(body.colour, user.id);
    }
    if (body.pin !== undefined && body.pin !== '') {
      db.prepare('UPDATE users SET pin_hash = ?, pin_len = ? WHERE id = ?').run(hashPin(body.pin), body.pin.length, user.id);
      signOut = true;
    }
  })();
  if (body.pin) clearUserLock({ id: user.id, name: user.name });
  // A new group or PIN signs the person out everywhere, so the change takes effect straight away.
  // (Editing yourself keeps this browser signed in.)
  if (signOut) destroyUserSessions(user.id, user.id === admin.id ? await currentSessionToken() : undefined);
  return NextResponse.json({ ok: true, signedOut: signOut });
});

export const DELETE = handler<Ctx>(async (_req, ctx) => {
  const admin = await requireAdmin();
  const user = load(Number((await ctx.params).id));
  if (user.id === admin.id) throw new HttpError(400, 'You cannot remove yourself.');
  if (user.role === 'admin' && adminCount() <= 1) throw new HttpError(400, 'There must always be at least one admin.');
  destroyUserSessions(user.id);
  getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
  return NextResponse.json({ ok: true });
});
