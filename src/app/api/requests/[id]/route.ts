import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin, requireUser } from '@/lib/auth';
import { approveRequest, declineRequest, deleteRequest } from '@/lib/requests';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id.');
  return id;
}

/** Admin: approve or decline. */
export const PATCH = handler<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  const { action, note } = await readJson<{ action?: string; note?: string }>(req);
  if (action === 'approve') return NextResponse.json({ request: await approveRequest(admin, id) });
  if (action === 'decline') return NextResponse.json({ request: declineRequest(admin, id, note) });
  throw new HttpError(400, 'Unknown action.');
});

/** Cancel your own pending request, or (admin) remove any request. */
export const DELETE = handler<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  deleteRequest(user, await idFrom(ctx));
  return NextResponse.json({ ok: true });
});
