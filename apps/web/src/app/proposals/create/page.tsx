'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Input, Select, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { buildMintProposalCall } from '@/lib/proposal-call';
import { encodeProposalMetadata, type ProposalMetadataDraft } from '@/lib/proposal-metadata';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Stack } from 'styled-system/jsx';

type GovernorClient = {
  propose: (args: { targets: string[]; functions: string[]; args: unknown[][]; description: string; proposer: string }, options?: MethodOptions) => Promise<AssembledTransaction<string>>;
};

type ProposalTxType = 'mint-governance-token';
type ProposalStep = 1 | 2 | 3;

const PROPOSAL_TX_TYPES: Array<{ value: ProposalTxType; label: string; description: string }> = [
  {
    value: 'mint-governance-token',
    label: 'Mint governance token',
    description: 'Creates a treasury-backed proposal that mints voting tokens for a recipient.'
  }
];

const EMPTY_METADATA: ProposalMetadataDraft = {
  title: '',
  description: '',
  url: ''
};

export default function ProposalCreatePage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [step, setStep] = useState<ProposalStep>(1);
  const [metadata, setMetadata] = useState<ProposalMetadataDraft>(EMPTY_METADATA);
  const [txType, setTxType] = useState<ProposalTxType>('mint-governance-token');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const proposalDescription = useMemo(() => encodeProposalMetadata(metadata), [metadata]);
  const metadataIsValid = metadata.title.trim().length > 0 && metadata.description.trim().length > 0;
  const recipientIsValid = recipient.trim().length > 0;
  const canReview = metadataIsValid && txType === 'mint-governance-token' && recipientIsValid;

  async function createMintProposal() {
    if (!session.address) {
      setStatus('Connect a wallet first.');
      return;
    }

    if (!config.governorContractId || !config.treasuryContractId || !config.tokenContractId) {
      setStatus('Missing DAO contract ids in the active network config.');
      return;
    }

    if (!recipientIsValid) {
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

      const { targets, functions, args } = buildMintProposalCall(recipient, config.tokenContractId, config.treasuryContractId);

      const assembled = await governor.propose({
        targets,
        functions,
        args,
        description: proposalDescription,
        proposer: session.address
      });

      const sent = await assembled.signAndSend();
      setStatus(`Proposal submitted${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
      setStep(1);
      setMetadata(EMPTY_METADATA);
      setTxType('mint-governance-token');
      setRecipient('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Proposal failed');
    } finally {
      setBusy(false);
    }
  }

  function advanceFromMetadata() {
    if (!metadataIsValid) {
      setStatus('Title and description are required.');
      return;
    }

    setStatus('');
    setStep(2);
  }

  function advanceFromTxType() {
    if (!recipientIsValid) {
      setStatus('Recipient is required.');
      return;
    }

    setStatus('');
    setStep(3);
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Create proposal"
        description="Draft proposal metadata, choose a transaction type, and review the encoded payload before submitting."
      >
        <Stack gap="4">
          <Link href="/proposals" style={{ color: 'inherit' }}>Back to proposals</Link>

          <Card p="5">
            <Stack gap="3">
              <Text className="label">Create proposal</Text>
              <Heading style={{ fontSize: '1.2rem' }}>Three-step proposal flow</Heading>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Badge style={step === 1 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>1. Metadata</Badge>
                <Badge style={step === 2 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>2. Transaction</Badge>
                <Badge style={step === 3 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>3. Review</Badge>
              </div>

              {step === 1 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Enter the proposal metadata that will be stored as stringified JSON in the contract description.
                  </Text>
                  <Input
                    value={metadata.title}
                    onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Proposal title"
                  />
                  <textarea
                    value={metadata.description}
                    onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Proposal description"
                    rows={6}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      border: '1px solid rgba(160, 194, 225, 0.28)',
                      background: 'transparent',
                      color: 'inherit',
                      padding: '0.875rem 1rem',
                      font: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  <Input
                    value={metadata.url ?? ''}
                    onChange={(event) => setMetadata((current) => ({ ...current, url: event.target.value }))}
                    placeholder="Optional URL"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="button" onClick={advanceFromMetadata} disabled={!metadataIsValid}>
                      Next
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step === 2 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Choose the proposal transaction type.
                  </Text>
                  <Select value={txType} onChange={(event) => setTxType(event.target.value as ProposalTxType)}>
                    {PROPOSAL_TX_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>

                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {PROPOSAL_TX_TYPES[0].description}
                  </Text>

                  {txType === 'mint-governance-token' ? (
                    <Input
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="Recipient address"
                    />
                  ) : null}

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button type="button" onClick={advanceFromTxType} disabled={!recipientIsValid}>
                      Next
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step === 3 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Review the encoded proposal metadata and transaction details before submitting on-chain.
                  </Text>
                  <Card p="4">
                    <Stack gap="2">
                      <Text className="label">Metadata</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Title: {metadata.title}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Description: {metadata.description}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>URL: {metadata.url || '—'}</Text>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem' }}>{proposalDescription}</pre>
                    </Stack>
                  </Card>
                  <Card p="4">
                    <Stack gap="2">
                      <Text className="label">Transaction</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Type: Mint governance token</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Recipient: {recipient}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Treasury: {config.treasuryContractId}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Token: {config.tokenContractId}</Text>
                    </Stack>
                  </Card>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button type="button" onClick={createMintProposal} disabled={busy || !canReview}>
                      {busy ? 'Submitting...' : 'Submit proposal'}
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step < 3 ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {step === 1 ? 'Start with the proposal metadata.' : 'Now choose the transaction type and recipient.'}
                </Text>
              ) : null}

              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              <ShortId value={config.governorContractId} label="Governor" />
              <ShortId value={config.treasuryContractId} label="Treasury" />
              <ShortId value={config.tokenContractId} label="Token" />
            </Stack>
          </Card>
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
