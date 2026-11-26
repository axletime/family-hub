'use client';
import { useEffect, useRef, useState } from 'react';
import type { MediaType, RequestView, SearchResult } from '@/lib/types';
import { api } from '@/components/api';
import { Empty, ErrorNote, Icon, Poster, Spinner, StatusBadge } from '@/components/ui';

const TABS: { type: MediaType; label: string; icon: string; placeholder: string }[] = [
  { type: 'movie', label: 'Films', icon: 'film', placeholder: 'Search for a film…' },
  { type: 'tv', label: 'TV shows', icon: 'tv', placeholder: 'Search for a TV show…' },
  { type: 'music', label: 'Music', icon: 'music', placeholder: 'Search for an artist…' },
];

function ResultCard({ r, onRequested }: { r: SearchResult; onRequested: (r: SearchResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const { request } = await api<{ request: RequestView }>('/api/requests', {
        method: 'POST',
        body: { mediaType: r.mediaType, externalId: r.externalId },
      });
      onRequested({ ...r, requested: { status: request.status, by: request.requestedBy } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex gap-4 p-3 sm:flex-col sm:p-3">
      <div className="w-24 shrink-0 sm:w-full">
        <Poster src={r.poster} title={r.title} square={r.mediaType === 'music'} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-semibold leading-tight">
          {r.title} {r.year ? <span className="font-normal text-slate-500 dark:text-slate-400">({r.year})</span> : null}
        </h3>
        {r.meta && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.meta}</p>}
        {r.overview && (
          <p onClick={() => setExpanded(!expanded)} className={`mt-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300 ${expanded ? '' : 'line-clamp-3'}`}>
            {r.overview}
          </p>
        )}
        <div className="mt-auto pt-3">
          {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          {r.inLibrary ? (
            <span className="badge bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><Icon name="check" className="h-3.5 w-3.5" /> Already in library</span>
          ) : r.requested ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-slate-500/15 text-slate-600 dark:text-slate-300">Already requested by {r.requested.by}</span>
              <StatusBadge status={r.requested.status} />
            </div>
          ) : (
            <button onClick={request} disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />} Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RequestPage() {
  const [type, setType] = useState<MediaType>('movie');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ results: SearchResult[] }>(`/api/search?type=${type}&q=${encodeURIComponent(q)}`);
        if (mine === seq.current) {
          setResults(d.results);
          setError(null);
        }
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, type]);

  const tab = TABS.find((t) => t.type === type)!;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Request something</h1>
        <p className="text-slate-500 dark:text-slate-400">Search for a film, TV show or artist and we’ll fetch it for the family.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.type} onClick={() => setType(t.type)} className={t.type === type ? 'btn-primary' : 'btn-ghost'}>
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab.placeholder} className="input py-3 pl-12 text-base" aria-label={tab.placeholder} />
        {loading && <Spinner className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {results && !results.length && !loading && <Empty>No results for “{query}”.</Empty>}
      {!results && !error && <Empty>Start typing to search.</Empty>}
      {results && results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {results.map((r) => (
            <ResultCard key={`${r.mediaType}-${r.externalId}`} r={r} onRequested={(nr) => setResults((rs) => rs?.map((x) => (x.externalId === nr.externalId ? nr : x)) ?? null)} />
          ))}
        </div>
      )}
    </div>
  );
}
