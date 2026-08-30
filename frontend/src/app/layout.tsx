import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppQueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DoersOS',
  description: 'DoersOS modular ERP platform',
};

const THEME_INIT_SCRIPT = `
try {
  var t = window.localStorage.getItem('doers-os-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppQueryProvider>{children}</AppQueryProvider>
      </body>
    </html>
  );
}
