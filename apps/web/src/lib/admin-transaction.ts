import { Client as ContractClient, type SignTransaction } from '@stellar/stellar-sdk/contract';
import { BASE_FEE, Contract, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';
import { Server, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import type { DaoNetworkConfig } from '@/lib/dao-config';

type ContractCall = {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
};

type ContractSpec = {
  funcArgsToScVals: (name: string, args: object) => xdr.ScVal[];
};

const specCache = new Map<string, Promise<ContractSpec>>();

async function getContractSpec(config: DaoNetworkConfig, publicKey: string, contractId: string) {
  const cacheKey = `${config.rpcUrl}:${contractId}`;
  const cached = specCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = ContractClient.from<{ spec: ContractSpec }>({
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey
  }).then((client) => client.spec);

  specCache.set(cacheKey, promise);
  return promise;
}

export async function submitContractBatch({
  config,
  publicKey,
  signTransaction,
  calls,
  timeoutInSeconds = 30
}: {
  config: DaoNetworkConfig;
  publicKey: string;
  signTransaction: SignTransaction;
  calls: ContractCall[];
  timeoutInSeconds?: number;
}) {
  if (!calls.length) {
    throw new Error('No contract calls queued.');
  }

  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const account = await server.getAccount(publicKey);
  const builder = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * Math.max(calls.length, 1)).toString()
  })
    .setNetworkPassphrase(config.passphrase)
    .setTimeout(timeoutInSeconds);

  for (const call of calls) {
    const spec = await getContractSpec(config, publicKey, call.contractId);
    const contract = new Contract(call.contractId);
    builder.addOperation(contract.call(call.method, ...spec.funcArgsToScVals(call.method, call.args)));
  }

  const rawTransaction = builder.build();
  const simulation = await server.simulateTransaction(rawTransaction);
  if ('error' in simulation && simulation.error) {
    throw new Error(simulation.error);
  }

  const prepared = assembleTransaction(rawTransaction, simulation).build();
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: config.passphrase,
    address: publicKey
  });

  if (signed.error) {
    throw new Error(signed.error.message);
  }

  const finalTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase);
  const submitted = await server.sendTransaction(finalTransaction);
  if (submitted.status === 'ERROR' || submitted.status === 'TRY_AGAIN_LATER') {
    throw new Error(submitted.errorResult ? 'Transaction failed on-chain.' : `Transaction send failed: ${submitted.status}`);
  }

  const finalized = submitted.status === 'PENDING' || submitted.status === 'DUPLICATE'
    ? await server.pollTransaction(submitted.hash)
    : await server.getTransaction(submitted.hash);

  return {
    hash: submitted.hash,
    submitted,
    finalized
  };
}
