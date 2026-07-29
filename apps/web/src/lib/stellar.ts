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
  adminAddress: string;
};

const defaultAdminAddress = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';

export function getNetworkConfig(name: NetworkName): NetworkConfig {
  if (name === 'testnet') {
    return {
      name,
      label: 'Testnet',
      rpcUrl: process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL ?? 'https://soroban-testnet.stellar.org',
      passphrase:
        process.env.NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
      contractId: process.env.NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID ?? '',
      adminAddress: process.env.NEXT_PUBLIC_STELLAR_TESTNET_ADMIN_ADDRESS ?? defaultAdminAddress
    };
  }

  return {
    name,
    label: 'Local',
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL ?? 'http://localhost:8000/rpc',
    passphrase:
      process.env.NEXT_PUBLIC_STELLAR_LOCAL_NETWORK_PASSPHRASE ?? 'Standalone Network ; February 2017',
    contractId: process.env.NEXT_PUBLIC_STELLAR_LOCAL_CONTRACT_ID ?? '',
    adminAddress: process.env.NEXT_PUBLIC_STELLAR_LOCAL_ADMIN_ADDRESS ?? defaultAdminAddress
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

function createRpcServer(network: NetworkConfig) {
  return new rpc.Server(network.rpcUrl, { allowHttp: network.name === 'local' });
}

export async function ensureArenaAccountExists(network: NetworkConfig, address: string) {
  try {
    await createRpcServer(network).getAccount(address);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account lookup failed';
    if (message.toLowerCase().includes('account not found')) {
      return false;
    }
    throw normalizeSubmitError(error);
  }
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

  const resultError = 'error' in result ? (result.error as { message?: string } | undefined) : undefined;
  const message = resultError?.message ?? 'Wallet signing failed';
  throw new Error(message);
}

export async function selectArenaWallet() {
  const result = await StellarWalletsKit.authModal();
  return result.address;
}

export async function submitArenaTransaction(network: NetworkConfig, signedTxXdr: string) {
  try {
    const server = createRpcServer(network);
    const transaction = TransactionBuilder.fromXDR(signedTxXdr, network.passphrase);
    const response = await server.sendTransaction(transaction);
    if (response.status === 'ERROR') {
      throw new Error(response.errorResult ? response.errorResult.toString() : 'Transaction rejected by network');
    }
    return response;
  } catch (error) {
    throw normalizeSubmitError(error);
  }
}
