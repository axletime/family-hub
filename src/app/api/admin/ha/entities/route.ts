import { NextResponse } from 'next/server';
import { handler, requireAdmin } from '@/lib/auth';
import { listHeatingEntities } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** climate.* and water_heater.* entities available in Home Assistant, for the settings picker. */
export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json(await listHeatingEntities());
});
