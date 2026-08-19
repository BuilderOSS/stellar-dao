import { NextResponse } from 'next/server';
import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { getMercuryActivityFeed } from '@/lib/mercury';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { proposalStateLabel, type ProposalState as ProposalStateValue } from '@/lib/proposal-state';

type GovernorClient = {
  proposal_state: (args: { proposal_id: Buffer }) => Promise<{ result: ProposalStateValue }>;
};

type ProposalListItem = {
  proposalId: string;
  title: string;
  summary: string;
  state: ProposalStateValue | null;
  stateLabel: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

type ProposalGroup = {
  proposalId: string;
  created?: {
    title: string;
    summary: string;
    ledger: number;
    timestamp: number;
    txHash: string;
    contractId: string;
  };
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
      const created = item.title === 'Proposal Created'
        ? {
            title: item.title,
            summary: item.summary,
            ledger: item.ledger,
            timestamp: item.timestamp,
            txHash: item.txHash,
            contractId: item.contractId
          }
        : undefined;

      if (!current) {
        groups.set(item.proposalId, {
          proposalId: item.proposalId,
          created,
          latestLedger: item.ledger,
          latestTimestamp: item.timestamp
        });
        continue;
      }

      current.latestLedger = Math.max(current.latestLedger, item.ledger);
      current.latestTimestamp = Math.max(current.latestTimestamp, item.timestamp);
      if (!current.created && created) {
        current.created = created;
      }
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
          const created = group.created ?? {
            title: 'Proposal',
            summary: 'Proposal details unavailable.',
            ledger: group.latestLedger,
            timestamp: group.latestTimestamp,
            txHash: '',
            contractId: ''
          };

          try {
            const state = await fetchProposalState(client, group.proposalId);
            return {
              proposalId: group.proposalId,
              title: created.title,
              summary: created.summary,
              state,
              stateLabel: proposalStateLabel(state),
              ledger: created.ledger,
              timestamp: created.timestamp,
              txHash: created.txHash,
              contractId: created.contractId
            };
          } catch {
            return {
              proposalId: group.proposalId,
              title: created.title,
              summary: created.summary,
              state: null,
              stateLabel: 'Unknown',
              ledger: created.ledger,
              timestamp: created.timestamp,
              txHash: created.txHash,
              contractId: created.contractId
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
