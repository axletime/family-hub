import { NextResponse } from 'next/server';
import { handler, requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => NextResponse.json({ user: await requireUser(), pinMin: getSettings().requireLongPins ? 6 : 4 }));
