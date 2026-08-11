'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { Stack } from 'styled-system/jsx';

const PAGE_SIZE = 10;

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function ActivityCard({ item }: { item: { id: string; title: string; summary: string; ledger: number; timestamp: number; addresses: string[] } }) {
  return (
    <Card p="3">
      <Stack gap="1">
        <Text style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.2 }}>{item.title}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.35 }}>
          {item.summary}
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <Badge style={{ paddingBlock: '2px', paddingInline: '8px', fontSize: '0.7rem', lineHeight: 1.1, minHeight: '20px' }}>Ledger {item.ledger}</Badge>
          <Badge style={{ paddingBlock: '2px', paddingInline: '8px', fontSize: '0.7rem', lineHeight: 1.1, minHeight: '20px' }}>{formatTimestamp(item.timestamp)}</Badge>
          {item.addresses.slice(0, 2).map((address) => (
            <Badge key={address} style={{ paddingBlock: '2px', paddingInline: '8px', fontSize: '0.7rem', lineHeight: 1.1, minHeight: '20px' }}>
              <ShortId value={address} />
            </Badge>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

export function MercuryActivityFeed() {
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate, error } = useMercuryActivityFeed(page, PAGE_SIZE);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const canGoPrev = page > 1;
  const canGoNext = Boolean(data?.hasMore);

  return (
    <Card p="6">
      <Stack gap="4">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Stack gap="1">
            <Text className="label">Mercury feed</Text>
            <Heading style={{ fontSize: '1.4rem' }}>Recent indexed activity</Heading>
          </Stack>
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
            <RefreshCw size={14} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                Page {data.page} of {totalPages}
              </Text>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!canGoPrev}>
                  Prev
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={!canGoNext}>
                  Next
                </Button>
              </div>
            </div>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
