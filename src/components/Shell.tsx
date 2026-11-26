'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SessionUser } from '@/lib/auth';
import { api } from './api';
import { Avatar, Icon } from './ui';

const MEMBER_LINKS = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/request', label: 'Request', icon: 'search' },
  { href: '/my-requests', label: 'My requests', icon: 'list' },
];
const ADMIN_LINKS = [
  { href: '/admin/requests', label: 'All requests', icon: 'inbox' },
  { href: '/admin/users', label: 'Family', icon: 'users' },
  { href: '/admin/settings', label: 'Settings', icon: 'cog' },
];

export function ThemeToggle() {
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
  return (
    <button onClick={flip} className="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export default function Shell({ user, demo, children }: { user: SessionUser; demo: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const links = user.role === 'admin' ? [...MEMBER_LINKS, ...ADMIN_LINKS] : MEMBER_LINKS;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/85">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg">Family Hub</span>
          </Link>
          {demo && <span className="badge bg-amber-500/20 text-amber-700 dark:text-amber-300">Demo mode</span>}
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
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
            <Link href="/account" className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-200 dark:hover:bg-white/10" title="My account">
              <Avatar name={user.name} colour={user.colour} size="h-8 w-8 text-sm" />
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </Link>
            <button onClick={signOut} className="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10" title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="scrollbar-thin fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-white/10 dark:bg-[#0b1220]/95">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex min-w-[72px] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium ${isActive(l.href) ? 'text-accent-600 dark:text-accent-300' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Icon name={l.icon} className="h-5 w-5" />
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
