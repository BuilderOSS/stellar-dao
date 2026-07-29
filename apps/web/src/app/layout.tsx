import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../styled-system/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Punch Counter: Soroban Token Dashboard',
  description: 'Soroban token dashboard with contract reads, signing, and action forms'
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
