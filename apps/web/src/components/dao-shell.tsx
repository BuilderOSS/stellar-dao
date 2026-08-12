'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';

const BASE_NAV_ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/treasury', label: 'Treasury' },
  { href: '/members', label: 'Members' },
  { href: '/profile', label: 'Profile' }
];

function NavLink({ href, label, active }: { href: Route; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '10px 14px',
        borderRadius: '999px',
        border: active ? '1px solid rgba(0,133,255,0.42)' : '1px solid rgba(148,163,184,0.2)',
        background: active ? 'rgba(0,133,255,0.12)' : 'rgba(255,255,255,0.03)',
        color: active ? 'white' : 'rgba(177,198,220,0.88)',
        textDecoration: 'none',
        fontSize: '0.92rem',
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </Link>
  );
}

export function DaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useDaoSessionStore();
  const updateSession = useDaoSessionStore((state) => state.updateSession);
  const network = getDefaultDaoNetwork();
  const currentNetwork = getDaoNetworkConfig(network);
  const adminNavItem: { href: Route; label: string } = { href: '/admin', label: 'Admin' };
  const isAdmin = session.address && session.address === currentNetwork.adminAddress;
  const navItems: Array<{ href: Route; label: string }> = isAdmin ? [...BASE_NAV_ITEMS, adminNavItem] : BASE_NAV_ITEMS;

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });

    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const nextAddress = event.payload.address ?? '';
      updateSession({
        address: nextAddress,
        status: nextAddress ? `Connected on ${currentNetwork.label}` : 'Disconnected'
      });
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      updateSession({ address: '', status: 'Disconnected', syncedAt: '' });
    });

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [currentNetwork.label, updateSession]);

  async function connectWallet() {
    try {
      const result = await StellarWalletsKit.authModal();
      updateSession({ address: result.address, status: `Connected on ${currentNetwork.label}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      updateSession({ status: message });
    }
  }

  async function disconnectWallet() {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      updateSession({ address: '', status: 'Disconnected', syncedAt: '' });
    }
  }

  return (
    <main className="page-shell">
      <Card p="6">
        <Stack gap="5">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack gap="1">
              <Text className="eyebrow">DAO governance</Text>
              <Heading style={{ fontSize: 'clamp(2.2rem, 4vw, 4rem)', lineHeight: 1.02, margin: 0 }}>
                DAO Test Stellar
              </Heading>
              <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
                A single-DAO governance interface for voting, treasury execution, token profiles, and admin minting.
              </Text>
            </Stack>

            <Grid columns={{ base: 1, sm: 2 }} gap="3">
              <Badge>{currentNetwork.label}</Badge>
              <Badge>{session.address ? 'Wallet connected' : 'Wallet idle'}</Badge>
              <Badge>{session.status}</Badge>
              {isAdmin ? <Badge>Admin</Badge> : null}
              {session.address ? <ShortId value={session.address} /> : null}
            </Grid>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text className="lede" style={{ margin: 0, fontSize: '0.92rem' }}>
              RPC: {currentNetwork.rpcUrl}
            </Text>
            <Button
              type="button"
              size="lg"
              onClick={session.address ? disconnectWallet : connectWallet}
            >
              {session.address ? 'Disconnect wallet' : 'Connect wallet'}
            </Button>
          </div>
        </Stack>
      </Card>

      {children}
    </main>
  );
}
