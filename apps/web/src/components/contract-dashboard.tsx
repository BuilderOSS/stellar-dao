'use client';

import { useEffect, useMemo, useState } from 'react';
import { createCounterClient, getNetworkConfig, type NetworkName } from '@/lib/stellar';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Input, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

type ContractDashboardProps = {
  network: NetworkName;
  address: string;
  onSync?: (patch: { status?: string; syncedAt?: string }) => void;
};

type ReadState = {
  loading: boolean;
  error: string;
  syncedAt: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: string;
  totalSupply: string;
  globalCount: string;
  cooldownDuration: string;
  balance: string;
  isOnCooldown: string;
  cooldownRemaining: string;
  allowance: string;
  totalPunches: string;
  totalKicks: string;
  lastAction: string;
  battleWins: string;
  battleLosses: string;
  totalBattles: string;
};

const emptyState: ReadState = {
  loading: false,
  error: '',
  syncedAt: '',
  tokenName: '—',
  tokenSymbol: '—',
  decimals: '—',
  totalSupply: '—',
  globalCount: '—',
  cooldownDuration: '—',
  balance: '—',
  isOnCooldown: '—',
  cooldownRemaining: '—',
  allowance: '—',
  totalPunches: '—',
  totalKicks: '—',
  lastAction: '—',
  battleWins: '—',
  battleLosses: '—',
  totalBattles: '—'
};

function formatDateTime(value: number) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value * 1000));
  } catch {
    return String(value);
  }
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

function SectionHeader({
  title,
  hint,
  action,
  onAction
}: {
  title: string;
  hint: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
      <Stack gap="1">
        <Text className="label">{title}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>{hint}</Text>
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
        <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>{hint}</Text>
      </Stack>
    </Card>
  );
}

function formatWithUnit(value: string, unit: string) {
  return value === '—' ? '—' : `${value}${unit}`;
}

export function ContractDashboard({ network, address, onSync }: ContractDashboardProps) {
  const [spenderAddress, setSpenderAddress] = useState('');
  const [watchAddress, setWatchAddress] = useState(address);
  const [state, setState] = useState<ReadState>(emptyState);

  const currentNetwork = useMemo(() => getNetworkConfig(network), [network]);

  useEffect(() => {
    setWatchAddress(address);
  }, [address]);

  async function refresh(targetWatchAddress = watchAddress, targetSpenderAddress = spenderAddress) {
    const client = createCounterClient(currentNetwork);
    if (!client) {
      const error = 'Set a contract id first';
      setState((current) => ({ ...current, loading: false, error }));
      onSync?.({ status: error });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const overview = await Promise.all([
        client.name(),
        client.symbol(),
        client.decimals(),
        client.get_total_supply(),
        client.get_global_count(),
        client.get_cooldown_duration()
      ]);

      const nextState: ReadState = {
        loading: false,
        error: '',
        syncedAt: new Date().toISOString(),
        tokenName: overview[0].result,
        tokenSymbol: overview[1].result,
        decimals: String(overview[2].result),
        totalSupply: overview[3].result.toString(),
        globalCount: overview[4].result.toString(),
        cooldownDuration: overview[5].result.toString(),
        balance: '—',
        isOnCooldown: '—',
        cooldownRemaining: '—',
        allowance: '—',
        totalPunches: '—',
        totalKicks: '—',
        lastAction: '—',
        battleWins: '—',
        battleLosses: '—',
        totalBattles: '—'
      };

      if (targetWatchAddress) {
        const [balanceTx, cooldownTx, cooldownRemainingTx, statsTx, battleTx] = await Promise.all([
          client.balance({ id: targetWatchAddress }),
          client.is_on_cooldown({ user: targetWatchAddress }),
          client.cooldown_remaining({ user: targetWatchAddress }),
          client.get_stats({ user: targetWatchAddress }),
          client.get_battle_record({ user: targetWatchAddress })
        ]);

        nextState.balance = balanceTx.result.toString();
        nextState.isOnCooldown = formatBoolean(cooldownTx.result);
        nextState.cooldownRemaining = cooldownRemainingTx.result.toString();
        nextState.totalPunches = statsTx.result?.total_punches?.toString() ?? '0';
        nextState.totalKicks = statsTx.result?.total_kicks?.toString() ?? '0';
        nextState.lastAction = statsTx.result?.last_action ? formatDateTime(Number(statsTx.result.last_action)) : '—';
        nextState.battleWins = battleTx.result?.wins?.toString() ?? '0';
        nextState.battleLosses = battleTx.result?.losses?.toString() ?? '0';
        nextState.totalBattles = battleTx.result?.total_battles?.toString() ?? '0';
      }

      if (targetWatchAddress && targetSpenderAddress) {
        const allowanceTx = await client.allowance({ from: targetWatchAddress, spender: targetSpenderAddress });
        nextState.allowance = allowanceTx.result.toString();
      }

      setState(nextState);
      onSync?.({ status: `Contract data loaded for ${currentNetwork.label}`, syncedAt: nextState.syncedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Contract lookup failed';
      setState((current) => ({ ...current, loading: false, error: message }));
      onSync?.({ status: message });
    }
  }

  useEffect(() => {
    if (address) {
      setWatchAddress(address);
    }
    void refresh(address || watchAddress, spenderAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, currentNetwork.contractId, address]);

  return (
    <Card className="stack">
      <Stack gap="5">
      <SectionHeader
          title="Contract dashboard"
          hint="Live reads from the Soroban contract"
          action={state.loading ? 'Loading...' : 'Refresh'}
          onAction={() => void refresh()}
        />

        {state.error ? (
          <Badge style={{ background: 'rgba(248,113,113,0.18)', color: 'white', borderColor: 'rgba(248,113,113,0.24)' }}>
            {state.error}
          </Badge>
        ) : null}

        <Grid columns={{ base: 1, lg: 2 }} gap="4">
          <Field>
            <FieldLabel htmlFor="watch-address">Account address</FieldLabel>
            <Input
              id="watch-address"
              value={watchAddress}
              onChange={(event) => setWatchAddress(event.target.value)}
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
          <Metric
            label="Token"
            value={state.tokenName === '—' ? '—' : `${state.tokenName} (${state.tokenSymbol})`}
            hint="Contract metadata."
          />
          <Metric label="Decimals" value={state.decimals} hint="Token precision." />
          <Metric label="Total supply" value={state.totalSupply} hint="Current issued supply." />
          <Metric label="Global count" value={state.globalCount} hint="Total minted through app actions." />
          <Metric label="Cooldown" value={formatWithUnit(state.cooldownDuration, 's')} hint="Configured cooldown duration." />
          <Metric label="Balance" value={state.balance} hint="Balance for the inspected account." />
        </Grid>

        <Grid columns={{ base: 1, md: 2 }} gap="4">
          <Metric label="On cooldown" value={state.isOnCooldown} hint="Whether the inspected account is blocked." />
          <Metric
            label="Cooldown remaining"
            value={formatWithUnit(state.cooldownRemaining, 's')}
            hint="Seconds until the next action."
          />
          <Metric label="Allowance" value={state.allowance} hint="Allowance for the selected spender." />
          <Metric label="Last synced" value={state.syncedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.syncedAt)) : '—'} hint="Last completed refresh." />
        </Grid>

        <Grid columns={{ base: 1, md: 3 }} gap="4">
          <Metric label="Punches" value={state.totalPunches} hint="Times the account punched." />
          <Metric label="Kicks" value={state.totalKicks} hint="Times the account kicked." />
          <Metric label="Last action" value={state.lastAction} hint="Most recent on-chain action timestamp." />
        </Grid>

        <Grid columns={{ base: 1, md: 3 }} gap="4">
          <Metric label="Battle wins" value={state.battleWins} hint="Recorded battle wins." />
          <Metric label="Battle losses" value={state.battleLosses} hint="Recorded battle losses." />
          <Metric label="Battles" value={state.totalBattles} hint="Total battles fought." />
        </Grid>
      </Stack>
    </Card>
  );
}
