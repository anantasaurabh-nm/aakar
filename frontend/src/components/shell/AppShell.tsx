'use client';

import type { SDUIBrand, SDUINavigation } from '@erp/shared-contracts';
import { Header } from './Header';
import { AIChatPanel } from './AIChatPanel';
import { ToastHost } from '@/components/ui/ToastHost';

export function AppShell({
  brand,
  navigation,
  children,
}: {
  brand: SDUIBrand;
  navigation: SDUINavigation;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header brand={brand} navigation={navigation} />
      {children}
      <AIChatPanel />
      <ToastHost />
    </div>
  );
}
