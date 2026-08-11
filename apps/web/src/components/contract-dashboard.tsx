'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Input, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import { getNetworkConfig, type NetworkName } from '@/lib/stellar';
import { emptyContractDashboardState, useContractDashboardReads } from '@/lib/stellar-queries';

type ContractDashboardProps = {
  network: NetworkName;
  address: string;
  view: 'overview' | 'account' | 'dev';
  onSync?: (patch: { status?: string; syncedAt?: string }) => void;
};

function SectionHeader({
  title,
  hint,
  action,
  onAction
}: {
  title: string;
  hint: string;
  action: ReactNode;
  onAction: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
      <Stack gap="1">
        <Text className="label">{title}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
          {hint}
        </Text>
      </Stack>
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card p="4">
      <Stack gap="2">
        <Text className="label" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
          {label}
        </Text>
        <Text style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{value}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}

function formatWithUnit(value: string, unit: string) {
  return value === '—' ? '—' : `${value}${unit}`;
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

export function ContractDashboard({ network, address, view, onSync }: ContractDashboardProps) {
  const [spenderAddress, setSpenderAddress] = useState('');
  const [watchAddressDraft, setWatchAddressDraft] = useState('');
  const [cooldownDisplay, setCooldownDisplay] = useState<{ source: string; remaining: string; active: string } | null>(null);
  const cooldownEndsAtRef = useRef<number | null>(null);
  const watchAddress = watchAddressDraft || address;
  const targetWatchAddress = view === 'overview' ? '' : watchAddress;

  const currentNetwork = useMemo(() => getNetworkConfig(network), [network]);
  const { data, error: swrError, isLoading, isValidating, mutate } = useContractDashboardReads(
    network,
    targetWatchAddress,
    spenderAddress
  );
  const state = data ?? emptyContractDashboardState;

  useEffect(() => {
    if (state.syncedAt) {
      onSync?.({ status: `Contract data loaded for ${currentNetwork.label}`, syncedAt: state.syncedAt });
    } else if (state.error) {
      onSync?.({ status: state.error });
    }
  }, [currentNetwork.label, onSync, state.error, state.syncedAt]);

  useEffect(() => {
    const remainingSeconds = Number(state.cooldownRemaining);
    cooldownEndsAtRef.current = Number.isFinite(remainingSeconds) && remainingSeconds > 0 ? Date.now() + remainingSeconds * 1000 : null;
  }, [state.cooldownRemaining]);

  useEffect(() => {
    if (view !== 'account') {
      return;
    }

    const tickCooldown = () => {
      const endsAt = cooldownEndsAtRef.current;
      if (!endsAt) {
        setCooldownDisplay((current) => (current?.source === state.cooldownRemaining && current.remaining === '0' && current.active === 'No' ? current : { source: state.cooldownRemaining, remaining: '0', active: 'No' }));
        return;
      }

      const remainingSeconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setCooldownDisplay({ source: state.cooldownRemaining, remaining: String(remainingSeconds), active: remainingSeconds > 0 ? 'Yes' : 'No' });

      if (remainingSeconds <= 0) {
        cooldownEndsAtRef.current = null;
      }
    };

    tickCooldown();
    const interval = window.setInterval(tickCooldown, 1000);
    return () => window.clearInterval(interval);
  }, [view, state.cooldownRemaining]);

  const cooldownRemaining = (() => {
    if (cooldownDisplay?.source === state.cooldownRemaining) return cooldownDisplay.remaining;
    return state.cooldownRemaining;
  })();

  const isOnCooldown = cooldownDisplay?.source === state.cooldownRemaining ? cooldownDisplay.active : state.isOnCooldown;

  return (
    <Card className="stack">
      <Stack gap="5">
        <SectionHeader
          title={view === 'overview' ? 'Overview' : view === 'account' ? 'Account' : 'Developer'}
          hint={
            view === 'overview'
              ? 'Arena metadata and network-level point state'
              : view === 'account'
                ? 'Reads for the selected arena profile'
                : 'Low-level arena and network diagnostics'
          }
          action={
            <>
              <RefreshCw size={14} />
              {isLoading || isValidating ? 'Loading...' : 'Refresh'}
            </>
          }
          onAction={() => void mutate()}
        />

        {state.error || swrError ? (
          <Badge style={{ background: 'rgba(248,113,113,0.18)', color: 'white', borderColor: 'rgba(248,113,113,0.24)' }}>
            {state.error || swrError?.message}
          </Badge>
        ) : null}

        {view === 'overview' ? (
          <>
            <Grid columns={{ base: 1, md: 2 }} gap="4">
              <Metric label="Points" value={state.tokenName === '—' ? '—' : `${state.tokenName} (${state.tokenSymbol})`} hint="Game points metadata." />
              <Metric label="Decimals" value={state.decimals} hint="Smallest on-chain unit precision." />
              <Metric label="Total supply" value={state.totalSupply} hint="Current issued points." />
              <Metric label="Action count" value={state.actionCount} hint="Total arena actions seen by the contract." />
              <Metric label="Cooldown" value={formatWithUnit(state.cooldownDuration, 's')} hint="Configured cooldown duration." />
              <Metric label="Synced" value={formatSyncedAt(state.syncedAt)} hint="Last completed refresh." />
            </Grid>
            <Metric label="Network" value={currentNetwork.label} hint={currentNetwork.rpcUrl} />
          </>
        ) : null}

        {view === 'account' ? (
          <>
            <Grid columns={{ base: 1, lg: 2 }} gap="4">
              <Field>
                <FieldLabel htmlFor="watch-address">Account address</FieldLabel>
                <Input
                  id="watch-address"
                  value={watchAddress}
                  onChange={(event) => setWatchAddressDraft(event.target.value)}
                  placeholder="Enter an address to inspect"
                />
                <FieldHelperText>Defaults to the connected wallet address.</FieldHelperText>
              </Field>
              <Field>
                <FieldLabel htmlFor="spender-address">Allowance spender</FieldLabel>
                <Input
                  id="spender-address"
                  value={spenderAddress}
                  onChange={(event) => setSpenderAddress(event.target.value)}
                  placeholder="Optional spender address"
                />
                <FieldHelperText>Used to read allowance for the selected account.</FieldHelperText>
              </Field>
            </Grid>

            <Grid columns={{ base: 1, md: 3 }} gap="4">
              <Metric label="Points" value={state.balance} hint="Points for the inspected account." />
              <Metric label="On cooldown" value={isOnCooldown} hint="Whether the inspected account is blocked." />
              <Metric label="Cooldown remaining" value={formatWithUnit(cooldownRemaining, 's')} hint="Seconds until the next action." />
              <Metric label="Allowance" value={state.allowance} hint="Allowance for the selected spender." />
              <Metric label="Last synced" value={formatSyncedAt(state.syncedAt)} hint="Last completed refresh." />
              <Metric label="Last action" value={state.lastAction} hint="Most recent on-chain action timestamp." />
            </Grid>

            <Grid columns={{ base: 1, md: 3 }} gap="4">
              <Metric label="Punches" value={state.totalPunches} hint="Times the account punched." />
              <Metric label="Kicks" value={state.totalKicks} hint="Times the account kicked." />
              <Metric label="Battles" value={state.totalBattles} hint="Total battles fought." />
            </Grid>

            <Grid columns={{ base: 1, md: 2 }} gap="4">
              <Metric label="Battle wins" value={state.battleWins} hint="Recorded battle wins." />
              <Metric label="Battle losses" value={state.battleLosses} hint="Recorded battle losses." />
            </Grid>
          </>
        ) : null}

        {view === 'dev' ? (
          <Grid columns={{ base: 1, md: 2 }} gap="4">
            <Metric label="RPC URL" value={currentNetwork.rpcUrl} hint="Active Soroban RPC endpoint." />
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Contract ID</Text>
                {currentNetwork.contractId ? <ShortId value={currentNetwork.contractId} /> : <Text>Missing</Text>}
              </Stack>
            </Card>
            <Card p="4">
              <Stack gap="2">
                <Text className="label">Session address</Text>
                {address ? <ShortId value={address} /> : <Text>Not connected</Text>}
              </Stack>
            </Card>
            <Metric label="Refresh status" value={isLoading || isValidating ? 'Loading' : 'Idle'} hint={state.error || swrError?.message || 'Ready to inspect the network.'} />
          </Grid>
        ) : null}
      </Stack>
    </Card>
  );
}
