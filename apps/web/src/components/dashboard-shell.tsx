'use client';

import { useEffect, useMemo, useState } from 'react';
import { AccountCenter } from '@/components/account-center';
import { ActionCenter } from '@/components/action-center';
import { ContractDashboard } from '@/components/contract-dashboard';
import { DevTools } from '@/components/dev-tools';
import { WalletSessionPanel } from '@/components/wallet-session-panel';
import { Badge, Button, Card, Heading, Select, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import { getNetworkConfig, type NetworkConfig, type NetworkName } from '@/lib/stellar';
import type { ActionRecord } from '@/lib/tx';

type DashboardTab = 'overview' | 'account' | 'actions' | 'dev';

type DashboardSession = {
  network: NetworkName;
  address: string;
  status: string;
  syncedAt: string;
  activeTab: DashboardTab;
  history: ActionRecord[];
};

const STORAGE_KEY = 'punch-counter.dashboard.v2';

const initialSession: DashboardSession = {
  network: 'local',
  address: '',
  status: 'Disconnected',
  syncedAt: '',
  activeTab: 'overview',
  history: []
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
      history: Array.isArray(parsed.history) ? (parsed.history as ActionRecord[]).slice(0, 20) : [],
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

  function recordAction(record: ActionRecord) {
    setSession((current) => ({
      ...current,
      history: [record, ...current.history].slice(0, 20),
      status: record.summary
    }));
  }

  return (
    <main className="page-shell">
      <Card p="8">
        <Stack gap="5">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack gap="1">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Badge>Park UI</Badge>
                <Badge>Stellar Wallets Kit</Badge>
                <Badge>Soroban</Badge>
              </div>
              <Text className="label">Soroban app shell</Text>
              <Heading style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', lineHeight: 1.02 }}>
                Punch Counter: Soroban Token Dashboard
              </Heading>
              <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
                A focused Soroban frontend with typed reads, wallet signing, and a clean path from local dev to testnet.
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
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Wallet</Text>
                {session.address ? <ShortId value={session.address} /> : <Text>Not connected</Text>}
              </Stack>
            </Card>
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Contract</Text>
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
            <ContractDashboard network={session.network} address={session.address} view="overview" onSync={(patch) => updateSession(patch)} />
            <Card p="6">
              <Stack gap="3">
                <Text className="label">Session activity</Text>
                <Text className="lede" style={{ margin: 0 }}>
                  Track submitted actions here without indexing. Recent submissions stay local to this browser session.
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
            <WalletSessionPanel network={session.network} address={session.address} onSessionUpdate={(patch) => updateSession(patch)} />
            <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
              <AccountCenter network={session.network} address={session.address} status={session.status} history={session.history} />
              <ContractDashboard network={session.network} address={session.address} view="account" onSync={(patch) => updateSession(patch)} />
            </div>
          </Stack>
        ) : null}

        {session.activeTab === 'actions' ? (
          <ActionCenter network={session.network} address={session.address} onRecord={recordAction} />
        ) : null}

        {session.activeTab === 'dev' ? (
          <Grid columns={{ base: 1, xl: 2 }} gap="6">
            <ContractDashboard network={session.network} address={session.address} view="dev" onSync={(patch) => updateSession(patch)} />
            <DevTools
              network={session.network}
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
