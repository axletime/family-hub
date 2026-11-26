'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/components/api';
import { ErrorNote, Icon, Spinner, Toggle } from '@/components/ui';
import { formatBytes } from '@/components/format';

interface Settings {
  requireApproval: boolean;
  sonarrRootFolder: string;
  sonarrQualityProfileId: number | null;
  radarrRootFolder: string;
  radarrQualityProfileId: number | null;
  lidarrRootFolder: string;
  lidarrQualityProfileId: number | null;
  lidarrMetadataProfileId: number | null;
  haEntities: string[];
}

interface Env {
  demoMode: boolean;
  sonarrUrl: string;
  radarrUrl: string;
  lidarrUrl: string;
  plexUrl: string;
  haUrl: string;
  sonarrKeySet: boolean;
  radarrKeySet: boolean;
  lidarrKeySet: boolean;
  plexTokenSet: boolean;
  haTokenSet: boolean;
  tmdbKeySet: boolean;
  cookieSecure: boolean;
}

type Opt = { rootFolders: { path: string; freeSpace?: number }[]; qualityProfiles: { id: number; name: string }[]; metadataProfiles?: { id: number; name: string }[] } | { error: string };

const ARRS = [
  { key: 'radarr', name: 'Radarr (films)' },
  { key: 'sonarr', name: 'Sonarr (TV)' },
  { key: 'lidarr', name: 'Lidarr (music)' },
] as const;

export default function SettingsPage() {
  const { data, error } = useApi<{ settings: Settings; environment: Env }>('/api/admin/settings');
  const options = useApi<Record<string, Opt>>('/api/admin/options');
  const [s, setS] = useState<Settings | null>(null);
  const [entitiesText, setEntitiesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data && !s) {
      setS(data.settings);
      setEntitiesText(data.settings.haEntities.join('\n'));
    }
  }, [data, s]);

  const save = async (patch: Partial<Settings>) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: patch });
      setS(res.settings);
      setEntitiesText(res.settings.haEntities.join('\n'));
      setMsg({ ok: true, text: 'Settings saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!s || !data) return <Spinner />;
  const env = data.environment;

  const field = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">How requests are handled and what appears on the dashboard.</p>
      </div>

      {msg && (msg.ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}

      <section className="card flex items-start gap-4 p-4 sm:p-5">
        <div className="flex-1">
          <h2 className="font-semibold">Require admin approval</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            When on, requests from family members wait in <a href="/admin/requests" className="link py-3">All requests</a> until an admin approves them. When off, requests go straight to Sonarr, Radarr or Lidarr. Admins’ own requests are always sent straight away.
          </p>
        </div>
        <Toggle label="Require admin approval" checked={s.requireApproval} disabled={saving} onChange={(v) => save({ requireApproval: v })} />
      </section>

      <section className="card space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Where new requests go</h2>
          <button className="btn-ghost px-3 py-1.5" onClick={options.reload}><Icon name="refresh" className="h-4 w-4" /> Refresh</button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Leave on “Automatic” to use the first root folder and profile configured in each app.</p>
        {ARRS.map(({ key, name }) => {
          const o = options.data?.[key];
          const rootKey = `${key}RootFolder` as const;
          const qKey = `${key}QualityProfileId` as const;
          return (
            <div key={key} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <h3 className="mb-3 font-medium">{name}</h3>
              {!o ? <Spinner /> : 'error' in o ? <p className="text-sm text-slate-500 dark:text-slate-400">Could not load options: {o.error}</p> : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">Root folder</label>
                    <select className="input" value={s[rootKey]} onChange={(e) => field(rootKey, e.target.value)}>
                      <option value="">Automatic</option>
                      {o.rootFolders.map((r) => <option key={r.path} value={r.path}>{r.path}{r.freeSpace ? ` (${formatBytes(r.freeSpace)} free)` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Quality profile</label>
                    <select className="input" value={s[qKey] ?? ''} onChange={(e) => field(qKey, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Automatic</option>
                      {o.qualityProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {key === 'lidarr' && o.metadataProfiles && (
                    <div>
                      <label className="label">Metadata profile</label>
                      <select className="input" value={s.lidarrMetadataProfileId ?? ''} onChange={(e) => field('lidarrMetadataProfileId', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Automatic</option>
                        {o.metadataProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          className="btn-primary"
          disabled={saving}
          onClick={() =>
            save({
              sonarrRootFolder: s.sonarrRootFolder,
              sonarrQualityProfileId: s.sonarrQualityProfileId,
              radarrRootFolder: s.radarrRootFolder,
              radarrQualityProfileId: s.radarrQualityProfileId,
              lidarrRootFolder: s.lidarrRootFolder,
              lidarrQualityProfileId: s.lidarrQualityProfileId,
              lidarrMetadataProfileId: s.lidarrMetadataProfileId,
            })
          }
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save request defaults
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Home Assistant entities</h2>
        <p className="break-words text-sm text-slate-500 dark:text-slate-400">
          One entity ID per line, in the order you want them shown — e.g. <code>light.living_room</code>, <code>switch.kettle</code>, <code>sensor.outdoor_temperature</code>, <code>climate.hallway</code>, <code>person.andrew</code>. Lights, switches, fans and input booleans get a toggle; everything else is shown as a reading. Find IDs in Home Assistant under Settings › Devices &amp; services › Entities.
        </p>
        <textarea className="input min-h-[180px] font-mono" value={entitiesText} onChange={(e) => setEntitiesText(e.target.value)} spellCheck={false} />
        <button className="btn-primary" disabled={saving} onClick={() => save({ haEntities: entitiesText.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) })}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save entities
        </button>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Connections</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">These come from the container’s environment variables. Change them in Unraid / docker-compose and restart the container.</p>
        {env.demoMode && <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">Demo mode is on (DEMO_MODE=true) — mock data is shown and nothing is sent to your real services.</p>}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Sonarr', env.sonarrUrl, env.sonarrKeySet, 'API key'],
            ['Radarr', env.radarrUrl, env.radarrKeySet, 'API key'],
            ['Lidarr', env.lidarrUrl, env.lidarrKeySet, 'API key'],
            ['Plex', env.plexUrl, env.plexTokenSet, 'token (optional)'],
            ['Home Assistant', env.haUrl, env.haTokenSet, 'token'],
            ['TMDB (recommendations)', 'api.themoviedb.org', env.tmdbKeySet, 'API key (optional)'],
          ].map(([n, url, set, what]) => (
            <div key={n as string} className="rounded-xl bg-slate-100 p-3 dark:bg-white/5">
              <dt className="font-medium">{n as string}</dt>
              <dd className="truncate text-slate-500 dark:text-slate-400">{url as string}</dd>
              <dd className={set ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{set ? `✓ ${what} set` : `✗ ${what} not set`}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Secure cookies: {env.cookieSecure ? 'on (HTTPS only)' : 'off (plain HTTP on your LAN)'}</p>
      </section>
    </div>
  );
}
