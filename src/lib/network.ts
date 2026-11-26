import 'server-only';
import net from 'node:net';
import { headers } from 'next/headers';
import { getSettings } from './db';

/**
 * Works out who is really connecting.
 *
 * The bundled start script (fh-server.cjs) stamps every request with the TCP
 * peer address in `x-fh-peer`, overwriting anything the client sent. Only when
 * that peer is a trusted reverse proxy (Admin › Settings › Security, or
 * TRUST_PROXY) do we believe X-Forwarded-For / X-Forwarded-Proto. Anyone on the
 * internet can type those headers, so they are ignored otherwise.
 */

export interface ClientInfo {
  /** Best guess at the real client address. */
  ip: string;
  /** "home" = a private (LAN) address. */
  network: 'home' | 'away';
  https: boolean;
  /** The TCP peer (the proxy, if there is one). */
  peer: string;
  peerTrusted: boolean;
  /** Request carried X-Forwarded-For from a peer we do not trust (a proxy that needs adding to the trusted list?). */
  untrustedForward: boolean;
  /** False when not started via fh-server.cjs (e.g. `next dev`), so the peer address is a guess. */
  peerKnown: boolean;
}

export function normaliseIp(ip: string): string {
  let v = ip.trim().replace(/^\[|\]$/g, '');
  // "1.2.3.4:5678" (some proxies include the port)
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(v)) v = v.split(':')[0];
  if (v.toLowerCase().startsWith('::ffff:') && net.isIPv4(v.slice(7))) v = v.slice(7);
  return v;
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  if (net.isIPv4(ip) && net.isIPv4(base)) {
    const bits = bitsStr === undefined ? 32 : Number(bitsStr);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
  }
  if (net.isIPv6(ip) && net.isIPv6(base) && bitsStr === undefined) return ip.toLowerCase() === base.toLowerCase();
  return false;
}

const PRIVATE_V4 = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'];

/** RFC 1918, loopback, link-local and IPv6 unique-local addresses. */
export function isPrivateIp(raw: string): boolean {
  const ip = normaliseIp(raw);
  if (net.isIPv4(ip)) return PRIVATE_V4.some((c) => inCidr(ip, c));
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || /^f[cd][0-9a-f]{2}:/.test(l) || /^fe[89ab][0-9a-f]:/.test(l);
  }
  return false;
}

export function parseTrustedProxies(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Validate the trusted proxy list; returns an error message or null. */
export function trustedProxiesError(text: string): string | null {
  for (const e of parseTrustedProxies(text)) {
    if (e === 'private') continue;
    const [base, bits] = e.split('/');
    if (net.isIPv4(base) && (bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= 32))) continue;
    if (net.isIPv6(base) && bits === undefined) continue;
    return `"${e}" is not an IP address or CIDR range (e.g. 172.17.0.0/16).`;
  }
  return null;
}

function isTrusted(ip: string, list: string[]): boolean {
  return list.some((e) => (e === 'private' ? isPrivateIp(ip) : inCidr(ip, e)));
}

let warned = false;

export function resolveClient(h: Headers, trustedText = getSettings().trustedProxies): ClientInfo {
  const list = parseTrustedProxies(trustedText);
  const xff = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => normaliseIp(s))
    .filter((s) => net.isIP(s));
  const stamped = h.get('x-fh-peer');
  const peerKnown = Boolean(stamped);
  if (!peerKnown && !warned && process.env.NODE_ENV === 'production') {
    warned = true;
    console.warn('[family-hub] Started without fh-server.cjs: the client address cannot be verified. Use `node fh-server.cjs`.');
  }
  // Without the stamp (dev server), Next puts the socket address in X-Forwarded-For only when the client sent none.
  const peer = normaliseIp(stamped || xff[xff.length - 1] || '0.0.0.0');
  const peerTrusted = isTrusted(peer, list);

  let ip = peer;
  if (peerTrusted && xff.length) {
    // Walk right-to-left past our own proxies; the first untrusted hop is the client.
    ip = xff[0];
    for (let i = xff.length - 1; i >= 0; i--) {
      if (isTrusted(xff[i], list) && i > 0) continue;
      ip = xff[i];
      break;
    }
  }
  const tls = h.get('x-fh-tls') === '1';
  const fwdProto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();
  const https = tls || (peerTrusted && fwdProto === 'https');
  const untrustedForward = peerKnown && !peerTrusted && xff.length > 0 && xff.some((x) => x !== peer);
  return { ip, network: isPrivateIp(ip) ? 'home' : 'away', https, peer, peerTrusted, untrustedForward, peerKnown };
}

/** Client details for the current request (route handlers and server components). */
export async function getClient(): Promise<ClientInfo> {
  return resolveClient(await headers());
}
