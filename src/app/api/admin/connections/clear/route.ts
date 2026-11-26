import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { connectionsView, saveConnections } from '@/lib/connections';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Remove one value saved in the hub so the .env value (or the default) applies again. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const { name } = await readJson<{ name?: unknown }>(req);
  if (typeof name !== 'string' || !name) throw new HttpError(400, 'Which setting should be cleared?');
  const changed = saveConnections({ clear: [name] });
  return NextResponse.json({ demoMode: getConfig().demoMode, connections: connectionsView(), changed });
});
