'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi } from '@/components/api';
import { ErrorNote, Icon, Spinner } from '@/components/ui';

type Source = 'hub' | 'env' | 'none';

interface Field {
  name: string;
  source: Source;
  value?: string;
  masked?: string;
  envSet: boolean;
  unreadable?: boolean;
  label: string;
  placeholder?: string;
}

interface Connection {
  id: string;
  name: string;
  help: string;
  testable: boolean;
  url?: Field;
  secret?: Field;
}

interface View {
  demoMode: boolean;
  connections: Connection[];
}

type Note = { ok: boolean; text: string } | null;

const SOURCE_LABEL: Record<Source, string> = { hub: 'Saved in hub', env: '.env', none: 'Not set' };
const SOURCE_STYLE: Record<Source, string> = {
  hub: 'bg-accent-600/15 text-accent-700 dark:text-accent-300',
  env: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  none: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

function SourceBadge({ source }: { source: Source }) {
  return <span className={`badge shrink-0 ${SOURCE_STYLE[source]}`}>{SOURCE_LABEL[source]}</span>;
}

function ResultLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p role="status" className={`break-words rounded-xl px-3 py-2 text-sm ${note.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'}`}>
      {note.ok ? '✓ ' : '✗ '}
      {note.text}
    </p>
  );
}

function ConnectionCard({ c, onSaved }: { c: Connection; onSaved: (v: View) => void }) {
  const [url, setUrl] = useState(c.url?.value ?? '');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  const [note, setNote] = useState<Note>(null);
  const urlDirty = Boolean(c.url) && url.trim().replace(/\/+$/, '') !== (c.url?.value ?? '');
  const dirty = urlDirty || secret.trim() !== '';

  const run = async (kind: 'save' | 'test' | 'clear', fn: () => Promise<void>) => {
    setBusy(kind);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      const values: Record<string, string> = {};
      if (c.url && urlDirty) values[c.url.name] = url;
      if (c.secret && secret.trim()) values[c.secret.name] = secret;
      const v = await api<View & { changed: string[] }>('/api/admin/connections', { method: 'PUT', body: { values } });
      const fresh = v.connections.find((x) => x.id === c.id);
      setUrl(fresh?.url?.value ?? '');
      setSecret('');
      onSaved(v);
      setNote({ ok: true, text: v.changed.length ? 'Saved. It is in use straight away.' : 'Nothing changed.' });
    });

  const clear = (name: string, what: string) =>
    run('clear', async () => {
      const v = await api<View>('/api/admin/connections/clear', { method: 'POST', body: { name } });
      const fresh = v.connections.find((x) => x.id === c.id);
      if (fresh?.url) setUrl(fresh.url.value ?? '');
      onSaved(v);
      const f = fresh?.url?.name === name ? fresh.url : fresh?.secret;
      setNote({ ok: true, text: f?.source === 'env' ? `${what} cleared — now using the value from .env.` : `${what} cleared.` });
    });

  const test = () =>
    run('test', async () => {
      const r = await api<{ ok: boolean; message: string }>('/api/admin/connections/test', {
        method: 'POST',
        body: { service: c.id, url: c.url ? url : undefined, secret: secret || undefined },
      });
      setNote({ ok: r.ok, text: r.message });
    });

  const secretId = `${c.id}-secret`;
  const urlId = `${c.id}-url`;

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-labelledby={`${c.id}-title`}>
      <div>
        <h2 id={`${c.id}-title`} className="font-semibold">{c.name}</h2>
        <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{c.help}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {c.url && (
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor={urlId}>{c.url.label}</label>
              <SourceBadge source={c.url.source} />
            </div>
            <input id={urlId} className="input" inputMode="url" autoComplete="off" spellCheck={false} placeholder={c.url.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} />
            {c.url.source === 'hub' && (
              <button type="button" className="link mt-1 py-2 text-xs" disabled={busy !== null} onClick={() => clear(c.url!.name, 'Address')}>
                {c.url.envSet ? 'Revert to .env' : 'Revert to default'}
              </button>
            )}
            {c.url.source === 'none' && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Using the default address.</p>}
          </div>
        )}

        {c.secret && (
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor={secretId}>{c.secret.label}</label>
              <SourceBadge source={c.secret.source} />
            </div>
            <input
              id={secretId}
              type="password"
              className="input font-mono"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={c.secret.masked ? 'Type a new value to replace' : 'Not set'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
              {c.secret.masked ? <span className="font-mono">Current: {c.secret.masked}</span> : <span>Leave blank to keep it unset.</span>}
              {(c.secret.source === 'hub' || c.secret.unreadable) && (
                <button type="button" className="link py-2" disabled={busy !== null} onClick={() => clear(c.secret!.name, c.secret!.label)}>
                  {c.secret.envSet ? 'Clear (use .env)' : 'Clear'}
                </button>
              )}
            </div>
            {c.secret.unreadable && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">The saved value could not be decrypted (APP_SECRET or the key file changed). Please enter it again.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null || !dirty} onClick={save}>
          {busy === 'save' ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save
        </button>
        {c.testable && (
          <button className="btn-ghost" disabled={busy !== null} onClick={test}>
            {busy === 'test' ? <Spinner className="h-4 w-4" /> : <Icon name="link" className="h-4 w-4" />} Test connection
          </button>
        )}
      </div>
      <ResultLine note={note} />
    </section>
  );
}

export default function ConnectionsPage() {
  const { data, error, setData } = useApi<View>('/api/admin/connections');

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="link inline-flex py-2 text-sm">‹ Settings</Link>
        <h1 className="text-2xl font-bold sm:text-3xl">Connections</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Addresses and API keys for your services. Changes apply straight away — no restart needed. Values saved here take priority over the container’s .env file, which is used as a fallback.
        </p>
      </div>

      {data.demoMode && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Demo mode is on (DEMO_MODE=true): values can be saved, but tests do not contact your real services.
        </p>
      )}

      <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
        Keys are encrypted on the server and never shown again — only the last four characters. Leave a key blank to keep the current one.
      </p>

      {data.connections.map((c) => (
        <ConnectionCard key={c.id} c={c} onSaved={(v) => setData(v)} />
      ))}
    </div>
  );
}
