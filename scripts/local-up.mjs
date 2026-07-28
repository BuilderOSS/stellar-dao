import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { run, runQuiet } from './lib.mjs';

const containerName = 'stellar-punch-counter-local';
const networkName = 'local';
const identityName = 'local-dev';
const networkPassphrase = 'Standalone Network ; February 2017';
const salt = createHash('sha256').update(`punch-counter:${networkName}`).digest('hex');
const wasmPath = 'target/wasm32-unknown-unknown/release/counter.wasm';
const envPath = 'apps/web/.env.local';
let rpcUrl = 'http://localhost:8000/rpc';

function inspectContainerHostPort() {
  const inspect = runQuiet('docker', [
    'inspect',
    '-f',
    '{{(index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort}}',
    containerName
  ]);

  if (!inspect.ok) {
    return null;
  }

  const hostPort = inspect.stdout.trim();
  return hostPort || null;
}

function ensureContainer() {
  const running = runQuiet('docker', ['inspect', '-f', '{{.State.Running}}', containerName]);
  if (running.ok && running.stdout.trim() === 'true') {
    const mapped = inspectContainerHostPort();
    if (mapped) {
      rpcUrl = `http://localhost:${mapped}/rpc`;
    }
    return;
  }

  if (running.ok && running.stdout.trim() === 'false') {
    run('docker', ['start', containerName]);
    const mapped = inspectContainerHostPort();
    if (mapped) {
      rpcUrl = `http://localhost:${mapped}/rpc`;
    }
    return;
  }

  const candidatePorts = [8000, 8001, 8002, 8003];
  for (const port of candidatePorts) {
    const started = runQuiet('stellar', ['container', 'start', 'local', '--name', 'punch-counter-local', '--ports-mapping', `${port}:8000`]);
    if (started.ok) {
      rpcUrl = `http://localhost:${port}/rpc`;
      return;
    }

    const stderr = `${started.stderr}\n${started.stdout}`;
    if (stderr.includes('already running')) {
      const mapped = inspectContainerHostPort();
      if (mapped) {
        rpcUrl = `http://localhost:${mapped}/rpc`;
        return;
      }
    }

    if (!stderr.includes('port is already allocated') && !stderr.includes('Bind for 0.0.0.0')) {
      throw new Error(stderr || `Failed to start local Stellar container on port ${port}`);
    }
  }

  throw new Error('Could not find a free port for the local Stellar container');
}

function ensureNetwork() {
  runQuiet('stellar', ['network', 'add', networkName, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase]);
  run('stellar', ['network', 'use', networkName]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureIdentity() {
  runQuiet('stellar', ['keys', 'generate', identityName]);

  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = runQuiet('stellar', ['keys', 'fund', identityName, '--network', networkName]);
    if (result.ok) {
      return;
    }

    lastError = result.stderr || result.stdout || 'Failed to fund local identity';
    await sleep(2000);
  }

  throw new Error(lastError);
}

function contractId() {
  return runQuiet('stellar', ['contract', 'id', 'wasm', '--salt', salt, '--source-account', identityName, '--network', networkName]).stdout.trim();
}

function deployAndInit(id) {
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
      'counter-local'
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
}

function writeEnv(id) {
  mkdirSync('apps/web', { recursive: true });
  writeFileSync(
    envPath,
    [
      'NEXT_PUBLIC_STELLAR_NETWORK=local',
      `NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL=${rpcUrl}`,
      `NEXT_PUBLIC_STELLAR_LOCAL_NETWORK_PASSPHRASE=${networkPassphrase}`,
      `NEXT_PUBLIC_STELLAR_LOCAL_CONTRACT_ID=${id}`,
      'NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL=https://soroban-testnet.stellar.org',
      'NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE=Test SDF Network ; September 2015',
      'NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID='
    ].join('\n') + '\n'
  );
}

run('stellar', ['contract', 'build', '--package', 'counter', '--out-dir', 'target/wasm32-unknown-unknown/release']);
ensureContainer();
ensureNetwork();
await ensureIdentity();
const id = contractId();
deployAndInit(id);
writeEnv(id);

console.log(`Local network ready. Contract ID: ${id}`);
