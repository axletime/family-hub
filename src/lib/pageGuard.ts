import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser, type SessionUser } from './auth';
import { canUse, type FeatureId } from './features';

/** Server-side page guard: signed in, and an admin or allowed to use the feature on this network. */
export async function guardPage(need?: FeatureId | 'admin'): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (need === 'admin' ? user.role !== 'admin' : need && !canUse(user, need)) redirect('/');
  return user;
}
