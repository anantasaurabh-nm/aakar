'use client';

import { validateSDUIResponse } from '@erp/shared-contracts';
import { AppShell } from '@/components/shell/AppShell';
import { useUiStore } from '@/lib/ui-store';
import { SectionRotator } from './SectionRotator';
import { SDUISectionRenderer } from './SDUISectionRenderer';

export function SDUIPageRenderer({
  raw,
  isLoading,
  isError,
}: {
  raw: unknown;
  isLoading: boolean;
  isError: boolean;
}) {
  const copilotPage = useUiStore((s) => s.copilotPage);

  if (!copilotPage && isLoading) {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }
  if (!copilotPage && isError) {
    return <FullPageMessage>Something went wrong loading this page.</FullPageMessage>;
  }

  const activeRaw = copilotPage ?? raw;
  const result = validateSDUIResponse(activeRaw);
  if (!result.ok) {
    return <FullPageMessage>This page couldn't be displayed ({result.reason}).</FullPageMessage>;
  }

  const { brand, navigation, page } = result.page;

  return (
    <AppShell brand={brand} navigation={navigation}>
      <SectionRotator sections={page.sections} renderSection={(section) => <SDUISectionRenderer section={section} />} />
    </AppShell>
  );
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
      {children}
    </div>
  );
}
