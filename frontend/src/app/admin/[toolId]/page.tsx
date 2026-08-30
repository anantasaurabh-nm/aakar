'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { SDUIPageRenderer } from '@/components/sdui/SDUIPageRenderer';

export default function AdminToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const { user, isLoading: authLoading } = useRequireAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ui', 'admin', toolId],
    queryFn: () => apiClient.get(`ui/pages/admin/${toolId}`),
    enabled: Boolean(user) && Boolean(toolId),
  });

  if (authLoading || !user) return null;

  return <SDUIPageRenderer raw={data} isLoading={isLoading} isError={isError} />;
}
