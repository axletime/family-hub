import { NextResponse } from 'next/server';
import { handler, requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { getHaEntities } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = await requireUser();
  const canControlHeating = user.role === 'admin' || getSettings().familyCanControlHeating;
  return NextResponse.json({ ...(await getHaEntities()), canControlHeating });
});
