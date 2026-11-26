import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClient } from '@/lib/network';
import { clearSessionCookie, destroySession, handler, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  destroySession((await cookies()).get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, await getClient());
  return res;
});
