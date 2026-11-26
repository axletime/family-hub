import { NextResponse } from 'next/server';
import { handler, requireAdmin } from '@/lib/auth';
import { getOptions, isArrAvailable } from '@/lib/services';
import type { ArrKind } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Root folders and profiles from each *arr app, for the settings dropdowns. */
export const GET = handler(async () => {
  await requireAdmin();
  const kinds: ArrKind[] = ['sonarr', 'radarr', 'lidarr'];
  const entries = await Promise.all(
    kinds.map(async (k) => {
      if (!isArrAvailable(k)) return [k, { error: 'Not configured' }] as const;
      try {
        return [k, await getOptions(k)] as const;
      } catch (e) {
        return [k, { error: e instanceof Error ? e.message : String(e) }] as const;
      }
    }),
  );
  return NextResponse.json(Object.fromEntries(entries));
});
