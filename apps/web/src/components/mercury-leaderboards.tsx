'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from 'lucide-react';
import { Button, Card, Heading, ShortId, Text } from '@/components/ui';
import type { MercuryLeaderboardEntry, MercuryLeaderboardMetric } from '@/lib/mercury-types';
import { useMercuryLeaderboards } from '@/lib/mercury-queries';
import { Stack } from 'styled-system/jsx';

const SORTABLE_COLUMNS: Array<{ key: MercuryLeaderboardMetric; label: string }> = [
  { key: 'combined', label: 'Combined' },
  { key: 'balance', label: 'Balance' },
  { key: 'wins', label: 'Wins' },
  { key: 'chargeUps', label: 'Charge ups' },
  { key: 'punches', label: 'Punches' },
  { key: 'kicks', label: 'Kicks' },
  { key: 'raids', label: 'Raids' },
  { key: 'losses', label: 'Losses' }
];

const PAGE_SIZE = 10;

type SortDirection = 'asc' | 'desc';

function sortIcon(metric: MercuryLeaderboardMetric, currentMetric: MercuryLeaderboardMetric, direction: SortDirection) {
  if (metric !== currentMetric) {
    return <ArrowUpDown size={12} />;
  }

  return direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />;
}

function SortableHeader({
  label,
  metric,
  currentMetric,
  direction,
  onSort
}: {
  label: string;
  metric: MercuryLeaderboardMetric;
  currentMetric: MercuryLeaderboardMetric;
  direction: SortDirection;
  onSort: (metric: MercuryLeaderboardMetric) => void;
}) {
  const active = metric === currentMetric;

  return (
    <th style={{ padding: '0 10px 10px', textAlign: 'right', verticalAlign: 'bottom' }} aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(metric)}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          color: active ? 'white' : 'rgba(148, 163, 184, 0.9)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          justifyContent: 'flex-end',
          padding: 0,
          width: '100%',
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase'
        }}
      >
        <span>{label}</span>
        {sortIcon(metric, currentMetric, direction)}
      </button>
    </th>
  );
}

function LeaderboardRow({ entry }: { entry: MercuryLeaderboardEntry }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        <ShortId value={entry.address} label={`#${entry.rank}`} />
      </td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.score}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.balance}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.wins}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.chargeUps}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.punches}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.kicks}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.raids}</td>
      <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.losses}</td>
    </tr>
  );
}

export function MercuryLeaderboards() {
  const [metric, setMetric] = useState<MercuryLeaderboardMetric>('combined');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate, error } = useMercuryLeaderboards(metric, page, PAGE_SIZE, direction);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const showPager = totalPages > 1;

  function handleSort(nextMetric: MercuryLeaderboardMetric) {
    setPage(1);
    if (nextMetric === metric) {
      setDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }

    setMetric(nextMetric);
    setDirection('desc');
  }

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

        {data?.message ? <Text className="lede" style={{ margin: 0 }}>{data.message}</Text> : null}
        {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
        {!data?.items.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No leaderboard rows yet.
          </Text>
        ) : (
          <Stack gap="3">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '0 10px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148, 163, 184, 0.9)' }}>Rank / wallet</th>
                    {SORTABLE_COLUMNS.map((column) => (
                      <SortableHeader
                        key={column.key}
                        label={column.label}
                        metric={column.key}
                        currentMetric={metric}
                        direction={direction}
                        onSort={handleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <LeaderboardRow key={entry.address} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
            {showPager ? (
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
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
