import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run, runQuiet } from './lib.mjs';

const networkName = process.argv[2];

if (!networkName || !['local', 'testnet'].includes(networkName)) {
  throw new Error('Usage: node scripts/deploy-counter.mjs <local|testnet>');
}

const identityName = networkName === 'local' ? 'local-dev' : 'testnet-dev';
const envPath = 'apps/web/.env.local';
const rpcUrl =
  networkName === 'local'
    ? readLocalEnv('NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL') ?? 'http://localhost:8000/rpc'
    : 'https://soroban-testnet.stellar.org';
const networkPassphrase =
  networkName === 'local' ? 'Standalone Network ; February 2017' : 'Test SDF Network ; September 2015';
const salt = createHash('sha256').update(`punch-counter:${networkName}`).digest('hex');
const wasmPath = 'target/wasm32-unknown-unknown/release/arena.wasm';

function readLocalEnv(key) {
  if (!existsSync(envPath)) {
    return null;
  }

  const content = readFileSync(envPath, 'utf8');
  const line = content
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`));

  return line ? line.slice(key.length + 1).trim() : null;
}

run('stellar', ['contract', 'build', '--package', 'arena', '--out-dir', 'target/wasm32-unknown-unknown/release']);

runQuiet('stellar', ['keys', 'generate', identityName]);

if (networkName === 'local') {
  runQuiet('stellar', ['network', 'add', networkName, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase]);
  run('stellar', ['network', 'use', networkName]);
  runQuiet('stellar', ['keys', 'fund', identityName, '--network', networkName]);
} else {
  runQuiet('stellar', ['network', 'add', networkName, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase]);
  run('stellar', ['network', 'use', networkName]);
}

const id = runQuiet('stellar', ['contract', 'id', 'wasm', '--salt', salt, '--source-account', identityName, '--network', networkName]).stdout.trim();
const exists = runQuiet('stellar', ['contract', 'fetch', '--id', id, '--network', networkName]);

if (!exists.ok) {
  run('stellar', [
    'contract',
    'deploy',
    '--wasm',
    wasmPath,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--salt',
    salt,
    '--alias',
    `arena-${networkName}`
  ]);
}

const admin = runQuiet('stellar', ['keys', 'public-key', identityName]).stdout.trim();
runQuiet('stellar', [
  'contract',
  'invoke',
  '--id',
  id,
  '--source-account',
  identityName,
  '--network',
  networkName,
  '--',
  'initialize',
  '--admin',
  admin,
  '--name',
  'Punch Counter',
  '--symbol',
  'PUNCH',
  '--decimals',
  '7'
]);

mkdirSync('apps/web', { recursive: true });
writeFileSync(
  envPath,
  [
    `NEXT_PUBLIC_STELLAR_NETWORK=${networkName}`,
    'NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL=http://localhost:8000/rpc',
    'NEXT_PUBLIC_STELLAR_LOCAL_NETWORK_PASSPHRASE=Standalone Network ; February 2017',
    `NEXT_PUBLIC_STELLAR_LOCAL_CONTRACT_ID=${networkName === 'local' ? id : ''}`,
    'NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL=https://soroban-testnet.stellar.org',
    'NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE=Test SDF Network ; September 2015',
    `NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID=${networkName === 'testnet' ? id : ''}`
  ].join('\n') + '\n'
);

console.log(`Deployed ${networkName} contract ID: ${id}`);
