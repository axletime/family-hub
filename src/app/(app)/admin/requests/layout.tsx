import { guardPage } from '@/lib/pageGuard';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await guardPage('allRequests');
  return <>{children}</>;
}
