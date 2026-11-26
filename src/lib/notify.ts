import 'server-only';
import crypto from 'node:crypto';
import { getConfig } from './config';
import { getDb, getSettings, type RequestRow, type UserRow } from './db';

/**
 * Push notifications via ntfy (https://ntfy.sh or a self-hosted server).
 * Every function here swallows its own errors: a notification problem must
 * never break a request, an approval or the status poller.
 */

export type NotifyEvent = 'approved' | 'declined' | 'available' | 'newRequest';

export interface NotifyPrefs {
  approved: boolean;
  declined: boolean;
  available: boolean;
  newRequest: boolean; // admins only
}

export const DEFAULT_PREFS: NotifyPrefs = { approved: true, declined: true, available: true, newRequest: true };

const MEDIA_WORD = { movie: 'film', tv: 'TV show', music: 'artist' } as const;

export function parsePrefs(raw: string | null): NotifyPrefs {
  try {
    return { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<NotifyPrefs>) : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(userId: number, prefs: Partial<NotifyPrefs>) {
  const user = getDb().prepare('SELECT notify_prefs FROM users WHERE id = ?').get(userId) as { notify_prefs: string | null } | undefined;
  const next = { ...parsePrefs(user?.notify_prefs ?? null) };
  for (const k of Object.keys(DEFAULT_PREFS) as (keyof NotifyPrefs)[]) if (typeof prefs[k] === 'boolean') next[k] = prefs[k] as boolean;
  getDb().prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return next;
}

function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'user';
}

/** Topic = prefix-name-<20 random base32 chars> (≈100 bits), so it can't be guessed. */
export function newTopic(name: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = crypto.randomBytes(20);
  const suffix = Array.from(bytes, (b) => alphabet[b % 32]).join('');
  const prefix = slug(getSettings().ntfyTopicPrefix || 'familyhub');
  return `${prefix}-${slug(name)}-${suffix}`.slice(0, 64);
}

/** Return the user's topic, creating one the first time it's needed. */
export function ensureTopic(userId: number): string {
  const db = getDb();
  const u = db.prepare('SELECT name, notify_topic FROM users WHERE id = ?').get(userId) as Pick<UserRow, 'name' | 'notify_topic'> | undefined;
  if (!u) throw new Error('User not found');
  if (u.notify_topic) return u.notify_topic;
  const topic = newTopic(u.name);
  db.prepare('UPDATE users SET notify_topic = ? WHERE id = ? AND notify_topic IS NULL').run(topic, userId);
  return (db.prepare('SELECT notify_topic FROM users WHERE id = ?').get(userId) as { notify_topic: string }).notify_topic;
}

export function regenerateTopic(userId: number): string {
  const u = getDb().prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string } | undefined;
  if (!u) throw new Error('User not found');
  const topic = newTopic(u.name);
  getDb().prepare('UPDATE users SET notify_topic = ? WHERE id = ?').run(topic, userId);
  return topic;
}

function authHeader(): string | undefined {
  return ntfyAuthHeader(getConfig().ntfy.token);
}

/** "user:password" → Basic auth; anything else (e.g. tk_...) → Bearer token. */
export function ntfyAuthHeader(token: string): string | undefined {
  if (!token) return undefined;
  // "user:password" → Basic auth; anything else (e.g. tk_...) → Bearer token.
  if (token.includes(':') && !token.startsWith('tk_')) return `Basic ${Buffer.from(token).toString('base64')}`;
  return `Bearer ${token}`;
}

interface Message {
  topic: string;
  title: string;
  message: string;
  click?: string;
  image?: string | null;
  tags?: string[];
  priority?: number;
}

/** Publish one message to ntfy. Throws on failure (callers catch). */
async function publish(m: Message): Promise<'sent' | 'logged'> {
  const cfg = getConfig();
  const s = getSettings();
  const body: Record<string, unknown> = { topic: m.topic, title: m.title, message: m.message, tags: m.tags, priority: m.priority ?? 3 };
  if (m.click) body.click = m.click;
  // ntfy can only fetch public http(s) images; demo posters are inline SVGs.
  if (m.image && /^https?:\/\//.test(m.image)) {
    body.icon = m.image;
    body.attach = m.image;
    body.filename = 'poster.jpg';
  }
  if (cfg.demoMode) {
    console.log(`[family-hub] (demo) ntfy → ${s.ntfyUrl}/${m.topic}: ${m.title} — ${m.message}${m.click ? ` [${m.click}]` : ''}`);
    return 'logged';
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;
  const res = await fetch(`${s.ntfyUrl}/`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) detail = j.error;
    } catch {
      /* keep statusText */
    }
    throw new Error(`ntfy HTTP ${res.status} ${detail}`.trim());
  }
  return 'sent';
}

export function describeError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; errors?: { code?: string }[] } };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'ntfy timed out';
  const code = err?.cause?.code || err?.cause?.errors?.find((x) => x.code)?.code;
  if (code) return `ntfy unreachable (${code})`;
  if (err?.message === 'fetch failed' && err.cause && (err.cause as Error).message) return `ntfy unreachable (${(err.cause as Error).message})`;
  return err?.message || String(e);
}

/**
 * Send to one user at most once per dedupe key. The key is claimed in SQLite
 * *before* sending, so overlapping pollers can't double-send.
 */
async function sendOnce(dedupeKey: string | null, user: Pick<UserRow, 'id' | 'name'>, event: NotifyEvent | 'test', requestId: number | null, m: Omit<Message, 'topic'>) {
  const db = getDb();
  let rowId: number;
  try {
    const info = db
      .prepare(`INSERT ${dedupeKey ? 'OR IGNORE' : ''} INTO notifications (dedupe_key, user_id, event, request_id, title, message) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(dedupeKey, user.id, event, requestId, m.title, m.message);
    if (!info.changes) return { status: 'duplicate' as const };
    rowId = Number(info.lastInsertRowid);
  } catch (e) {
    console.error('[family-hub] notification bookkeeping failed', e);
    return { status: 'failed' as const, error: describeError(e) };
  }
  try {
    const status = await publish({ ...m, topic: ensureTopic(user.id) });
    db.prepare('UPDATE notifications SET status = ? WHERE id = ?').run(status, rowId);
    return { status };
  } catch (e) {
    const error = describeError(e);
    console.warn(`[family-hub] notification to ${user.name} failed: ${error}`);
    db.prepare('UPDATE notifications SET status = ?, error = ? WHERE id = ?').run('failed', error.slice(0, 500), rowId);
    return { status: 'failed' as const, error };
  }
}

function clickUrl(path: string) {
  return `${getSettings().publicUrl}${path}`;
}

function label(r: RequestRow) {
  return r.year ? `${r.title} (${r.year})` : r.title;
}

/** Build and send the notification for a request event. Never throws. */
export async function notifyRequestEvent(event: NotifyEvent, requestId: number): Promise<void> {
  try {
    if (!getSettings().notificationsEnabled) return;
    const db = getDb();
    const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as RequestRow | undefined;
    if (!r) return;
    const what = MEDIA_WORD[r.media_type];

    if (event === 'newRequest') {
      const requester = db.prepare('SELECT name FROM users WHERE id = ?').get(r.user_id) as { name: string } | undefined;
      const admins = db.prepare(`SELECT * FROM users WHERE role = 'admin' AND id != ?`).all(r.user_id) as UserRow[];
      await Promise.all(
        admins
          .filter((a) => parsePrefs(a.notify_prefs).newRequest)
          .map((a) =>
            sendOnce(`newRequest:${r.id}:${a.id}`, a, event, r.id, {
              title: `New request: ${label(r)}`,
              message: `${requester?.name ?? 'Someone'} asked for this ${what}. It needs your approval.`,
              click: clickUrl('/admin/requests?status=pending'),
              image: r.poster,
              tags: ['inbox_tray'],
              priority: 4,
            }),
          ),
      );
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id) as UserRow | undefined;
    if (!user || !parsePrefs(user.notify_prefs)[event]) return;
    const msg = {
      approved: { title: `Approved: ${label(r)}`, message: `Your ${what} request was approved and is being downloaded. We'll let you know when it's ready.`, tags: ['white_check_mark'] },
      declined: { title: `Declined: ${label(r)}`, message: r.note ? `Your ${what} request was declined. Reason: ${r.note}` : `Your ${what} request was declined.`, tags: ['no_entry'] },
      available: { title: `Ready to watch: ${label(r)}`, message: r.media_type === 'music' ? `${r.title} is now in the music library.` : `Your ${what} request is now available on Plex.`, tags: ['tada'] },
    }[event];
    if (r.media_type === 'music' && event === 'available') msg.title = `Ready to listen: ${label(r)}`;
    await sendOnce(`${event}:${r.id}`, user, event, r.id, { ...msg, click: clickUrl('/my-requests'), image: r.poster, priority: event === 'available' ? 4 : 3 });
  } catch (e) {
    console.error('[family-hub] notification failed', e);
  }
}

/** Fire-and-forget wrapper for use inside the request flow. */
export function queueNotification(event: NotifyEvent, requestId: number) {
  void notifyRequestEvent(event, requestId).catch(() => undefined);
}

export async function sendTest(userId: number) {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!user) return { status: 'failed' as const, error: 'User not found' };
  return sendOnce(null, user, 'test', null, {
    title: 'Family Hub test notification',
    message: `Hello ${user.name}! Notifications from Family Hub are working on this device.`,
    click: clickUrl('/account'),
    tags: ['bell'],
  });
}

export function recentNotifications(limit = 20, userId?: number) {
  return getDb()
    .prepare(
      `SELECT n.id, n.event, n.title, n.message, n.status, n.error, n.created_at AS createdAt, u.name AS userName
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id ${userId ? 'WHERE n.user_id = ?' : ''}
       ORDER BY n.id DESC LIMIT ?`,
    )
    .all(...(userId ? [userId, limit] : [limit]));
}
