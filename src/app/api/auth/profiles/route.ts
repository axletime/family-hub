import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PublicProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Public: the list of names shown on the sign-in screen (no PINs, obviously). */
export function GET() {
  const rows = getDb().prepare('SELECT id, name, colour, role FROM users ORDER BY role = \'admin\' DESC, name COLLATE NOCASE').all() as PublicProfile[];
  return NextResponse.json({ profiles: rows });
}
