import { guardPage } from '@/lib/pageGuard';

export const dynamic = 'force-dynamic';

/** Each admin section has its own guard (All requests can be opened up to other groups). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await guardPage();
  return <>{children}</>;
}
