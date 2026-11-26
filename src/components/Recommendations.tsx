'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { RecItem, RecResponse, RequestStatus, RequestView } from '@/lib/types';
import { api, useApi } from './api';
import { Icon, Poster, Spinner, StatusBadge } from './ui';

/** One recommendation: poster, title, year, short overview and a Request button (existing request flow). */
export function RecCard({ item, reason, compact = false }: { item: RecItem; reason?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const { request } = await api<{ request: RequestView }>('/api/requests', { method: 'POST', body: { mediaType: item.mediaType, externalId: item.externalId } });
      setStatus(request.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card flex h-full flex-col overflow-hidden ${compact ? 'w-40 shrink-0 sm:w-44' : ''}`}>
      <Poster src={item.poster} title={item.title} className="rounded-b-none" />
      <div className="flex flex-1 flex-col p-3">
        {reason && <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-300" title={reason}>{reason}</p>}
        <h3 className="line-clamp-2 font-semibold leading-tight" title={item.title}>
          {item.title} {item.year ? <span className="font-normal text-slate-500 dark:text-slate-400">({item.year})</span> : null}
        </h3>
        {item.overview && <p className={`mt-1 text-sm text-slate-600 dark:text-slate-300 ${compact ? 'line-clamp-3' : 'line-clamp-4'}`}>{item.overview}</p>}
        <div className="mt-auto pt-3">
          {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          {status ? (
            <div className="flex min-h-[44px] items-center md:min-h-0"><StatusBadge status={status} /></div>
          ) : (
            <button onClick={request} disabled={busy} className="btn-primary w-full px-3" aria-label={`Request ${item.title}`}>
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />} Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Interleave sections so the dashboard row mixes "Because you have…" and trending. */
function interleave(data: RecResponse, max: number) {
  const out: { item: RecItem; reason: string }[] = [];
  const queues = data.sections.map((s) => s.items.map((item) => ({ item, reason: s.title })));
  while (out.length < max && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < max) out.push(q.shift()!);
  return out;
}

export function AdminHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-accent-500/10 px-3 py-2 text-sm text-accent-700 dark:text-accent-300">
      <strong>Admin tip:</strong> {text}
    </p>
  );
}

/** Dashboard row. Hides itself completely when there is nothing to show (members) or shows a setup hint (admins). */
export function RecRow({ type, title }: { type: 'tv' | 'movie'; title: string }) {
  const { data, loading } = useApi<RecResponse>(`/api/recommendations?type=${type}&limit=12`);
  const items = data ? interleave(data, 16) : [];
  if (!loading && !items.length && !data?.hint && !data?.error) return null;

  return (
    <section className="card p-4">
      <h2 className="card-title mb-3">
        <span className="flex items-center gap-2"><Icon name={type === 'tv' ? 'tv' : 'film'} className="h-4 w-4" /> {title}</span>
        {items.length > 0 && <Link href={`/discover?type=${type}`} className="link flex min-h-[44px] items-center normal-case md:min-h-0">See all</Link>}
      </h2>
      {loading && !data && <Spinner />}
      {items.length > 0 && (
        <div className="scrollbar-thin -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {items.map(({ item, reason }) => (
            <div key={item.externalId} className="snap-start">
              <RecCard item={item} reason={reason} compact />
            </div>
          ))}
        </div>
      )}
      {data && !items.length && (data.hint || data.error) && <AdminHint text={[data.error && `Couldn’t load recommendations: ${data.error}.`, data.hint].filter(Boolean).join(' ')} />}
    </section>
  );
}
