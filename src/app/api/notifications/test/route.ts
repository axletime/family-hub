import { NextResponse } from 'next/server';
import { handler, HttpError, requireUser } from '@/lib/auth';
import { sendTest } from '@/lib/notify';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const user = await requireUser();
  const res = await sendTest(user.id);
  if (res.status === 'failed') throw new HttpError(502, `Could not send: ${res.error ?? 'unknown error'}`);
  return NextResponse.json({ status: res.status });
});
