export type DaoNetworkName = 'local' | 'testnet';

export type DaoNetworkConfig = {
  name: DaoNetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  adminAddress: string;
  tokenContractId: string;
  governorContractId: string;
  treasuryContractId: string;
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
    adminAddress: process.env.NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS ?? defaultAdminAddress,
    tokenContractId: process.env.NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_ID ?? '',
    governorContractId: process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_ID ?? '',
    treasuryContractId: process.env.NEXT_PUBLIC_STELLAR_TREASURY_ID ?? ''
  };
}
