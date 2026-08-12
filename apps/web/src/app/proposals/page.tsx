'use client';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { Grid, Stack } from 'styled-system/jsx';

function proposalBucket(title: string) {
  switch (title) {
    case 'Proposal Created':
      return 'Draft';
    case 'Proposal Call':
      return 'Execution';
    case 'Proposal Lifecycle':
      return 'State';
    case 'Vote Cast':
      return 'Votes';
    default:
      return 'Proposal';
  }
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

export default function ProposalsPage() {
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(24);
  const items = (data?.items ?? []).filter((item) => item.programKey === 'governor');

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Governance workspace"
        description="Browse proposal creation, vote, lifecycle, and execution history from the governor Mercury program."
      >
        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <Text className="label">Mercury proposals</Text>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
            {!items.length ? (
              <Text className="lede" style={{ margin: 0 }}>No proposal rows indexed yet.</Text>
            ) : (
              <Grid columns={{ base: 1, lg: 2 }} gap="4">
                {items.map((item) => (
                  <Card key={item.id} p="4">
                    <Stack gap="2">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <Badge>{proposalBucket(item.title)}</Badge>
                        <Badge>{item.title}</Badge>
                      </div>
                      <Heading style={{ fontSize: '1.1rem' }}>{item.summary}</Heading>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{formatTimestamp(item.timestamp)}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Ledger {item.ledger}</Text>
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
