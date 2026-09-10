'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { SDUIPageRenderer } from '@/components/sdui/SDUIPageRenderer';

function AppPageContent() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const { user, isLoading: authLoading } = useRequireAuth();

  const queryUrl = view ? `ui/pages/app/${appId}?view=${view}` : `ui/pages/app/${appId}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ui', 'app', appId, view],
    queryFn: () => apiClient.get(queryUrl),
    enabled: Boolean(user) && Boolean(appId),
  });

  if (authLoading || !user) return null;

  return <SDUIPageRenderer raw={data} isLoading={isLoading} isError={isError} />;
}

export default function AppPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading…</div>}>
      <AppPageContent />
    </Suspense>
  );
}

