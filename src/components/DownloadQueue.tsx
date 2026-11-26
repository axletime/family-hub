'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueueItem } from '@/lib/types';
import { Empty, Icon, Spinner } from '@/components/ui';
import { formatBytes } from '@/components/format';

const PREVIEW = 5;

const SERVICE_ICON: Record<QueueItem['service'], string> = { sonarr: 'tv', radarr: 'film', lidarr: 'music' };

const STATUS_LABEL: Record<string, string> = {
  downloading: 'Downloading',
  queued: 'Queued',
  paused: 'Paused',
  delay: 'Delayed',
  completed: 'Completed',
  importpending: 'Ready to import',
  importing: 'Importing',
  imported: 'Imported',
  failed: 'Failed',
  failedpending: 'Failed',
  warning: 'Warning',
  stalled: 'Stalled',
};

function statusLabel(s: string) {
  return STATUS_LABEL[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function QueueRow({ q, showIcon }: { q: QueueItem; showIcon?: boolean }) {
  const label = statusLabel(q.status);
  const problem = /fail|warn|stall/i.test(q.status);
  const details = [`${q.progress.toFixed(0)}%`, q.timeLeft && `${q.timeLeft} left`, q.sizeBytes && formatBytes(q.sizeBytes)].filter(Boolean).join(' · ');
  return (
    <li>
      <div className="flex items-start gap-2 text-sm">
        {showIcon && <Icon name={SERVICE_ICON[q.service]} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <div className="truncate" title={q.subtitle ? `${q.title} · ${q.subtitle}` : q.title}>
            <span className="font-medium">{q.title}</span>
            {q.subtitle && <span className="text-slate-500 dark:text-slate-400"> · {q.subtitle}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span className={problem ? 'font-medium text-red-600 dark:text-red-400' : ''}>{label}</span>
            <span>{details}</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className={`h-full rounded-full transition-all ${problem ? 'bg-red-500' : 'bg-accent-500'}`} style={{ width: `${Math.min(100, Math.max(0, q.progress))}%` }} />
      </div>
    </li>
  );
}

function QueueDialog({ queue, onClose }: { queue: QueueItem[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && panelRef.current) {
        // Keep focus inside the dialog.
        const items = panelRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-dialog-title"
        className="relative flex h-full w-full flex-col bg-white shadow-2xl dark:bg-slate-900 sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-slate-200 sm:dark:border-white/10"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div>
            <h2 id="queue-dialog-title" className="flex items-center gap-2 text-lg font-semibold"><Icon name="download" className="h-5 w-5 text-accent-600 dark:text-accent-400" /> Download queue</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{queue.length} {queue.length === 1 ? 'item' : 'items'} · updates automatically</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-ghost h-11 w-11 shrink-0 justify-center p-0" aria-label="Close download queue">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {!queue.length ? <Empty>Nothing downloading right now.</Empty> : (
            <ul className="space-y-4">{queue.map((q) => <QueueRow key={q.id} q={q} showIcon />)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dashboard card: top 5 of the queue, with a pop-up for the whole list. Data refreshes come from the parent. */
export function DownloadQueue({ queue }: { queue: QueueItem[] | undefined }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const total = queue?.length ?? 0;
  return (
    <section className="card p-4">
      <h2 className="card-title mb-3">
        <span className="flex items-center gap-2"><Icon name="download" className="h-4 w-4" /> Downloading now</span>
        {queue && <span className="normal-case">{total} in queue</span>}
      </h2>
      {!queue ? <Spinner /> : !total ? <Empty>Nothing downloading right now.</Empty> : (
        <>
          <ul className="space-y-3">{queue.slice(0, PREVIEW).map((q) => <QueueRow key={q.id} q={q} />)}</ul>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
            <span className="text-xs text-slate-500 dark:text-slate-400">Showing {Math.min(PREVIEW, total)} of {total}</span>
            <button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-[44px] text-sm" aria-haspopup="dialog">
              View all{total > PREVIEW ? ` (${total})` : ''}
            </button>
          </div>
        </>
      )}
      {open && queue && <QueueDialog queue={queue} onClose={close} />}
    </section>
  );
}
