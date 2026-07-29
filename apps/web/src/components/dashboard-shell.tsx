'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContractDashboard } from '@/components/contract-dashboard';
import { WalletDemo } from '@/components/wallet-demo';
import { Badge, Button, Card, Heading, Select, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import { getNetworkConfig, type NetworkConfig, type NetworkName } from '@/lib/stellar';

type DashboardTab = 'overview' | 'account' | 'actions' | 'dev';

type DashboardSession = {
  network: NetworkName;
  address: string;
  status: string;
  syncedAt: string;
  activeTab: DashboardTab;
};

const STORAGE_KEY = 'punch-counter.dashboard.v2';

const initialSession: DashboardSession = {
  network: 'local',
  address: '',
  status: 'Disconnected',
  syncedAt: '',
  activeTab: 'overview'
};

function readSession(): DashboardSession {
  if (typeof window === 'undefined') {
    return initialSession;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialSession;

    const parsed = JSON.parse(raw) as Partial<DashboardSession>;
    return {
      network: parsed.network === 'testnet' ? 'testnet' : 'local',
      address: parsed.address ?? '',
      status: parsed.status ?? 'Disconnected',
      syncedAt: parsed.syncedAt ?? '',
      activeTab:
        parsed.activeTab === 'account' || parsed.activeTab === 'actions' || parsed.activeTab === 'dev'
          ? parsed.activeTab
          : 'overview'
    };
  } catch {
    return initialSession;
  }
}

function persistSession(session: DashboardSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

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
  const [session, setSession] = useState<DashboardSession>(initialSession);

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    persistSession(session);
  }, [session]);

  const currentNetwork: NetworkConfig = useMemo(() => getNetworkConfig(session.network), [session.network]);

  function updateSession(patch: Partial<DashboardSession>) {
    setSession((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="page-shell">
      <Grid columns={{ base: 1, lg: 2 }} gap="6">
        <Card p="8">
          <Stack gap="5">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>Park UI</Badge>
              <Badge>Stellar Wallets Kit</Badge>
              <Badge>Soroban</Badge>
            </div>
            <Heading>Punch Counter</Heading>
            <Text className="lede">
              A focused Soroban frontend with typed reads, wallet signing, and a clean path from local dev to testnet.
            </Text>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>Typed bindings</Badge>
              <Badge>Local network</Badge>
              <Badge>Testnet ready</Badge>
            </div>
          </Stack>
        </Card>

        <Card p="8">
          <Stack gap="4">
            <Text className="label">Workflow</Text>
            <Stack gap="3">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>1</Badge>
                <Text>Choose a network and keep the session synced.</Text>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>2</Badge>
                <Text>Connect a wallet through Stellar Wallets Kit.</Text>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>3</Badge>
                <Text>Inspect contract data, then move into account and action tabs.</Text>
              </div>
            </Stack>
          </Stack>
        </Card>
      </Grid>

      <Card p="6">
        <Stack gap="5">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack gap="1">
              <Text className="label">Dashboard status</Text>
              <Heading style={{ fontSize: '1.4rem' }}>Session overview</Heading>
            </Stack>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>{currentNetwork.label}</Badge>
              <Badge>{session.address ? 'Wallet connected' : 'Wallet idle'}</Badge>
              <Badge>{session.status}</Badge>
            </div>
          </div>

          <Grid columns={{ base: 1, md: 4 }} gap="4">
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Network</Text>
                <Select value={session.network} onChange={(event) => updateSession({ network: event.target.value as NetworkName })}>
                  <option value="local">Local</option>
                  <option value="testnet">Testnet</option>
                </Select>
                <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                  {currentNetwork.rpcUrl}
                </Text>
              </Stack>
            </Card>
            <SessionStat
              label="Wallet"
              value={session.address || 'Not connected'}
              hint="Last connected address for this browser session."
            />
            <SessionStat
              label="Contract"
              value={currentNetwork.contractId || 'Missing'}
              hint="Loaded from the active network environment."
            />
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

      {session.activeTab === 'overview' ? (
        <ContractDashboard network={session.network} address={session.address} view="overview" onSync={(patch) => updateSession(patch)} />
      ) : null}

      {session.activeTab === 'account' ? (
        <Grid columns={{ base: 1, xl: 2 }} gap="6">
          <WalletDemo network={session.network} onSessionUpdate={(patch) => updateSession(patch)} />
          <ContractDashboard network={session.network} address={session.address} view="account" onSync={(patch) => updateSession(patch)} />
        </Grid>
      ) : null}

      {session.activeTab === 'actions' ? (
        <Card p="6">
          <Stack gap="4">
            <Text className="label">Actions</Text>
            <Heading style={{ fontSize: '1.3rem' }}>Coming next</Heading>
            <Text className="lede" style={{ margin: 0 }}>
              The action forms for punch, kick, transfer, approval, and battle will live here in phase 3.
            </Text>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>Single signer</Badge>
              <Badge>Multi-signer</Badge>
              <Badge>Action history</Badge>
            </div>
          </Stack>
        </Card>
      ) : null}

      {session.activeTab === 'dev' ? (
        <Grid columns={{ base: 1, xl: 2 }} gap="6">
          <ContractDashboard network={session.network} address={session.address} view="dev" onSync={(patch) => updateSession(patch)} />
          <Card p="6">
            <Stack gap="4">
              <Text className="label">Developer notes</Text>
              <Heading style={{ fontSize: '1.3rem' }}>Local and testnet diagnostics</Heading>
              <Text className="lede" style={{ margin: 0 }}>
                Keep this space for bootstrap checks, admin controls, and deploy diagnostics while the app remains
                indexed-free.
              </Text>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Badge>{currentNetwork.rpcUrl}</Badge>
                <Badge>{currentNetwork.contractId || 'No contract id'}</Badge>
              </div>
            </Stack>
          </Card>
        </Grid>
      ) : null}
    </main>
  );
}
