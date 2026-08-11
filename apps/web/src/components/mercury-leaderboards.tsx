'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Heading, Select, ShortId, Text } from '@/components/ui';
import type { MercuryLeaderboardEntry, MercuryLeaderboardMetric } from '@/lib/mercury-types';
import { useMercuryLeaderboards } from '@/lib/mercury-queries';
import { Stack } from 'styled-system/jsx';

const METRIC_OPTIONS: Array<{ value: MercuryLeaderboardMetric; label: string }> = [
  { value: 'balance', label: 'Balance' },
  { value: 'combined', label: 'Combined' },
  { value: 'wins', label: 'Wins' },
  { value: 'punches', label: 'Punches' },
  { value: 'raids', label: 'Raids' }
];

const PAGE_SIZE = 10;

function statValue(entry: MercuryLeaderboardEntry, metric: MercuryLeaderboardMetric) {
  if (metric === 'combined') {
    return entry.score;
  }

  return entry[metric as Exclude<MercuryLeaderboardMetric, 'combined'>];
}

function LeaderboardRow({ entry, metric }: { entry: MercuryLeaderboardEntry; metric: MercuryLeaderboardMetric }) {
  return (
    <Card p="4" style={{ width: '100%' }}>
      <Stack gap="2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <ShortId value={entry.address} label={`#${entry.rank}`} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {metric !== 'balance' ? <Badge>{statValue(entry, metric)}</Badge> : null}
            <Badge
              style={{
                width: '2.25rem',
                height: '2.25rem',
                padding: 0,
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {entry.balance}
            </Badge>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Badge>{entry.wins} wins</Badge>
          <Badge>{entry.punches} punches</Badge>
          <Badge>{entry.raids} raids</Badge>
          <Badge>{entry.losses} losses</Badge>
        </div>
      </Stack>
    </Card>
  );
}

export function MercuryLeaderboards() {
  const [metric, setMetric] = useState<MercuryLeaderboardMetric>('balance');
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate, error } = useMercuryLeaderboards(metric, page, PAGE_SIZE);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card p="6">
      <Stack gap="4">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Stack gap="1">
            <Text className="label">Mercury leaderboards</Text>
            <Heading style={{ fontSize: '1.4rem' }}>Arena rankings</Heading>
          </Stack>
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
            <RefreshCw size={14} />
            {isLoading ? 'Syncing' : 'Refresh'}
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          <Text className="label" style={{ margin: 0 }}>
            Filter
          </Text>
          <Select
            value={metric}
            onChange={(event) => {
              setMetric(event.currentTarget.value as MercuryLeaderboardMetric);
              setPage(1);
            }}
          >
            {METRIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {data?.message ? <Text className="lede" style={{ margin: 0 }}>{data.message}</Text> : null}
        {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
        {!data?.items.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No leaderboard rows yet.
          </Text>
        ) : (
          <Stack gap="3">
            {data.items.map((entry) => (
              <LeaderboardRow key={entry.address} entry={entry} metric={metric} />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                Page {data.page} of {totalPages}
              </Text>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                  Prev
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={!data.hasMore}>
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
