import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getGroupAccess, saveGroupAccess } from '@/lib/db';
import { FEATURE_IDS, type Access, type GroupAccess } from '@/lib/features';
import { getClient } from '@/lib/network';

export const dynamic = 'force-dynamic';

async function view() {
  const client = await getClient();
  return { access: getGroupAccess(), network: client.network, ip: client.ip };
}

export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json(await view());
});

/** Replace the permissions matrix (and optionally rename Home / Outside). */
export const PUT = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<Partial<GroupAccess>>(req);
  const cur = getGroupAccess();
  const next: GroupAccess = { names: { ...cur.names }, admin: { ...cur.admin }, home: { ...cur.home }, outside: { ...cur.outside } };
  for (const g of ['admin', 'home', 'outside'] as const) {
    const m = b[g];
    if (m === undefined) continue;
    if (typeof m !== 'object' || m === null) throw new HttpError(400, `Invalid permissions for ${g}.`);
    for (const [f, v] of Object.entries(m)) {
      if (!FEATURE_IDS.includes(f as (typeof FEATURE_IDS)[number])) throw new HttpError(400, `Unknown feature "${f}".`);
      const allowed: Access[] = g === 'admin' ? ['on', 'lan'] : ['off', 'on', 'lan'];
      if (!allowed.includes(v as Access)) throw new HttpError(400, g === 'admin' ? 'Admins always have every feature; you can only limit it to the home network.' : `Invalid value for ${f}.`);
      next[g][f as (typeof FEATURE_IDS)[number]] = v as Access;
    }
  }
  if (b.names) {
    for (const g of ['home', 'outside'] as const) {
      const v = b.names[g];
      if (v === undefined) continue;
      const clean = String(v).trim();
      if (clean.length < 1 || clean.length > 24) throw new HttpError(400, 'Group names must be 1–24 characters.');
      if (clean.toLowerCase() === 'admin') throw new HttpError(400, '"Admin" is reserved.');
      next.names[g] = clean;
    }
    if (next.names.home.toLowerCase() === next.names.outside.toLowerCase()) throw new HttpError(400, 'The two groups need different names.');
  }
  saveGroupAccess(next);
  return NextResponse.json(await view());
});
