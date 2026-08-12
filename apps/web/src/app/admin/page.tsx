'use client';

import { useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';

type TokenMintClient = {
  mint: (
    args: { to: string; token_id: number },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
};

export default function AdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const isAdmin = session.address && session.address === config.adminAddress;
  const [recipient, setRecipient] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function mintToken() {
    if (!session.address || !isAdmin) {
      setStatus('Connect the admin wallet first.');
      return;
    }

    if (!config.tokenContractId) {
      setStatus('Missing token contract id in the active network config.');
      return;
    }

    if (!recipient || !tokenId) {
      setStatus('Recipient and token id are required.');
      return;
    }

    setBusy(true);
    setStatus('Preparing mint transaction...');

    try {
      const client = await ContractClient.from<TokenMintClient>({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: (async (xdr, opts) => {
          return StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          });
        }) as SignTransaction
      });

      const assembled = await client.mint({ to: recipient, token_id: Number.parseInt(tokenId, 10) });
      const sent = await assembled.signAndSend();
      setStatus(`Mint submitted: ${sent.sendTransactionResponse?.hash ?? 'unknown hash'}`);
      setTokenId('');
      setRecipient('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Mint failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Admin"
        title="Mint voting tokens"
        description="Bootstrap page for the configured admin address. This page is only useful when the connected wallet matches the DAO admin."
      >
        {!isAdmin ? (
          <Card p="5">
            <Stack gap="2">
              <Badge>Access restricted</Badge>
              <Heading style={{ fontSize: '1.3rem' }}>Connect the admin wallet to continue</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Admin actions are hidden until the connected address matches the configured bootstrap admin.
              </Text>
              <ShortId value={config.adminAddress} label="Admin address" />
            </Stack>
          </Card>
        ) : (
          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <Badge>Admin only</Badge>
                <Heading style={{ fontSize: '1.3rem' }}>Mint form</Heading>
                <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" />
                <Input value={tokenId} onChange={(event) => setTokenId(event.target.value)} placeholder="Token id" />
                <Button type="button" onClick={mintToken} disabled={busy}>
                  {busy ? 'Minting...' : 'Mint token'}
                </Button>
                {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="2">
                <Text className="label">What this page will do</Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Verify the connected wallet against the admin address, then submit mint transactions and show receipts.
                </Text>
              </Stack>
            </Card>
          </Grid>
        )}
      </PageSection>
    </DaoShell>
  );
}
