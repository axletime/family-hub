import { NextResponse } from 'next/server';
import { handler, requireFeature } from '@/lib/auth';
import { publicCameras } from '@/lib/cameras';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Camera names and ids only — stream addresses never leave the server. */
export const GET = handler(async () => {
  await requireFeature('cameras');
  return NextResponse.json({ cameras: publicCameras(), demo: getConfig().demoMode }, { headers: { 'Cache-Control': 'no-store' } });
});
