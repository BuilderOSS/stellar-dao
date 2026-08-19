'use client';

import { useMemo } from 'react';
import { Client as TokenClient } from '@dao-test-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';
import useSWR from 'swr';

type MemberRow = {
  address: string;
  balance: string;
};

type BalanceSWRKey = [
  'member-balances',
  string,
  string,
  string,
  string,
  string[]
];

async function fetchMemberBalances([
  ,
  tokenContractId,
  rpcUrl,
  passphrase,
  publicKey,
  addresses
]: BalanceSWRKey): Promise<MemberRow[]> {
  const client = new TokenClient({
    contractId: tokenContractId,
    rpcUrl,
    networkPassphrase: passphrase,
    publicKey,
    signTransaction: (async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? passphrase,
        address: opts?.address ?? publicKey
      }))
  });

  const balances = await Promise.all(
    addresses.map(async (address) => {
      const assembled = await client.balance({ account: address });
      return { address, balance: String(assembled.result ?? 0) };
    })
  );

  return balances;
}

export default function MembersPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(32);
  const items = (data?.items ?? []).filter((item) => item.programKey === 'token' && (item.title === 'Mint' || item.title === 'Transfer'));

  const candidateAddresses = useMemo(
    () => [...new Set(items.flatMap((item) => item.addresses))],
    [items]
  );
  const hasBalanceQuery = !!config.tokenContractId && candidateAddresses.length > 0;
  const {
    data: balanceRows = [],
    error: balanceError,
    isLoading: balanceLoading
  } = useSWR(
    hasBalanceQuery
      ? ['member-balances', config.tokenContractId, config.rpcUrl, config.passphrase, session.address, candidateAddresses]
      : null,
    fetchMemberBalances
  );

  const rows = useMemo(
    () => balanceRows.filter((row) => Number(row.balance) > 0),
    [balanceRows]
  );
  const visibleBalanceLoading = hasBalanceQuery && balanceLoading;
  const visibleBalanceError = hasBalanceQuery ? balanceError?.message ?? '' : '';

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
            {visibleBalanceError ? <Text className="lede" style={{ margin: 0 }}>{visibleBalanceError}</Text> : null}
            {visibleBalanceLoading ? <Text className="lede" style={{ margin: 0 }}>Loading balances...</Text> : null}
            {!visibleBalanceLoading && !rows.length ? (
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
