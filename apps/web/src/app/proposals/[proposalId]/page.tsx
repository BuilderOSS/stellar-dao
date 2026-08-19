'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Buffer } from 'buffer';
import { Client as ContractClient, type AssembledTransaction, type MethodOptions, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Button, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { proposalActionMode } from '@/lib/proposal-state';
import { ProposalLifecycleAction } from '@/components/proposal/proposal-lifecycle-action';
import { ProposalOutcomeCallout } from '@/components/proposal/proposal-outcome-callout';
import { ProposalOverview } from '@/components/proposal/proposal-overview';
import { ProposalVoteHistory } from '@/components/proposal/proposal-vote-history';
import { ProposalVotePanel } from '@/components/proposal/proposal-vote-panel';
import { ProposalVoteSummary } from '@/components/proposal/proposal-vote-summary';
import type { ProposalDetail, ProposalVoteItem } from '@/components/proposal/types';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';
import useSWR from 'swr';

type ProposalPageData = {
  detail: ProposalDetail;
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

  const detail = (await detailResponse.json()) as ProposalDetail;
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
  const currentVote = session.address ? votes.find((vote) => vote.voter === session.address) ?? null : null;
  const actionMode = proposalActionMode(detail?.state);
  const errorMessage = error instanceof Error ? error.message : '';

  function voteLabelForSupport(support: number) {
    if (support === VOTE_FOR) return 'For';
    if (support === VOTE_AGAINST) return 'Against';
    return 'Abstain';
  }

  function outcomeStateLabel() {
    return detail?.label ?? 'Loading';
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposal detail"
        title={detail ? detail.metadata.title : `Proposal ${proposalId}`}
        description="Live vote state, indexed votes, and proposal actions for the selected governance item."
      >
        <Stack gap="4">
          {detail ? <ProposalOverview detail={detail} now={now} /> : null}
          {errorMessage ? <Text className="lede" style={{ margin: 0 }}>{errorMessage}</Text> : null}

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <ProposalVoteSummary forCount={activeVotes.for} againstCount={activeVotes.against} abstainCount={activeVotes.abstain} />
            {detail && actionMode === 'vote' ? (
              <ProposalVotePanel
                canVote={true}
                busy={busy}
                voteReason={voteReason}
                onVoteReasonChange={setVoteReason}
                onVote={(voteType) => void submitVote(voteType)}
                currentVote={currentVote ? { label: voteLabelForSupport(currentVote.support), reason: currentVote.reason } : null}
              />
            ) : null}
            {detail && actionMode === 'queue' ? (
              <ProposalLifecycleAction
                title="This proposal passed and is ready to queue."
                body="Queue it to move the proposal into the execution-ready state."
                buttonLabel="Queue proposal"
                onAction={() => void queueProposal()}
                busy={busy}
              />
            ) : null}
            {detail && actionMode === 'execute' ? (
              <ProposalLifecycleAction
                title="This proposal is queued and ready to execute."
                body="Execute it now to perform the proposal's on-chain action."
                buttonLabel="Execute proposal"
                onAction={() => void executeProposal()}
                busy={busy}
              />
            ) : null}
            {detail && actionMode === 'outcome' ? (
              <ProposalOutcomeCallout stateLabel={outcomeStateLabel()} />
            ) : null}
          </Grid>

          {detail ? (
            <ProposalVoteHistory
              votes={votes}
              voteLabelForSupport={voteLabelForSupport}
              formatTimestamp={formatTimestamp}
            />
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <Text className="lede" style={{ margin: 0 }}>{status}</Text>
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <Link href="/proposals" style={{ color: 'inherit' }}>Back to proposals</Link>
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
