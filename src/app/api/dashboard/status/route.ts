import { NextResponse } from 'next/server';
import { handler, requireFeature } from '@/lib/auth';
import { getStatuses } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await requireFeature('tiles');
  return NextResponse.json({ services: await getStatuses() });
});
