'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi } from '../api';
import { ErrorNote, Icon, Spinner } from '../ui';

interface AdminCamera {
  id: number;
  name: string;
  mainMasked: string;
  subMasked: string | null;
  unreadable: boolean;
  position: number;
}
type SyncResult = { ok: number; failed: number; error?: string };
type Msg = { ok: boolean; text: string } | null;

const PATTERNS = [
  { id: 'xmeye', label: 'Sannce / XMeye (most Sannce NVRs)' },
  { id: 'hikvision', label: 'Hikvision-style (/Streaming/Channels/101)' },
  { id: 'dahua', label: 'Dahua-style (/cam/realmonitor)' },
  { id: 'custom', label: 'Custom pattern' },
] as const;

function syncNote(s?: SyncResult): Msg {
  if (!s) return null;
  if (s.failed) return { ok: false, text: `Saved, but go2rtc could not be updated: ${s.error ?? 'unknown error'}. Check the go2rtc address on Connections, then press “Send to go2rtc”.` };
  return { ok: true, text: 'Saved and sent to go2rtc.' };
}

function CameraForm({ initial, onSaved, onCancel }: { initial?: AdminCamera; onSaved: (cams: AdminCamera[], m: Msg) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mainUrl, setMainUrl] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [clearSub, setClearSub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = initial
        ? await api<{ cameras: AdminCamera[]; sync: SyncResult }>(`/api/admin/cameras/${initial.id}`, { method: 'PATCH', body: { name, mainUrl, subUrl, clearSub } })
        : await api<{ cameras: AdminCamera[]; sync: SyncResult }>('/api/admin/cameras', { method: 'POST', body: { name, mainUrl, subUrl } });
      setName('');
      setMainUrl('');
      setSubUrl('');
      onSaved(r.cameras, syncNote(r.sync));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} placeholder="e.g. Front door" />
      </div>
      <div>
        <label className="label">Main stream (RTSP) {initial && <span className="font-normal text-slate-500">— leave blank to keep</span>}</label>
        {initial && <p className="mb-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">Current: {initial.mainMasked}</p>}
        <input className="input font-mono" type="password" autoComplete="off" value={mainUrl} required={!initial} onChange={(e) => setMainUrl(e.target.value)} placeholder="rtsp://user:password@192.168.1.50:554/…" spellCheck={false} />
      </div>
      <div>
        <label className="label">Sub-stream (optional, smaller — used for the dashboard pictures)</label>
        {initial?.subMasked && <p className="mb-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">Current: {initial.subMasked}</p>}
        <input className="input font-mono" type="password" autoComplete="off" value={subUrl} disabled={clearSub} onChange={(e) => setSubUrl(e.target.value)} placeholder="rtsp://…stream=1…" spellCheck={false} />
        {initial?.subMasked && (
          <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={clearSub} onChange={(e) => setClearSub(e.target.checked)} /> Remove the sub-stream</label>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Addresses are stored encrypted and never shown again in full; passwords are masked.</p>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Icon name={initial ? 'check' : 'plus'} className="h-4 w-4" />} {initial ? 'Save camera' : 'Add camera'}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function NvrHelper({ onSaved }: { onSaved: (cams: AdminCamera[], m: Msg) => void }) {
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [channels, setChannels] = useState(4);
  const [pattern, setPattern] = useState<(typeof PATTERNS)[number]['id']>('xmeye');
  const [customMain, setCustomMain] = useState('rtsp://{user}:{pass}@{ip}:554/ch{channel}/main');
  const [customSub, setCustomSub] = useState('rtsp://{user}:{pass}@{ip}:554/ch{channel}/sub');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ cameras: AdminCamera[]; sync: SyncResult; ids: number[] }>('/api/admin/cameras/nvr', { method: 'POST', body: { ip, username, password, channels, pattern, customMain, customSub } });
      setPassword('');
      const note = syncNote(r.sync);
      onSaved(r.cameras, note?.ok ? { ok: true, text: `Added ${r.ids.length} cameras and sent them to go2rtc. Rename them and press Test to check each one.` } : note);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not add cameras');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">NVR IP address</label>
        <input className="input" value={ip} required onChange={(e) => setIp(e.target.value.trim())} placeholder="192.168.1.50" inputMode="decimal" />
      </div>
      <div>
        <label className="label">Channels</label>
        <select className="input" value={channels} onChange={(e) => setChannels(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 16].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="label">NVR username</label>
        <input className="input" value={username} required autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label className="label">NVR password</label>
        <input className="input" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Address pattern</label>
        <select className="input" value={pattern} onChange={(e) => setPattern(e.target.value as typeof pattern)}>
          {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {pattern === 'custom' && (
        <>
          <div className="sm:col-span-2">
            <label className="label">Main stream pattern</label>
            <input className="input font-mono text-sm" value={customMain} onChange={(e) => setCustomMain(e.target.value)} spellCheck={false} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Sub-stream pattern (optional)</label>
            <input className="input font-mono text-sm" value={customSub} onChange={(e) => setCustomSub(e.target.value)} spellCheck={false} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Placeholders: <code>{'{ip}'}</code> <code>{'{user}'}</code> <code>{'{pass}'}</code> <code>{'{channel}'}</code> (1, 2, 3…) <code>{'{channel0}'}</code> (0, 1, 2…).</p>
          </div>
        </>
      )}
      {err && <div className="sm:col-span-2"><ErrorNote>{err}</ErrorNote></div>}
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />} Add {channels} camera{channels === 1 ? '' : 's'}</button>
      </div>
    </form>
  );
}

export default function CamerasAdmin() {
  const { data, error, setData } = useApi<{ cameras: AdminCamera[] }>('/api/admin/cameras');
  const [mode, setMode] = useState<'none' | 'add' | 'nvr'>('none');
  const [editing, setEditing] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [tests, setTests] = useState<Record<number, { busy?: boolean; ok?: boolean; text?: string; img?: string }>>({});
  const [busy, setBusy] = useState(false);
  const cams = data?.cameras ?? [];

  const saved = (c: AdminCamera[], m: Msg) => {
    setData({ cameras: c });
    setMsg(m);
    setMode('none');
    setEditing(null);
  };

  const test = async (c: AdminCamera) => {
    setTests((t) => ({ ...t, [c.id]: { busy: true } }));
    try {
      const r = await api<{ ok: boolean; message: string }>(`/api/admin/cameras/${c.id}/test`, { method: 'POST' });
      setTests((t) => ({ ...t, [c.id]: { ok: r.ok, text: r.message, img: r.ok ? `/api/cameras/${c.id}/snapshot?stream=sub&t=${Date.now()}` : undefined } }));
    } catch (e) {
      setTests((t) => ({ ...t, [c.id]: { ok: false, text: e instanceof Error ? e.message : 'Test failed' } }));
    }
  };

  const move = async (i: number, d: number) => {
    const order = cams.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    try {
      setData(await api<{ cameras: AdminCamera[] }>('/api/admin/cameras', { method: 'PUT', body: { order } }));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not reorder' });
    }
  };

  const remove = async (c: AdminCamera) => {
    if (!window.confirm(`Remove ${c.name}?`)) return;
    try {
      setData(await api<{ cameras: AdminCamera[] }>(`/api/admin/cameras/${c.id}`, { method: 'DELETE' }));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not remove' });
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      setMsg(syncNote(await api<SyncResult>('/api/admin/cameras/sync', { method: 'POST' })));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not reach go2rtc' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 font-semibold"><Icon name="camera" className="h-4 w-4" /> Cameras</h2>
        <button className="btn-ghost px-3 py-1.5" disabled={busy || !cams.length} onClick={sync}><Icon name="refresh" className="h-4 w-4" /> Send to go2rtc</button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cameras are streamed through <strong>go2rtc</strong> on your server (set its address on <Link href="/admin/settings/connections" className="link">Connections</Link>). Family Hub registers the streams with go2rtc for you and passes the pictures through, so camera passwords never reach anyone&rsquo;s browser. Who can watch is set on <Link href="/admin/users" className="link">Family › Groups &amp; permissions</Link>.
      </p>
      {msg && (msg.ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? <Spinner /> : !cams.length ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No cameras yet. Use the NVR helper to add all channels at once.</p>
      ) : (
        <ul className="space-y-2">
          {cams.map((c, i) => {
            const t = tests[c.id];
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                {editing === c.id ? (
                  <CameraForm initial={c} onSaved={saved} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col">
                        <button className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-white/10" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`}><Icon name="up" className="h-4 w-4" /></button>
                        <button className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-white/10" disabled={i === cams.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`}><Icon name="down" className="h-4 w-4" /></button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{c.name} {c.unreadable && <span className="badge bg-red-500/15 text-red-700 dark:text-red-300">re-enter address</span>}</div>
                        <div className="break-all font-mono text-xs text-slate-500 dark:text-slate-400">{c.mainMasked}</div>
                        {c.subMasked && <div className="break-all font-mono text-xs text-slate-500 dark:text-slate-400">Sub: {c.subMasked}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-ghost px-3 py-1.5" disabled={t?.busy} onClick={() => test(c)}>{t?.busy ? <Spinner className="h-4 w-4" /> : <Icon name="camera" className="h-4 w-4" />} Test</button>
                        <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(c.id)}>Edit</button>
                        <button className="btn-ghost px-3 py-1.5 text-red-600 dark:text-red-400" onClick={() => remove(c)} aria-label={`Remove ${c.name}`}><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {t && !t.busy && (
                      <div className="flex flex-wrap items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {t.img && <img src={t.img} alt={`Test picture from ${c.name}`} className="w-48 rounded-lg bg-black" />}
                        <p className={`text-sm ${t.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{t.text}</p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={mode === 'nvr' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode(mode === 'nvr' ? 'none' : 'nvr')}>NVR helper</button>
        <button className={mode === 'add' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode(mode === 'add' ? 'none' : 'add')}><Icon name="plus" className="h-4 w-4" /> Add one camera</button>
      </div>
      {mode === 'nvr' && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <h3 className="mb-1 text-sm font-medium">Add every channel from your NVR</h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Creates “Camera 1”, “Camera 2”… with main and sub-stream addresses. The username and password are sent only to Family Hub, stored encrypted, and never shown again.</p>
          <NvrHelper onSaved={saved} />
        </div>
      )}
      {mode === 'add' && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <CameraForm onSaved={saved} onCancel={() => setMode('none')} />
        </div>
      )}
    </section>
  );
}
