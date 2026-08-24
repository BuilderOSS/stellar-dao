import { getDeployment, type DeploymentNetwork } from '@/config/deployments.generated';

export type DaoNetworkName = DeploymentNetwork;

export type DaoNetworkConfig = {
  name: DaoNetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  tokenName: string;
  tokenDescription: string;
  adminAddress: string;
  tokenContractId: string;
  governorContractId: string;
  treasuryContractId: string;
  auctionContractId: string;
  tokenMercuryProgramId: string;
  governorMercuryProgramId: string;
  treasuryMercuryProgramId: string;
  tokenMercuryProject: string;
  governorMercuryProject: string;
  treasuryMercuryProject: string;
  auctionMercuryProgramId: string;
  auctionMercuryProject: string;
};

export function getDefaultDaoNetwork(): DaoNetworkName {
  const network = process.env.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = process.env.NEXT_PUBLIC_DAO_LABEL || 'local';

  // This will throw if deployment not found - fail fast
  const deployment = getDeployment(network, label);
  return deployment.network as DaoNetworkName;
}

export function getDaoNetworkConfig(name: DaoNetworkName): DaoNetworkConfig {
  const network = process.env.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = process.env.NEXT_PUBLIC_DAO_LABEL || 'local';
  const deployment = getDeployment(network, label);

  return {
    name: deployment.network as DaoNetworkName,
    label: deployment.label,
    rpcUrl: deployment.config.rpcUrl,
    passphrase: deployment.config.networkPassphrase,
    tokenName: deployment.config.token.name,
    tokenDescription: deployment.config.token.description,
    adminAddress: deployment.config.adminAddress,
    tokenContractId: deployment.contracts.token,
    governorContractId: deployment.contracts.governor,
    treasuryContractId: deployment.contracts.treasury,
    auctionContractId: deployment.contracts.auction,
    tokenMercuryProgramId: String(deployment.mercury?.programs?.token?.program_id || ''),
    governorMercuryProgramId: String(deployment.mercury?.programs?.governor?.program_id || ''),
    treasuryMercuryProgramId: String(deployment.mercury?.programs?.treasury?.program_id || ''),
    tokenMercuryProject: deployment.mercury?.programs?.token?.project || '',
    governorMercuryProject: deployment.mercury?.programs?.governor?.project || '',
    treasuryMercuryProject: deployment.mercury?.programs?.treasury?.project || '',
    auctionMercuryProgramId: String(deployment.mercury?.programs?.auction?.program_id || ''),
    auctionMercuryProject: deployment.mercury?.programs?.auction?.project || ''
  };
}
