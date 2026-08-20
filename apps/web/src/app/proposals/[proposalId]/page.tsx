'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Client as GovernorClient } from '@dao-test-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { TxExplorerLink } from '@/components/tx-explorer-link';
import { Button, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { keccak256Bytes } from '@/lib/keccak';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { proposalActionMode } from '@/lib/proposal-state';
import { normalizeProposalCallArgs, type ProposalCallArgs } from '@/lib/proposal-call';
import { useVotingPower } from '@/lib/voting-power';
import { ProposalExecutePanel } from '@/components/proposal/proposal-execute-panel';
import { ProposalOutcomeCallout } from '@/components/proposal/proposal-outcome-callout';
import { ProposalOverview } from '@/components/proposal/proposal-overview';
import { ProposalQueuePanel } from '@/components/proposal/proposal-queue-panel';
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

const VOTE_FOR = 1;
const VOTE_AGAINST = 0;
const VOTE_ABSTAIN = 2;

function descriptionHash(description: string) {
  return keccak256Bytes(description);
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function shortenProposalId(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
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
  const [selectedVoteType, setSelectedVoteType] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const { data, error, isLoading, mutate } = useSWR(
    proposalId ? (['proposal-detail', proposalId] as const) : null,
    fetchProposalPageData,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  const detail = data?.detail ?? null;
  const votes = data?.votes ?? [];
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(config, detail ? session.address : '', detail?.vote_snapshot);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function getGovernor() {
    if (!session.address) throw new Error('Connect a wallet first.');
    if (!config.governorContractId) throw new Error('Missing governor contract id.');

    return new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      signTransaction: (async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
        address: opts?.address ?? session.address
      }))
    });
  }

  async function submitVote(voteType: number) {
    if (!detail) return;
    setBusy(true);
    setStatus('Submitting vote...');
    setTxHash('');

    try {
      const governor = await getGovernor();
      const assembled = await governor.cast_vote({
        proposal_id: proposalIdToBuffer(proposalId),
        vote_type: voteType,
        reason: voteReason,
        voter: session.address
      });
      const sent = await assembled.signAndSend();
      setStatus('Vote submitted');
      setTxHash(sent.sendTransactionResponse?.hash ?? '');
      setVoteReason('');
      setSelectedVoteType(null);
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
    setTxHash('');

    try {
      const governor = await getGovernor();
      const args = normalizeProposalCallArgs(detail.args);
      const payload = {
        targets: detail.targets,
        functions: detail.functions,
        args,
        description_hash: descriptionHash(detail.description),
        eta: Math.floor(Date.now() / 1000) + 60,
        operator: session.address
      };

      console.log('[proposal queue] calling governor.queue', {
        proposalId,
        caller: session.address,
        governorContractId: config.governorContractId,
        treasuryContractId: config.treasuryContractId,
        state: detail.state,
        label: detail.label,
        args,
        payload: {
          ...payload,
          description_hash: `0x${payload.description_hash.toString('hex')}`
        }
      });

      const assembled = await governor.queue(payload);
      const sent = await assembled.signAndSend();
      setStatus('Proposal queued');
      setTxHash(sent.sendTransactionResponse?.hash ?? '');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Queue failed');
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    if (!detail || !config.treasuryContractId || !config.tokenContractId) return;
    if (detail.eta && Date.now() < detail.eta * 1000) {
      setStatus('Queued proposal is not ready to execute yet.');
      return;
    }
    setBusy(true);
    setStatus('Executing proposal...');
    setTxHash('');

    try {
      const governor = await getGovernor();
      const args = normalizeProposalCallArgs(detail.args);
      const assembled = await governor.execute({
        targets: detail.targets,
        functions: detail.functions,
        args,
        description_hash: descriptionHash(detail.description),
        executor: session.address
      });
      const sent = await assembled.signAndSend();
      setStatus('Proposal executed');
      setTxHash(sent.sendTransactionResponse?.hash ?? '');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

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
        title={detail ? detail.metadata.title : `Proposal ${shortenProposalId(proposalId)}`}
        description="Live vote state, indexed votes, and proposal actions for the selected governance item."
      >
        <Stack gap="4">
          {detail ? <ProposalOverview detail={detail} now={now} network={config.name} /> : null}
          {errorMessage ? <Text className="lede" style={{ margin: 0 }}>{errorMessage}</Text> : null}

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <ProposalVoteSummary votes={votes} quorumVotes={detail?.quorumVotes ?? null} />
            {detail && actionMode === 'vote' ? (
              <ProposalVotePanel
                canVote={true}
                busy={busy}
                voteReason={voteReason}
                selectedVoteType={selectedVoteType}
                votingPower={votingPower?.votes.toString() ?? null}
                votingPowerLoading={votingPowerLoading}
                votingPowerError={votingPowerError?.message ?? ''}
                onVoteReasonChange={setVoteReason}
                onSelectedVoteTypeChange={setSelectedVoteType}
                onVote={(voteType) => void submitVote(voteType)}
                currentVote={currentVote ? { label: voteLabelForSupport(currentVote.support), reason: currentVote.reason } : null}
              />
            ) : null}
            {detail && actionMode === 'queue' ? (
              <ProposalQueuePanel busy={busy} onQueue={() => void queueProposal()} />
            ) : null}
            {detail && actionMode === 'execute' ? (
              <ProposalExecutePanel busy={busy} now={now} eta={detail.eta} onExecute={() => void executeProposal()} />
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
            {txHash ? <Text className="lede" style={{ margin: 0 }}><TxExplorerLink network={config.name} txHash={txHash} /></Text> : null}
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
