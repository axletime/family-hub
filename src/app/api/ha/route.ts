import { NextResponse } from 'next/server';
import { handler, requireFeature } from '@/lib/auth';
import { canUse } from '@/lib/features';
import { getHaEntities } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = await requireFeature('haView');
  const canControlHeating = canUse(user, 'haControl');
  return NextResponse.json({ ...(await getHaEntities()), canControlHeating });
});
