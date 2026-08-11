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
const knownArenaErrorMessages = [
  'Still on cooldown',
  'Contract already initialized',
  'Not authorized',
  'Insufficient balance to burn',
  'Insufficient balance',
  'Insufficient allowance',
  'This wallet does not exist',
  'Account not found'
];

function cleanErrorText(value: string) {
  return value
    .replace(/^Error:\s*/i, '')
    .replace(/^Error\((.*)\)$/i, '$1')
    .replace(/^HostError:\s*/i, '')
    .trim();
}

function collectErrorTexts(value: unknown, seen = new Set<unknown>(), depth = 0): string[] {
  if (value === null || typeof value === 'undefined' || depth > 5) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return [String(value)];
  if (seen.has(value)) return [];
  seen.add(value);

  if (value instanceof Error) {
    return [value.name, value.message, ...collectErrorTexts(value.cause, seen, depth + 1)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectErrorTexts(entry, seen, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.flatMap(([key, entry]) => [key, ...collectErrorTexts(entry, seen, depth + 1)]);
  }

  return [];
}

export function formatArenaError(error: unknown, fallback = 'Transaction failed') {
  const collected = collectErrorTexts(error)
    .map(cleanErrorText)
    .filter(Boolean);

  const joined = collected.join(' | ').toLowerCase();

  for (const message of knownArenaErrorMessages) {
    if (joined.includes(message.toLowerCase())) {
      return message;
    }
  }

  if (joined.includes('cooldown')) {
    return 'Still on cooldown';
  }

  const firstMeaningful = collected.find((message) => !message.toLowerCase().startsWith('hosterror'));
  return firstMeaningful ?? fallback;
}

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
  const message = formatArenaError(error, 'Wallet signing failed');
  return { code: -1, message };
}

function normalizeSubmitError(error: unknown) {
  return new Error(formatArenaError(error, 'Transaction submission failed'));
}

function createRpcServer(network: NetworkConfig) {
  return new rpc.Server(network.rpcUrl, { allowHttp: network.name === 'local' });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  throw new Error(formatArenaError('error' in result ? result.error : result, 'Wallet signing failed'));
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
      throw new Error(formatArenaError(response.errorResult ?? response, 'Transaction rejected by network'));
    }
    return response;
  } catch (error) {
    throw normalizeSubmitError(error);
  }
}

export async function waitForArenaTransactionConfirmation(network: NetworkConfig, hash: string, timeoutMs = 60_000) {
  const server = createRpcServer(network);
  const startedAt = Date.now();
  let delayMs = 1000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await server.getTransaction(hash);
    if (response.status === 'SUCCESS') {
      return response;
    }

    if (response.status === 'FAILED') {
      throw new Error('Transaction failed on-chain');
    }

    await sleep(delayMs);
    delayMs = Math.min(Math.round(delayMs * 1.5), 5000);
  }

  throw new Error('Transaction still pending');
}

export async function submitAndConfirmArenaTransaction(network: NetworkConfig, signedTxXdr: string) {
  const submission = await submitArenaTransaction(network, signedTxXdr);
  const confirmation = await waitForArenaTransactionConfirmation(network, submission.hash);
  return { submission, confirmation };
}
