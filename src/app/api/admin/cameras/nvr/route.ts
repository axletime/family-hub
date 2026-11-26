import { NextResponse } from 'next/server';
import { handler, readJson, requireAdmin } from '@/lib/auth';
import { addFromNvr, adminCameras, syncAll } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** NVR helper: { ip, username, password, channels, pattern, customMain?, customSub?, namePrefix? } → one camera per channel. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const ids = addFromNvr(await readJson(req));
  const sync = await syncAll();
  return NextResponse.json({ ids, sync, cameras: adminCameras() }, { status: 201 });
});
