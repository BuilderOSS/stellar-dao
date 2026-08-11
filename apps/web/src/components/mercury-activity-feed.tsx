'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import type { MercuryActivityItem, MercuryActivityResponse } from '@/lib/mercury-types';
import { Stack } from 'styled-system/jsx';

type MercuryActivityFeedProps = {
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

function ActivityCard({ item }: { item: MercuryActivityItem }) {
  return (
    <Card p="4">
      <Stack gap="2">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Text style={{ margin: 0, color: 'white', fontWeight: 700 }}>{item.title}</Text>
          <Badge>{item.kind}</Badge>
        </div>
        <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
          {item.summary}
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Badge>Ledger {item.ledger}</Badge>
          <Badge>{formatTimestamp(item.timestamp)}</Badge>
          {item.addresses.slice(0, 2).map((address) => (
            <Badge key={address}>
              <ShortId value={address} />
            </Badge>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

export function MercuryActivityFeed({ limit = 8 }: MercuryActivityFeedProps) {
  const [state, setState] = useState<MercuryActivityResponse>({ items: [], generatedAt: '' });
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/mercury/activity-feed?limit=${limit}`, { signal: controller.signal, cache: 'no-store' });
        const json = (await response.json()) as MercuryActivityResponse;
        if (!controller.signal.aborted) {
          setState(json);
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ items: [], generatedAt: '' });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [limit, refreshTick]);

  return (
    <Card p="6">
      <Stack gap="4">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Stack gap="1">
            <Text className="label">Mercury feed</Text>
            <Heading style={{ fontSize: '1.4rem' }}>Recent indexed activity</Heading>
          </Stack>
          <Button type="button" variant="outline" size="sm" onClick={() => setRefreshTick((current) => current + 1)} disabled={loading}>
            {loading ? 'Syncing' : 'Refresh'}
          </Button>
        </div>

        {state.message ? <Text className="lede" style={{ margin: 0 }}>{state.message}</Text> : null}
        {!state.items.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No indexed activity yet.
          </Text>
        ) : (
          <Stack gap="3">
            {state.items.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
