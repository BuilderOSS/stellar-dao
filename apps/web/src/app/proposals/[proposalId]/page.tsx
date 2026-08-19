'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Buffer } from 'buffer';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';
import useSWR from 'swr';

type ProposalDetailResponse = {
  proposalId: string;
  proposer: string;
  description: string;
  targets: string[];
  functions: string[];
  args: string[][];
  vote_end: number;
  vote_snapshot: number;
  vote_start: number;
  eta: number;
  deadline: number;
  state: number;
  label: string;
};

type ProposalVoteItem = {
  id: string;
  proposalId: string;
  voter: string;
  support: number;
  weight: string;
  reason: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

type ProposalPageData = {
  detail: ProposalDetailResponse;
  votes: ProposalVoteItem[];
};

type GovernorClient = {
  cast_vote: (args: { proposal_id: Buffer; vote_type: number; reason: string; voter: string }, options?: MethodOptions) => Promise<AssembledTransaction<bigint>>;
  queue: (args: { targets: string[]; functions: string[]; args: string[][]; description_hash: Buffer; eta: number; operator: string }, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>;
  execute: (args: { targets: string[]; functions: string[]; args: string[][]; description_hash: Buffer; executor: string }, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>;
  has_voted: (args: { proposal_id: Buffer; account: string }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
};

const VOTE_FOR = 1;
const VOTE_AGAINST = 0;
const VOTE_ABSTAIN = 2;

function formatCountdown(target: number, now: number) {
  if (!target) return '—';
  const delta = Math.max(0, target - Math.floor(now / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function descriptionHash(description: string) {
  return Buffer.from(description, 'utf8');
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

async function fetchProposalPageData([, proposalId]: readonly ['proposal-detail', string]): Promise<ProposalPageData> {
  const [detailResponse, votesResponse] = await Promise.all([
    fetch(`/api/proposals/${proposalId}`, { cache: 'no-store' }),
    fetch(`/api/mercury/proposals/${proposalId}/votes`, { cache: 'no-store' })
  ]);

  if (!detailResponse.ok) {
    throw new Error((await detailResponse.json()).message || 'Proposal lookup failed');
  }

  if (!votesResponse.ok) {
    throw new Error((await votesResponse.json()).message || 'Vote lookup failed');
  }

  const detail = (await detailResponse.json()) as ProposalDetailResponse;
  const votesPayload = (await votesResponse.json()) as { items?: ProposalVoteItem[] };

  return { detail, votes: votesPayload.items ?? [] };
}

export default function ProposalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [voteReason, setVoteReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const { data, error, isLoading, mutate } = useSWR(
    proposalId ? (['proposal-detail', proposalId] as const) : null,
    fetchProposalPageData,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  const detail = data?.detail ?? null;
  const votes = data?.votes ?? [];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function getGovernor() {
    if (!session.address) throw new Error('Connect a wallet first.');
    if (!config.governorContractId) throw new Error('Missing governor contract id.');

    return ContractClient.from<GovernorClient>({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      signTransaction: (async (xdr, opts) => StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
        address: opts?.address ?? session.address
      })) as SignTransaction
    });
  }

  async function submitVote(voteType: number) {
    if (!detail) return;
    setBusy(true);
    setStatus('Submitting vote...');

    try {
      const governor = await getGovernor();
      const assembled = await governor.cast_vote({
        proposal_id: proposalIdToBuffer(proposalId),
        vote_type: voteType,
        reason: voteReason,
        voter: session.address
      });
      const sent = await assembled.signAndSend();
      setStatus(`Vote submitted${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
      setVoteReason('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setBusy(false);
    }
  }

  async function queueProposal() {
    if (!detail || !config.treasuryContractId) return;
    setBusy(true);
    setStatus('Queueing proposal...');

    try {
      const governor = await getGovernor();
      const assembled = await governor.queue({
        targets: detail.targets,
        functions: detail.functions,
        args: detail.args,
        description_hash: descriptionHash(detail.description),
        eta: Math.floor(Date.now() / 1000) + 60,
        operator: session.address
      });
      const sent = await assembled.signAndSend();
      setStatus(`Proposal queued${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Queue failed');
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    if (!detail || !config.treasuryContractId || !config.tokenContractId) return;
    setBusy(true);
    setStatus('Executing proposal...');

    try {
      const governor = await getGovernor();
      const assembled = await governor.execute({
        targets: detail.targets,
        functions: detail.functions,
        args: detail.args,
        description_hash: descriptionHash(detail.description),
        executor: session.address
      });
      const sent = await assembled.signAndSend();
      setStatus(`Proposal executed${sent.sendTransactionResponse?.hash ? ` (tx ${sent.sendTransactionResponse.hash})` : ''}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

  const activeVotes = votes.reduce((acc, item) => {
    if (item.support === VOTE_FOR) acc.for += 1;
    if (item.support === VOTE_AGAINST) acc.against += 1;
    if (item.support === VOTE_ABSTAIN) acc.abstain += 1;
    return acc;
  }, { for: 0, against: 0, abstain: 0 });
  const loading = isLoading && !data;
  const errorMessage = error instanceof Error ? error.message : '';

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposal detail"
        title={detail ? `Proposal ${detail.proposalId}` : `Proposal ${proposalId}`}
        description="Live vote state, indexed votes, and proposal actions for the selected governance item."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <div>
                <Badge>{detail?.label ?? 'Loading'}</Badge>
              </div>
              <Heading style={{ fontSize: '1.35rem' }}>Vote window and execution status</Heading>
              {loading ? <Text className="lede" style={{ margin: 0 }}>Loading proposal data…</Text> : null}
              {errorMessage ? <Text className="lede" style={{ margin: 0 }}>{errorMessage}</Text> : null}
              {detail ? (
                <Stack gap="2">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Proposer: {detail.proposer}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Snapshot ledger: {detail.vote_snapshot}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Deadline ledger: {detail.vote_end}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Ends in: {formatCountdown(detail.vote_end, now)}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Description: {detail.description || '—'}</Text>
                </Stack>
              ) : null}
              <ShortId value={proposalId} label="Proposal id" />
            </Stack>
          </Card>

          <Card p="5">
            <Stack gap="3">
              <Text className="label">Actions</Text>
              <Input value={voteReason} onChange={(event) => setVoteReason(event.target.value)} placeholder="Vote reason" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Button type="button" onClick={() => void submitVote(VOTE_FOR)} disabled={busy || !session.address}>For</Button>
                <Button type="button" variant="outline" onClick={() => void submitVote(VOTE_AGAINST)} disabled={busy || !session.address}>Against</Button>
                <Button type="button" variant="outline" onClick={() => void submitVote(VOTE_ABSTAIN)} disabled={busy || !session.address}>Abstain</Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Button type="button" variant="outline" onClick={() => void queueProposal()} disabled={busy || !session.address}>Queue</Button>
                <Button type="button" variant="outline" onClick={() => void executeProposal()} disabled={busy || !session.address}>Execute</Button>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>For {activeVotes.for} | Against {activeVotes.against} | Abstain {activeVotes.abstain}</Text>
            </Stack>
          </Card>
        </Grid>

        <Card p="5">
          <Stack gap="3">
            <Text className="label">Votes</Text>
            {!votes.length ? (
              <Text className="lede" style={{ margin: 0 }}>No votes indexed yet.</Text>
            ) : (
              <Grid columns={{ base: 1, xl: 2 }} gap="3">
                {votes.map((vote) => (
                  <Card key={vote.id} p="4">
                    <Stack gap="1">
                      <ShortId value={vote.voter} label={vote.support === VOTE_FOR ? 'For' : vote.support === VOTE_AGAINST ? 'Against' : 'Abstain'} />
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Weight {vote.weight}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>{vote.reason || 'No reason provided'}</Text>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>{formatTimestamp(vote.timestamp)} | Ledger {vote.ledger}</Text>
                    </Stack>
                  </Card>
                ))}
              </Grid>
            )}
            <Link href="/proposals" style={{ color: 'inherit' }}>Back to proposals</Link>
          </Stack>
        </Card>
      </PageSection>
    </DaoShell>
  );
}
