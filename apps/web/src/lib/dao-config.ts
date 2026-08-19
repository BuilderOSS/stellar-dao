export type DaoNetworkName = 'local' | 'testnet';

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
  tokenMercuryProgramId: string;
  governorMercuryProgramId: string;
  treasuryMercuryProgramId: string;
  tokenMercuryProject: string;
  governorMercuryProject: string;
  treasuryMercuryProject: string;
};

const defaultAdminAddress = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';

export function getDefaultDaoNetwork(): DaoNetworkName {
  const value = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return value === 'testnet' ? 'testnet' : 'local';
}

export function getDaoNetworkConfig(name: DaoNetworkName): DaoNetworkConfig {
  return {
    name,
    label: name === 'testnet' ? 'Testnet' : 'Local',
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? 'http://localhost:8000/rpc',
    passphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Standalone Network ; February 2017',
    tokenName: process.env.NEXT_PUBLIC_STELLAR_TOKEN_NAME ?? 'DAO Token',
    tokenDescription: process.env.NEXT_PUBLIC_STELLAR_TOKEN_DESCRIPTION ?? 'A single-DAO governance interface for voting, treasury execution, token details, and admin minting.',
    adminAddress: process.env.NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS ?? defaultAdminAddress,
    tokenContractId: process.env.NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_ID ?? '',
    governorContractId: process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_CONTRACT_ID ?? '',
    treasuryContractId: process.env.NEXT_PUBLIC_STELLAR_TREASURY_CONTRACT_ID ?? '',
    tokenMercuryProgramId: process.env.NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROGRAM_ID ?? '',
    governorMercuryProgramId: process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROGRAM_ID ?? '',
    treasuryMercuryProgramId: process.env.NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROGRAM_ID ?? '',
    tokenMercuryProject: process.env.NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROJECT ?? '',
    governorMercuryProject: process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROJECT ?? '',
    treasuryMercuryProject: process.env.NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROJECT ?? ''
  };
}
