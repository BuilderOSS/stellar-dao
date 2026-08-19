import useSWR from 'swr';
import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { Server } from '@stellar/stellar-sdk/rpc';
import type { DaoNetworkConfig } from '@/lib/dao-config';

export type GovernorSettings = {
  votingDelay: number;
  votingPeriod: number;
  proposalThreshold: bigint;
  quorumBps: number;
  latestLedger: number;
};

type GovernorReadClient = {
  voting_delay: () => Promise<{ result: number }>;
  voting_period: () => Promise<{ result: number }>;
  proposal_threshold: () => Promise<{ result: bigint }>;
  quorum_bps: () => Promise<{ result: number }>;
};

type GovernorSettingsKey = readonly ['governor-settings', string, string, string, string];

async function fetchGovernorSettings([, contractId, rpcUrl, passphrase, publicKey]: GovernorSettingsKey) {
  if (!contractId) {
    throw new Error('Missing governor contract id in the active network config.');
  }

  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const [latestLedger, client] = await Promise.all([
    server.getLatestLedger(),
    ContractClient.from<GovernorReadClient>({
      contractId,
      rpcUrl,
      networkPassphrase: passphrase,
      publicKey
    })
  ]);

  const [votingDelay, votingPeriod, proposalThreshold, quorumBps] = await Promise.all([
    client.voting_delay(),
    client.voting_period(),
    client.proposal_threshold(),
    client.quorum_bps()
  ]);

  return {
    votingDelay: votingDelay.result,
    votingPeriod: votingPeriod.result,
    proposalThreshold: proposalThreshold.result,
    quorumBps: quorumBps.result,
    latestLedger: latestLedger.sequence
  } satisfies GovernorSettings;
}

export function useGovernorSettings(config: DaoNetworkConfig, publicKey: string) {
  const key = config.governorContractId && publicKey ? (['governor-settings', config.governorContractId, config.rpcUrl, config.passphrase, publicKey] as const) : null;
  return useSWR(key, fetchGovernorSettings, { keepPreviousData: true });
}
