'use client';
import { useState } from 'react';
import type { RequestView } from '@/lib/types';
import { api } from './api';
import { formatDate } from './format';
import { Empty, Icon, MEDIA_ICON, MEDIA_LABEL, Poster, Spinner, StatusBadge } from './ui';

/** `admin` = the "All requests" view (shows who asked); approve/decline need `canApprove`, removing others' requests needs `canRemoveAny`. */
export default function RequestList({ requests, admin = false, canApprove = false, canRemoveAny = false, currentUserId, onChange }: { requests: RequestView[]; admin?: boolean; canApprove?: boolean; canRemoveAny?: boolean; currentUserId: number; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; msg: string } | null>(null);

  const act = async (r: RequestView, fn: () => Promise<unknown>) => {
    setBusy(r.id);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError({ id: r.id, msg: e instanceof Error ? e.message : 'Action failed' });
      onChange();
    } finally {
      setBusy(null);
    }
  };

  if (!requests.length) return <Empty>No requests here yet.</Empty>;

  return (
    <ul className="space-y-3">
      {requests.map((r) => {
        const canCancel = canRemoveAny || (r.requestedById === currentUserId && ['pending', 'declined', 'failed'].includes(r.status));
        return (
          <li key={r.id} className="card flex gap-4 p-3">
            <div className="w-16 shrink-0 sm:w-20">
              <Poster src={r.poster} title={r.title} square={r.mediaType === 'music'} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">
                  {r.title} {r.year ? <span className="font-normal text-slate-500 dark:text-slate-400">({r.year})</span> : null}
                </h3>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><Icon name={MEDIA_ICON[r.mediaType]} className="h-3.5 w-3.5" />{MEDIA_LABEL[r.mediaType]}</span>
                {admin && <span>Requested by <strong className="text-slate-700 dark:text-slate-200">{r.requestedBy}</strong></span>}
                <span>{formatDate(r.createdAt)}</span>
                {r.decidedBy && <span>{r.status === 'declined' ? 'Declined' : 'Approved'} by {r.decidedBy}</span>}
              </div>
              {r.note && <p className="text-sm text-slate-600 dark:text-slate-300">{r.status === 'failed' ? '⚠ ' : ''}{r.note}</p>}
              {error?.id === r.id && <p className="text-sm text-red-600 dark:text-red-400">{error.msg}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {canApprove && ['pending', 'failed', 'declined'].includes(r.status) && (
                  <button disabled={busy === r.id} onClick={() => act(r, () => api(`/api/requests/${r.id}`, { method: 'PATCH', body: { action: 'approve' } }))} className="btn-success px-3 py-1.5">
                    {busy === r.id ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} {r.status === 'failed' ? 'Retry' : 'Approve'}
                  </button>
                )}
                {canApprove && ['pending', 'failed'].includes(r.status) && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => {
                      const note = window.prompt('Reason for declining (optional):') ?? undefined;
                      if (note === undefined) return;
                      act(r, () => api(`/api/requests/${r.id}`, { method: 'PATCH', body: { action: 'decline', note } }));
                    }}
                    className="btn-ghost px-3 py-1.5"
                  >
                    <Icon name="x" className="h-4 w-4" /> Decline
                  </button>
                )}
                {canCancel && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => {
                      if (window.confirm(canRemoveAny ? `Remove the request for “${r.title}”? (This does not delete anything from Sonarr/Radarr/Lidarr.)` : `Cancel your request for “${r.title}”?`)) {
                        act(r, () => api(`/api/requests/${r.id}`, { method: 'DELETE' }));
                      }
                    }}
                    className="btn-ghost px-3 py-1.5 text-red-600 dark:text-red-400"
                  >
                    <Icon name="trash" className="h-4 w-4" /> {canRemoveAny ? 'Remove' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
