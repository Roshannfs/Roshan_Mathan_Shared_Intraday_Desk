import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shared Intraday Desk | Roshan & Mathan',
  description: 'Shared intraday trade ledger and capital reconciliation for Roshan and Mathan.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
