import { NextResponse } from 'next/server';
import { handler, readJson, requireUser } from '@/lib/auth';
import { savePrefs, type NotifyPrefs } from '@/lib/notify';
import { notificationView } from '@/lib/notifyView';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = await requireUser();
  return NextResponse.json(await notificationView(user.id));
});

export const PUT = handler(async (req) => {
  const user = await requireUser();
  const b = await readJson<{ prefs?: Partial<NotifyPrefs> }>(req);
  savePrefs(user.id, b.prefs ?? {});
  return NextResponse.json(await notificationView(user.id));
});
