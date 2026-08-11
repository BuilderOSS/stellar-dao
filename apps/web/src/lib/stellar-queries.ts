import useSWR from 'swr';
import { createArenaClient, getNetworkConfig, type NetworkConfig, type NetworkName } from '@/lib/stellar';

export type ContractDashboardReadState = {
  loading: boolean;
  error: string;
  syncedAt: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: string;
  totalSupply: string;
  actionCount: string;
  cooldownDuration: string;
  balance: string;
  isOnCooldown: string;
  cooldownRemaining: string;
  allowance: string;
  totalPunches: string;
  totalKicks: string;
  lastAction: string;
  battleWins: string;
  battleLosses: string;
  totalBattles: string;
};

export const emptyContractDashboardState: ContractDashboardReadState = {
  loading: false,
  error: '',
  syncedAt: '',
  tokenName: '—',
  tokenSymbol: '—',
  decimals: '—',
  totalSupply: '—',
  actionCount: '—',
  cooldownDuration: '—',
  balance: '—',
  isOnCooldown: '—',
  cooldownRemaining: '—',
  allowance: '—',
  totalPunches: '—',
  totalKicks: '—',
  lastAction: '—',
  battleWins: '—',
  battleLosses: '—',
  totalBattles: '—'
};

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

function formatDateTime(value: number) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value * 1000));
  } catch {
    return String(value);
  }
}

async function readContractDashboardState(
  network: NetworkConfig,
  watchAddress: string,
  spenderAddress: string
): Promise<ContractDashboardReadState> {
  const client = createArenaClient(network);
  if (!client) {
    return { ...emptyContractDashboardState, error: 'Set a contract id first' };
  }

  const overview = await Promise.all([
    client.name(),
    client.symbol(),
    client.decimals(),
    client.get_total_supply(),
    client.get_action_count(),
    client.get_cooldown_duration()
  ]);

  const nextState: ContractDashboardReadState = {
    loading: false,
    error: '',
    syncedAt: new Date().toISOString(),
    tokenName: overview[0].result,
    tokenSymbol: overview[1].result,
    decimals: String(overview[2].result),
    totalSupply: overview[3].result.toString(),
    actionCount: overview[4].result.toString(),
    cooldownDuration: overview[5].result.toString(),
    balance: '—',
    isOnCooldown: '—',
    cooldownRemaining: '—',
    allowance: '—',
    totalPunches: '—',
    totalKicks: '—',
    lastAction: '—',
    battleWins: '—',
    battleLosses: '—',
    totalBattles: '—'
  };

  if (watchAddress) {
    const [balanceTx, cooldownTx, cooldownRemainingTx, statsTx, battleTx] = await Promise.all([
      client.balance({ id: watchAddress }),
      client.is_on_cooldown({ user: watchAddress }),
      client.cooldown_remaining({ user: watchAddress }),
      client.get_stats({ user: watchAddress }),
      client.get_battle_record({ user: watchAddress })
    ]);

    nextState.balance = balanceTx.result.toString();
    nextState.isOnCooldown = formatBoolean(cooldownTx.result);
    nextState.cooldownRemaining = cooldownRemainingTx.result.toString();
    nextState.totalPunches = statsTx.result?.total_punches?.toString() ?? '0';
    nextState.totalKicks = statsTx.result?.total_kicks?.toString() ?? '0';
    nextState.lastAction = statsTx.result?.last_action ? formatDateTime(Number(statsTx.result.last_action)) : '—';
    nextState.battleWins = battleTx.result?.wins?.toString() ?? '0';
    nextState.battleLosses = battleTx.result?.losses?.toString() ?? '0';
    nextState.totalBattles = battleTx.result?.total_battles?.toString() ?? '0';
  }

  if (watchAddress && spenderAddress) {
    const allowanceTx = await client.allowance({ from: watchAddress, spender: spenderAddress });
    nextState.allowance = allowanceTx.result.toString();
  }

  return nextState;
}

export function useContractDashboardReads(network: NetworkName, watchAddress: string, spenderAddress: string) {
  const currentNetwork = getNetworkConfig(network);
  const key = [network, currentNetwork.contractId, watchAddress, spenderAddress] as const;

  return useSWR<ContractDashboardReadState>(key, () => readContractDashboardState(currentNetwork, watchAddress, spenderAddress), {
    keepPreviousData: true,
    revalidateOnFocus: false
  });
}
