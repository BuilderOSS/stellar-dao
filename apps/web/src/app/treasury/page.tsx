'use client';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';
import { Grid, Stack } from 'styled-system/jsx';

export default function TreasuryPage() {
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(8);
  const {
    data: balances,
    error: balanceError,
    isLoading: balanceLoading,
    mutate: mutateBalances
  } = useTreasuryBalances(config);

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
            <Stack gap="3">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text className="label">Asset Balances</Text>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void mutateBalances()}
                  disabled={balanceLoading}
                >
                  {balanceLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>

              {balanceError ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {balanceError.message}
                </Text>
              ) : null}

              {balanceLoading && !balances ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Loading balances...
                </Text>
              ) : null}

              {balances && balances.length > 0 ? (
                <Stack gap="2">
                  {balances.map((asset) => (
                    <div
                      key={asset.isNative ? 'XLM' : `${asset.assetCode}-${asset.assetIssuer}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--gray-6)'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Text style={{ margin: 0, fontWeight: 600 }}>{asset.assetCode}</Text>
                        {!asset.isNative && asset.assetIssuer ? (
                          <Text className="lede" style={{ margin: 0, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {asset.assetIssuer.slice(0, 8)}...{asset.assetIssuer.slice(-4)}
                          </Text>
                        ) : null}
                      </div>
                      <Badge>{parseFloat(asset.balance).toLocaleString()}</Badge>
                    </div>
                  ))}
                </Stack>
              ) : balances && balances.length === 0 ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  No balances found
                </Text>
              ) : null}
            </Stack>
          </Card>
          <Card p="5" style={{ gridColumn: '1 / -1' }}>
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
