import { NextResponse } from 'next/server';
import { handler, HttpError, requireAdmin } from '@/lib/auth';
import { testCamera } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid camera.');
  return NextResponse.json(await testCamera(id));
});
