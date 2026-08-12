import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../styled-system/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'DAO Test Stellar',
  description: 'DAO governance web app with proposals, treasury, admin minting, and token metadata.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
