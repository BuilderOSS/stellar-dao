import type { DaoNetworkConfig } from './dao-config';

export function getDaoAccountRole(config: DaoNetworkConfig, address: string) {
  if (address === config.auctionContractId) return 'Auction contract';
  if (address === config.treasuryContractId) return 'Treasury contract';
  return null;
}
