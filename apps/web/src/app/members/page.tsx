'use client';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { Grid, Stack } from 'styled-system/jsx';

type MemberRow = {
  address: string;
  count: number;
  lastSeenLedger: number;
  lastSeenAt: number;
};

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

export default function MembersPage() {
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(32);
  const items = (data?.items ?? []).filter((item) => item.programKey === 'token');

  const members = new Map<string, MemberRow>();
  for (const item of items) {
    for (const address of item.addresses) {
      const existing = members.get(address) ?? { address, count: 0, lastSeenLedger: 0, lastSeenAt: 0 };
      existing.count += 1;
      existing.lastSeenLedger = Math.max(existing.lastSeenLedger, item.ledger);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, item.timestamp);
      members.set(address, existing);
    }
  }

  const rows = [...members.values()].sort((a, b) => b.count - a.count || b.lastSeenLedger - a.lastSeenLedger);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Members"
        title="Voting power directory"
        description="A Mercury-backed view of token activity and the most recently seen DAO addresses."
      >
        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <Text className="label">Mercury members</Text>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
            {!rows.length ? (
              <Text className="lede" style={{ margin: 0 }}>No token addresses indexed yet.</Text>
            ) : (
              <Grid columns={{ base: 1, lg: 2 }} gap="4">
                {rows.map((row, index) => (
                  <Card key={row.address} p="4">
                    <Stack gap="2">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <Badge>#{index + 1}</Badge>
                        <Badge>Seen {row.count}x</Badge>
                      </div>
                      <ShortId value={row.address} label="Address" />
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Ledger {row.lastSeenLedger}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{formatTimestamp(row.lastSeenAt)}</Text>
                    </Stack>
                  </Card>
                ))}
              </Grid>
            )}
          </Stack>
        </Card>
      </PageSection>
    </DaoShell>
  );
}
