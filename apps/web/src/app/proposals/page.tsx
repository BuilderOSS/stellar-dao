'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { ProposalStateBadge } from '@/components/proposal/proposal-state-badge';
import { Grid, Stack } from 'styled-system/jsx';
import type { ProposalListResponse } from '@/components/proposal/types';

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

export default function ProposalsPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<ProposalListResponse>('/api/proposals?limit=24', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' });
    const json = (await response.json()) as ProposalListResponse;
    if (!response.ok) {
      throw new Error(json.message || 'Proposal list failed');
    }
    return json;
  }, { keepPreviousData: true });
  const items = data?.items ?? [];

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Governance workspace"
        description="Browse proposal history and review on-chain proposal state."
      >
        <Stack gap="4">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <Text className="label">Mercury proposals</Text>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button type="button" size="sm" onClick={() => router.push('/proposals/create')}>
                Create proposal
              </Button>
            </div>
          </div>

          {error ? <Text className="lede" style={{ margin: 0 }}>{error.message}</Text> : null}
          {!items.length ? (
            <Text className="lede" style={{ margin: 0 }}>No proposal rows indexed yet.</Text>
          ) : (
            <Grid columns={{ base: 1 }} gap="4">
              {items.map((item) => (
                <Card key={item.proposalId} p="4">
                  <Link href={`/proposals/${item.proposalId}`} style={{ textDecoration: 'none' }}>
                    <Stack gap="2">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <ProposalStateBadge label={item.stateLabel} />
                        <Badge>{item.metadata.title}</Badge>
                      </div>
                      <Heading style={{ fontSize: '1.1rem' }}>{item.metadata.description}</Heading>
                      {item.metadata.url ? (
                        <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{item.metadata.url}</Text>
                      ) : null}
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{formatTimestamp(item.timestamp)}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Ledger {item.ledger}</Text>
                    </Stack>
                  </Link>
                </Card>
              ))}
            </Grid>
          )}
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
