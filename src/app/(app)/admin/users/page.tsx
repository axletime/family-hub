'use client';
import { useState } from 'react';
import { api, useApi } from '@/components/api';
import { Avatar, ErrorNote, Icon, Spinner } from '@/components/ui';
import { useMe } from '@/components/useMe';
import { FEATURES, type Access, type GroupAccess, type GroupId } from '@/lib/features';

interface AdminUser {
  id: number;
  name: string;
  role: 'admin' | 'member';
  group: GroupId;
  pinLength: number | null;
  colour: string;
  createdAt: string;
  requestCount: number;
}

const COLOURS = ['#1B4F8A', '#2E7D5B', '#8A3B1B', '#6B3FA0', '#A0346B', '#B07D1A', '#2B7A8C', '#5A6B7D'];

function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOURS.map((c) => (
        <button type="button" key={c} onClick={() => onChange(c)} aria-label={`Colour ${c}`} className={`h-11 w-11 rounded-full ring-offset-2 md:h-7 md:w-7 ring-offset-white dark:ring-offset-[#111a2e] ${value === c ? 'ring-2 ring-accent-400' : ''}`} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

type GroupNames = GroupAccess['names'];
const groupName = (g: GroupId, n: GroupNames | undefined) => (g === 'admin' ? 'Admin' : n?.[g] ?? (g === 'home' ? 'Home' : 'Outside'));

function UserForm({ initial, names, pinMin, onDone, onCancel }: { initial?: AdminUser; names?: GroupNames; pinMin: number; onDone: (msg?: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [pin, setPin] = useState('');
  const [group, setGroup] = useState<GroupId>(initial?.group ?? 'home');
  const [colour, setColour] = useState(initial?.colour ?? COLOURS[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let msg: string | undefined;
      if (initial) {
        const r = await api<{ signedOut?: boolean }>(`/api/admin/users/${initial.id}`, { method: 'PATCH', body: { name, group, colour, ...(pin ? { pin } : {}) } });
        if (r.signedOut) msg = `${name} has been signed out on their devices so the change takes effect.`;
      } else await api('/api/admin/users', { method: 'POST', body: { name, pin, group, colour } });
      setName('');
      setPin('');
      onDone(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required placeholder="e.g. Emma" />
      </div>
      <div>
        <label className="label">{initial ? 'New PIN (leave blank to keep)' : `PIN (${pinMin}–8 digits)`}</label>
        <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} required={!initial} pattern={`\\d{${pinMin},8}`} />
      </div>
      <div>
        <label className="label">Group</label>
        <select className="input" value={group} onChange={(e) => setGroup(e.target.value as GroupId)}>
          <option value="home">{groupName('home', names)}</option>
          <option value="outside">{groupName('outside', names)}</option>
          <option value="admin">Admin (everything, including settings)</option>
        </select>
      </div>
      <div>
        <label className="label">Colour</label>
        <ColourPicker value={colour} onChange={setColour} />
      </div>
      {error && <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Icon name={initial ? 'check' : 'plus'} className="h-4 w-4" />} {initial ? 'Save changes' : 'Add family member'}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function UsersPage() {
  const me = useMe();
  const { data, error, reload } = useApi<{ users: AdminUser[] }>('/api/admin/users');
  const groups = useApi<GroupsResponse>('/api/admin/groups');
  const auth = useApi<{ pinMin?: number }>('/api/auth/me');
  const pinMin = auth.data?.pinMin ?? 6;
  const names = groups.data?.access.names;
  const [editing, setEditing] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = (msg?: string) => {
    setNotice(msg ?? null);
    reload();
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`Remove ${u.name}? Their requests will also be removed.`)) return;
    setActionError(null);
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Family members</h1>
        <p className="text-slate-500 dark:text-slate-400">Add people, reset PINs and choose which group each person is in.</p>
      </div>
      <section className="card p-5">
        <h2 className="card-title mb-4">Add someone</h2>
        <UserForm names={names} pinMin={pinMin} onDone={done} />
      </section>
      {notice && <div className="rounded-xl bg-accent-600/10 px-4 py-3 text-sm text-accent-700 dark:text-accent-200">{notice}</div>}
      {(error || actionError) && <ErrorNote>{error ?? actionError}</ErrorNote>}
      {!data ? <Spinner /> : (
        <ul className="space-y-3">
          {data.users.map((u) => (
            <li key={u.id} className="card p-4">
              {editing === u.id ? (
                <UserForm initial={u} names={names} pinMin={pinMin} onCancel={() => setEditing(null)} onDone={(msg) => { setEditing(null); done(msg); }} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={u.name} colour={u.colour} size="h-11 w-11 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{u.name} {me?.id === u.id && <span className="text-xs font-normal text-slate-500">(you)</span>}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`badge ${u.group === 'admin' ? 'bg-accent-600/15 text-accent-700 dark:text-accent-200' : u.group === 'home' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>{groupName(u.group, names)}</span>
                      {(u.pinLength === null || u.pinLength < 6) && <span className="badge bg-red-500/15 text-red-700 dark:text-red-300" title="Reset to a 6–8 digit PIN">{u.pinLength ? `${u.pinLength}-digit PIN` : 'Short PIN?'}</span>}
                      <span>{u.requestCount} request{u.requestCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(u.id)}><Icon name="key" className="h-4 w-4" /> Edit / reset PIN</button>
                  {me?.id !== u.id && <button className="btn-ghost px-3 py-1.5 text-red-600 dark:text-red-400" onClick={() => remove(u)}><Icon name="trash" className="h-4 w-4" /> Remove</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.data && <PermissionsCard initial={groups.data} onSaved={() => { groups.reload(); reload(); }} />}
    </div>
  );
}

type GroupsResponse = { access: GroupAccess; network: 'home' | 'away'; ip: string };

const ACCESS_LABEL: Record<Access, string> = { on: 'Yes', lan: 'Home network only', off: 'No' };

/** Features × groups. Admin always has everything, but cameras and HA control can be limited to the home network. */
function PermissionsCard({ initial, onSaved }: { initial: GroupsResponse; onSaved: () => void }) {
  const [ga, setGa] = useState<GroupAccess>(initial.access);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (g: 'admin' | 'home' | 'outside', f: string, v: Access) => setGa((cur) => ({ ...cur, [g]: { ...cur[g], [f]: v } }));
  const dirty = JSON.stringify(ga) !== JSON.stringify(initial.access);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/groups', { method: 'PUT', body: ga });
      setMsg({ ok: true, text: 'Permissions saved. They apply straight away.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  const cell = (g: 'admin' | 'home' | 'outside', f: string) => {
    const v = ga[g][f as keyof GroupAccess['home']];
    const opts: Access[] = g === 'admin' ? ['on', 'lan'] : ['on', 'lan', 'off'];
    return (
      <select aria-label={`${g} ${f}`} className={`input min-w-[9rem] py-1.5 text-sm ${v === 'off' ? 'text-slate-400' : v === 'lan' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`} value={v} onChange={(e) => set(g, f, e.target.value as Access)}>
        {opts.map((o) => <option key={o} value={o}>{ACCESS_LABEL[o]}</option>)}
      </select>
    );
  };

  return (
    <section className="card p-5">
      <h2 className="card-title mb-1"><span className="flex items-center gap-2"><Icon name="shield" className="h-4 w-4" /> Groups &amp; permissions</span></h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Choose what each group can use. &ldquo;Home network only&rdquo; works only when someone is connected to your home Wi-Fi/network. You are currently on the{' '}
        <strong className={initial.network === 'home' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'}>{initial.network === 'home' ? 'home network' : 'internet (away)'}</strong> ({initial.ip || 'unknown IP'}).
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {(['home', 'outside'] as const).map((g) => (
          <div key={g}>
            <label className="label">Name of the &ldquo;{g === 'home' ? 'Home' : 'Outside'}&rdquo; group</label>
            <input className="input" maxLength={24} value={ga.names[g]} onChange={(e) => setGa((cur) => ({ ...cur, names: { ...cur.names, [g]: e.target.value } }))} />
          </div>
        ))}
      </div>
      <div className="scrollbar-thin -mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-3 font-semibold">Feature</th>
              <th className="px-2 py-2 font-semibold">Admin</th>
              <th className="px-2 py-2 font-semibold">{ga.names.home || 'Home'}</th>
              <th className="px-2 py-2 font-semibold">{ga.names.outside || 'Outside'}</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.id} className="border-t border-slate-200 dark:border-white/10">
                <td className="py-2 pr-3">
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{f.help}</div>
                </td>
                <td className="px-2 py-2">{f.id === 'cameras' || f.id === 'haControl' ? cell('admin', f.id) : <span className="text-xs text-slate-500">Always</span>}</td>
                <td className="px-2 py-2">{cell('home', f.id)}</td>
                <td className="px-2 py-2">{cell('outside', f.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Save permissions</button>
        {dirty && <button className="btn-ghost" onClick={() => setGa(initial.access)}>Undo changes</button>}
      </div>
    </section>
  );
}
