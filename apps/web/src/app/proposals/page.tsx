'use client';

import { useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryActivityFeed } from '@/lib/mercury-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';

type GovernorClient = {
  propose: (args: { targets: string[]; functions: string[]; args: string[][]; description: string; proposer: string }, options?: MethodOptions) => Promise<AssembledTransaction<string>>;
};

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
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useMercuryActivityFeed(24);
  const items = (data?.items ?? []).filter((item) => item.programKey === 'governor');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function createMintProposal() {
    if (!session.address) {
      setStatus('Connect a wallet first.');
      return;
    }

    if (!config.governorContractId || !config.treasuryContractId || !config.tokenContractId) {
      setStatus('Missing DAO contract ids in the active network config.');
      return;
    }

    if (!recipient) {
      setStatus('Recipient is required.');
      return;
    }

    setBusy(true);
    setStatus('Preparing mint proposal...');

    try {
      const governor = await ContractClient.from<GovernorClient>({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: (async (xdr, opts) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })) as SignTransaction
      });

      const targets = [config.treasuryContractId];
      const functions = ['execute'];
      const callArgs = [config.tokenContractId, config.treasuryContractId, recipient];
      const args = [callArgs];
      const description = `Mint token to ${recipient}`;

      const assembled = await governor.propose({
        targets,
        functions,
        args,
        description,
        proposer: session.address
      });

      const sent = await assembled.signAndSend();
      setStatus(`Proposal submitted${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
      setRecipient('');
      void mutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Proposal failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Governance workspace"
        description="Browse proposal history and create a treasury-backed mint proposal for a specific recipient."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <Text className="label">Create proposal</Text>
              <Heading style={{ fontSize: '1.2rem' }}>Mint voting token via treasury</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                This submits a governor proposal that calls treasury `execute`, which then calls token `mint` for the chosen recipient.
              </Text>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" />
              <Button type="button" onClick={createMintProposal} disabled={busy}>
                {busy ? 'Submitting...' : 'Create mint proposal'}
              </Button>
              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              <ShortId value={config.governorContractId} label="Governor" />
              <ShortId value={config.treasuryContractId} label="Treasury" />
              <ShortId value={config.tokenContractId} label="Token" />
            </Stack>
          </Card>

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
                <Grid columns={{ base: 1 }} gap="4">
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
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
