import { NextResponse } from 'next/server';
import { handler, requireUser } from '@/lib/auth';
import { getStatuses } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await requireUser();
  return NextResponse.json({ services: await getStatuses() });
});
