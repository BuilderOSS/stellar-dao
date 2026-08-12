'use client';

import { useMemo } from 'react';
import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { Grid, Stack } from 'styled-system/jsx';

type MemberRow = {
  address: string;
  balance: string;
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
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(32);
  const items = (data?.items ?? []).filter((item) => item.programKey === 'token');

  const candidateAddresses = useMemo(
    () => [...new Set(items.flatMap((item) => item.addresses))],
    [items]
  );

  const rows = candidateAddresses
    .filter((address) => address !== config.adminAddress)
    .map((address) => ({ address, balance: '0' }))
    .filter((row) => Number(row.balance) > 0);

  return (
    <DaoShell>
        <PageSection
        eyebrow="Members"
        title="Voting power directory"
        description="A Mercury-backed view of token holders with non-zero balances."
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
              <Text className="lede" style={{ margin: 0 }}>No token holders indexed yet.</Text>
            ) : (
              <Grid columns={{ base: 1, lg: 2 }} gap="4">
                {rows.map((row, index) => (
                  <Card key={row.address} p="4">
                    <Stack gap="2">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <Badge>#{index + 1}</Badge>
                        <Badge>Balance {row.balance}</Badge>
                      </div>
                      <ShortId value={row.address} label="Address" />
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
