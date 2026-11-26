'use client';
import { useState } from 'react';
import { api, useApi } from './api';
import { ErrorNote, Icon, Spinner, Toggle } from './ui';
import { formatDateTime } from './format';

interface Prefs {
  approved: boolean;
  declined: boolean;
  available: boolean;
  newRequest: boolean;
}

interface View {
  topic: string;
  server: string;
  subscribeUrl: string;
  appUrl: string;
  selfHosted: boolean;
  enabled: boolean;
  demo: boolean;
  prefs: Prefs;
  qrSvg: string;
  recent: { id: number; title: string; status: string; error: string | null; createdAt: string }[];
}

const PREF_LABELS: { key: keyof Prefs; label: string; adminOnly?: boolean }[] = [
  { key: 'approved', label: 'My request is approved' },
  { key: 'declined', label: 'My request is declined' },
  { key: 'available', label: 'My request is ready to watch or listen to' },
  { key: 'newRequest', label: 'A family member makes a request that needs approval', adminOnly: true },
];

export default function NotificationsCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, error, setData } = useApi<View>('/api/notifications');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="card p-5"><Spinner /></div>;

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const setPref = (key: keyof Prefs, value: boolean) =>
    run('prefs', async () => setData(await api<View>('/api/notifications', { method: 'PUT', body: { prefs: { [key]: value } } })));

  const test = () =>
    run('test', async () => {
      const r = await api<{ status: string }>('/api/notifications/test', { method: 'POST' });
      setMsg({ ok: true, text: r.status === 'logged' ? 'Demo mode: the test notification was written to the server log instead of being sent.' : 'Test notification sent — check your phone.' });
      setData(await api<View>('/api/notifications'));
    });

  const regenerate = () => {
    if (!confirm('Create a new private topic? You will need to subscribe again in the ntfy app, and the old topic stops receiving alerts.')) return;
    run('topic', async () => setData(await api<View>('/api/notifications/topic', { method: 'POST' })));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.topic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked on plain HTTP — the topic is selectable instead */
    }
  };

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <h2 className="card-title">Phone notifications</h2>
      {!data.enabled && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">Notifications are switched off by an admin at the moment.</p>}
      {data.demo && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">Demo mode: notifications are written to the server log instead of being sent.</p>}

      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>
          Install the free <strong>ntfy</strong> app:{' '}
          <a className="link" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer">iPhone (App Store)</a> ·{' '}
          <a className="link" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">Android (Play Store)</a> ·{' '}
          <a className="link" href="https://f-droid.org/packages/io.heckel.ntfy/" target="_blank" rel="noreferrer">F-Droid</a>
        </li>
        <li>
          In the app tap <strong>+</strong> (Subscribe to topic) and enter your topic below.
          {data.selfHosted && <> Turn on <strong>Use another server</strong> and enter <code className="break-all">{data.server}</code>.</>}
          {' '}On Android you can also scan the QR code or tap “Open in ntfy app”.
        </li>
        <li>Press <strong>Send test notification</strong> to check it works. Allow notifications if your phone asks.</li>
      </ol>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-white p-1 [&>svg]:h-full [&>svg]:w-full" aria-label="QR code for your notification topic" role="img" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
        <div className="w-full min-w-0 space-y-2">
          <label className="label" htmlFor="topic">Your private topic</label>
          <div className="flex gap-2">
            <input id="topic" readOnly value={data.topic} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono" />
            <button className="btn-ghost shrink-0" onClick={copy} aria-label="Copy topic">{copied ? <Icon name="check" className="h-4 w-4" /> : 'Copy'}</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Keep this to yourself — anyone with the topic name can read its alerts.</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost" href={data.appUrl}>Open in ntfy app</a>
            <a className="btn-ghost" href={data.subscribeUrl} target="_blank" rel="noreferrer">Open in browser</a>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">Tell me when…</h3>
        <ul className="divide-y divide-slate-200 dark:divide-white/10">
          {PREF_LABELS.filter((p) => !p.adminOnly || isAdmin).map((p) => (
            <li key={p.key} className="flex min-h-[52px] items-center justify-between gap-3 py-1">
              <span className="text-sm">{p.label}</span>
              <Toggle label={p.label} checked={data.prefs[p.key]} disabled={busy === 'prefs'} onChange={(v) => setPref(p.key, v)} />
            </li>
          ))}
        </ul>
      </div>

      {msg && (msg.ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={test} disabled={busy !== null}>
          {busy === 'test' ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />} Send test notification
        </button>
        <button className="btn-ghost" onClick={regenerate} disabled={busy !== null}>New topic</button>
      </div>

      {data.recent.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Recent alerts</h3>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {data.recent.map((n) => (
              <li key={n.id} className="break-words">
                {n.title} <span className="text-xs text-slate-500 dark:text-slate-400">· {n.status === 'failed' ? `failed (${n.error ?? ''})` : n.status === 'logged' ? 'logged (demo)' : n.status} · {formatDateTime(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
