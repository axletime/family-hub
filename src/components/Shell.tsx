'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '@/lib/auth';
import { api } from './api';
import { Avatar, Icon } from './ui';

const MEMBER_LINKS = [
  { href: '/', label: 'Dashboard', short: 'Home', icon: 'home' },
  { href: '/request', label: 'Request', short: 'Request', icon: 'search' },
  { href: '/discover', label: 'Discover', short: 'Discover', icon: 'sparkle' },
  { href: '/my-requests', label: 'My requests', short: 'My requests', icon: 'list' },
];
const ADMIN_LINKS = [
  { href: '/admin/requests', label: 'All requests', short: 'All requests', icon: 'inbox' },
  { href: '/admin/users', label: 'Family', short: 'Family', icon: 'users' },
  { href: '/admin/settings', label: 'Settings', short: 'Settings', icon: 'cog' },
];
/** Extra admin shortcuts shown only in the phone "More" sheet. */
const MORE_ADMIN_LINKS = [{ href: '/admin/settings/connections', label: 'Connections & API keys', icon: 'key' }];

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const flip = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('fh-theme', next ? 'dark' : 'light');
    } catch {
      /* private mode */
    }
  };
  return { dark, flip };
}

export function ThemeToggle() {
  const { dark, flip } = useTheme();
  return (
    <button onClick={flip} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200 lg:h-auto lg:w-auto lg:p-2 dark:text-slate-300 dark:hover:bg-white/10" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

async function signOut() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/login';
}

/** Bottom sheet opened from the "More" tab on phones. */
function MoreSheet({ user, open, onClose, isActive }: { user: SessionUser; open: boolean; onClose: () => void; isActive: (h: string) => boolean }) {
  const { dark, flip } = useTheme();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const row = 'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 text-left text-base font-medium';
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={onClose} />
      <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#111a2e]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        <div className="mb-2 flex items-center gap-3 px-4 py-2">
          <Avatar name={user.name} colour={user.colour} size="h-11 w-11 text-lg" />
          <div>
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{user.role === 'admin' ? 'Administrator' : 'Family member'}</div>
          </div>
        </div>
        {user.role === 'admin' && (
          <>
            <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin</div>
            {[...ADMIN_LINKS, ...MORE_ADMIN_LINKS].map((l) => (
              <Link key={l.href} href={l.href} onClick={onClose} className={`${row} ${(l.href === '/admin/settings' ? isActive(l.href) && !isActive('/admin/settings/connections') : isActive(l.href)) ? 'bg-accent-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                <Icon name={l.icon} /> {l.label}
              </Link>
            ))}
            <div className="my-2 border-t border-slate-200 dark:border-white/10" />
          </>
        )}
        <Link href="/account" onClick={onClose} className={`${row} ${isActive('/account') ? 'bg-accent-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
          <Icon name="key" /> My account &amp; PIN
        </Link>
        <button onClick={flip} className={`${row} hover:bg-slate-100 dark:hover:bg-white/5`}>
          <Icon name={dark ? 'sun' : 'moon'} /> {dark ? 'Light theme' : 'Dark theme'}
        </button>
        <button onClick={signOut} className={`${row} text-red-600 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-white/5`}>
          <Icon name="logout" /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function Shell({ user, demo, children }: { user: SessionUser; demo: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const links = user.role === 'admin' ? [...MEMBER_LINKS, ...ADMIN_LINKS] : MEMBER_LINKS;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const moreActive = [...ADMIN_LINKS.map((l) => l.href), '/account'].some(isActive);

  const closeMore = useCallback(() => setMoreOpen(false), []);
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <div className="pb-tabbar min-h-screen">
      <header className="pt-safe sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/85">
        <div className="px-safe mx-auto flex max-w-[1600px] items-center gap-3 py-2 lg:py-3">
          <Link href="/" className="flex min-h-[44px] items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg">Family Hub</span>
          </Link>
          {demo && <span className="badge bg-amber-500/20 text-amber-700 dark:text-amber-300">Demo<span className="hidden sm:inline">&nbsp;mode</span></span>}
          <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive(l.href) ? 'bg-accent-600 text-white' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10'}`}
              >
                <Icon name={l.icon} className="h-4 w-4" />
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/account" className="flex min-h-[44px] items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-200 dark:hover:bg-white/10" title="My account">
              <Avatar name={user.name} colour={user.colour} size="h-8 w-8 text-sm" />
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </Link>
            <button onClick={signOut} className="hidden rounded-xl p-2 text-slate-500 hover:bg-slate-200 lg:block dark:text-slate-300 dark:hover:bg-white/10" title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-safe mx-auto max-w-[1600px] py-4 sm:py-6">{children}</main>

      {/* Phone / tablet bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-white/10 dark:bg-[#0b1220]/95" aria-label="Main">
        <div className="mx-auto flex max-w-xl">
          {MEMBER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${isActive(l.href) ? 'text-accent-600 dark:text-accent-300' : 'text-slate-500 dark:text-slate-400'}`}
            >
              <Icon name={l.icon} className="h-6 w-6" />
              <span className="max-w-full truncate">{l.short}</span>
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${moreActive ? 'text-accent-600 dark:text-accent-300' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Icon name="more" className="h-6 w-6" />
            <span>More</span>
          </button>
        </div>
      </nav>
      <MoreSheet user={user} open={moreOpen} onClose={closeMore} isActive={isActive} />
    </div>
  );
}
