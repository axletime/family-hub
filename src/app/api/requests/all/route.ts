import { NextResponse } from 'next/server';
import { handler, requireAdmin } from '@/lib/auth';
import { listRequests } from '@/lib/requests';
import type { RequestStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get('status') as RequestStatus | null;
  return NextResponse.json({ requests: await listRequests({ status: status || undefined }) });
});
