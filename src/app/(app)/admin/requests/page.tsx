'use client';
import { useState } from 'react';
import type { RequestStatus, RequestView } from '@/lib/types';
import { useApi } from '@/components/api';
import RequestList from '@/components/RequestList';
import { ErrorNote, Spinner } from '@/components/ui';
import { useMe } from '@/components/useMe';

const FILTERS: { value: RequestStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'available', label: 'Available' },
  { value: 'declined', label: 'Declined' },
  { value: 'failed', label: 'Failed' },
];

export default function AllRequestsPage() {
  const me = useMe();
  const [filter, setFilter] = useState<RequestStatus | ''>('');
  const { data, error, reload } = useApi<{ requests: RequestView[] }>(`/api/requests/all${filter ? `?status=${filter}` : ''}`, 30000);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">All requests</h1>
        <p className="text-slate-500 dark:text-slate-400">Approve, decline or tidy up the family’s requests.</p>
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`${filter === f.value ? 'btn-primary' : 'btn-ghost'} shrink-0 px-3 py-1.5`}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data || !me ? <Spinner /> : <RequestList admin requests={data.requests} currentUserId={me.id} onChange={reload} />}
    </div>
  );
}
