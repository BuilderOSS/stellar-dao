'use client';

import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { useMercuryAccountHistory } from '@/lib/mercury-queries';
import type { NetworkName } from '@/lib/stellar';
import { Grid, Stack } from 'styled-system/jsx';

type AccountCenterProps = {
  network: NetworkName;
  address: string;
  status: string;
};

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function countBy(history: Array<{ kind: string }>, predicate: (record: { kind: string }) => boolean) {
  return history.filter(predicate).length;
}

export function AccountCenter({ network, address, status }: AccountCenterProps) {
  const { data, error, isLoading } = useMercuryAccountHistory(address, 8);

  const items = data?.items ?? [];
  const recent = items.slice(0, 5);
  const successCount = countBy(items, (record) => record.kind !== 'admin');
  const uniqueActions = new Set(items.map((record) => record.kind)).size;
  const lastAction = items[0];
  const chargeUps = countBy(items, (record) => record.kind === 'charge_up');
  const punches = countBy(items, (record) => record.kind === 'punch');
  const kicks = countBy(items, (record) => record.kind === 'kick');
  const battles = countBy(items, (record) => record.kind === 'battle');
  const raids = countBy(items, (record) => record.kind === 'joint_punch' || record.kind === 'heavy_kick');

  return (
    <Stack gap="5">
      <Card p="6">
        <Stack gap="3">
          <div>
            <Badge>{network === 'local' ? 'Local account' : 'Testnet account'}</Badge>
          </div>
          <Heading style={{ fontSize: '1.6rem' }}>Arena profile</Heading>
          <Text className="lede" style={{ margin: 0 }}>
            {address ? 'Wallet connected and ready for indexed reads.' : 'Connect a wallet to unlock arena actions.'}
          </Text>
        </Stack>
      </Card>

      <Grid columns={{ base: 1, md: 2 }} gap="4">
        <Card p="4">
          <Stack gap="2">
            <Text className="label">Wallet</Text>
            {address ? <ShortId value={address} /> : <Text>Not connected</Text>}
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              {status}
            </Text>
          </Stack>
        </Card>
        <Card p="4">
          <Stack gap="2">
            <Text className="label">Mercury activity</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge>{items.length} actions</Badge>
              <Badge>{chargeUps} charge ups</Badge>
              <Badge>{punches} punches</Badge>
              <Badge>{kicks} kicks</Badge>
              <Badge>{battles} battles</Badge>
              <Badge>{raids} raids</Badge>
              <Badge>{successCount} indexed</Badge>
              <Badge>{uniqueActions} kinds</Badge>
            </div>
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              {lastAction ? `Latest: ${lastAction.title} at ${formatTimestamp(lastAction.timestamp)}` : 'No indexed activity yet.'}
            </Text>
          </Stack>
        </Card>
      </Grid>

      <Card p="5">
        <Stack gap="4">
          <Text className="label">Recent interactions</Text>
          {data?.message ? <Text className="lede" style={{ margin: 0 }}>{data.message}</Text> : null}
          {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
          {isLoading ? <Text className="lede" style={{ margin: 0 }}>Loading...</Text> : null}
          {recent.length ? (
            <Stack gap="3">
              {recent.map((record) => (
                <Card key={record.id} p="4">
                  <Stack gap="2">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <Text style={{ margin: 0, color: 'white', fontWeight: 700 }}>{record.title}</Text>
                      <Badge>{record.kind}</Badge>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
                      {record.summary}
                    </Text>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                      {formatTimestamp(record.timestamp)} · ledger {record.ledger}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text className="lede" style={{ margin: 0 }}>
              No indexed history for this wallet yet.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
