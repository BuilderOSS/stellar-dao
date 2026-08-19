import { NextResponse } from 'next/server';
import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { getMercuryProposalDetail } from '@/lib/mercury';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { parseProposalMetadata } from '@/lib/proposal-metadata';
import { ProposalState, proposalStateLabel, type ProposalState as ProposalStateValue } from '@/lib/proposal-state';

type GovernorClient = {
  proposal_state: (args: { proposal_id: Buffer }) => Promise<{ result: ProposalStateValue }>;
  proposal_deadline: (args: { proposal_id: Buffer }) => Promise<{ result: number }>;
  proposal_snapshot: (args: { proposal_id: Buffer }) => Promise<{ result: number }>;
  proposal_proposer: (args: { proposal_id: Buffer }) => Promise<{ result: string }>;
};

export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  if (!config.governorContractId) {
    return NextResponse.json({ message: 'Missing governor contract id' }, { status: 400 });
  }

  try {
    const detail = await getMercuryProposalDetail(proposalId);

    try {
      const client = await ContractClient.from<GovernorClient>({
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

      const payload = {
        ...detail,
        metadata: parseProposalMetadata(detail.description),
        proposer: detail.proposer || proposerTx.result,
        vote_end: detail.vote_end || deadlineTx.result,
        vote_snapshot: detail.vote_snapshot || snapshotTx.result,
        vote_start: detail.vote_start || snapshotTx.result + 1,
        deadline: detail.deadline || deadlineTx.result,
        state: stateTx.result,
        label: proposalStateLabel(stateTx.result)
      };

      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(
        {
          ...detail,
          metadata: parseProposalMetadata(detail.description),
          state: ProposalState.Pending,
          label: detail.label || 'Pending'
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
