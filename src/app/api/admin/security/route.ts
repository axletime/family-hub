import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getDb, getSettings, saveSettings } from '@/lib/db';
import { activeLocks, recentAuthEvents } from '@/lib/loginGuard';
import { getClient, resolveClient, trustedProxiesError } from '@/lib/network';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

async function view() {
  const s = getSettings();
  const client = await getClient();
  const shortPins = getDb()
    .prepare('SELECT id, name, pin_len AS pinLength FROM users WHERE pin_len IS NULL OR pin_len < 6 ORDER BY name COLLATE NOCASE')
    .all() as { id: number; name: string; pinLength: number | null }[];
  return {
    settings: { requireLongPins: s.requireLongPins, trustedProxies: s.trustedProxies, trustedProxiesFromEnv: (process.env.TRUST_PROXY ?? '').trim() },
    client,
    cookieSecureEnv: getConfig().cookieSecure,
    shortPins,
    locks: activeLocks(),
    events: recentAuthEvents(100),
  };
}

export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json(await view());
});

export const PUT = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<{ requireLongPins?: boolean; trustedProxies?: string }>(req);
  const patch: { requireLongPins?: boolean; trustedProxies?: string } = {};
  if (b.requireLongPins !== undefined) patch.requireLongPins = Boolean(b.requireLongPins);
  if (b.trustedProxies !== undefined) {
    const v = String(b.trustedProxies).trim().slice(0, 500);
    const err = trustedProxiesError(v);
    if (err) throw new HttpError(400, err);
    // Don't let an admin lock themselves into a broken state: show what this request would look like.
    const preview = resolveClient(await headers(), v);
    if (preview.ip === '0.0.0.0') throw new HttpError(400, 'Could not work out your address with that list.');
    patch.trustedProxies = v;
  }
  saveSettings(patch);
  return NextResponse.json(await view());
});
