import 'server-only';
import { getDb, getSettings, type RequestRow } from './db';
import { getConfig } from './config';
import { KIND_FOR_MEDIA } from './arr';
import * as svc from './services';
import { queueNotification } from './notify';
import { HttpError, type SessionUser } from './auth';
import { canUse } from './features';
import type { MediaType, RequestStatus, RequestView, SearchResult } from './types';

const ACTIVE: RequestStatus[] = ['pending', 'approved', 'downloading', 'available'];

type JoinedRow = RequestRow & { requested_by: string; decided_by_name: string | null };

function toView(r: JoinedRow): RequestView {
  return {
    id: r.id,
    mediaType: r.media_type,
    externalId: r.external_id,
    title: r.title,
    year: r.year,
    poster: r.poster,
    overview: r.overview,
    status: r.status,
    note: r.note,
    requestedBy: r.requested_by,
    requestedById: r.user_id,
    decidedBy: r.decided_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `SELECT r.*, u.name AS requested_by, d.name AS decided_by_name
  FROM requests r JOIN users u ON u.id = r.user_id LEFT JOIN users d ON d.id = r.decided_by`;

export function findActiveRequest(mediaType: MediaType, externalId: string): JoinedRow | undefined {
  return getDb()
    .prepare(`${SELECT} WHERE r.media_type = ? AND r.external_id = ? AND r.status IN (${ACTIVE.map(() => '?').join(',')}) ORDER BY r.id DESC LIMIT 1`)
    .get(mediaType, externalId, ...ACTIVE) as JoinedRow | undefined;
}

/** Search an *arr app and annotate each result with library / request state. */
export async function search(mediaType: MediaType, term: string): Promise<SearchResult[]> {
  const kind = KIND_FOR_MEDIA[mediaType];
  if (!svc.isArrAvailable(kind)) throw new HttpError(503, `${kind[0].toUpperCase()}${kind.slice(1)} is not configured.`);
  const [items, library] = await Promise.all([svc.lookup(kind, term), svc.getLibrary(kind).catch(() => new Map())]);
  return items.slice(0, 30).map((i) => {
    const req = findActiveRequest(mediaType, i.externalId);
    return {
      mediaType,
      externalId: i.externalId,
      title: i.title,
      year: i.year,
      overview: i.overview,
      poster: i.poster,
      meta: i.meta,
      inLibrary: Boolean(i.arrId) || library.has(i.externalId),
      requested: req ? { status: req.status, by: req.requested_by } : null,
    };
  });
}

function setStatus(id: number, status: RequestStatus, extra: { arrId?: number | null; note?: string | null; decidedBy?: number } = {}) {
  getDb()
    .prepare(
      `UPDATE requests SET status = ?, arr_id = COALESCE(?, arr_id), note = COALESCE(?, note),
       decided_by = COALESCE(?, decided_by), updated_at = datetime('now') WHERE id = ?`,
    )
    .run(status, extra.arrId ?? null, extra.note ?? null, extra.decidedBy ?? null, id);
}

async function sendToArr(row: RequestRow, decidedBy?: number) {
  const kind = KIND_FOR_MEDIA[row.media_type];
  try {
    const arrId = await svc.addToArr(kind, row.external_id);
    setStatus(row.id, 'approved', { arrId, decidedBy, note: '' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(row.id, 'failed', { note: msg, decidedBy });
    throw new HttpError(502, `Could not send to ${kind}: ${msg}`);
  }
}

export async function createRequest(
  user: SessionUser,
  input: { mediaType: MediaType; externalId: string },
): Promise<RequestView> {
  const { mediaType, externalId } = input;
  if (!['movie', 'tv', 'music'].includes(mediaType) || !externalId) throw new HttpError(400, 'Invalid request.');
  const existing = findActiveRequest(mediaType, externalId);
  if (existing) throw new HttpError(409, `Already requested by ${existing.requested_by}.`);

  // Re-fetch the details server-side rather than trusting what the browser sent.
  const kind = KIND_FOR_MEDIA[mediaType];
  const termFor = { movie: `tmdb:${externalId}`, tv: `tvdb:${externalId}`, music: `lidarr:${externalId}` }[mediaType];
  const [found, library] = await Promise.all([svc.lookup(kind, termFor), svc.getLibrary(kind)]);
  const details = found.find((f) => f.externalId === externalId);
  if (!details) throw new HttpError(404, 'Could not find that title.');
  if (details.arrId || library.has(externalId)) throw new HttpError(409, 'Already in the library.');

  // Re-check after the awaits above (SQLite writes are synchronous, so this closes the race).
  if (findActiveRequest(mediaType, externalId)) throw new HttpError(409, 'Already requested.');
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO requests (user_id, media_type, external_id, title, year, poster, overview, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .run(user.id, mediaType, externalId, details.title, details.year, details.poster?.slice(0, 200000) ?? null, details.overview);
  const id = Number(info.lastInsertRowid);
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow;

  // Admins skip the approval queue; otherwise respect the toggle.
  // People who can approve requests do not need to wait for approval themselves.
  const approver = user.role === 'admin' || canUse(user, 'approve');
  if (!getSettings().requireApproval || approver) {
    await sendToArr(row, approver ? user.id : undefined);
  } else {
    queueNotification('newRequest', id);
  }
  return getRequest(id)!;
}

export function getRequest(id: number): RequestView | undefined {
  const r = getDb().prepare(`${SELECT} WHERE r.id = ?`).get(id) as JoinedRow | undefined;
  return r ? toView(r) : undefined;
}

export async function approveRequest(admin: SessionUser, id: number) {
  const row = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!row) throw new HttpError(404, 'Request not found.');
  if (!['pending', 'failed', 'declined'].includes(row.status)) throw new HttpError(409, 'This request has already been approved.');
  await sendToArr(row, admin.id);
  if (row.user_id !== admin.id) queueNotification('approved', id);
  return getRequest(id)!;
}

export function declineRequest(admin: SessionUser, id: number, note?: string) {
  const row = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!row) throw new HttpError(404, 'Request not found.');
  if (row.status !== 'pending' && row.status !== 'failed') throw new HttpError(409, 'Only pending requests can be declined.');
  setStatus(id, 'declined', { decidedBy: admin.id, note: note?.slice(0, 500) || '' });
  if (row.user_id !== admin.id) queueNotification('declined', id);
  return getRequest(id)!;
}

export function deleteRequest(user: SessionUser, id: number) {
  const row = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!row) throw new HttpError(404, 'Request not found.');
  const own = row.user_id === user.id && ['pending', 'declined', 'failed'].includes(row.status);
  if (user.role !== 'admin' && !own) throw new HttpError(403, 'You can only cancel your own pending requests.');
  getDb().prepare('DELETE FROM requests WHERE id = ?').run(id);
}

/** Refresh approved/downloading requests against the *arr libraries and queues. */
export async function syncStatuses() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM requests WHERE status IN ('approved','downloading')`).all() as RequestRow[];
  if (!rows.length) return;
  const kinds = [...new Set(rows.map((r) => KIND_FOR_MEDIA[r.media_type]))];
  const state = new Map<string, { library: Map<string, { arrId: number; available: boolean }>; queued: Set<number> }>();
  await Promise.all(
    kinds.map(async (k) => {
      try {
        const [library, queued] = await Promise.all([svc.getLibrary(k), svc.getQueuedArrIds(k)]);
        state.set(k, { library, queued });
      } catch {
        /* service offline: leave statuses as they are */
      }
    }),
  );
  for (const r of rows) {
    const s = state.get(KIND_FOR_MEDIA[r.media_type]);
    if (!s) continue;
    const entry = s.library.get(r.external_id);
    const arrId = entry?.arrId ?? r.arr_id;
    let next: RequestStatus = r.status;
    if (entry?.available) next = 'available';
    else if (arrId && s.queued.has(arrId)) next = 'downloading';
    else next = 'approved';
    if (next !== r.status) {
      setStatus(r.id, next, { arrId: arrId ?? undefined });
      if (next === 'available') queueNotification('available', r.id);
    }
  }
}

/**
 * Background poller: checks Sonarr/Radarr/Lidarr every few minutes so
 * "available" notifications go out even when nobody has the hub open.
 * Started once per server process from instrumentation.ts.
 */
export function startStatusPoller() {
  const g = globalThis as unknown as { __fhPoller?: NodeJS.Timeout };
  if (g.__fhPoller) return;
  const minutes = Math.max(1, getConfig().ntfy.pollMinutes);
  const run = () => syncStatuses().catch((e) => console.error('[family-hub] background status check failed', e));
  g.__fhPoller = setInterval(run, minutes * 60_000);
  g.__fhPoller.unref?.();
  setTimeout(run, 15_000).unref?.();
  console.log(`[family-hub] Checking request status every ${minutes} minute${minutes === 1 ? '' : 's'}.`);
}

/** Restart the poller and run a check soon, e.g. after connection details change. */
export function restartStatusPoller() {
  const g = globalThis as unknown as { __fhPoller?: NodeJS.Timeout };
  if (g.__fhPoller) clearInterval(g.__fhPoller);
  g.__fhPoller = undefined;
  startStatusPoller();
}

export async function listRequests(opts: { userId?: number; status?: RequestStatus }) {
  await syncStatuses().catch((e) => console.error('[family-hub] status sync failed', e));
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.userId) {
    where.push('r.user_id = ?');
    args.push(opts.userId);
  }
  if (opts.status) {
    where.push('r.status = ?');
    args.push(opts.status);
  }
  const rows = getDb()
    .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT 500`)
    .all(...args) as JoinedRow[];
  return rows.map(toView);
}
