'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './session';

export function useRequireAuth() {
  const router = useRouter();
  const { data, isLoading, isError } = useSession();

  useEffect(() => {
    if (!isLoading && isError) router.replace('/login');
  }, [isLoading, isError, router]);

  return { user: data?.user, isLoading };
}
