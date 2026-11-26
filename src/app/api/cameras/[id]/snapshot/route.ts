import { handler, HttpError, requireFeature } from '@/lib/auth';
import { snapshotResponse } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireFeature('cameras');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid camera.');
  const stream = new URL(req.url).searchParams.get('stream') === 'main' ? 'main' : 'sub';
  return snapshotResponse(id, stream);
});
