import { NextResponse } from 'next/server';
import { attemptLogin, handler, HttpError, readJson, setSessionCookie } from '@/lib/auth';
import { isValidPin } from '@/lib/pin';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const body = await readJson<{ userId?: number; pin?: string }>(req);
  if (!Number.isInteger(body.userId) || !isValidPin(body.pin)) throw new HttpError(400, 'Choose a profile and enter your 4–8 digit PIN.');
  const result = attemptLogin(body.userId!, body.pin!);
  if (!result.ok) throw new HttpError(result.status, result.error);
  const res = NextResponse.json({ user: result.user });
  setSessionCookie(res, result.token);
  return res;
});
