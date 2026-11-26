import 'server-only';
import { getConfig } from './config';
import { fetchJson } from './http';
import * as arr from './arr';
import * as mock from './mock';
import * as svc from './services';
import { findActiveRequest } from './requests';
import type { RecItem, RecMediaType, RecResponse, RecSection, RecSource } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * "You may enjoy" recommendations.
 *
 *  - TMDB (TMDB_API_KEY set): "Because you have X" (TMDB recommendations for
 *    recent library titles) + trending this week (+ films coming soon).
 *  - No key, TV: TVmaze (free, no key) shows airing now, sorted by popularity,
 *    plus genre matches against the Sonarr library.
 *  - No key, films: Radarr's own Discover list (recommendations/trending/popular).
 *
 * Raw candidate lists are cached in memory (REC_CACHE_HOURS, default 6). Library
 * and request filtering is applied on every call so the lists stay accurate.
 * All calls happen server-side; no key ever reaches the browser.
 */

interface RawResult {
  source: RecSource;
  sections: RecSection[];
  hint?: string;
  error?: string;
  at: number;
}

const g = globalThis as unknown as {
  __recCache?: Map<RecMediaType, RawResult>;
  __recInflight?: Map<RecMediaType, Promise<RawResult>>;
  __tvdbCache?: Map<number, { tvdb: number | null; at: number }>;
};
const cache: Map<RecMediaType, RawResult> = (g.__recCache ??= new Map());
const inflight: Map<RecMediaType, Promise<RawResult>> = (g.__recInflight ??= new Map());
const tvdbCache: Map<number, { tvdb: number | null; at: number }> = (g.__tvdbCache ??= new Map());

/** Forget all cached recommendations (e.g. after the TMDB key or a service changes). */
export function clearRecommendationCache() {
  cache.clear();
  inflight.clear();
  tvdbCache.clear();
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const NO_KEY_HINT =
  'Add a free TMDB API key on Admin › Settings › Connections for personalised “Because you have…” recommendations (see the README).';

/* ---------------- helpers ---------------- */

function yearOf(d?: string | null): number | null {
  const y = d ? Number.parseInt(d.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}

function stripHtml(s?: string | null) {
  return (s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function shorten(s: string, max = 280) {
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
}

/** Run async work over a list with limited concurrency. */
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Stable daily rotation so seeds vary from day to day but not between refreshes. */
function rotate<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const day = Math.floor(Date.now() / 86400000);
  const start = day % list.length;
  return [...list.slice(start), ...list.slice(0, start)].slice(0, n);
}

/* ---------------- TMDB ---------------- */

function tmdb<T = Any>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { apiKey, language } = getConfig().tmdb;
  const qs = new URLSearchParams({ language, ...params });
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Accept either a v3 API key or a v4 "API Read Access Token" (a long JWT).
  if (apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${apiKey}`;
  else qs.set('api_key', apiKey);
  return fetchJson<T>('TMDB', `https://api.themoviedb.org/3${path}?${qs}`, { headers });
}

async function tmdbTvToTvdb(tmdbId: number): Promise<number | null> {
  const hit = tvdbCache.get(tmdbId);
  if (hit && Date.now() - hit.at < 7 * 86400000) return hit.tvdb;
  try {
    const ext = await tmdb<{ tvdb_id?: number | null }>(`/tv/${tmdbId}/external_ids`, {});
    const tvdb = ext?.tvdb_id || null;
    tvdbCache.set(tmdbId, { tvdb, at: Date.now() });
    return tvdb;
  } catch {
    return null;
  }
}

async function seedTmdbIdForSeries(seed: arr.LibrarySeed): Promise<number | null> {
  if (seed.tmdbId) return seed.tmdbId; // Sonarr v4 includes tmdbId
  if (!seed.tvdbId) return null;
  try {
    const found = await tmdb<{ tv_results?: { id: number }[] }>(`/find/${seed.tvdbId}`, { external_source: 'tvdb_id' });
    return found?.tv_results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

function tmdbToItem(mediaType: RecMediaType, r: Any, externalId: string): RecItem {
  return {
    mediaType,
    externalId,
    title: r.title ?? r.name ?? 'Untitled',
    year: yearOf(r.release_date ?? r.first_air_date),
    overview: shorten(r.overview ?? ''),
    poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
    rating: typeof r.vote_average === 'number' ? Math.round(r.vote_average * 10) / 10 : null,
  };
}

async function tmdbSections(mediaType: RecMediaType): Promise<RecSection[]> {
  const kind = mediaType === 'tv' ? 'sonarr' : 'radarr';
  const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
  const sections: { id: string; title: string; results: Any[] }[] = [];

  // 1. "Because you have X" from recently added library titles.
  let seeds: arr.LibrarySeed[] = [];
  if (arr.isConfigured(kind)) {
    try {
      seeds = rotate((await arr.getLibrarySeeds(kind)).slice(0, 20), 4);
    } catch {
      /* Sonarr/Radarr offline: trending only */
    }
  }
  await pool(seeds, 4, async (seed) => {
    const id = mediaType === 'tv' ? await seedTmdbIdForSeries(seed) : seed.tmdbId ?? null;
    if (!id) return;
    try {
      let data = await tmdb<{ results?: Any[] }>(`/${tmdbType}/${id}/recommendations`);
      if (!data?.results?.length) data = await tmdb(`/${tmdbType}/${id}/similar`);
      if (data?.results?.length) sections.push({ id: `because-${id}`, title: `Because you have ${seed.title}`, results: data.results.slice(0, 14) });
    } catch {
      /* skip this seed */
    }
  });
  // Keep the seed order stable (pool finishes in any order).
  sections.sort((a, b) => seeds.findIndex((s) => `Because you have ${s.title}` === a.title) - seeds.findIndex((s) => `Because you have ${s.title}` === b.title));

  // 2. Trending this week (and, for films, coming soon).
  const trending = await tmdb<{ results?: Any[] }>(`/trending/${tmdbType}/week`);
  sections.push({ id: 'trending', title: 'Trending this week', results: (trending?.results ?? []).slice(0, 20) });
  if (mediaType === 'movie') {
    try {
      const upcoming = await tmdb<{ results?: Any[] }>('/movie/upcoming', { region: getConfig().tmdb.region });
      sections.push({ id: 'coming-soon', title: 'Coming soon to cinemas', results: (upcoming?.results ?? []).slice(0, 20) });
    } catch {
      /* optional */
    }
  }

  // 3. Map to the IDs Sonarr/Radarr use: TVDB for TV (via TMDB external_ids), TMDB for films.
  if (mediaType === 'movie') {
    return sections.map((s) => ({ id: s.id, title: s.title, items: s.results.filter((r) => r.id).map((r) => tmdbToItem('movie', r, String(r.id))) }));
  }
  const uniqueIds = [...new Set(sections.flatMap((s) => s.results.map((r) => r.id as number)))];
  const tvdbIds = new Map<number, number | null>();
  await pool(uniqueIds, 8, async (id) => tvdbIds.set(id, await tmdbTvToTvdb(id)));
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    items: s.results.filter((r) => tvdbIds.get(r.id)).map((r) => tmdbToItem('tv', r, String(tvdbIds.get(r.id)))),
  }));
}

/* ---------------- No-key fallbacks ---------------- */

async function tvmazeSections(): Promise<RecSection[]> {
  const today = new Date();
  const dates = [0, 1, 2].map((d) => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10));
  const country = getConfig().tmdb.region || 'GB';
  const calls = [
    ...dates.map((d) => fetchJson<Any[]>('TVmaze', `https://api.tvmaze.com/schedule/web?date=${d}`).then((eps) => eps.map((e) => e._embedded?.show))),
    fetchJson<Any[]>('TVmaze', `https://api.tvmaze.com/schedule?country=${country}&date=${dates[0]}`).then((eps) => eps.map((e) => e.show)),
  ];
  const settled = await Promise.allSettled(calls);
  const shows = new Map<number, Any>();
  for (const r of settled) if (r.status === 'fulfilled') for (const s of r.value) if (s?.id && s.externals?.thetvdb) shows.set(s.id, s);
  if (!shows.size) throw new Error('TVmaze returned no shows');

  const ranked = [...shows.values()]
    .filter((s) => !s.language || s.language === 'English')
    .filter((s) => s.type !== 'News' && s.type !== 'Sports' && s.type !== 'Talk Show')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const toItem = (s: Any): RecItem => ({
    mediaType: 'tv',
    externalId: String(s.externals.thetvdb),
    title: s.name,
    year: yearOf(s.premiered),
    overview: shorten(stripHtml(s.summary)),
    poster: s.image?.medium ?? s.image?.original ?? null,
    rating: s.rating?.average ?? null,
  });

  const sections: RecSection[] = [];
  // Genre matches against what the family already watches.
  if (arr.isConfigured('sonarr')) {
    try {
      const counts = new Map<string, number>();
      for (const seed of await arr.getLibrarySeeds('sonarr')) for (const genre of seed.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([genre]) => genre);
      for (const genre of top) {
        const items = ranked.filter((s) => (s.genres ?? []).includes(genre)).slice(0, 14).map(toItem);
        if (items.length) sections.push({ id: `genre-${genre}`, title: `Because you like ${genre.toLowerCase()}`, items });
      }
    } catch {
      /* Sonarr offline */
    }
  }
  sections.push({ id: 'popular', title: 'Popular on TV right now', items: ranked.slice(0, 20).map(toItem) });
  return sections;
}

async function radarrDiscoverSections(): Promise<RecSection[]> {
  const list = await arr.getRadarrDiscover();
  const toItem = (m: Any): RecItem => ({
    mediaType: 'movie',
    externalId: String(m.tmdbId),
    title: m.title,
    year: m.year || null,
    overview: shorten(m.overview ?? ''),
    poster: m.remotePoster || arr.pickImage(m.images),
    rating: m.ratings?.tmdb?.value ?? null,
  });
  const usable = list.filter((m) => m.tmdbId && !m.isExisting && !m.isExcluded);
  return [
    { id: 'recommended', title: 'Recommended for your library', items: usable.filter((m) => m.isRecommendation).slice(0, 20).map(toItem) },
    { id: 'trending', title: 'Trending', items: usable.filter((m) => m.isTrending).slice(0, 20).map(toItem) },
    { id: 'popular', title: 'Popular', items: usable.filter((m) => m.isPopular).slice(0, 20).map(toItem) },
  ].filter((s) => s.items.length);
}

/* ---------------- build + cache ---------------- */

async function build(mediaType: RecMediaType): Promise<RawResult> {
  const cfg = getConfig();
  const at = Date.now();
  if (cfg.demoMode) {
    return { source: 'demo', sections: mock.demoRecommendations(mediaType === 'tv' ? 'sonarr' : 'radarr'), hint: cfg.tmdb.apiKey ? undefined : NO_KEY_HINT, at };
  }
  if (cfg.tmdb.apiKey) {
    try {
      return { source: 'tmdb', sections: await tmdbSections(mediaType), at };
    } catch (e) {
      // Bad key / TMDB down: fall through to the free sources but tell the admin.
      const fallback = await buildNoKey(mediaType, at);
      return { ...fallback, hint: `TMDB could not be used (${e instanceof Error ? e.message : e}). Check the TMDB key on Admin › Settings › Connections.` };
    }
  }
  return buildNoKey(mediaType, at);
}

async function buildNoKey(mediaType: RecMediaType, at: number): Promise<RawResult> {
  try {
    if (mediaType === 'tv') return { source: 'tvmaze', sections: await tvmazeSections(), hint: NO_KEY_HINT, at };
    if (!arr.isConfigured('radarr')) return { source: 'none', sections: [], hint: NO_KEY_HINT, at };
    return { source: 'radarr', sections: await radarrDiscoverSections(), hint: NO_KEY_HINT, at };
  } catch (e) {
    return { source: 'none', sections: [], hint: NO_KEY_HINT, error: e instanceof Error ? e.message : String(e), at };
  }
}

async function getRaw(mediaType: RecMediaType, refresh: boolean): Promise<RawResult> {
  const ttl = getConfig().recCacheHours * 3600000;
  const cached = cache.get(mediaType);
  // Failed / empty results are retried sooner (15 minutes) than good ones.
  const fresh = cached && Date.now() - cached.at < (cached.sections.some((s) => s.items.length) ? ttl : 15 * 60000);
  if (cached && fresh && !refresh) return cached;
  let p = inflight.get(mediaType);
  if (!p) {
    p = build(mediaType)
      .then((r) => {
        // Never replace a good cached list with an empty failure.
        if (!r.sections.some((s) => s.items.length) && cached?.sections.some((s) => s.items.length)) return { ...cached, at: Date.now() - ttl + 15 * 60000 };
        cache.set(mediaType, r);
        return r;
      })
      .finally(() => inflight.delete(mediaType));
    inflight.set(mediaType, p);
  }
  return p;
}

/**
 * Recommendations ready for display: anything already in the library or already
 * requested (pending/approved/downloading/available) is removed, and each title
 * appears only once across sections.
 */
export async function getRecommendations(mediaType: RecMediaType, opts: { perSection?: number; refresh?: boolean } = {}): Promise<RecResponse> {
  const perSection = opts.perSection ?? 20;
  const raw = await getRaw(mediaType, Boolean(opts.refresh));
  const kind = mediaType === 'tv' ? 'sonarr' : 'radarr';
  let library = new Map<string, unknown>();
  try {
    if (svc.isArrAvailable(kind)) library = await svc.getLibrary(kind);
  } catch {
    /* if the library can't be read, duplicate detection at request time still protects us */
  }
  const seen = new Set<string>();
  const sections = raw.sections
    .map((s) => {
      const items: RecItem[] = [];
      for (const i of s.items) {
        if (items.length >= perSection) break;
        if (seen.has(i.externalId) || library.has(i.externalId) || findActiveRequest(mediaType, i.externalId)) continue;
        seen.add(i.externalId);
        items.push(i);
      }
      return { ...s, items };
    })
    .filter((s) => s.items.length);
  return { mediaType, source: raw.source, sections, hint: raw.hint, error: raw.error, generatedAt: new Date(raw.at).toISOString() };
}
