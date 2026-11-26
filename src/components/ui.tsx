'use client';
import { useState } from 'react';
import type { MediaType, RequestStatus } from '@/lib/types';

const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  inbox: 'M4 4h16l1 9v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6zm1.8 2-.7 6H9a3 3 0 0 0 6 0h3.9l-.7-6z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6zm15.5 0c0-2-.8-3.8-2.1-5.1 3.3.3 6.6 2 6.6 5.1z',
  cog: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.6 5.5 1.9 1.5-2 3.4-2.3-.8a8 8 0 0 1-2 1.2L16 21h-4l-.4-2.3a8 8 0 0 1-2-1.2l-2.3.9-2-3.5 1.9-1.4a8 8 0 0 1 0-2.4L5.3 9.6l2-3.4 2.3.8a8 8 0 0 1 2-1.2L12 3h4l.4 2.3a8 8 0 0 1 2 1.2l2.3-.9 2 3.5-1.9 1.4a8 8 0 0 1 0 2.4z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
  moon: 'M20 15.3A8.5 8.5 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3z',
  logout: 'M10 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-9v-2h8V5h-8zm-.6 5L11 9.4 9.4 11H16v2H9.4l1.6 1.6L9.4 16 5.4 12z',
  key: 'M14 2a6 6 0 0 0-5.7 7.9L2 16.2V22h5.8v-2.2H10v-2.2h2.2l1.9-1.9A6 6 0 1 0 14 2zm1.5 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  bulb: 'M9 21h6v-1H9zm3-19a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z',
  power: 'M11 2h2v10h-2zm6.4 3.1A8 8 0 1 1 6.6 5.1L8 6.5a6 6 0 1 0 8 0z',
  thermo: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 1a4 4 0 0 1 4 4v8.8a6 6 0 1 1-8 0V5a4 4 0 0 1 4-4z',
  person: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-9 10c0-4.4 4-8 9-8s9 3.6 9 8z',
  gauge: 'M12 4a10 10 0 0 0-10 10h2a8 8 0 0 1 16 0h2A10 10 0 0 0 12 4zm4.2 4.4-5 5a1.5 1.5 0 1 0 2.1 2.1l3.6-6.4z',
  film: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v2h2V5zm12 0v2h2V5zM5 11v2h2v-2zm12 0v2h2v-2zM5 17v2h2v-2zm12 0v2h2v-2z',
  tv: 'M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  music: 'M9 17.5V6l11-3v11.5a3 3 0 1 1-2-2.8V7.6l-7 1.9v8a3 3 0 1 1-2-2.8z',
  download: 'M11 3h2v9.6l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4 3.3 3.3zM4 19h16v2H4z',
  calendar: 'M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm-2 8v9h14v-9z',
  sparkle: 'M12 2l2.1 6.9L21 11l-6.9 2.1L12 20l-2.1-6.9L3 11l6.9-2.1z',
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5 1.4 1.4-3.5 3.5a1 1 0 0 1-1.4 0zM8.5 19.1a4 4 0 0 1-5.6-5.6l3-3 1.4 1.4-3 3a2 2 0 0 0 2.8 2.8l3-3 1.4 1.4zm7-7.6-1.4-1.4 3-3a2 2 0 0 0-2.8-2.8l-3 3-1.4-1.4 3-3a4 4 0 0 1 5.6 5.6z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  x: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  refresh: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  );
}

export function Poster({ src, title, square = false, className = '' }: { src?: string | null; title: string; square?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const aspect = square ? 'aspect-square' : 'aspect-[2/3]';
  if (!src || failed) {
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');
    return (
      <div className={`${aspect} flex items-center justify-center rounded-xl bg-gradient-to-br from-accent-600 to-slate-800 text-2xl font-bold text-white/90 ${className}`}>
        {initials || '?'}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${aspect} w-full rounded-xl bg-slate-800 object-cover ${className}`} />
  );
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  downloading: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  available: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  declined: 'bg-red-500/15 text-red-700 dark:text-red-300',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  downloading: 'Downloading',
  available: 'Available',
  declined: 'Declined',
  failed: 'Failed',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const MEDIA_LABEL: Record<MediaType, string> = { movie: 'Film', tv: 'TV show', music: 'Music' };
export const MEDIA_ICON: Record<MediaType, string> = { movie: 'film', tv: 'tv', music: 'music' };

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-label="Loading" />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{children}</p>;
}

export function Avatar({ name, colour, size = 'h-9 w-9 text-sm' }: { name: string; colour: string; size?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`} style={{ backgroundColor: colour }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-accent-500' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
