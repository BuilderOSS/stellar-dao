'use client';

import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import type { MercuryAccountHistoryItem, MercuryAccountHistoryResponse } from '@/lib/mercury-types';
import type { NetworkName } from '@/lib/stellar';
import { useEffect, useState } from 'react';
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

function countBy(history: MercuryAccountHistoryItem[], predicate: (record: MercuryAccountHistoryItem) => boolean) {
  return history.filter(predicate).length;
}

export function AccountCenter({ network, address, status }: AccountCenterProps) {
  const [state, setState] = useState<MercuryAccountHistoryResponse>({ address, items: [], generatedAt: '' });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!address) {
        setState({ address, items: [], generatedAt: '', message: 'Connect a wallet to see indexed history.' });
        return;
      }

      try {
        const response = await fetch(`/api/mercury/account-history?address=${encodeURIComponent(address)}&limit=8`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        const json = (await response.json()) as MercuryAccountHistoryResponse;
        if (!controller.signal.aborted) {
          setState(json);
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ address, items: [], generatedAt: '' });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [address]);

  const recent = state.items.slice(0, 5);
  const successCount = countBy(state.items, (record) => record.kind !== 'admin');
  const uniqueActions = new Set(state.items.map((record) => record.kind)).size;
  const lastAction = state.items[0];
  const chargeUps = countBy(state.items, (record) => record.kind === 'charge_up');
  const punches = countBy(state.items, (record) => record.kind === 'punch');
  const kicks = countBy(state.items, (record) => record.kind === 'kick');
  const battles = countBy(state.items, (record) => record.kind === 'battle');
  const raids = countBy(state.items, (record) => record.kind === 'joint_punch' || record.kind === 'heavy_kick');

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
              <Badge>{state.items.length} actions</Badge>
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
          {state.message ? <Text className="lede" style={{ margin: 0 }}>{state.message}</Text> : null}
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
