import { NextResponse } from 'next/server';
import { handler, requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => NextResponse.json({ user: await requireUser() }));
