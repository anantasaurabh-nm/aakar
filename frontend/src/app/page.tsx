'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { SDUIPageRenderer } from '@/components/sdui/SDUIPageRenderer';

export default function HomePage() {
  const { user, isLoading: authLoading } = useRequireAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ui', 'home'],
    queryFn: () => apiClient.get('ui/pages/home'),
    enabled: Boolean(user),
  });

  if (authLoading || !user) return null;

  return <SDUIPageRenderer raw={data} isLoading={isLoading} isError={isError} />;
}
