'use client';

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

export default function Page() {
  const network = getDefaultDaoNetwork();
  const config = getDaoNetworkConfig(network);
  const { data: mercuryStatuses, error: mercuryStatusError, isLoading: mercuryStatusLoading, mutate: refreshStatuses } = useMercuryProgramStatuses();
  const { data: mercuryFeed, error: mercuryFeedError, isLoading: mercuryFeedLoading, mutate: refreshFeed } = useMercuryActivityFeed(6);
  const { data: tokens, error: tokenError, isLoading: tokenLoading, mutate: refreshTokens } = useTokenInventory();

  return (
    <DaoShell>
      <PageSection
        eyebrow="Dashboard"
        title="Governance at a glance"
        description="Track the current network, contract status, and the most important DAO actions from one clean home screen."
      >
        <Grid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Network</Text>
              <Heading style={{ fontSize: '1.6rem' }}>{config.label}</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>{config.rpcUrl}</Text>
            </Stack>
          </Card>
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
              <Grid columns={{ base: 1, md: 2, xl: 3 }} gap="4">
                {tokens?.items.map((token) => (
                  <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={token.owner} />
                ))}
              </Grid>
            )}
          </Stack>
        </Card>

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

        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <Text className="label">Mercury feed</Text>
                <Badge>{mercuryFeedLoading ? 'Syncing' : 'Live'}</Badge>
              </div>
              {mercuryFeedError ? <Text className="lede" style={{ margin: 0 }}>{mercuryFeedError.message}</Text> : null}
              {!mercuryFeed?.items.length ? (
                <Text className="lede" style={{ margin: 0 }}>No indexed activity yet.</Text>
              ) : (
                <Stack gap="2">
                  {mercuryFeed.items.map((item) => (
                    <Card key={item.id} p="4">
                      <Stack gap="1">
                        <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{item.summary}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                          {formatTimestamp(item.timestamp)} | Ledger {item.ledger} | Program #{item.programId}
                        </Text>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Card p="5">
            <Stack gap="3">
              <Text className="label">Refresh</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatuses()}>
                  Refresh Mercury status
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshFeed()}>
                  Refresh Mercury feed
                </Button>
              </div>
            </Stack>
          </Card>
        </Grid>

        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <Text className="label">Next actions</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Badge>Connect wallet</Badge>
                <Badge>Open proposals</Badge>
                <Badge>Inspect treasury</Badge>
              </div>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="3">
              <Text className="label">Admin</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Minting is gated to the configured admin address.
              </Text>
              <ShortId value={config.adminAddress} />
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
