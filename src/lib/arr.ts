import 'server-only';
import type { ArrConfig, ArrKind } from './config';
import { getConfig } from './config';
import { fetchJson, ServiceError } from './http';
import type { Settings } from './db';
import type { CalendarItem, MediaType, QueueItem, RecentItem } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export const KIND_FOR_MEDIA: Record<MediaType, ArrKind> = { movie: 'radarr', tv: 'sonarr', music: 'lidarr' };
const NAMES: Record<ArrKind, string> = { sonarr: 'Sonarr', radarr: 'Radarr', lidarr: 'Lidarr' };

export function arrConfig(kind: ArrKind): ArrConfig {
  return getConfig()[kind];
}

export function isConfigured(kind: ArrKind) {
  const c = arrConfig(kind);
  return Boolean(c.url && c.apiKey);
}

async function arr<T = Any>(kind: ArrKind, path: string, init: RequestInit = {}): Promise<T> {
  const c = arrConfig(kind);
  if (!c.apiKey) throw new ServiceError(NAMES[kind], 'API key not configured');
  return fetchJson<T>(NAMES[kind], `${c.url}/api/${c.apiVersion}${path}`, {
    ...init,
    headers: { 'X-Api-Key': c.apiKey, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
  });
}

/** Pick a remote (internet) image URL so the browser never needs an *arr API key. */
export function pickImage(images: Any[] | undefined, types: string[] = ['poster', 'cover']): string | null {
  if (!Array.isArray(images)) return null;
  for (const t of types) {
    const img = images.find((i) => i.coverType === t);
    if (!img) continue;
    const url = img.remoteUrl || img.url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

export async function arrStatus(kind: ArrKind): Promise<{ version: string }> {
  return arr(kind, '/system/status');
}

/* ---------------- Queue ---------------- */

function formatTimeLeft(t?: string): string | undefined {
  if (!t) return undefined;
  // "1.02:03:04" or "02:03:04"
  const m = t.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/);
  if (!m) return t;
  const [, d, h, min] = m;
  const parts = [];
  if (d && d !== '0') parts.push(`${d}d`);
  if (h !== '00') parts.push(`${Number(h)}h`);
  parts.push(`${Number(min)}m`);
  return parts.join(' ');
}

export async function getQueue(kind: ArrKind): Promise<QueueItem[]> {
  const include =
    kind === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : kind === 'radarr' ? 'includeMovie=true' : 'includeArtist=true&includeAlbum=true';
  const data = await arr(kind, `/queue?page=1&pageSize=50&${include}`);
  const records: Any[] = data?.records ?? [];
  return records.map((r) => {
    let title = r.title;
    let subtitle: string | undefined;
    if (kind === 'sonarr' && r.series) {
      title = r.series.title;
      if (r.episode) subtitle = `S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')} · ${r.episode.title}`;
    } else if (kind === 'radarr' && r.movie) {
      title = r.movie.title;
      subtitle = r.movie.year ? String(r.movie.year) : undefined;
    } else if (kind === 'lidarr' && r.artist) {
      title = r.artist.artistName;
      subtitle = r.album?.title;
    }
    const size = Number(r.size) || 0;
    const left = Number(r.sizeleft) || 0;
    return {
      id: `${kind}-${r.id}`,
      service: kind,
      title,
      subtitle,
      progress: size > 0 ? Math.round(((size - left) / size) * 1000) / 10 : 0,
      status: String(r.trackedDownloadState || r.status || 'queued'),
      timeLeft: formatTimeLeft(r.timeleft),
      sizeBytes: size || undefined,
    };
  });
}

/* ---------------- Recent imports ---------------- */

const IMPORT_EVENTS = new Set(['downloadFolderImported', 'trackFileImported', 'downloadImported']);

export async function getRecent(kind: ArrKind, limit = 10): Promise<RecentItem[]> {
  const include =
    kind === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : kind === 'radarr' ? 'includeMovie=true' : 'includeArtist=true&includeAlbum=true';
  const data = await arr(kind, `/history?page=1&pageSize=100&sortKey=date&sortDirection=descending&${include}`);
  const out: RecentItem[] = [];
  const seen = new Set<string>();
  for (const r of (data?.records ?? []) as Any[]) {
    if (!IMPORT_EVENTS.has(r.eventType)) continue;
    let key: string, title: string, subtitle: string | undefined, poster: string | null = null;
    if (kind === 'sonarr') {
      key = `e${r.episodeId}`;
      title = r.series?.title ?? r.sourceTitle;
      if (r.episode) subtitle = `S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')} · ${r.episode.title}`;
      poster = pickImage(r.series?.images);
    } else if (kind === 'radarr') {
      key = `m${r.movieId}`;
      title = r.movie?.title ?? r.sourceTitle;
      subtitle = r.movie?.year ? String(r.movie.year) : undefined;
      poster = pickImage(r.movie?.images);
    } else {
      key = `a${r.albumId}`;
      title = r.album?.title ?? r.sourceTitle;
      subtitle = r.artist?.artistName;
      poster = pickImage(r.album?.images, ['cover', 'poster']) ?? pickImage(r.artist?.images);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${kind}-${r.id}`, service: kind, title, subtitle, date: r.date, poster: poster ?? undefined });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------------- Calendars ---------------- */

export async function getSonarrCalendar(days = 14): Promise<CalendarItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400000);
  const data: Any[] = await arr('sonarr', `/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeSeries=true&unmonitored=false`);
  return (data ?? []).map((e) => ({
    id: `sonarr-${e.id}`,
    service: 'sonarr' as const,
    title: e.series?.title ?? 'Unknown series',
    subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} · ${e.title ?? 'TBA'}`,
    date: e.airDateUtc ?? e.airDate,
    poster: pickImage(e.series?.images) ?? undefined,
    hasFile: Boolean(e.hasFile),
  }));
}

export async function getRadarrCalendar(days = 60): Promise<CalendarItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400000);
  const data: Any[] = await arr('radarr', `/calendar?start=${start.toISOString()}&end=${end.toISOString()}&unmonitored=false`);
  const items: CalendarItem[] = [];
  for (const m of data ?? []) {
    const candidates: [string, string | undefined][] = [
      ['In cinemas', m.inCinemas],
      ['Digital release', m.digitalRelease],
      ['Physical release', m.physicalRelease],
    ];
    const upcoming = candidates
      .filter(([, d]) => d && new Date(d) >= start && new Date(d) <= end)
      .sort((a, b) => new Date(a[1]!).getTime() - new Date(b[1]!).getTime());
    if (!upcoming.length) continue;
    items.push({
      id: `radarr-${m.id}`,
      service: 'radarr',
      title: m.title,
      subtitle: `${upcoming[0][0]}${m.year ? ` · ${m.year}` : ''}`,
      date: upcoming[0][1]!,
      poster: pickImage(m.images) ?? undefined,
      hasFile: Boolean(m.hasFile),
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- Library ---------------- */

export interface LibraryEntry {
  arrId: number;
  available: boolean;
}

const libraryCache = new Map<ArrKind, { at: number; raw: Any[]; map: Map<string, LibraryEntry> }>();

async function loadLibrary(kind: ArrKind, maxAgeMs: number) {
  const cached = libraryCache.get(kind);
  if (cached && Date.now() - cached.at < maxAgeMs) return cached;
  const path = kind === 'radarr' ? '/movie' : kind === 'sonarr' ? '/series' : '/artist';
  const raw: Any[] = (await arr<Any[]>(kind, path)) ?? [];
  const map = new Map<string, LibraryEntry>();
  for (const i of raw) {
    if (kind === 'radarr') map.set(String(i.tmdbId), { arrId: i.id, available: Boolean(i.hasFile) });
    else if (kind === 'sonarr') map.set(String(i.tvdbId), { arrId: i.id, available: (i.statistics?.episodeFileCount ?? 0) > 0 });
    else map.set(String(i.foreignArtistId), { arrId: i.id, available: (i.statistics?.trackFileCount ?? 0) > 0 });
  }
  const entry = { at: Date.now(), raw, map };
  libraryCache.set(kind, entry);
  return entry;
}

/** Map of external id (tmdbId / tvdbId / MusicBrainz id) -> library entry. Cached briefly. */
export async function getLibrary(kind: ArrKind, maxAgeMs = 60000): Promise<Map<string, LibraryEntry>> {
  return (await loadLibrary(kind, maxAgeMs)).map;
}

export interface LibrarySeed {
  title: string;
  tmdbId?: number;
  tvdbId?: number;
  added?: string;
  genres: string[];
}

/** Library titles (newest first) used as seeds for recommendations. */
export async function getLibrarySeeds(kind: 'sonarr' | 'radarr'): Promise<LibrarySeed[]> {
  const { raw } = await loadLibrary(kind, 5 * 60000);
  return raw
    .map((i) => ({
      title: i.title as string,
      tmdbId: i.tmdbId || undefined,
      tvdbId: i.tvdbId || undefined,
      added: i.added as string | undefined,
      genres: Array.isArray(i.genres) ? i.genres : [],
    }))
    .sort((a, b) => (b.added ?? '').localeCompare(a.added ?? ''));
}

/** Radarr's built-in Discover list (no API key needed beyond Radarr's own). */
export async function getRadarrDiscover(): Promise<Any[]> {
  return (await arr<Any[]>('radarr', '/importlist/movie?includeRecommendations=true&includeTrending=true&includePopular=true')) ?? [];
}

export function invalidateLibrary(kind: ArrKind) {
  libraryCache.delete(kind);
}

/** Set of library ids (arr internal id) currently in the download queue. */
export async function getQueuedArrIds(kind: ArrKind): Promise<Set<number>> {
  const data = await arr(kind, '/queue?page=1&pageSize=200');
  const field = kind === 'radarr' ? 'movieId' : kind === 'sonarr' ? 'seriesId' : 'artistId';
  return new Set(((data?.records ?? []) as Any[]).map((r) => r[field]).filter(Boolean));
}

/* ---------------- Lookup ---------------- */

export interface LookupItem {
  externalId: string;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  meta?: string;
  arrId?: number;
  raw: Any;
}

export async function lookup(kind: ArrKind, term: string): Promise<LookupItem[]> {
  const q = encodeURIComponent(term);
  if (kind === 'radarr') {
    const data: Any[] = await arr('radarr', `/movie/lookup?term=${q}`);
    return (data ?? [])
      .filter((m) => m.tmdbId)
      .map((m) => ({
        externalId: String(m.tmdbId),
        title: m.title,
        year: m.year || null,
        overview: m.overview ?? '',
        poster: m.remotePoster || pickImage(m.images),
        meta: [m.runtime ? `${m.runtime} min` : '', (m.genres ?? []).slice(0, 3).join(', ')].filter(Boolean).join(' · '),
        arrId: m.id || undefined,
        raw: m,
      }));
  }
  if (kind === 'sonarr') {
    const data: Any[] = await arr('sonarr', `/series/lookup?term=${q}`);
    return (data ?? [])
      .filter((s) => s.tvdbId)
      .map((s) => ({
        externalId: String(s.tvdbId),
        title: s.title,
        year: s.year || null,
        overview: s.overview ?? '',
        poster: s.remotePoster || pickImage(s.images),
        meta: [s.network, s.seasonCount ? `${s.seasonCount} season${s.seasonCount === 1 ? '' : 's'}` : s.seasons ? `${s.seasons.filter((x: Any) => x.seasonNumber > 0).length} seasons` : '', s.status === 'ended' ? 'Ended' : s.status === 'continuing' ? 'Continuing' : '']
          .filter(Boolean)
          .join(' · '),
        arrId: s.id || undefined,
        raw: s,
      }));
  }
  const data: Any[] = await arr('lidarr', `/artist/lookup?term=${q}`);
  return (data ?? [])
    .filter((a) => a.foreignArtistId)
    .map((a) => ({
      externalId: String(a.foreignArtistId),
      title: a.artistName,
      year: null,
      overview: a.overview ?? '',
      poster: pickImage(a.images, ['poster', 'fanart', 'banner']),
      meta: [a.artistType, a.disambiguation, (a.genres ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
      arrId: a.id || undefined,
      raw: a,
    }));
}

async function lookupExact(kind: ArrKind, externalId: string): Promise<Any> {
  let items: Any[];
  if (kind === 'radarr') {
    const m = await arr('radarr', `/movie/lookup/tmdb?tmdbId=${encodeURIComponent(externalId)}`);
    items = m ? [m] : [];
  } else if (kind === 'sonarr') {
    items = await arr('sonarr', `/series/lookup?term=${encodeURIComponent(`tvdb:${externalId}`)}`);
  } else {
    items = await arr('lidarr', `/artist/lookup?term=${encodeURIComponent(`lidarr:${externalId}`)}`);
  }
  const idField = kind === 'radarr' ? 'tmdbId' : kind === 'sonarr' ? 'tvdbId' : 'foreignArtistId';
  const match = (items ?? []).find((i) => String(i[idField]) === String(externalId));
  if (!match) throw new ServiceError(NAMES[kind], `could not find item ${externalId}`);
  return match;
}

/* ---------------- Options (root folders / profiles) ---------------- */

export interface ArrOptions {
  rootFolders: { path: string; freeSpace?: number }[];
  qualityProfiles: { id: number; name: string }[];
  metadataProfiles?: { id: number; name: string }[];
}

export async function getOptions(kind: ArrKind): Promise<ArrOptions> {
  const [roots, profiles, meta] = await Promise.all([
    arr<Any[]>(kind, '/rootfolder'),
    arr<Any[]>(kind, '/qualityprofile'),
    kind === 'lidarr' ? arr<Any[]>(kind, '/metadataprofile') : Promise.resolve(undefined),
  ]);
  return {
    rootFolders: (roots ?? []).map((r) => ({ path: r.path, freeSpace: r.freeSpace })),
    qualityProfiles: (profiles ?? []).map((p) => ({ id: p.id, name: p.name })),
    metadataProfiles: meta?.map((p) => ({ id: p.id, name: p.name })),
  };
}

/* ---------------- Add ---------------- */

export async function addToArr(kind: ArrKind, externalId: string, settings: Settings): Promise<number> {
  const prefix = kind as 'sonarr' | 'radarr' | 'lidarr';
  const opts = await getOptions(kind);
  const rootFolderPath = settings[`${prefix}RootFolder`] || opts.rootFolders[0]?.path;
  const qualityProfileId = settings[`${prefix}QualityProfileId`] ?? opts.qualityProfiles[0]?.id;
  if (!rootFolderPath) throw new ServiceError(NAMES[kind], 'no root folder configured');
  if (!qualityProfileId) throw new ServiceError(NAMES[kind], 'no quality profile configured');

  const item = await lookupExact(kind, externalId);
  if (item.id) return item.id; // already in the library

  let body: Any;
  let path: string;
  if (kind === 'radarr') {
    path = '/movie';
    body = {
      ...item,
      qualityProfileId,
      rootFolderPath,
      monitored: true,
      minimumAvailability: 'released',
      addOptions: { searchForMovie: true },
    };
  } else if (kind === 'sonarr') {
    path = '/series';
    body = {
      ...item,
      qualityProfileId,
      languageProfileId: 1, // required by Sonarr v3, ignored by v4
      rootFolderPath,
      monitored: true,
      seasonFolder: true,
      addOptions: { monitor: 'all', searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false },
    };
  } else {
    const metadataProfileId = settings.lidarrMetadataProfileId ?? opts.metadataProfiles?.[0]?.id ?? 1;
    path = '/artist';
    body = {
      ...item,
      qualityProfileId,
      metadataProfileId,
      rootFolderPath,
      monitored: true,
      monitorNewItems: 'all',
      addOptions: { monitor: 'all', searchForMissingAlbums: true },
    };
  }
  const created = await arr(kind, path, { method: 'POST', body: JSON.stringify(body) });
  invalidateLibrary(kind);
  return created.id;
}
