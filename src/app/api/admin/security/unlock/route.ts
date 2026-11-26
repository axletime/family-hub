import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { clearIpLock, clearUserLock } from '@/lib/loginGuard';
import net from 'node:net';

export const dynamic = 'force-dynamic';

/** Lift a sign-in lockout for an address or a profile. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<{ ip?: string; userName?: string }>(req);
  if (typeof b.ip === 'string') {
    if (!net.isIP(b.ip)) throw new HttpError(400, 'Invalid address.');
    clearIpLock(b.ip);
  } else if (typeof b.userName === 'string') {
    const u = getDb().prepare('SELECT id, name FROM users WHERE name = ?').get(b.userName) as { id: number; name: string } | undefined;
    if (!u) throw new HttpError(404, 'Profile not found.');
    clearUserLock(u);
  } else throw new HttpError(400, 'Nothing to unlock.');
  return NextResponse.json({ ok: true });
});
