import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { getHaEntities, toggleHaEntity } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const user = await requireUser();
  const { entityId } = await readJson<{ entityId?: string }>(req);
  if (typeof entityId !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(entityId)) throw new HttpError(400, 'Invalid entity.');
  try {
    await toggleHaEntity(entityId);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : 'Toggle failed.');
  }
  // Give Home Assistant a moment to update its state machine.
  await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json({ ...(await getHaEntities()), canControlHeating: user.role === 'admin' || getSettings().familyCanControlHeating });
});
