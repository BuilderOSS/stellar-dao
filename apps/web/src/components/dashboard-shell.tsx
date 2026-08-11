'use client';

import { useEffect, useMemo } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { AccountCenter } from '@/components/account-center';
import { ActionCenter } from '@/components/action-center';
import { ContractDashboard } from '@/components/contract-dashboard';
import { DevTools } from '@/components/dev-tools';
import { MercuryActivityFeed } from '@/components/mercury-activity-feed';
import { MercuryLeaderboards } from '@/components/mercury-leaderboards';
import { WalletSessionPanel } from '@/components/wallet-session-panel';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import { getDefaultNetwork, getNetworkConfig, type NetworkConfig } from '@/lib/stellar';
import { useDashboardSessionStore } from '@/stores/dashboard-session-store';

function formatSyncedAt(syncedAt: string) {
  if (!syncedAt) return 'Not synced yet';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(syncedAt));
  } catch {
    return syncedAt;
  }
}

function SessionStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card p="4">
      <Stack gap="2">
        <Text className="label" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
          {label}
        </Text>
        <Text style={{ fontSize: '1rem', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{value}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant={active ? 'surface' : 'plain'} onClick={onClick}>
      {children}
    </Button>
  );
}

export function DashboardShell() {
  const session = useDashboardSessionStore();
  const updateSession = useDashboardSessionStore((state) => state.updateSession);
  const recordAction = useDashboardSessionStore((state) => state.recordAction);

  const network = useMemo(() => getDefaultNetwork(), []);
  const currentNetwork: NetworkConfig = useMemo(() => getNetworkConfig(network), [network]);

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
      <Card p="8">
        <Stack gap="5">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack gap="1">
              <Heading style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', lineHeight: 1.02 }}>
                Punch Arena
              </Heading>
              <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
                Ember-lit clashes, hard points, and quiet revenge. Build your name in the arena, then burn it into the ledger.
              </Text>
            </Stack>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>{currentNetwork.label}</Badge>
              <Badge>{session.address ? 'Wallet connected' : 'Wallet idle'}</Badge>
              <Badge>{session.status}</Badge>
            </div>
          </div>

          <Grid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Wallet</Text>
                {session.address ? <ShortId value={session.address} /> : <Text>Not connected</Text>}
                <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                  {session.address ? 'Disconnect this wallet or swap to another one.' : 'Connect a wallet to start reading and signing.'}
                </Text>
                <Button
                  type="button"
                  size="lg"
                  variant="solid"
                  onClick={session.address ? disconnectWallet : connectWallet}
                  style={{ width: '100%' }}
                >
                  {session.address ? 'Disconnect wallet' : 'Connect wallet'}
                </Button>
              </Stack>
            </Card>
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Arena</Text>
                {currentNetwork.contractId ? <ShortId value={currentNetwork.contractId} /> : <Text>Missing</Text>}
              </Stack>
            </Card>
            <SessionStat
              label="Synced"
              value={formatSyncedAt(session.syncedAt)}
              hint="Last successful contract read."
            />
          </Grid>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <TabButton active={session.activeTab === 'overview'} onClick={() => updateSession({ activeTab: 'overview' })}>
              Overview
            </TabButton>
            <TabButton active={session.activeTab === 'account'} onClick={() => updateSession({ activeTab: 'account' })}>
              Account
            </TabButton>
            <TabButton active={session.activeTab === 'actions'} onClick={() => updateSession({ activeTab: 'actions' })}>
              Actions
            </TabButton>
            <TabButton active={session.activeTab === 'dev'} onClick={() => updateSession({ activeTab: 'dev' })}>
              Dev
            </TabButton>
          </div>
        </Stack>
      </Card>

      <div style={{ width: '100%' }}>
        {session.activeTab === 'overview' ? (
          <Stack gap="6">
            <MercuryLeaderboards />
            <Grid columns={{ base: 1, xl: 2 }} gap="6">
              <ContractDashboard network={network} address={session.address} view="overview" onSync={updateSession} />
              <MercuryActivityFeed />
            </Grid>
            <Card p="6">
              <Stack gap="3">
                <Text className="label">Local arena activity</Text>
                <Text className="lede" style={{ margin: 0 }}>
                  Track submitted arena actions here without indexing. Recent submissions stay local to this browser session.
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <Badge>{session.history.length} local records</Badge>
                  <Badge>{session.history.filter((record) => record.status === 'success').length} success</Badge>
                  <Badge>{session.history.filter((record) => record.status === 'error').length} errors</Badge>
                </div>
              </Stack>
            </Card>
          </Stack>
        ) : null}

        {session.activeTab === 'account' ? (
          <Stack gap="6">
            <WalletSessionPanel network={network} address={session.address} onSessionUpdate={updateSession} />
            <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
              <AccountCenter network={network} address={session.address} status={session.status} />
              <ContractDashboard network={network} address={session.address} view="account" onSync={updateSession} />
            </div>
          </Stack>
        ) : null}

        {session.activeTab === 'actions' ? (
          <ActionCenter network={network} address={session.address} onRecord={recordAction} />
        ) : null}

        {session.activeTab === 'dev' ? (
          <Grid columns={{ base: 1, xl: 2 }} gap="6">
            <ContractDashboard network={network} address={session.address} view="dev" onSync={updateSession} />
            <DevTools
              network={network}
              networkConfig={currentNetwork}
              address={session.address}
              status={session.status}
              history={session.history}
              onRecord={recordAction}
            />
          </Grid>
        ) : null}
      </div>
    </main>
  );
}
