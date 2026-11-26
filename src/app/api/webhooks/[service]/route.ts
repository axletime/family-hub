import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getConfig, type ArrKind } from '@/lib/config';
import { invalidateLibrary } from '@/lib/arr';
import { syncStatuses } from '@/lib/requests';

export const dynamic = 'force-dynamic';

const KINDS: ArrKind[] = ['sonarr', 'radarr', 'lidarr'];

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Optional "On Import" webhook for Sonarr/Radarr/Lidarr (Settings › Connect › Webhook).
 * URL: http://<hub>/api/webhooks/sonarr?secret=<WEBHOOK_SECRET>
 * It just triggers an immediate status check — the poller works without it.
 */
export async function POST(req: Request, ctx: { params: Promise<{ service: string }> }) {
  const { service } = await ctx.params;
  const secret = getConfig().webhookSecret;
  if (!secret) return NextResponse.json({ error: 'Webhooks are disabled (set WEBHOOK_SECRET).' }, { status: 404 });
  const url = new URL(req.url);
  const basic = req.headers.get('authorization')?.match(/^Basic (.+)$/i)?.[1];
  const basicPass = basic ? Buffer.from(basic, 'base64').toString().split(':').slice(1).join(':') : '';
  const given = url.searchParams.get('secret') || req.headers.get('x-webhook-secret') || basicPass;
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  if (!KINDS.includes(service as ArrKind)) return NextResponse.json({ error: 'Unknown service.' }, { status: 404 });

  let eventType = 'unknown';
  try {
    eventType = String(((await req.json()) as { eventType?: string }).eventType ?? 'unknown');
  } catch {
    /* body is optional */
  }
  // "Test" is what the *arr apps send when you click the Test button.
  if (eventType !== 'Test') {
    invalidateLibrary(service as ArrKind);
    // Give the *arr app a moment to finish writing the import before we look.
    setTimeout(() => void syncStatuses().catch((e) => console.error('[family-hub] webhook status check failed', e)), 3000).unref?.();
  }
  return NextResponse.json({ ok: true, service, eventType });
}
