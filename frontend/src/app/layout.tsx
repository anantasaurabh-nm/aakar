import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nunito } from 'next/font/google';
import { AppQueryProvider } from '@/lib/query-provider';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
});

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
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={nunito.className}>
        <AppQueryProvider>{children}</AppQueryProvider>
      </body>
    </html>
  );
}
