import { NextResponse } from 'next/server';
import { currentSessionToken, destroyUserSessions, handler, HttpError, readJson, requireUser } from '@/lib/auth';
import { getDb, getSettings, type UserRow } from '@/lib/db';
import { hashPin, isValidPin, newPinError, verifyPin } from '@/lib/pin';

export const dynamic = 'force-dynamic';

/** Let any signed-in family member change their own PIN. Signs out their other devices. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const { currentPin, newPin } = await readJson<{ currentPin?: string; newPin?: string }>(req);
  const policy = newPinError(newPin, getSettings().requireLongPins);
  if (policy) throw new HttpError(400, `Your new ${policy.charAt(0).toLowerCase()}${policy.slice(1)}`);
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
  if (!isValidPin(currentPin) || !verifyPin(currentPin, row.pin_hash)) throw new HttpError(401, 'Your current PIN is incorrect.');
  getDb().prepare('UPDATE users SET pin_hash = ?, pin_len = ? WHERE id = ?').run(hashPin(newPin!), newPin!.length, user.id);
  destroyUserSessions(user.id, await currentSessionToken());
  return NextResponse.json({ ok: true });
});
