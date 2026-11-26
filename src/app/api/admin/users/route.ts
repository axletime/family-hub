import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getDb, getSettings, randomColour } from '@/lib/db';
import { hashPin, newPinError } from '@/lib/pin';
import { groupFrom } from '@/lib/users';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await requireAdmin();
  const users = getDb()
    .prepare(
      `SELECT u.id, u.name, u.role, u.user_group AS "group", u.colour, u.pin_len AS pinLength, u.created_at AS createdAt,
        (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id) AS requestCount
       FROM users u ORDER BY u.role = 'admin' DESC, u.name COLLATE NOCASE`,
    )
    .all();
  return NextResponse.json({ users });
});

export const POST = handler(async (req) => {
  await requireAdmin();
  const body = await readJson<{ name?: string; pin?: string; role?: string; group?: string; colour?: string }>(req);
  const clean = (body.name ?? '').trim();
  if (clean.length < 1 || clean.length > 30) throw new HttpError(400, 'Name must be 1–30 characters.');
  const pinErr = newPinError(body.pin, getSettings().requireLongPins);
  if (pinErr) throw new HttpError(400, pinErr);
  const group = groupFrom(body) ?? 'home';
  const c = body.colour && /^#[0-9a-fA-F]{6}$/.test(body.colour) ? body.colour : randomColour();
  try {
    const info = getDb()
      .prepare('INSERT INTO users (name, pin_hash, role, colour, user_group, pin_len) VALUES (?, ?, ?, ?, ?, ?)')
      .run(clean, hashPin(body.pin!), group === 'admin' ? 'admin' : 'member', c, group, body.pin!.length);
    return NextResponse.json({ id: Number(info.lastInsertRowid) }, { status: 201 });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Someone with that name already exists.');
    throw e;
  }
});
