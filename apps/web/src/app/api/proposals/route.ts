import { NextResponse } from 'next/server';
import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { getMercuryActivityFeed, getMercuryProposalDetail } from '@/lib/mercury';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { parseProposalMetadata, type ProposalMetadata } from '@/lib/proposal-metadata';
import { proposalStateLabel, type ProposalState as ProposalStateValue } from '@/lib/proposal-state';

type GovernorClient = {
  proposal_state: (args: { proposal_id: Buffer }) => Promise<{ result: ProposalStateValue }>;
};

type ProposalListItem = {
  proposalId: string;
  metadata: ProposalMetadata;
  state: ProposalStateValue | null;
  stateLabel: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

type ProposalGroup = {
  proposalId: string;
  latestLedger: number;
  latestTimestamp: number;
};

async function fetchProposalState(client: ContractClient<GovernorClient>, proposalId: string) {
  const proposalBuffer = proposalIdToBuffer(proposalId);
  const stateTx = await client.proposal_state({ proposal_id: proposalBuffer });
  return stateTx.result;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '24'), 100));
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  if (!config.governorContractId) {
    return NextResponse.json({ items: [], generatedAt: new Date().toISOString(), message: 'Missing governor contract id' }, { status: 400 });
  }

  try {
    const feed = await getMercuryActivityFeed(limit * 6);
    const groups = new Map<string, ProposalGroup>();

    for (const item of feed.items) {
      if (item.programKey !== 'governor' || !item.proposalId) {
        continue;
      }

      const current = groups.get(item.proposalId);
      if (!current) {
        groups.set(item.proposalId, {
          proposalId: item.proposalId,
          latestLedger: item.ledger,
          latestTimestamp: item.timestamp
        });
        continue;
      }

      current.latestLedger = Math.max(current.latestLedger, item.ledger);
      current.latestTimestamp = Math.max(current.latestTimestamp, item.timestamp);
    }

    const client = await ContractClient.from<GovernorClient>({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: config.adminAddress
    });

    const items = await Promise.all(
      [...groups.values()]
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp || b.latestLedger - a.latestLedger)
        .slice(0, limit)
        .map(async (group): Promise<ProposalListItem> => {
          const detail = await getMercuryProposalDetail(group.proposalId).catch(() => null);
          const metadata = parseProposalMetadata(detail?.description ?? '');

          try {
            const state = await fetchProposalState(client, group.proposalId);
            return {
              proposalId: group.proposalId,
              metadata,
              state,
              stateLabel: proposalStateLabel(state),
              ledger: detail?.ledger ?? group.latestLedger,
              timestamp: detail?.timestamp ?? group.latestTimestamp,
              txHash: detail?.txHash ?? '',
              contractId: detail?.contractId ?? ''
            };
          } catch {
            return {
              proposalId: group.proposalId,
              metadata,
              state: null,
              stateLabel: 'Unknown',
              ledger: detail?.ledger ?? group.latestLedger,
              timestamp: detail?.timestamp ?? group.latestTimestamp,
              txHash: detail?.txHash ?? '',
              contractId: detail?.contractId ?? ''
            };
          }
        })
    );

    return NextResponse.json({ items, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { items: [], generatedAt: new Date().toISOString(), message: error instanceof Error ? error.message : 'Proposal list unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
