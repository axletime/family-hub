'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/components/api';
import { ErrorNote, Icon, Spinner, Toggle } from '@/components/ui';
import { formatBytes, formatDateTime } from '@/components/format';
import SecurityPanel from '@/components/admin/SecurityPanel';
import CamerasAdmin from '@/components/admin/CamerasAdmin';

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
  notificationsEnabled: boolean;
  ntfyUrl: string;
  ntfyTopicPrefix: string;
  publicUrl: string;
}

interface NotificationLog {
  id: number;
  event: string;
  title: string;
  status: 'queued' | 'sent' | 'logged' | 'failed';
  error: string | null;
  createdAt: string;
  userName: string | null;
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
  ntfyTokenSet: boolean;
  webhookSecretSet: boolean;
  pollMinutes: number;
}

type Opt = { rootFolders: { path: string; freeSpace?: number }[]; qualityProfiles: { id: number; name: string }[]; metadataProfiles?: { id: number; name: string }[] } | { error: string };

const ARRS = [
  { key: 'radarr', name: 'Radarr (films)' },
  { key: 'sonarr', name: 'Sonarr (TV)' },
  { key: 'lidarr', name: 'Lidarr (music)' },
] as const;

export default function SettingsPage() {
  const { data, error, reload } = useApi<{ settings: Settings; environment: Env; notifications: NotificationLog[] }>('/api/admin/settings');
  const options = useApi<Record<string, Opt>>('/api/admin/options');
  const heatingList = useApi<{ entities: { entityId: string; name: string }[]; error?: string }>('/api/admin/ha/entities');
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
      if (patch.haEntities !== undefined) setEntitiesText(res.settings.haEntities.join('\n'));
      setMsg({ ok: true, text: 'Settings saved.' });
      reload();
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
  const entityLines = entitiesText.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const toggleListed = (id: string, on: boolean) =>
    setEntitiesText((on ? [...entityLines.filter((x) => x !== id), id] : entityLines.filter((x) => x !== id)).join('\n'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">How requests are handled and what appears on the dashboard.</p>
      </div>

      <Link href="/admin/settings/connections" className="card flex items-center gap-4 p-4 transition hover:border-accent-400 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white"><Icon name="key" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Connections &amp; API keys</span>
          <span className="block break-words text-sm text-slate-500 dark:text-slate-400">Sonarr, Radarr, Lidarr, Plex, Home Assistant, go2rtc, TMDB, ntfy, webhook secret and the hub’s address — no need to edit .env.</span>
        </span>
        <span aria-hidden className="text-2xl text-slate-400">›</span>
      </Link>

      <SecurityPanel />

      {msg && (msg.ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}

      <section className="card flex items-start gap-4 p-4 sm:p-5">
        <div className="flex-1">
          <h2 className="font-semibold">Require admin approval</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            When on, requests from family members wait in <a href="/admin/requests" className="link py-3">All requests</a> until an admin approves them. When off, requests go straight to Sonarr, Radarr or Lidarr. Requests from people who can approve are always sent straight away.
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
          One entity ID per line, in the order you want them shown — e.g. <code>light.living_room</code>, <code>switch.kettle</code>, <code>sensor.outdoor_temperature</code>, <code>person.andrew</code>. Lights, switches, fans and input booleans get a toggle; thermostats (<code>climate.*</code>) and hot water (<code>water_heater.*</code>) get heating controls; everything else is shown as a reading. Find IDs in Home Assistant under Settings › Devices &amp; services › Entities.
        </p>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium"><Icon name="thermo" className="h-4 w-4" /> Heating &amp; hot water (e.g. Hive)</h3>
            <button className="btn-ghost px-3 py-1.5" onClick={heatingList.reload}><Icon name="refresh" className="h-4 w-4" /> Refresh</button>
          </div>
          {!heatingList.data ? (
            heatingList.error ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Could not load entities: {heatingList.error}</p> : <Spinner />
          ) : heatingList.data.error ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Could not load entities: {heatingList.data.error}</p>
          ) : !heatingList.data.entities.length ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No thermostats or hot water found in Home Assistant. Add the Hive integration there first.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-200 dark:divide-white/10">
              {heatingList.data.entities.map((e) => (
                <li key={e.entityId} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <code className="block truncate text-xs text-slate-500 dark:text-slate-400">{e.entityId}</code>
                  </span>
                  <Toggle label={`Show ${e.name} on the dashboard`} checked={entityLines.includes(e.entityId)} disabled={saving} onChange={(v) => toggleListed(e.entityId, v)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Switching one on adds it to the list below — press <strong>Save entities</strong> to apply.</p>
        </div>
        <textarea className="input min-h-[180px] font-mono" value={entitiesText} onChange={(e) => setEntitiesText(e.target.value)} spellCheck={false} />
        <button className="btn-primary" disabled={saving} onClick={() => save({ haEntities: entityLines })}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save entities
        </button>
      </section>

      <p className="-mt-3 px-1 text-xs text-slate-500 dark:text-slate-400">
        Who can switch things and change the heating is now set per group on <Link href="/admin/users" className="link">Family › Groups &amp; permissions</Link>.
      </p>

      <CamerasAdmin />

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h2 className="font-semibold">Push notifications (ntfy)</h2>
            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
              Family members get a phone alert when their request is approved, declined or ready to watch, and admins get one when a request needs approval. Each person subscribes to their own private topic from <a href="/account" className="link">My account</a>.
            </p>
          </div>
          <Toggle label="Send push notifications" checked={s.notificationsEnabled} disabled={saving} onChange={(v) => save({ notificationsEnabled: v })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ntfyPrefix">Topic prefix</label>
            <input id="ntfyPrefix" className="input" placeholder="familyhub" value={s.ntfyTopicPrefix} onChange={(e) => field('ntfyTopicPrefix', e.target.value)} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used for new topics. A random suffix is always added so topics can’t be guessed.</p>
          </div>
          <div className="text-sm">
            <span className="label">Server</span>
            <p className="break-all">{s.ntfyUrl}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Access token: {env.ntfyTokenSet ? 'set' : 'none'}. Change the server, token or the hub’s address on <Link href="/admin/settings/connections" className="link">Connections</Link>.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={saving} onClick={() => save({ ntfyTopicPrefix: s.ntfyTopicPrefix })}>
            {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save topic prefix
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Checking Sonarr, Radarr and Lidarr every {env.pollMinutes} minute{env.pollMinutes === 1 ? '' : 's'} for finished downloads. Import webhooks: {env.webhookSecretSet ? 'enabled (webhook secret set).' : 'off (optional — set a webhook secret on Connections, see README).'}
        </p>
        <div>
          <h3 className="mb-2 text-sm font-medium">Recent notifications</h3>
          {!data.notifications.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">None sent yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm dark:divide-white/10">
              {data.notifications.map((n) => (
                <li key={n.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="min-w-0 flex-1 break-words"><span className="font-medium">{n.userName ?? '—'}</span> · {n.title}</span>
                  <span className={`shrink-0 text-xs ${n.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {{ sent: 'Sent', logged: 'Logged (demo)', queued: 'Sending…', failed: `Failed: ${n.error ?? ''}` }[n.status]} · {formatDateTime(n.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card space-y-2 p-5 text-sm">
        {env.demoMode && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">Demo mode is on (DEMO_MODE=true) — mock data is shown and nothing is sent to your real services.</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Secure cookies: {env.cookieSecure ? 'on (HTTPS only)' : 'off (plain HTTP on your LAN)'}</p>
      </section>
    </div>
  );
}
