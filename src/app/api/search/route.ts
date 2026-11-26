import { NextResponse } from 'next/server';
import { handler, HttpError, requireFeature } from '@/lib/auth';
import { search } from '@/lib/requests';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireFeature('request');
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as MediaType;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!['movie', 'tv', 'music'].includes(type)) throw new HttpError(400, 'Unknown media type.');
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await search(type, q) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, e instanceof Error ? e.message : 'Search failed.');
  }
});
