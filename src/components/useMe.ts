'use client';
import type { SessionUser } from '@/lib/auth';
import { useApi } from './api';

export function useMe() {
  return useApi<{ user: SessionUser }>('/api/auth/me').data?.user ?? null;
}
