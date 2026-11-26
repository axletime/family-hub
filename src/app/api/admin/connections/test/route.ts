import { NextResponse } from 'next/server';
import { handler, readJson, requireAdmin } from '@/lib/auth';
import { testConnection } from '@/lib/connections';

export const dynamic = 'force-dynamic';

/** Test a service with the values typed into the form; blank fields fall back to the saved/.env values. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<{ service?: unknown; url?: unknown; secret?: unknown }>(req);
  return NextResponse.json(await testConnection(String(b.service ?? ''), { url: b.url, secret: b.secret }));
});
