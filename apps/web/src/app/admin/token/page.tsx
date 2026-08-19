'use client';

import { useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { Badge, Button, Card, Heading, Input, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryMintAuthorities } from '@/lib/mercury-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Stack } from 'styled-system/jsx';

type TokenMintClient = {
  mint: (args: { minter: string; to: string }, options?: MethodOptions) => Promise<AssembledTransaction<number>>;
};

async function mintToken(config: ReturnType<typeof getDaoNetworkConfig>, sessionAddress: string, recipient: string) {
  const client = await ContractClient.from<TokenMintClient>({
    contractId: config.tokenContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: sessionAddress,
    signTransaction: (async (xdr, opts) => StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
      address: opts?.address ?? sessionAddress
    })) as SignTransaction
  });

  const assembled = await client.mint({ minter: sessionAddress, to: recipient });
  return assembled.signAndSend();
}

export default function TokenAdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const { data: mintAuthorities, error, isLoading, mutate } = useMercuryMintAuthorities();
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasMintAccess = Boolean(isOwner || mintAuthorities?.items.some((item) => item.authority === session.address));

  async function handleMint() {
    if (!session.address || !hasMintAccess) {
      setStatus('Connect a mint authority wallet first.');
      return;
    }

    if (!config.tokenContractId) {
      setStatus('Missing token contract id in the active network config.');
      return;
    }

    if (!recipient) {
      setStatus('Recipient is required.');
      return;
    }

    setBusy(true);
    setStatus('Preparing mint transaction...');

    try {
      const sent = await mintToken(config, session.address, recipient);
      setStatus(`Minted token #${sent.result}${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
      setRecipient('');
      void mutate();
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
        title="Token Admin"
        description="Mint tokens and review the current mint-authority set."
      >
        <Stack gap="4">
          <AdminSectionNav active="/admin/token" />

          <Card p="5">
            <Stack gap="3">
              <Badge>{hasMintAccess ? 'Mint enabled' : 'Read only'}</Badge>
              <Heading style={{ fontSize: '1.2rem' }}>Mint voting token</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                {hasMintAccess ? 'Enter a recipient address and mint directly to that wallet.' : 'Only a mint authority or the owner can mint from this page.'}
              </Text>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" disabled={!hasMintAccess} />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button type="button" onClick={handleMint} disabled={busy || !hasMintAccess}>
                  {busy ? 'Minting...' : 'Mint token'}
                </Button>
                <Button type="button" variant="outline" onClick={() => void mutate()} disabled={isLoading}>
                  {isLoading ? 'Refreshing...' : 'Refresh authorities'}
                </Button>
              </div>
              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              {error ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{error.message}</Text> : null}
            </Stack>
          </Card>

          <AuthorityPanel
            title="Mint authorities"
            badge="Token"
            description="These wallets are explicitly allowed to mint. The owner is always allowed too."
            items={mintAuthorities?.items ?? []}
            value=""
            allowLabel=""
            revokeLabel=""
            editable={false}
            emptyLabel="No explicit mint authorities indexed yet."
          />
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
