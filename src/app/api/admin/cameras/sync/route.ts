import { NextResponse } from 'next/server';
import { handler, requireAdmin } from '@/lib/auth';
import { syncAll } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** Re-send every camera to go2rtc (e.g. after go2rtc was reinstalled). */
export const POST = handler(async () => {
  await requireAdmin();
  return NextResponse.json(await syncAll());
});
