import { NextResponse } from 'next/server';
import { attemptLogin, handler, HttpError, readJson, setSessionCookie } from '@/lib/auth';
import { getClient } from '@/lib/network';
import { isValidPin } from '@/lib/pin';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const body = await readJson<{ userId?: number; pin?: string }>(req);
  if (!Number.isInteger(body.userId) || !isValidPin(body.pin)) throw new HttpError(400, 'Choose a profile and enter your 4–8 digit PIN.');
  const client = await getClient();
  const result = attemptLogin(body.userId!, body.pin!, client);
  if (!result.ok) {
    // Slow down guessing: wrong answers take longer each time.
    if (result.delayMs) await new Promise((r) => setTimeout(r, result.delayMs));
    throw new HttpError(result.status, result.error);
  }
  const res = NextResponse.json({ user: result.user });
  setSessionCookie(res, result.token, client);
  return res;
});
