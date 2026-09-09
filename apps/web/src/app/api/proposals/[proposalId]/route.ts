import { NextResponse } from 'next/server';
import { Client as GovernorClient } from '@stellar-dao/governor-bindings';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { getGoldskyProposalDetail } from '@/lib/goldsky';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { parseProposalMetadata } from '@/lib/proposal-metadata';
import { ProposalState, proposalStateFromLabel, proposalStateLabel } from '@/lib/proposal-state';

export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  if (!config.governorContractId) {
    return NextResponse.json({ message: 'Missing governor contract id' }, { status: 400 });
  }

  try {
    const { proposal } = await getGoldskyProposalDetail(proposalId);

    try {
      const client = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: config.adminAddress
      });

      const proposalBuffer = proposalIdToBuffer(proposalId);
      const [stateTx, deadlineTx, snapshotTx, proposerTx] = await Promise.all([
        client.proposal_state({ proposal_id: proposalBuffer }),
        client.proposal_deadline({ proposal_id: proposalBuffer }),
        client.proposal_snapshot({ proposal_id: proposalBuffer }),
        client.proposal_proposer({ proposal_id: proposalBuffer })
      ]);
      let quorumVotes: string | null = null;
      try {
        const quorumTx = await client.quorum({ ledger: snapshotTx.result });
        quorumVotes = quorumTx.result.toString();
      } catch {
        quorumVotes = null;
      }

      const payload = {
        proposalId: proposal.proposal_id,
        proposalNumber: proposal.proposal_number,
        description: proposal.description,
        title: proposal.title,
        metadata: parseProposalMetadata(proposal.description ?? ''),
        proposer: proposal.proposer || proposerTx.result,
        vote_end: proposal.vote_end_ledger || deadlineTx.result,
        vote_snapshot: proposal.vote_snapshot_ledger || snapshotTx.result,
        vote_start: proposal.vote_start_timestamp || snapshotTx.result + 1,
        deadline: proposal.vote_end_ledger || deadlineTx.result,
        eta: proposal.eta,
        state: stateTx.result,
        label: proposalStateLabel(stateTx.result),
        quorumVotes,
        ledger: Number(proposal.created_at_ledger ?? 0),
        timestamp: Number(proposal.created_at_timestamp ?? 0),
        for_votes: proposal.for_votes,
        against_votes: proposal.against_votes,
        abstain_votes: proposal.abstain_votes
      };

      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(
        {
          proposalId: proposal.proposal_id,
          proposalNumber: proposal.proposal_number,
          description: proposal.description,
          title: proposal.title,
          metadata: parseProposalMetadata(proposal.description ?? ''),
          proposer: proposal.proposer,
          vote_end: proposal.vote_end_ledger,
          vote_snapshot: proposal.vote_snapshot_ledger,
          vote_start: proposal.vote_start_timestamp,
          deadline: proposal.vote_end_ledger,
          eta: proposal.eta,
          state: proposalStateFromLabel(proposal.current_state) ?? ProposalState.Pending,
          label: proposal.current_state || 'Pending',
          quorumVotes: null,
          ledger: Number(proposal.created_at_ledger ?? 0),
          timestamp: Number(proposal.created_at_timestamp ?? 0),
          for_votes: proposal.for_votes,
          against_votes: proposal.against_votes,
          abstain_votes: proposal.abstain_votes
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Proposal unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
