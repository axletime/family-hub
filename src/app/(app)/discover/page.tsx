'use client';
import { useEffect, useState } from 'react';
import type { RecResponse } from '@/lib/types';
import { useApi } from '@/components/api';
import { AdminHint, RecCard } from '@/components/Recommendations';
import { Empty, Icon, Spinner } from '@/components/ui';
import { formatDateTime } from '@/components/format';

const TABS = [
  { type: 'tv' as const, label: 'TV shows', icon: 'tv' },
  { type: 'movie' as const, label: 'Films', icon: 'film' },
];

const SOURCE_LABEL: Record<string, string> = {
  tmdb: 'TMDB',
  tvmaze: 'TVmaze',
  radarr: 'Radarr Discover',
  demo: 'demo data',
};

export default function DiscoverPage() {
  const [type, setType] = useState<'tv' | 'movie'>('tv');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t === 'movie' || t === 'tv') setType(t);
  }, []);
  const choose = (t: 'tv' | 'movie') => {
    setType(t);
    window.history.replaceState(null, '', `/discover?type=${t}`);
  };
  const { data, loading, error } = useApi<RecResponse>(`/api/recommendations?type=${type}&limit=24`);
  const current = data?.mediaType === type ? data : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{type === 'tv' ? 'TV shows you may enjoy' : 'Films you may enjoy'}</h1>
        <p className="text-slate-500 dark:text-slate-400">Picked from what’s already in the library, plus what’s popular right now. Anything we already have or someone has requested is left out.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.type} onClick={() => choose(t.type)} className={t.type === type ? 'btn-primary' : 'btn-ghost'}>
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {(loading || !current) && !error && <Spinner />}
      {error && <Empty>Recommendations aren’t available right now.</Empty>}
      {current && !current.sections.length && !current.hint && <Empty>No recommendations right now. Check back later.</Empty>}
      {current?.sections.map((s) => (
        <section key={s.id} className="space-y-3">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
            {s.items.map((item) => <RecCard key={item.externalId} item={item} />)}
          </div>
        </section>
      ))}
      {current && (current.hint || current.error) && <AdminHint text={[current.error && `Couldn’t load recommendations: ${current.error}.`, current.hint].filter(Boolean).join(' ')} />}
      {current?.generatedAt && SOURCE_LABEL[current.source] && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Source: {SOURCE_LABEL[current.source]} · updated {formatDateTime(current.generatedAt)}{current.source === 'tmdb' ? ' · This product uses the TMDB API but is not endorsed or certified by TMDB.' : ''}</p>
      )}
    </div>
  );
}
