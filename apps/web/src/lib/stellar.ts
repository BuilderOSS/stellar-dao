import { Client as CounterClient } from '@punch-counter/contracts-counter';

export type NetworkName = 'local' | 'testnet';

export type NetworkConfig = {
  name: NetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  contractId: string;
};

export function getNetworkConfig(name: NetworkName): NetworkConfig {
  if (name === 'testnet') {
    return {
      name,
      label: 'Testnet',
      rpcUrl: process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL ?? 'https://soroban-testnet.stellar.org',
      passphrase:
        process.env.NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
      contractId: process.env.NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID ?? ''
    };
  }

  return {
    name,
    label: 'Local',
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL ?? 'http://localhost:8000/rpc',
    passphrase:
      process.env.NEXT_PUBLIC_STELLAR_LOCAL_NETWORK_PASSPHRASE ?? 'Standalone Network ; February 2017',
    contractId: process.env.NEXT_PUBLIC_STELLAR_LOCAL_CONTRACT_ID ?? ''
  };
}

export function getDefaultNetwork(): NetworkName {
  const value = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return value === 'testnet' ? 'testnet' : 'local';
}

export function createCounterClient(network: NetworkConfig) {
  if (!network.contractId) {
    return null;
  }

  return new CounterClient({
    contractId: network.contractId,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.passphrase,
    allowHttp: network.name === 'local'
  });
}
