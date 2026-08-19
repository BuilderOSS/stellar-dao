import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import '../../styled-system/styles.css';
import './globals.css';

const daoConfig = getDaoNetworkConfig(getDefaultDaoNetwork());

export const metadata: Metadata = {
  title: daoConfig.tokenName,
  description: daoConfig.tokenDescription
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
