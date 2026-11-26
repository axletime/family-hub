import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getDb, randomColour } from '@/lib/db';
import { hashPin, isValidPin } from '@/lib/pin';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await requireAdmin();
  const users = getDb()
    .prepare(
      `SELECT u.id, u.name, u.role, u.colour, u.created_at AS createdAt,
        (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id) AS requestCount
       FROM users u ORDER BY u.role = 'admin' DESC, u.name COLLATE NOCASE`,
    )
    .all();
  return NextResponse.json({ users });
});

export const POST = handler(async (req) => {
  await requireAdmin();
  const { name, pin, role, colour } = await readJson<{ name?: string; pin?: string; role?: string; colour?: string }>(req);
  const clean = (name ?? '').trim();
  if (clean.length < 1 || clean.length > 30) throw new HttpError(400, 'Name must be 1–30 characters.');
  if (!isValidPin(pin)) throw new HttpError(400, 'PIN must be 4–8 digits.');
  const r = role === 'admin' ? 'admin' : 'member';
  const c = colour && /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : randomColour();
  try {
    const info = getDb().prepare('INSERT INTO users (name, pin_hash, role, colour) VALUES (?, ?, ?, ?)').run(clean, hashPin(pin), r, c);
    return NextResponse.json({ id: Number(info.lastInsertRowid) }, { status: 201 });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Someone with that name already exists.');
    throw e;
  }
});
