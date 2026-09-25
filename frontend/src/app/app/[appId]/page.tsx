'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { SDUIPageRenderer } from '@/components/sdui/SDUIPageRenderer';

function AppPageContent() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const record = searchParams.get('record');
  const { user, isLoading: authLoading } = useRequireAuth();

  useEffect(() => {
    if (appId === 'notifications') {
      router.replace('/admin/notifications');
    }
  }, [appId, router]);

  const queryParams = new URLSearchParams();
  if (view) queryParams.set('view', view);
  if (record) queryParams.set('record', record);
  const queryString = queryParams.toString();
  const queryUrl = queryString ? `ui/pages/app/${appId}?${queryString}` : `ui/pages/app/${appId}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ui', 'app', appId, view, record],
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

