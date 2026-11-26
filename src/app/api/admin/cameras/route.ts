import { NextResponse } from 'next/server';
import { handler, readJson, requireAdmin } from '@/lib/auth';
import { adminCameras, createCamera, reorderCameras, syncAll } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json({ cameras: adminCameras() });
});

/** Add a camera: { name, mainUrl, subUrl? }. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const id = createCamera(await readJson(req));
  const sync = await syncAll();
  return NextResponse.json({ id, sync, cameras: adminCameras() }, { status: 201 });
});

/** Reorder: { order: [id, id, …] }. */
export const PUT = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<{ order?: unknown }>(req);
  reorderCameras(b.order);
  return NextResponse.json({ cameras: adminCameras() });
});
