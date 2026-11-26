import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireUser } from '@/lib/auth';
import { getDb, type UserRow } from '@/lib/db';
import { hashPin, isValidPin, verifyPin } from '@/lib/pin';

export const dynamic = 'force-dynamic';

/** Let any signed-in family member change their own PIN. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const { currentPin, newPin } = await readJson<{ currentPin?: string; newPin?: string }>(req);
  if (!isValidPin(newPin)) throw new HttpError(400, 'Your new PIN must be 4–8 digits.');
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
  if (!isValidPin(currentPin) || !verifyPin(currentPin, row.pin_hash)) throw new HttpError(401, 'Your current PIN is incorrect.');
  getDb().prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(newPin), user.id);
  return NextResponse.json({ ok: true });
});
