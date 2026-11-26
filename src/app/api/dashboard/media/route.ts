import { NextResponse } from 'next/server';
import { handler, requireAnyFeature } from '@/lib/auth';
import { canUse } from '@/lib/features';
import { getMediaOverview } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = await requireAnyFeature(['queue', 'calendar']);
  const m = await getMediaOverview();
  // Only send the parts this person is allowed to see.
  if (!canUse(user, 'queue')) m.queue = [];
  if (!canUse(user, 'calendar')) {
    m.recent = [];
    m.upcomingTv = [];
    m.upcomingMovies = [];
  }
  return NextResponse.json(m);
});
