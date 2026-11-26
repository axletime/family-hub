import 'server-only';
import { getDb } from './db';
import { getConfig } from './config';
import { encryptSecret, decryptSecret } from './secretbox';
import { HttpError } from './auth';

/**
 * CCTV cameras, streamed through go2rtc.
 *
 * Camera addresses (which contain the NVR password) are stored encrypted and
 * never leave the server: the browser only sees camera ids and names, and
 * every image or video goes through Family Hub's own permission-checked
 * routes, which fetch from go2rtc on the home network.
 */

export type StreamKind = 'main' | 'sub';

interface CameraRow {
  id: number;
  name: string;
  main_url: string;
  sub_url: string | null;
  position: number;
}

export interface Camera {
  id: number;
  name: string;
  mainUrl: string;
  subUrl: string | null;
  position: number;
}

/** What admins see when editing: addresses with every password masked. */
export interface CameraAdminView {
  id: number;
  name: string;
  mainMasked: string;
  subMasked: string | null;
  unreadable: boolean;
  position: number;
}

/** What camera viewers see. */
export interface CameraPublic {
  id: number;
  name: string;
  hasSub: boolean;
}

const ALLOWED_SCHEMES = ['rtsp:', 'rtsps:', 'rtmp:', 'http:', 'https:'];

/** Accept only network stream addresses (go2rtc also supports exec:/ffmpeg: sources, which must never be user-supplied). */
export function validateStreamUrl(raw: unknown, label: string, required: boolean): string | null {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  if (v.length > 1000) throw new HttpError(400, `${label} is too long.`);
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new HttpError(400, `${label} is not a valid address (it should start with rtsp://).`);
  }
  if (!ALLOWED_SCHEMES.includes(u.protocol)) throw new HttpError(400, `${label} must start with rtsp://, rtsps://, rtmp:// or http(s)://.`);
  if (!u.hostname) throw new HttpError(400, `${label} needs a host name or IP address.`);
  if (/[\s#]/.test(v)) throw new HttpError(400, `${label} must not contain spaces or #.`);
  return v;
}

/** rtsp://admin:•••@192.168.1.50:554/user=admin&password=•••&channel=1 */
export function maskStreamUrl(url: string): string {
  let out = url.replace(/^([a-z0-9+.-]+:\/\/)([^/@:]*):([^/@]*)@/i, (_m, s: string, user: string) => `${s}${user}:•••@`);
  out = out.replace(/((?:password|passwd|pwd|pass)=)[^&;?#/]*/gi, '$1•••');
  return out;
}

function decode(stored: string | null): string | null {
  if (!stored) return null;
  return decryptSecret(stored);
}

function rows(): CameraRow[] {
  ensureDemoCameras();
  return getDb().prepare('SELECT id, name, main_url, sub_url, position FROM cameras ORDER BY position, id').all() as CameraRow[];
}

export function listCameras(): Camera[] {
  return rows().flatMap((r) => {
    const mainUrl = decode(r.main_url);
    if (!mainUrl) return [];
    return [{ id: r.id, name: r.name, mainUrl, subUrl: decode(r.sub_url), position: r.position }];
  });
}

export function publicCameras(): CameraPublic[] {
  return listCameras().map((c) => ({ id: c.id, name: c.name, hasSub: !!c.subUrl }));
}

export function adminCameras(): CameraAdminView[] {
  return rows().map((r) => {
    const main = decode(r.main_url);
    const sub = decode(r.sub_url);
    return {
      id: r.id,
      name: r.name,
      mainMasked: main ? maskStreamUrl(main) : '(cannot be decrypted — re-enter)',
      subMasked: sub ? maskStreamUrl(sub) : r.sub_url ? '(cannot be decrypted — re-enter)' : null,
      unreadable: !main || (!!r.sub_url && !sub),
      position: r.position,
    };
  });
}

export function getCamera(id: number): Camera {
  const c = listCameras().find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'Camera not found.');
  return c;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new HttpError(400, 'Give the camera a name.');
  if (name.length > 40) throw new HttpError(400, 'Camera names can be up to 40 characters.');
  return name;
}

export function createCamera(input: { name?: unknown; mainUrl?: unknown; subUrl?: unknown }): number {
  const name = cleanName(input.name);
  const main = validateStreamUrl(input.mainUrl, 'Main stream address', true)!;
  const sub = validateStreamUrl(input.subUrl, 'Sub-stream address', false);
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM cameras').get() as { n: number }).n;
  if (count >= 32) throw new HttpError(400, 'You can add up to 32 cameras.');
  const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM cameras').get() as { p: number }).p;
  const r = db.prepare('INSERT INTO cameras (name, main_url, sub_url, position) VALUES (?, ?, ?, ?)').run(name, encryptSecret(main), sub ? encryptSecret(sub) : null, pos);
  forget(Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

/** Blank address fields keep the saved value; `clearSub: true` removes the sub-stream. */
export function updateCamera(id: number, input: { name?: unknown; mainUrl?: unknown; subUrl?: unknown; clearSub?: unknown }) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM cameras WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Camera not found.');
  if (input.name !== undefined) db.prepare('UPDATE cameras SET name = ? WHERE id = ?').run(cleanName(input.name), id);
  const main = validateStreamUrl(input.mainUrl, 'Main stream address', false);
  if (main) db.prepare('UPDATE cameras SET main_url = ? WHERE id = ?').run(encryptSecret(main), id);
  if (input.clearSub === true) db.prepare('UPDATE cameras SET sub_url = NULL WHERE id = ?').run(id);
  else {
    const sub = validateStreamUrl(input.subUrl, 'Sub-stream address', false);
    if (sub) db.prepare('UPDATE cameras SET sub_url = ? WHERE id = ?').run(encryptSecret(sub), id);
  }
  forget(id);
}

export async function deleteCamera(id: number) {
  const r = getDb().prepare('DELETE FROM cameras WHERE id = ?').run(id);
  if (!r.changes) throw new HttpError(404, 'Camera not found.');
  forget(id);
  if (!getConfig().demoMode) {
    for (const kind of ['main', 'sub'] as const) {
      try {
        await go2rtcFetch(`/api/streams?src=${encodeURIComponent(streamName(id, kind))}`, { method: 'DELETE' }, 5000);
      } catch {
        /* go2rtc may be offline; the stream is harmless and is replaced if the id is reused */
      }
    }
  }
}

export function reorderCameras(ids: unknown) {
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) throw new HttpError(400, 'Expected a list of camera ids.');
  const db = getDb();
  const set = db.prepare('UPDATE cameras SET position = ? WHERE id = ?');
  db.transaction(() => (ids as number[]).forEach((id, i) => set.run(i, id)))();
}

/* ---------------- NVR helper ---------------- */

export type NvrPattern = 'xmeye' | 'hikvision' | 'dahua' | 'custom';

const PATTERNS: Record<Exclude<NvrPattern, 'custom'>, { main: string; sub: string }> = {
  // Sannce and most other XMeye-based NVRs.
  xmeye: {
    main: 'rtsp://{ip}:554/user={user}&password={pass}&channel={channel}&stream=0.sdp?real_stream',
    sub: 'rtsp://{ip}:554/user={user}&password={pass}&channel={channel}&stream=1.sdp?real_stream',
  },
  hikvision: {
    main: 'rtsp://{user}:{pass}@{ip}:554/Streaming/Channels/{channel}01',
    sub: 'rtsp://{user}:{pass}@{ip}:554/Streaming/Channels/{channel}02',
  },
  dahua: {
    main: 'rtsp://{user}:{pass}@{ip}:554/cam/realmonitor?channel={channel}&subtype=0',
    sub: 'rtsp://{user}:{pass}@{ip}:554/cam/realmonitor?channel={channel}&subtype=1',
  },
};

function fill(tpl: string, v: { ip: string; user: string; pass: string; channel: number }) {
  return tpl
    .replaceAll('{ip}', v.ip)
    .replaceAll('{user}', encodeURIComponent(v.user))
    .replaceAll('{pass}', encodeURIComponent(v.pass))
    .replaceAll('{channel0}', String(v.channel - 1))
    .replaceAll('{channel}', String(v.channel));
}

/** Create one camera per NVR channel. Credentials are only ever sent to the server. */
export function addFromNvr(input: Record<string, unknown>): number[] {
  const ip = typeof input.ip === 'string' ? input.ip.trim() : '';
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(ip)) throw new HttpError(400, 'Enter the NVR IP address (for example 192.168.1.50).');
  const user = typeof input.username === 'string' ? input.username.trim() : '';
  const pass = typeof input.password === 'string' ? input.password : '';
  if (!user) throw new HttpError(400, 'Enter the NVR username.');
  const channels = Number(input.channels);
  if (!Number.isInteger(channels) || channels < 1 || channels > 16) throw new HttpError(400, 'Channels must be between 1 and 16.');
  const pattern = input.pattern as NvrPattern;
  let tpl: { main: string; sub: string };
  if (pattern === 'custom') {
    const main = typeof input.customMain === 'string' ? input.customMain.trim() : '';
    const sub = typeof input.customSub === 'string' ? input.customSub.trim() : '';
    if (!main.includes('{channel')) throw new HttpError(400, 'A custom pattern must include {channel}.');
    tpl = { main, sub };
  } else if (pattern in PATTERNS) {
    tpl = PATTERNS[pattern as keyof typeof PATTERNS];
  } else throw new HttpError(400, 'Pick a URL pattern.');
  const prefix = typeof input.namePrefix === 'string' && input.namePrefix.trim() ? input.namePrefix.trim().slice(0, 30) : 'Camera';
  const ids: number[] = [];
  for (let ch = 1; ch <= channels; ch++) {
    const v = { ip, user, pass, channel: ch };
    ids.push(createCamera({ name: `${prefix} ${ch}`, mainUrl: fill(tpl.main, v), subUrl: tpl.sub ? fill(tpl.sub, v) : '' }));
  }
  return ids;
}

/* ---------------- go2rtc ---------------- */

export function streamName(id: number, kind: StreamKind) {
  return `fh_cam${id}_${kind}`;
}

/** go2rtc base URL with any user:pass@ moved into a Basic auth header (fetch rejects credentials in URLs). */
function go2rtcBase(): { base: string; headers: Record<string, string> } {
  const raw = getConfig().go2rtc.url;
  if (!raw) throw new HttpError(503, 'go2rtc is not set up yet (Admin › Settings › Connections).');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(503, 'The go2rtc address is not valid.');
  }
  const headers: Record<string, string> = {};
  if (u.username || u.password) {
    headers.Authorization = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
    u.username = '';
    u.password = '';
  }
  return { base: u.toString().replace(/\/+$/, ''), headers };
}

async function go2rtcFetch(path: string, init: RequestInit = {}, timeoutMs = 10000, signal?: AbortSignal): Promise<Response> {
  const { base, headers } = go2rtcBase();
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  try {
    return await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: AbortSignal.any(signals), cache: 'no-store' });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') throw new HttpError(504, 'go2rtc did not answer in time.');
    const cause = (e as { cause?: { code?: string } }).cause;
    throw new HttpError(502, `go2rtc is unreachable${cause?.code ? ` (${cause.code})` : ''}.`);
  }
}

// Which source each go2rtc stream was last registered with (per process).
const g = globalThis as unknown as { __fhStreams?: Map<string, string>; __fhSnaps?: Map<string, { at: number; body: ArrayBuffer; type: string }> };
const registered = (g.__fhStreams ??= new Map());
const snapCache = (g.__fhSnaps ??= new Map());

function forget(id: number) {
  for (const kind of ['main', 'sub']) {
    registered.delete(`fh_cam${id}_${kind}`);
    snapCache.delete(`${id}:${kind}`);
  }
}

function sourceFor(cam: Camera, kind: StreamKind): string {
  return kind === 'sub' && cam.subUrl ? cam.subUrl : cam.mainUrl;
}

/** Tell go2rtc about a camera stream (add or replace). */
export async function registerStream(cam: Camera, kind: StreamKind, force = false) {
  const name = streamName(cam.id, kind);
  const src = sourceFor(cam, kind);
  if (!force && registered.get(name) === src) return;
  const res = await go2rtcFetch(`/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`, { method: 'PUT' }, 8000);
  if (!res.ok) throw new HttpError(502, `go2rtc refused the stream (HTTP ${res.status}).`);
  registered.set(name, src);
}

/** Register every camera with go2rtc (after saving cameras). Returns the number registered. */
export async function syncAll(): Promise<{ ok: number; failed: number; error?: string }> {
  if (getConfig().demoMode) return { ok: listCameras().length, failed: 0 };
  let ok = 0;
  let failed = 0;
  let error: string | undefined;
  for (const cam of listCameras()) {
    for (const kind of ['main', 'sub'] as const) {
      try {
        await registerStream(cam, kind, true);
        ok++;
      } catch (e) {
        failed++;
        error = (e as Error).message;
      }
    }
  }
  return { ok, failed, error };
}

/** Fetch from go2rtc, (re)registering the stream if go2rtc does not know it (e.g. after a restart). */
async function streamFetch(cam: Camera, kind: StreamKind, endpoint: string, timeoutMs: number, signal?: AbortSignal) {
  await registerStream(cam, kind);
  const path = `${endpoint}?src=${encodeURIComponent(streamName(cam.id, kind))}`;
  let res = await go2rtcFetch(path, {}, timeoutMs, signal);
  if (res.status === 404 || res.status === 500) {
    await res.body?.cancel();
    await registerStream(cam, kind, true);
    res = await go2rtcFetch(path, {}, timeoutMs, signal);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160).trim();
    throw new HttpError(502, `The camera did not respond via go2rtc (HTTP ${res.status}${detail ? `: ${detail}` : ''}). Check the stream address.`);
  }
  return res;
}

const NO_STORE = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };

/** A single JPEG frame. Cached for 2 seconds so several viewers share one grab. */
export async function snapshotResponse(id: number, kind: StreamKind): Promise<Response> {
  const cam = getCamera(id);
  if (getConfig().demoMode) return new Response(demoFrame(cam, kind), { headers: { ...NO_STORE, 'Content-Type': 'image/svg+xml' } });
  const key = `${id}:${kind}`;
  const hit = snapCache.get(key);
  if (hit && Date.now() - hit.at < 2000) return new Response(hit.body, { headers: { ...NO_STORE, 'Content-Type': hit.type } });
  const res = await streamFetch(cam, kind, '/api/frame.jpeg', 15000);
  const body = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/jpeg';
  snapCache.set(key, { at: Date.now(), body, type });
  return new Response(body, { headers: { ...NO_STORE, 'Content-Type': type } });
}

/**
 * Live video piped straight through from go2rtc. `mp4` is fragmented MP4
 * (plays in a <video> element); `mjpeg` is the fallback for browsers or
 * cameras (H.265) that the MP4 stream does not suit. The upstream connection
 * is closed as soon as the viewer goes away.
 */
export async function liveResponse(id: number, kind: StreamKind, format: 'mp4' | 'mjpeg', reqSignal: AbortSignal): Promise<Response> {
  const cam = getCamera(id);
  if (getConfig().demoMode) throw new HttpError(404, 'Live video is not available in demo mode.');
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  reqSignal.addEventListener('abort', onAbort, { once: true });
  // Long timeout: the stream stays open while someone is watching (capped at 2 hours).
  const res = await streamFetch(cam, kind, format === 'mp4' ? '/api/stream.mp4' : '/api/stream.mjpeg', 2 * 60 * 60 * 1000, ctrl.signal);
  const upstream = res.body;
  if (!upstream) throw new HttpError(502, 'go2rtc returned no video.');
  const reader = upstream.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          reqSignal.removeEventListener('abort', onAbort);
        } else controller.enqueue(value);
      } catch {
        controller.close();
      }
    },
    cancel() {
      ctrl.abort();
      reader.cancel().catch(() => undefined);
      reqSignal.removeEventListener('abort', onAbort);
    },
  });
  const type = res.headers.get('content-type') || (format === 'mp4' ? 'video/mp4' : 'multipart/x-mixed-replace; boundary=frame');
  return new Response(body, { headers: { ...NO_STORE, 'Content-Type': type, 'X-Accel-Buffering': 'no' } });
}

/** Admin "Test": grab a frame from the camera's sub-stream (or main) and report. */
export async function testCamera(id: number): Promise<{ ok: boolean; message: string }> {
  const cam = getCamera(id);
  if (getConfig().demoMode) return { ok: true, message: 'Demo mode: showing a generated picture.' };
  try {
    forget(id);
    const res = await streamFetch(cam, cam.subUrl ? 'sub' : 'main', '/api/frame.jpeg', 20000);
    const size = (await res.arrayBuffer()).byteLength;
    return { ok: true, message: `Got a picture from ${cam.name} (${Math.round(size / 1024)} KB).` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/* ---------------- Demo mode ---------------- */

const DEMO_CAMS = [
  ['Front door', '#2E7D5B'],
  ['Driveway', '#1B4F8A'],
  ['Back garden', '#6B3FA0'],
  ['Side passage', '#8A3B1B'],
] as const;

function ensureDemoCameras() {
  if (!getConfig().demoMode) return;
  const db = getDb();
  if ((db.prepare('SELECT COUNT(*) AS n FROM cameras').get() as { n: number }).n > 0) return;
  const ins = db.prepare('INSERT INTO cameras (name, main_url, sub_url, position) VALUES (?, ?, ?, ?)');
  DEMO_CAMS.forEach(([name], i) => {
    const base = `rtsp://192.168.1.150:554/user=admin&password=demo-secret&channel=${i + 1}`;
    ins.run(name, encryptSecret(`${base}&stream=0.sdp?real_stream`), encryptSecret(`${base}&stream=1.sdp?real_stream`), i);
  });
}

function demoFrame(cam: Camera, kind: StreamKind): string {
  const idx = Math.abs(cam.id - 1) % DEMO_CAMS.length;
  const colour = DEMO_CAMS[idx][1];
  const now = new Date();
  const t = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London' });
  const d = now.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
  const x = 80 + ((now.getTime() / 1000) * 37) % 1120;
  const w = kind === 'main' ? 1280 : 640;
  const s = w / 1280;
  const name = cam.name.replace(/[&<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${720 * s}" viewBox="0 0 1280 720"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2937"/><stop offset="1" stop-color="${colour}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#sky)"/><rect y="470" width="1280" height="250" fill="#111827" opacity="0.7"/><path d="M0 470 L380 300 L640 470 Z" fill="#0f172a" opacity="0.6"/><rect x="760" y="250" width="300" height="220" fill="#0f172a" opacity="0.55"/><rect x="880" y="360" width="60" height="110" fill="#334155"/><circle cx="${x.toFixed(0)}" cy="520" r="26" fill="#f59e0b" opacity="0.85"/><rect x="${(x - 14).toFixed(0)}" y="546" width="28" height="60" rx="10" fill="#f59e0b" opacity="0.85"/><rect x="0" y="0" width="1280" height="64" fill="#000" opacity="0.45"/><text x="28" y="43" font-family="Consolas,Menlo,monospace" font-size="30" fill="#fff">${name}</text><text x="1252" y="43" font-family="Consolas,Menlo,monospace" font-size="30" fill="#fff" text-anchor="end">${d} ${t}</text><text x="1252" y="700" font-family="Segoe UI,Arial,sans-serif" font-size="26" fill="#fff" opacity="0.8" text-anchor="end">DEMO · ${kind === 'main' ? 'main stream' : 'sub-stream'}</text></svg>`;
}
