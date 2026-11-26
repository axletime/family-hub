'use client';
import { useEffect, useState } from 'react';
import type { PublicProfile } from '@/lib/types';
import { api } from '@/components/api';
import { Avatar, ErrorNote, Icon, Spinner } from '@/components/ui';
import { ThemeToggle } from '@/components/Shell';

export default function LoginForm() {
  const [profiles, setProfiles] = useState<PublicProfile[] | null>(null);
  const [selected, setSelected] = useState<PublicProfile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ profiles: PublicProfile[] }>('/api/auth/profiles')
      .then((d) => setProfiles(d.profiles))
      .catch((e) => setError(e.message));
  }, []);

  const submit = async (value = pin) => {
    if (!selected || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { userId: selected.id, pin: value } });
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setPin('');
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  // Physical keyboard support (handy on TVs with a remote keyboard, and desktops).
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') {
        setSelected(null);
        setPin('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pt-safe pb-safe px-safe flex min-h-screen flex-col">
      <div className="flex justify-end py-3">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center pb-10 sm:pb-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mb-4 h-16 w-16" />
        <h1 className="text-3xl font-bold">Family Hub</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{selected ? `Hello ${selected.name} — enter your PIN` : 'Who’s using the hub?'}</p>

        {error && <div className="mt-4 w-full max-w-sm">{<ErrorNote>{error}</ErrorNote>}</div>}

        {!profiles && !error && <Spinner className="mt-10 h-8 w-8" />}

        {profiles && !selected && (
          <div className="mt-8 flex w-full flex-wrap justify-center gap-4">
            {profiles.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="card flex w-[calc(50%-0.5rem)] flex-col items-center gap-3 p-5 transition sm:w-40 hover:-translate-y-0.5 hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                <Avatar name={p.name} colour={p.colour} size="h-16 w-16 text-2xl" />
                <span className="font-semibold">{p.name}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-8 flex w-full max-w-xs flex-col items-center">
            <Avatar name={selected.name} colour={selected.colour} size="h-16 w-16 text-2xl" />
            <div className="my-6 flex h-6 gap-3" aria-label={`${pin.length} digits entered`}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? 'border-accent-400 bg-accent-400' : 'border-slate-400 dark:border-slate-500'}`} />
              ))}
            </div>
            <div className="grid w-full grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} onClick={() => press(d)} className="card py-4 text-2xl font-semibold hover:border-accent-400 active:scale-95">
                  {d}
                </button>
              ))}
              <button onClick={() => setPin((p) => p.slice(0, -1))} className="card py-4 text-sm font-semibold text-slate-500 hover:border-accent-400" aria-label="Delete">
                ⌫
              </button>
              <button onClick={() => press('0')} className="card py-4 text-2xl font-semibold hover:border-accent-400 active:scale-95">
                0
              </button>
              <button onClick={() => submit()} disabled={busy || pin.length < 4} className="btn-primary rounded-2xl py-4" aria-label="Sign in">
                {busy ? <Spinner /> : <Icon name="check" className="h-6 w-6" />}
              </button>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setPin('');
                setError(null);
              }}
              className="mt-4 min-h-[44px] px-3 text-sm text-slate-500 hover:underline dark:text-slate-400"
            >
              Not {selected.name}? Choose another profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
