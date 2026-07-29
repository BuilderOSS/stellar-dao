import { Client as ArenaClient } from '@punch-arena/arena-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { TransactionBuilder, rpc } from '@stellar/stellar-sdk';

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

export function createArenaClient(network: NetworkConfig) {
  if (!network.contractId) {
    return null;
  }

  return new ArenaClient({
    contractId: network.contractId,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.passphrase,
    allowHttp: network.name === 'local'
  });
}

function normalizeWalletError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Wallet signing failed';
  return { code: -1, message };
}

function normalizeSubmitError(error: unknown) {
  return error instanceof Error ? error : new Error('Transaction submission failed');
}

export function createArenaActionClient(network: NetworkConfig, address: string) {
  if (!network.contractId) {
    return null;
  }

  return new ArenaClient({
    contractId: network.contractId,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.passphrase,
    allowHttp: network.name === 'local',
    publicKey: address,
    signTransaction: async (xdr, opts) => {
      try {
        return await StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: opts?.networkPassphrase ?? network.passphrase,
          address: opts?.address ?? address
        });
      } catch (error) {
        return { signedTxXdr: '', error: normalizeWalletError(error) };
      }
    },
    signAuthEntry: async (authEntry, opts) => {
      try {
        return await StellarWalletsKit.signAuthEntry(authEntry, {
          networkPassphrase: opts?.networkPassphrase ?? network.passphrase,
          address: opts?.address ?? address
        });
      } catch (error) {
        return { signedAuthEntry: '', error: normalizeWalletError(error) };
      }
    }
  });
}

export async function signArenaTransaction(network: NetworkConfig, xdr: string, address: string) {
  const result = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: network.passphrase,
    address
  });

  if (result.signedTxXdr) {
    return result.signedTxXdr;
  }

  throw normalizeWalletError(new Error('Wallet signing failed'));
}

export async function submitArenaTransaction(network: NetworkConfig, signedTxXdr: string) {
  try {
    const server = new rpc.Server(network.rpcUrl);
    const transaction = TransactionBuilder.fromXDR(signedTxXdr, network.passphrase);
    return await server.sendTransaction(transaction);
  } catch (error) {
    throw normalizeSubmitError(error);
  }
}
