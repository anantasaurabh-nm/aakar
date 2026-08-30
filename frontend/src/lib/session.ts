'use client';

import { useQuery } from '@tanstack/react-query';
import type { SessionUser } from '@erp/shared-contracts';
import { apiClient } from './api-client';

export function useSession() {
  return useQuery<{ user: SessionUser }>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('auth/me'),
    retry: false,
  });
}

export function hasPermission(user: SessionUser | undefined, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
