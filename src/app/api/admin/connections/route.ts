import { NextResponse } from 'next/server';
import { handler, readJson, requireAdmin } from '@/lib/auth';
import { connectionsView, saveConnections, type SavePatch } from '@/lib/connections';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

function view() {
  return { demoMode: getConfig().demoMode, connections: connectionsView() };
}

/** Masked view of every connection. Secrets are never returned, only "••••••••abcd". */
export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json(view());
});

/** Save addresses and secrets. A blank secret keeps the current one; a blank address reverts to .env. */
export const PUT = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<SavePatch>(req);
  const changed = saveConnections({ values: b.values && typeof b.values === 'object' ? b.values : {}, clear: Array.isArray(b.clear) ? b.clear : [] });
  return NextResponse.json({ ...view(), changed });
});
