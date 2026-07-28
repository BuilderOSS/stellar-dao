import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../styled-system/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Punch Counter',
  description: 'Soroban frontend with Stellar Wallets Kit'
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
