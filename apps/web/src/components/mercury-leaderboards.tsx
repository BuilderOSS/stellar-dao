'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, Heading, Select, ShortId, Text } from '@/components/ui';
import type { MercuryLeaderboardEntry, MercuryLeaderboardMetric, MercuryLeaderboardResponse } from '@/lib/mercury-types';
import { Grid, Stack } from 'styled-system/jsx';

const METRIC_OPTIONS: Array<{ value: MercuryLeaderboardMetric; label: string }> = [
  { value: 'balance', label: 'Balance' },
  { value: 'combined', label: 'Combined' },
  { value: 'wins', label: 'Wins' },
  { value: 'punches', label: 'Punches' },
  { value: 'raids', label: 'Raids' }
];

type MercuryLeaderboardsProps = {
  limit?: number;
};

function statValue(entry: MercuryLeaderboardEntry, metric: MercuryLeaderboardMetric) {
  if (metric === 'combined') {
    return entry.score;
  }

  return entry[metric as Exclude<MercuryLeaderboardMetric, 'combined'>];
}

function LeaderboardRow({ entry, metric }: { entry: MercuryLeaderboardEntry; metric: MercuryLeaderboardMetric }) {
  return (
    <Card p="4">
      <Stack gap="2">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <ShortId value={entry.address} label={`#${entry.rank}`} />
          </div>
          <Badge>{statValue(entry, metric)}</Badge>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Badge>{entry.balance} bal</Badge>
          <Badge>{entry.wins} wins</Badge>
          <Badge>{entry.punches} punches</Badge>
          <Badge>{entry.raids} raids</Badge>
          <Badge>{entry.losses} losses</Badge>
        </div>
      </Stack>
    </Card>
  );
}

export function MercuryLeaderboards({ limit = 8 }: MercuryLeaderboardsProps) {
  const [metric, setMetric] = useState<MercuryLeaderboardMetric>('balance');
  const [state, setState] = useState<MercuryLeaderboardResponse>({ metric, items: [], generatedAt: '' });
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/mercury/leaderboards?metric=${metric}&limit=${limit}`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        const json = (await response.json()) as MercuryLeaderboardResponse;
        if (!controller.signal.aborted) {
          setState(json);
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ metric, items: [], generatedAt: '' });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [limit, metric, refreshTick]);

  return (
    <Card p="6">
      <Stack gap="4">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <Stack gap="1">
            <Text className="label">Mercury leaderboards</Text>
            <Heading style={{ fontSize: '1.4rem' }}>Arena rankings</Heading>
          </Stack>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={metric} onChange={(event) => setMetric(event.currentTarget.value as MercuryLeaderboardMetric)}>
              {METRIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshTick((current) => current + 1)} disabled={loading}>
              {loading ? 'Syncing' : 'Refresh'}
            </Button>
          </div>
        </div>

        {state.message ? <Text className="lede" style={{ margin: 0 }}>{state.message}</Text> : null}
        {!state.items.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No leaderboard rows yet.
          </Text>
        ) : (
          <Grid columns={{ base: 1, xl: 2 }} gap="3">
            {state.items.map((entry) => (
              <LeaderboardRow key={entry.address} entry={entry} metric={metric} />
            ))}
          </Grid>
        )}
      </Stack>
    </Card>
  );
}
