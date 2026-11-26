import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <Shell user={user} demo={getConfig().demoMode}>
      {children}
    </Shell>
  );
}
