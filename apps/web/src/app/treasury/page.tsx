'use client';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { Grid, Stack } from 'styled-system/jsx';

export default function TreasuryPage() {
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(8);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Treasury"
        title="Execution boundary"
        description="The treasury is where approved governance actions become real contract calls."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Treasury address</Text>
              {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Heading style={{ fontSize: '1.2rem' }}>Recent executions</Heading>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              {error ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{error.message}</Text> : null}
              {!data?.items.length ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Treasury execution history will appear here once actions are indexed.
                </Text>
              ) : (
                <Stack gap="2">
                  {data.items
                    .filter((item) => item.programKey === 'treasury')
                    .map((item) => (
                      <Card key={item.id} p="4">
                        <Stack gap="1">
                          <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                          <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{item.summary}</Text>
                          <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>Ledger {item.ledger}</Text>
                        </Stack>
                      </Card>
                    ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
