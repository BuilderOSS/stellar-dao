'use client';

import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
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

function ActivityCard({ item }: { item: { id: string; title: string; kind: string; summary: string; ledger: number; timestamp: number; addresses: string[] } }) {
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
  const { data, isLoading, mutate, error } = useMercuryActivityFeed(limit);

  return (
    <Card p="6">
      <Stack gap="4">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Stack gap="1">
            <Text className="label">Mercury feed</Text>
            <Heading style={{ fontSize: '1.4rem' }}>Recent indexed activity</Heading>
          </Stack>
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
            {isLoading ? 'Syncing' : 'Refresh'}
          </Button>
        </div>

        {data?.message ? <Text className="lede" style={{ margin: 0 }}>{data.message}</Text> : null}
        {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
        {!data?.items.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No indexed activity yet.
          </Text>
        ) : (
          <Stack gap="3">
            {data.items.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
