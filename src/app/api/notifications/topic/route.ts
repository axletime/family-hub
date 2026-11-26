import { NextResponse } from 'next/server';
import { handler, requireUser } from '@/lib/auth';
import { regenerateTopic } from '@/lib/notify';
import { notificationView } from '@/lib/notifyView';

export const dynamic = 'force-dynamic';

/** Replace the user's topic (e.g. if the old one was shared by mistake). */
export const POST = handler(async () => {
  const user = await requireUser();
  regenerateTopic(user.id);
  return NextResponse.json(await notificationView(user.id));
});
