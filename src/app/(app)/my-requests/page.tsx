'use client';
import type { RequestView } from '@/lib/types';
import { useApi } from '@/components/api';
import RequestList from '@/components/RequestList';
import { ErrorNote, Icon, Spinner } from '@/components/ui';
import { useMe } from '@/components/useMe';

export default function MyRequestsPage() {
  const me = useMe();
  const { data, error, reload } = useApi<{ requests: RequestView[] }>('/api/requests', 30000);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">My requests</h1>
          <p className="text-slate-500 dark:text-slate-400">Everything you’ve asked for, and where it’s up to.</p>
        </div>
        <a href="/request" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> New request</a>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data || !me ? <Spinner /> : <RequestList requests={data.requests} currentUserId={me.id} onChange={reload} />}
    </div>
  );
}
