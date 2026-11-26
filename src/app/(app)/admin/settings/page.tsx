'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/components/api';
import { ErrorNote, Icon, Spinner, Toggle } from '@/components/ui';
import { formatBytes, formatDateTime } from '@/components/format';

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
  ntfyTokenFromEnv: boolean;
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
  const [token, setToken] = useState('');
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

  const save = async (patch: Partial<Settings> & { ntfyToken?: string | null }) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: patch });
      setS(res.settings);
      setEntitiesText(res.settings.haEntities.join('\n'));
      setMsg({ ok: true, text: 'Settings saved.' });
      if (patch.ntfyToken !== undefined) setToken('');
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
            <label className="label" htmlFor="ntfyUrl">ntfy server</label>
            <input id="ntfyUrl" className="input" inputMode="url" placeholder="https://ntfy.sh" value={s.ntfyUrl} onChange={(e) => field('ntfyUrl', e.target.value)} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Self-hosted is recommended, e.g. <code>http://192.168.1.201:8080</code>. Leave blank to use NTFY_URL (default ntfy.sh).</p>
          </div>
          <div>
            <label className="label" htmlFor="publicUrl">Family Hub address (for links in alerts)</label>
            <input id="publicUrl" className="input" inputMode="url" placeholder="http://192.168.1.201:3000" value={s.publicUrl} onChange={(e) => field('publicUrl', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ntfyPrefix">Topic prefix</label>
            <input id="ntfyPrefix" className="input" placeholder="familyhub" value={s.ntfyTopicPrefix} onChange={(e) => field('ntfyTopicPrefix', e.target.value)} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used for new topics. A random suffix is always added so topics can’t be guessed.</p>
          </div>
          <div>
            <label className="label" htmlFor="ntfyToken">Access token (optional)</label>
            <input id="ntfyToken" type="password" autoComplete="off" className="input" placeholder={env.ntfyTokenSet ? '•••••••• (saved — type to replace)' : 'tk_… or user:password'} value={token} onChange={(e) => setToken(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {env.ntfyTokenSet ? (env.ntfyTokenFromEnv ? '✓ Set via NTFY_TOKEN.' : '✓ Saved. It stays on the server and is never shown again.') : 'Only needed if your ntfy server requires a login.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={saving}
            onClick={() => save({ ntfyUrl: s.ntfyUrl, publicUrl: s.publicUrl, ntfyTopicPrefix: s.ntfyTopicPrefix, ...(token ? { ntfyToken: token } : {}) })}
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save notification settings
          </button>
          {env.ntfyTokenSet && !env.ntfyTokenFromEnv && (
            <button className="btn-ghost" disabled={saving} onClick={() => save({ ntfyToken: null })}>Remove saved token</button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Checking Sonarr, Radarr and Lidarr every {env.pollMinutes} minute{env.pollMinutes === 1 ? '' : 's'} for finished downloads. Import webhooks: {env.webhookSecretSet ? 'enabled (WEBHOOK_SECRET set).' : 'off (optional — set WEBHOOK_SECRET, see README).'}
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
