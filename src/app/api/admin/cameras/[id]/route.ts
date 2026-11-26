import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { adminCameras, deleteCamera, syncAll, updateCamera } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function camId(params: Ctx['params']) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid camera.');
  return id;
}

/** Edit: { name?, mainUrl?, subUrl?, clearSub? } — blank addresses keep the saved ones. */
export const PATCH = handler<Ctx>(async (req, { params }) => {
  await requireAdmin();
  updateCamera(await camId(params), await readJson(req));
  const sync = await syncAll();
  return NextResponse.json({ sync, cameras: adminCameras() });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteCamera(await camId(params));
  return NextResponse.json({ cameras: adminCameras() });
});
