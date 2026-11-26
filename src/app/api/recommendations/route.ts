import { NextResponse } from 'next/server';
import { handler, HttpError, requireFeature } from '@/lib/auth';
import { getRecommendations } from '@/lib/recommend';
import type { RecMediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const user = await requireFeature('discover');
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as RecMediaType;
  if (type !== 'tv' && type !== 'movie') throw new HttpError(400, 'Unknown type.');
  const perSection = Math.min(40, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const refresh = user.role === 'admin' && url.searchParams.get('refresh') === '1';
  try {
    const rec = await getRecommendations(type, { perSection, refresh });
    // Setup hints and raw errors are only useful to admins.
    if (user.role !== 'admin') {
      delete rec.hint;
      delete rec.error;
    }
    return NextResponse.json(rec);
  } catch (e) {
    console.error('[family-hub] recommendations failed', e);
    // Never break the dashboard: return an empty, well-formed response.
    return NextResponse.json({ mediaType: type, source: 'none', sections: [], ...(user.role === 'admin' ? { error: e instanceof Error ? e.message : String(e) } : {}) });
  }
});
