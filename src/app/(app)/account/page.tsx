'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { Avatar, ErrorNote } from '@/components/ui';
import { useMe } from '@/components/useMe';

export default function AccountPage() {
  const me = useMe();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) return setMsg({ ok: false, text: 'The new PINs do not match.' });
    try {
      await api('/api/auth/pin', { method: 'POST', body: { currentPin, newPin } });
      setMsg({ ok: true, text: 'Your PIN has been changed.' });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change PIN.' });
    }
  };

  const pinInput = (value: string, set: (v: string) => void, label: string) => (
    <div>
      <label className="label">{label}</label>
      <input type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,8}" maxLength={8} required value={value} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} className="input" />
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-5">
      {me && (
        <div className="flex items-center gap-3">
          <Avatar name={me.name} colour={me.colour} size="h-14 w-14 text-xl" />
          <div>
            <h1 className="text-2xl font-bold">{me.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{me.role === 'admin' ? 'Administrator' : 'Family member'}</p>
          </div>
        </div>
      )}
      <form onSubmit={save} className="card space-y-4 p-5">
        <h2 className="card-title">Change my PIN</h2>
        {pinInput(currentPin, setCurrentPin, 'Current PIN')}
        {pinInput(newPin, setNewPin, 'New PIN (4–8 digits)')}
        {pinInput(confirmPin, setConfirmPin, 'Confirm new PIN')}
        {msg && (msg.ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}
        <button className="btn-primary w-full">Save new PIN</button>
      </form>
    </div>
  );
}
