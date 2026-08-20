'use client';

import { useState } from 'react';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed, useMercuryProgramStatuses } from '@/lib/mercury-queries';
import { useTokenInventory } from '@/lib/token-queries';
import { TokenCard } from '@/components/token/token-card';
import { Grid, Stack } from 'styled-system/jsx';

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

const ACTIVITY_PAGE_SIZE = 12;
const TOKEN_PAGE_SIZE = 8;

export default function Page() {
  const network = getDefaultDaoNetwork();
  const config = getDaoNetworkConfig(network);
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);
  const [tokenLimit, setTokenLimit] = useState(TOKEN_PAGE_SIZE);
  const { data: mercuryStatuses, error: mercuryStatusError, isLoading: mercuryStatusLoading, mutate: refreshStatuses } = useMercuryProgramStatuses();
  const { data: mercuryFeed, error: mercuryFeedError, isLoading: mercuryFeedLoading, mutate: refreshFeed } = useMercuryActivityFeed(activityLimit);
  const { data: tokens, error: tokenError, isLoading: tokenLoading, mutate: refreshTokens } = useTokenInventory();
  const tokenItems = tokens?.items.slice(0, tokenLimit) ?? [];
  const canLoadMoreTokens = Boolean(tokens && tokens.items.length > tokenLimit);
  const activityItems = mercuryFeed?.items.slice(0, activityLimit) ?? [];
  const canLoadMoreActivity = Boolean(mercuryFeed && mercuryFeed.items.length >= activityLimit);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Dashboard"
        title="Governance at a glance"
        description="Track DAO contracts, token supply, Mercury indexing, and recent governance activity from one clean home screen."
      >
        <Grid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Token</Text>
              {config.tokenContractId ? <ShortId value={config.tokenContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Governor</Text>
              {config.governorContractId ? <ShortId value={config.governorContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Treasury</Text>
              {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Admin</Text>
              <ShortId value={config.adminAddress} />
            </Stack>
          </Card>
        </Grid>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Tokens</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Current live supply</Heading>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge>{tokenLoading ? 'Syncing' : `${tokens?.totalSupply ?? 0} live`}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshTokens()} disabled={tokenLoading}>
                  {tokenLoading ? 'Refreshing...' : 'Refresh tokens'}
                </Button>
              </div>
            </div>

            {tokenError ? <Text className="lede" style={{ margin: 0 }}>{tokenError.message}</Text> : null}
            {!tokenLoading && !tokens?.items.length ? (
              <Text className="lede" style={{ margin: 0 }}>No tokens indexed yet.</Text>
            ) : (
              <>
                <div className="token-inventory-grid">
                  {tokenItems.map((token) => (
                    <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={token.owner} />
                  ))}
                </div>
                {canLoadMoreTokens ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <Button type="button" variant="outline" size="sm" onClick={() => setTokenLimit((current) => current + TOKEN_PAGE_SIZE)} disabled={tokenLoading}>
                      {tokenLoading ? 'Loading...' : 'Show more tokens'}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Stack>
          <style jsx>{`
            .token-inventory-grid {
              display: grid;
              gap: 18px;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            }

            @media (min-width: 768px) {
              .token-inventory-grid {
                gap: 20px;
                grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
              }
            }
          `}</style>
        </Card>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Mercury programs</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Indexer health</Heading>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatuses()} disabled={mercuryStatusLoading}>
                {mercuryStatusLoading ? 'Refreshing...' : 'Refresh status'}
              </Button>
            </div>

            <Grid columns={{ base: 1, xl: 3 }} gap="4">
              {mercuryStatuses?.items.map((program) => (
                <Card key={program.key} p="5">
                  <Stack gap="2">
                    <Text className="label">Mercury {program.label}</Text>
                    <Heading style={{ fontSize: '1.2rem' }}>Program #{program.programId}</Heading>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{program.projectName}</Text>
                    <div>
                      <Badge>{program.running ? 'Running' : 'Stopped'}</Badge>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                      Executions {program.totalExecutions} | Errors {program.totalErrors}
                    </Text>
                  </Stack>
                </Card>
              ))}
              {mercuryStatusLoading ? <Card p="5"><Text>Loading Mercury status…</Text></Card> : null}
              {mercuryStatusError ? <Card p="5"><Text>{mercuryStatusError.message}</Text></Card> : null}
            </Grid>
          </Stack>
        </Card>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Mercury feed</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Latest indexed DAO activity</Heading>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge>{mercuryFeedLoading ? 'Syncing' : 'Live'}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshFeed()} disabled={mercuryFeedLoading}>
                  {mercuryFeedLoading ? 'Refreshing...' : 'Refresh feed'}
                </Button>
              </div>
            </div>
            {mercuryFeedError ? <Text className="lede" style={{ margin: 0 }}>{mercuryFeedError.message}</Text> : null}
            {!activityItems.length ? (
              <Text className="lede" style={{ margin: 0 }}>No indexed activity yet.</Text>
            ) : (
              <>
                <Stack gap="0">
                  {activityItems.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        borderTop: index === 0 ? 'none' : '1px solid rgba(148, 163, 184, 0.18)',
                        padding: '14px 0',
                      }}
                    >
                      <Stack gap="1">
                        <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{item.summary}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                          {formatTimestamp(item.timestamp)} | Ledger {item.ledger} | Program #{item.programId}
                        </Text>
                      </Stack>
                    </div>
                  ))}
                </Stack>
                {canLoadMoreActivity ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <Button type="button" variant="outline" size="sm" onClick={() => setActivityLimit((current) => current + ACTIVITY_PAGE_SIZE)} disabled={mercuryFeedLoading}>
                      {mercuryFeedLoading ? 'Loading...' : 'Show more activity'}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Stack>
        </Card>

      </PageSection>
    </DaoShell>
  );
}
