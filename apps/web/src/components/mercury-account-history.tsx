'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import type { MercuryAccountHistoryItem, MercuryAccountHistoryResponse } from '@/lib/mercury-types';
import { Grid, Stack } from 'styled-system/jsx';

type MercuryAccountHistoryProps = {
  address: string;
  limit?: number;
};

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function historyCount(items: MercuryAccountHistoryItem[], predicate: (item: MercuryAccountHistoryItem) => boolean) {
  return items.filter(predicate).length;
}

export function MercuryAccountHistory({ address, limit = 8 }: MercuryAccountHistoryProps) {
  const [state, setState] = useState<MercuryAccountHistoryResponse>({ address, items: [], generatedAt: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!address) {
        setState({ address, items: [], generatedAt: '', message: 'Connect a wallet to see indexed history.' });
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/mercury/account-history?address=${encodeURIComponent(address)}&limit=${limit}`, {
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
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [address, limit]);

  const items = state.items;
  const charges = historyCount(items, (item) => item.kind === 'charge_up');
  const combat = historyCount(items, (item) => item.kind === 'punch' || item.kind === 'kick' || item.kind === 'battle');
  const raids = historyCount(items, (item) => item.kind === 'joint_punch' || item.kind === 'heavy_kick');
  const mints = historyCount(items, (item) => item.kind === 'mint');
  const latest = items[0];

  return (
    <Stack gap="5">
      <Card p="6">
        <Stack gap="3">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <Stack gap="1">
              <Text className="label">Mercury history</Text>
              <Heading style={{ fontSize: '1.6rem' }}>Indexed account log</Heading>
            </Stack>
            <Badge>{loading ? 'Loading' : state.items.length ? `${state.items.length} rows` : 'Empty'}</Badge>
          </div>
          {state.message ? <Text className="lede" style={{ margin: 0 }}>{state.message}</Text> : null}
          {address ? <ShortId value={address} /> : <Text>Connect a wallet.</Text>}
        </Stack>
      </Card>

      <Grid columns={{ base: 1, md: 2 }} gap="4">
        <Card p="4">
          <Stack gap="2">
            <Text className="label">Summary</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge>{items.length} actions</Badge>
              <Badge>{charges} charge ups</Badge>
              <Badge>{combat} combat</Badge>
              <Badge>{raids} raids</Badge>
              <Badge>{mints} mints</Badge>
            </div>
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              {latest ? `Latest: ${latest.title} at ${formatTimestamp(latest.timestamp)}` : 'No indexed history yet.'}
            </Text>
          </Stack>
        </Card>
        <Card p="4">
          <Stack gap="2">
            <Text className="label">Tracked address</Text>
            {address ? <ShortId value={address} /> : <Text>Not connected</Text>}
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              Mercury-backed history only. Local dev logs stay in the Dev tab.
            </Text>
          </Stack>
        </Card>
      </Grid>

      <Card p="5">
        <Stack gap="4">
          <Text className="label">Recent rows</Text>
          {items.length ? (
            <Stack gap="3">
              {items.map((item) => (
                <Card key={item.id} p="4">
                  <Stack gap="2">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <Text style={{ margin: 0, color: 'white', fontWeight: 700 }}>{item.title}</Text>
                      <Badge>{item.kind}</Badge>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
                      {item.summary}
                    </Text>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                      {formatTimestamp(item.timestamp)} · ledger {item.ledger}
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
