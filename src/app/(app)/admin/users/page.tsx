'use client';
import { useState } from 'react';
import { api, useApi } from '@/components/api';
import { Avatar, ErrorNote, Icon, Spinner } from '@/components/ui';
import { useMe } from '@/components/useMe';

interface AdminUser {
  id: number;
  name: string;
  role: 'admin' | 'member';
  colour: string;
  createdAt: string;
  requestCount: number;
}

const COLOURS = ['#1B4F8A', '#2E7D5B', '#8A3B1B', '#6B3FA0', '#A0346B', '#B07D1A', '#2B7A8C', '#5A6B7D'];

function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOURS.map((c) => (
        <button type="button" key={c} onClick={() => onChange(c)} aria-label={`Colour ${c}`} className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-[#111a2e] ${value === c ? 'ring-2 ring-accent-400' : ''}`} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

function UserForm({ initial, onDone, onCancel }: { initial?: AdminUser; onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>(initial?.role ?? 'member');
  const [colour, setColour] = useState(initial?.colour ?? COLOURS[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) await api(`/api/admin/users/${initial.id}`, { method: 'PATCH', body: { name, role, colour, ...(pin ? { pin } : {}) } });
      else await api('/api/admin/users', { method: 'POST', body: { name, pin, role, colour } });
      setName('');
      setPin('');
      onDone();
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
        <label className="label">{initial ? 'New PIN (leave blank to keep)' : 'PIN (4–8 digits)'}</label>
        <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} required={!initial} pattern="\d{4,8}" />
      </div>
      <div>
        <label className="label">Role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
          <option value="member">Family member</option>
          <option value="admin">Admin (can approve requests and manage family)</option>
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
  const [editing, setEditing] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
        <p className="text-slate-500 dark:text-slate-400">Add people, reset PINs and choose who can approve requests.</p>
      </div>
      <section className="card p-5">
        <h2 className="card-title mb-4">Add someone</h2>
        <UserForm onDone={reload} />
      </section>
      {(error || actionError) && <ErrorNote>{error ?? actionError}</ErrorNote>}
      {!data ? <Spinner /> : (
        <ul className="space-y-3">
          {data.users.map((u) => (
            <li key={u.id} className="card p-4">
              {editing === u.id ? (
                <UserForm initial={u} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={u.name} colour={u.colour} size="h-11 w-11 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{u.name} {me?.id === u.id && <span className="text-xs font-normal text-slate-500">(you)</span>}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{u.role === 'admin' ? 'Admin' : 'Family member'} · {u.requestCount} request{u.requestCount === 1 ? '' : 's'}</div>
                  </div>
                  <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(u.id)}><Icon name="key" className="h-4 w-4" /> Edit / reset PIN</button>
                  {me?.id !== u.id && <button className="btn-ghost px-3 py-1.5 text-red-600 dark:text-red-400" onClick={() => remove(u)}><Icon name="trash" className="h-4 w-4" /> Remove</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
