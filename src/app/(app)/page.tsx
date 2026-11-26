'use client';
import { useState } from 'react';
import type { CalendarItem, HaEntity, MediaOverview, ServiceStatus } from '@/lib/types';
import { api, useApi } from '@/components/api';
import { Empty, ErrorNote, Icon, Poster, Spinner, Toggle } from '@/components/ui';
import { formatBytes, relativeDay, timeAgo } from '@/components/format';

const SERVICE_ICON: Record<string, string> = { sonarr: 'tv', radarr: 'film', lidarr: 'music', plex: 'sparkle', homeassistant: 'home' };
const SERVICE_COLOUR: Record<string, string> = { sonarr: '#35C5F4', radarr: '#FFC230', lidarr: '#00A65B', plex: '#E5A00D', homeassistant: '#18BCF2' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function StatusTiles({ services }: { services: ServiceStatus[] | undefined }) {
  if (!services) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="card h-[84px] animate-pulse" />)}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {services.map((s) => (
        <a key={s.id} href={s.link} target="_blank" rel="noreferrer" className="card group flex items-center gap-3 p-4 transition hover:border-accent-400" title={s.message ?? (s.online ? 'Online' : 'Offline')}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${SERVICE_COLOUR[s.id]}22`, color: SERVICE_COLOUR[s.id] }}>
            <Icon name={SERVICE_ICON[s.id]} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{s.name}</div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${s.online ? 'bg-emerald-500' : s.configured ? 'bg-red-500' : 'bg-slate-400'}`} />
              <span className={s.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                {s.online ? `Online${s.version ? ` · v${s.version}` : ''}` : s.configured ? 'Offline' : 'Not configured'}
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function HaPanel() {
  const { data, error, loading, setData } = useApi<{ entities: HaEntity[]; error?: string }>('/api/ha', 15000);
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggle = async (e: HaEntity) => {
    setBusy(e.entityId);
    setToggleError(null);
    // Optimistic update
    setData((d) => (d ? { ...d, entities: d.entities.map((x) => (x.entityId === e.entityId ? { ...x, state: x.state === 'on' ? 'off' : 'on' } : x)) } : d));
    try {
      setData(await api('/api/ha/toggle', { method: 'POST', body: { entityId: e.entityId } }));
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Toggle failed');
      setData((d) => (d ? { ...d, entities: d.entities.map((x) => (x.entityId === e.entityId ? e : x)) } : d));
    } finally {
      setBusy(null);
    }
  };

  const entities = data?.entities ?? [];
  const controls = entities.filter((e) => e.controllable);
  const readings = entities.filter((e) => !e.controllable);

  const iconFor = (e: HaEntity) => (e.kind === 'light' ? 'bulb' : e.kind === 'switch' ? 'power' : e.kind === 'temperature' ? 'thermo' : e.kind === 'presence' ? 'person' : 'gauge');
  const readable = (e: HaEntity) => {
    if (!e.available) return e.state === 'not found' ? 'Not found' : 'Unavailable';
    if (e.kind === 'presence') return e.state === 'home' ? 'Home' : e.state === 'not_home' ? 'Away' : e.state.replace(/_/g, ' ');
    if (e.domain === 'binary_sensor') return e.state === 'on' ? 'Open / detected' : 'Closed / clear';
    return `${e.state}${e.unit ? ` ${e.unit}` : ''}`;
  };

  return (
    <section className="card p-4">
      <h2 className="card-title mb-3">
        <span className="flex items-center gap-2"><Icon name="home" className="h-4 w-4" /> Home</span>
      </h2>
      {loading && !data && <Spinner />}
      {(error || data?.error) && <ErrorNote>{error ?? data?.error}</ErrorNote>}
      {toggleError && <div className="mb-2"><ErrorNote>{toggleError}</ErrorNote></div>}
      {data && !data.error && !entities.length && <Empty>No entities configured yet. An admin can add them in Settings.</Empty>}
      {controls.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {controls.map((e) => (
            <div key={e.entityId} className={`flex items-center gap-3 rounded-xl border p-3 ${e.state === 'on' ? 'border-amber-400/40 bg-amber-400/10' : 'border-slate-200 dark:border-white/10'}`}>
              <Icon name={iconFor(e)} className={`h-5 w-5 ${e.state === 'on' ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
              <Toggle label={`Toggle ${e.name}`} checked={e.state === 'on'} disabled={!e.available || busy === e.entityId} onChange={() => toggle(e)} />
            </div>
          ))}
        </div>
      )}
      {readings.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {readings.map((e) => (
            <div key={e.entityId} className="rounded-xl bg-slate-100 p-3 dark:bg-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Icon name={iconFor(e)} className="h-3.5 w-3.5" />
                <span className="truncate">{e.name}</span>
              </div>
              <div className={`mt-1 text-lg font-semibold ${e.kind === 'presence' && e.state === 'home' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{readable(e)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Calendar({ title, icon, items, empty }: { title: string; icon: string; items: CalendarItem[] | undefined; empty: string }) {
  return (
    <section className="card p-4">
      <h2 className="card-title mb-3"><span className="flex items-center gap-2"><Icon name={icon} className="h-4 w-4" /> {title}</span></h2>
      {!items ? <Spinner /> : !items.length ? <Empty>{empty}</Empty> : (
        <ul className="scrollbar-thin max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <div className="w-11 shrink-0"><Poster src={i.poster} title={i.title} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.title}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{i.subtitle}</div>
              </div>
              <div className="shrink-0 text-right text-xs">
                <div className="font-semibold text-accent-600 dark:text-accent-300">{relativeDay(i.date)}</div>
                {i.service === 'sonarr' && <div className="text-slate-500">{new Date(i.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  const status = useApi<{ services: ServiceStatus[] }>('/api/dashboard/status', 30000);
  const media = useApi<MediaOverview>('/api/dashboard/media', 20000);
  const m = media.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{greeting()}</h1>
          <p className="text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <a href="/request" className="btn-primary"><Icon name="search" className="h-4 w-4" /> Request something</a>
      </div>

      <StatusTiles services={status.data?.services} />
      {m && m.errors.length > 0 && <ErrorNote>Some services could not be reached: {m.errors.join(' · ')}</ErrorNote>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card p-4">
            <h2 className="card-title mb-3"><span className="flex items-center gap-2"><Icon name="download" className="h-4 w-4" /> Downloading now</span>{m && <span className="normal-case">{m.queue.length} in queue</span>}</h2>
            {!m ? <Spinner /> : !m.queue.length ? <Empty>Nothing downloading right now.</Empty> : (
              <ul className="space-y-3">
                {m.queue.slice(0, 12).map((q) => (
                  <li key={q.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate"><span className="font-medium">{q.title}</span>{q.subtitle && <span className="text-slate-500 dark:text-slate-400"> · {q.subtitle}</span>}</span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{q.progress.toFixed(0)}%{q.timeLeft ? ` · ${q.timeLeft} left` : ''}{q.sizeBytes ? ` · ${formatBytes(q.sizeBytes)}` : ''}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${Math.min(100, q.progress)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="card-title mb-3"><span className="flex items-center gap-2"><Icon name="sparkle" className="h-4 w-4" /> Recently added</span></h2>
            {!m ? <Spinner /> : !m.recent.length ? <Empty>Nothing new yet.</Empty> : (
              <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {m.recent.map((r) => (
                  <div key={r.id} className="w-28 shrink-0 sm:w-32">
                    <Poster src={r.poster} title={r.title} square={r.service === 'lidarr'} />
                    <div className="mt-1.5 truncate text-sm font-medium" title={r.title}>{r.title}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{r.subtitle}</div>
                    <div className="text-xs text-slate-400">{timeAgo(r.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Calendar title="Upcoming TV" icon="tv" items={m?.upcomingTv} empty="No episodes in the next fortnight." />
            <Calendar title="Upcoming films" icon="film" items={m?.upcomingMovies} empty="No film releases in the next two months." />
          </div>
        </div>

        <div className="space-y-6">
          <HaPanel />
          <section className="card p-4">
            <h2 className="card-title mb-3"><span className="flex items-center gap-2"><Icon name="link" className="h-4 w-4" /> Quick links</span></h2>
            <div className="grid grid-cols-2 gap-2">
              {(status.data?.services ?? []).map((s) => (
                <a key={s.id} href={s.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium hover:border-accent-400 dark:border-white/10">
                  <Icon name={SERVICE_ICON[s.id]} className="h-4 w-4" />
                  {s.name}
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
