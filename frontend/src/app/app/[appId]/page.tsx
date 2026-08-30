'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { SDUIPageRenderer } from '@/components/sdui/SDUIPageRenderer';

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();
  const { user, isLoading: authLoading } = useRequireAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ui', 'app', appId],
    queryFn: () => apiClient.get(`ui/pages/app/${appId}`),
    enabled: Boolean(user) && Boolean(appId),
  });

  if (authLoading || !user) return null;

  return <SDUIPageRenderer raw={data} isLoading={isLoading} isError={isError} />;
}
