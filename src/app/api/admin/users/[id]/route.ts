import { NextResponse } from 'next/server';
import { destroyUserSessions, handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getDb, type UserRow } from '@/lib/db';
import { hashPin, isValidPin } from '@/lib/pin';

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
  await requireAdmin();
  const user = load(Number((await ctx.params).id));
  const body = await readJson<{ name?: string; pin?: string; role?: string; colour?: string }>(req);
  const db = getDb();
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
  if (body.role !== undefined) {
    const role = body.role === 'admin' ? 'admin' : 'member';
    if (user.role === 'admin' && role === 'member' && adminCount() <= 1) throw new HttpError(400, 'There must always be at least one admin.');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  }
  if (body.colour !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.colour)) throw new HttpError(400, 'Invalid colour.');
    db.prepare('UPDATE users SET colour = ? WHERE id = ?').run(body.colour, user.id);
  }
  if (body.pin !== undefined && body.pin !== '') {
    if (!isValidPin(body.pin)) throw new HttpError(400, 'PIN must be 4–8 digits.');
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(body.pin), user.id);
    db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(user.id);
  }
  return NextResponse.json({ ok: true });
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
