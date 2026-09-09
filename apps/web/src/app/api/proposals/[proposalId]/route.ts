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

      const proposalBuffer = proposalIdToBuffer(proposal.proposal_id);
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

      const metadata = parseProposalMetadata(proposal.description ?? '');
      const payload = {
        proposalId: proposal.proposal_id,
        proposalNumber: proposal.proposal_number,
        description: proposal.description,
        title: metadata.title,
        metadata,
        proposer: proposal.proposer || proposerTx.result,
         vote_end: proposal.deadline_ledger ?? deadlineTx.result,
         vote_snapshot: proposal.snapshot_ledger ?? snapshotTx.result,
         vote_start: proposal.vote_start_timestamp ?? snapshotTx.result + 1,
         deadline: proposal.deadline_ledger ?? deadlineTx.result,
        eta: proposal.eta,
        state: stateTx.result,
        label: proposalStateLabel(stateTx.result),
        quorumVotes,
         ledger: Number(proposal.created_ledger ?? 0),
         timestamp: Number(proposal.created_timestamp ?? 0),
         for_votes: proposal.vote_summary?.for,
         against_votes: proposal.vote_summary?.against,
         abstain_votes: proposal.vote_summary?.abstain,
         targets: proposal.actions?.map((action: any) => action.target) ?? [],
         functions: proposal.actions?.map((action: any) => action.function) ?? [],
         args: proposal.actions?.map((action: any) => action.args) ?? []
      };

      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(
        {
          proposalId: proposal.proposal_id,
          proposalNumber: proposal.proposal_number,
          description: proposal.description,
          title: parseProposalMetadata(proposal.description ?? '').title,
          metadata: parseProposalMetadata(proposal.description ?? ''),
          proposer: proposal.proposer,
           vote_end: proposal.deadline_ledger,
           vote_snapshot: proposal.snapshot_ledger,
          vote_start: proposal.vote_start_timestamp,
           deadline: proposal.deadline_ledger,
          eta: proposal.eta,
           state: proposalStateFromLabel(proposal.state) ?? ProposalState.Pending,
           label: proposal.state || 'Pending',
          quorumVotes: null,
           ledger: Number(proposal.created_ledger ?? 0),
           timestamp: Number(proposal.created_timestamp ?? 0),
           for_votes: proposal.vote_summary?.for,
           against_votes: proposal.vote_summary?.against,
           abstain_votes: proposal.vote_summary?.abstain,
           targets: proposal.actions?.map((action: any) => action.target) ?? [],
           functions: proposal.actions?.map((action: any) => action.function) ?? [],
           args: proposal.actions?.map((action: any) => action.args) ?? []
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
