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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }}>
      <Header brand={brand} navigation={navigation} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {children}
        </main>
        <AIChatPanel />
      </div>
      <ToastHost />
    </div>
  );
}
