import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireFeature } from '@/lib/auth';
import { controlHeating, getHaEntities } from '@/lib/services';
import type { HeatingAction } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ENTITY_RE = /^(climate|water_heater)\.[a-z0-9_]+$/;

/** Heating / hot water controls. Validated and allowlisted in controlHeating(). */
export const POST = handler(async (req) => {
  await requireFeature('haView');
  await requireFeature('haControl');
  const b = await readJson<Record<string, unknown>>(req);
  const entityId = b.entityId;
  if (typeof entityId !== 'string' || !ENTITY_RE.test(entityId)) throw new HttpError(400, 'Invalid entity.');

  let action: HeatingAction;
  switch (b.action) {
    case 'set_temperature':
      action = { action: 'set_temperature', temperature: Number(b.temperature) };
      break;
    case 'set_mode':
      if (typeof b.mode !== 'string') throw new HttpError(400, 'Invalid mode.');
      action = { action: 'set_mode', mode: b.mode };
      break;
    case 'boost_on':
      action = { action: 'boost_on', minutes: Number(b.minutes), temperature: b.temperature === undefined || b.temperature === null ? undefined : Number(b.temperature) };
      break;
    case 'boost_off':
      action = { action: 'boost_off' };
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }

  let note: string | undefined;
  try {
    ({ note } = await controlHeating(entityId, action));
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : 'Home Assistant did not accept the change.');
  }
  // Give Home Assistant (and Hive's cloud) a moment to report the new state.
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ ...(await getHaEntities()), canControlHeating: true, note });
});
