import { handler, HttpError, requireFeature } from '@/lib/auth';
import { liveResponse } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** Live video: ?format=mp4 (default) or mjpeg, ?stream=main (default) or sub. */
export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireFeature('cameras');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid camera.');
  const q = new URL(req.url).searchParams;
  return liveResponse(id, q.get('stream') === 'sub' ? 'sub' : 'main', q.get('format') === 'mjpeg' ? 'mjpeg' : 'mp4', req.signal);
});
