import { NextResponse } from 'next/server';
import { handler, readJson, requireAnyFeature, requireFeature } from '@/lib/auth';
import { createRequest, listRequests } from '@/lib/requests';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** The signed-in user's own requests. */
export const GET = handler(async () => {
  const user = await requireFeature('myRequests');
  return NextResponse.json({ requests: await listRequests({ userId: user.id }) });
});

export const POST = handler(async (req) => {
  const user = await requireAnyFeature(['request', 'discover']);
  const body = await readJson<{ mediaType?: MediaType; externalId?: string }>(req);
  const request = await createRequest(user, { mediaType: body.mediaType as MediaType, externalId: String(body.externalId ?? '') });
  return NextResponse.json({ request }, { status: 201 });
});
