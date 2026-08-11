import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run, runQuiet } from './lib.mjs';

const networkName = process.argv[2];

if (!networkName || !['local', 'testnet'].includes(networkName)) {
  throw new Error('Usage: node scripts/deploy-dao.mjs <local|testnet>');
}

const identityName = networkName === 'local' ? 'local-dev' : 'testnet-dev';
const adminAddress = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';
const envPath = 'apps/web/.env.local';
const rootEnv = readEnvFile('.env');
const webBaseUrl =
  process.env.DAO_WEB_BASE_URL ?? rootEnv.DAO_WEB_BASE_URL ?? 'https://test-dao-stellar-web.vercel.app';
const tokenBaseUri = `${webBaseUrl.replace(/\/$/, '')}/api/token/`;
const rpcUrl =
  networkName === 'local'
    ? process.env.NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL ?? readLocalEnv('NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL') ?? 'http://localhost:8000/rpc'
    : 'https://soroban-testnet.stellar.org';
const networkPassphrase =
  networkName === 'local' ? 'Standalone Network ; February 2017' : 'Test SDF Network ; September 2015';
const saltSuffix = process.env.DAO_DEPLOY_SALT_SUFFIX?.trim() ?? '';
const contractBuildDir = 'target/wasm32v1-none/release';

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        return [key, value];
      })
  );
}

function readLocalEnv(key) {
  if (!existsSync(envPath)) {
    return null;
  }

  const content = readFileSync(envPath, 'utf8');
  const line = content.split('\n').find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function ensureNetwork() {
  runQuiet('stellar', ['network', 'add', networkName, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase]);
  run('stellar', ['network', 'use', networkName]);
}

function ensureIdentity() {
  runQuiet('stellar', ['keys', 'generate', identityName]);
  runQuiet('stellar', ['keys', 'fund', identityName, '--network', networkName]);
}

function wasmPath(packageName) {
  return `${contractBuildDir}/${packageName}.wasm`;
}

function wasmHash(packageName) {
  return createHash('sha256').update(readFileSync(wasmPath(packageName))).digest('hex');
}

function saltFor(packageName) {
  const hash = wasmHash(packageName);
  const seed = saltSuffix
    ? `dao:${networkName}:${packageName}:${hash}:${saltSuffix}`
    : `dao:${networkName}:${packageName}:${hash}`;
  return createHash('sha256').update(seed).digest('hex');
}

function contractId(packageName) {
  return runQuiet('stellar', [
    'contract',
    'id',
    'wasm',
    '--salt',
    saltFor(packageName),
    '--source-account',
    identityName,
    '--network',
    networkName
  ]).stdout.trim();
}

function deployIfMissing(packageName, alias, initArgs) {
  const id = contractId(packageName);
  const exists = runQuiet('stellar', ['contract', 'fetch', '--id', id, '--network', networkName]);

  if (!exists.ok) {
    run('stellar', [
      'contract',
      'deploy',
      '--alias',
      alias,
      '--wasm',
      wasmPath(packageName),
      '--source-account',
      identityName,
      '--network',
      networkName,
      '--salt',
      saltFor(packageName),
      '--',
      ...initArgs
    ]);
  }

  return id;
}

function writeEnvIfMissing(contracts) {
  if (existsSync(envPath)) {
    console.log(`Skipped writing ${envPath}; file already exists.`);
    console.log('Contract IDs:');
    console.log(`TOKEN=${contracts.token}`);
    console.log(`GOVERNOR=${contracts.governor}`);
    console.log(`TREASURY=${contracts.treasury}`);
    return;
  }

  mkdirSync('apps/web', { recursive: true });
  writeFileSync(
    envPath,
    [
      `NEXT_PUBLIC_STELLAR_NETWORK=${networkName}`,
      'NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL=http://localhost:8000/rpc',
      'NEXT_PUBLIC_STELLAR_LOCAL_NETWORK_PASSPHRASE=Standalone Network ; February 2017',
      `NEXT_PUBLIC_STELLAR_LOCAL_ADMIN_ADDRESS=${adminAddress}`,
      `NEXT_PUBLIC_STELLAR_LOCAL_TOKEN_CONTRACT_ID=${networkName === 'local' ? contracts.token : ''}`,
      `NEXT_PUBLIC_STELLAR_LOCAL_GOVERNOR_CONTRACT_ID=${networkName === 'local' ? contracts.governor : ''}`,
      `NEXT_PUBLIC_STELLAR_LOCAL_TREASURY_CONTRACT_ID=${networkName === 'local' ? contracts.treasury : ''}`,
      'NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL=https://soroban-testnet.stellar.org',
      'NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE=Test SDF Network ; September 2015',
      `NEXT_PUBLIC_STELLAR_TESTNET_ADMIN_ADDRESS=${adminAddress}`,
      `NEXT_PUBLIC_STELLAR_TESTNET_TOKEN_CONTRACT_ID=${networkName === 'testnet' ? contracts.token : ''}`,
      `NEXT_PUBLIC_STELLAR_TESTNET_GOVERNOR_CONTRACT_ID=${networkName === 'testnet' ? contracts.governor : ''}`,
      `NEXT_PUBLIC_STELLAR_TESTNET_TREASURY_CONTRACT_ID=${networkName === 'testnet' ? contracts.treasury : ''}`
    ].join('\n') + '\n'
  );
}

run('cargo', ['build', '-p', 'token', '-p', 'governor', '-p', 'treasury', '--release', '--target', 'wasm32v1-none'], {
  env: {
    ...process.env,
    SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2: '0'
  }
});
ensureNetwork();
ensureIdentity();

const token = contractId('token');
const treasury = contractId('treasury');
const governor = contractId('governor');

deployIfMissing('token', `dao-token-${networkName}`, [
  '--owner',
  adminAddress,
  '--uri',
  tokenBaseUri,
  '--name',
  'DAO Vote NFT',
  '--symbol',
  'vDAO'
]);

deployIfMissing('treasury', `dao-treasury-${networkName}`, [
  '--owner',
  adminAddress,
  '--governor',
  governor
]);

deployIfMissing('governor', `dao-governor-${networkName}`, [
  '--owner',
  adminAddress,
  '--token_contract',
  token,
  '--treasury_contract',
  treasury,
  '--voting_delay',
  '10',
  '--voting_period',
  '100',
  '--proposal_threshold',
  '1',
  '--quorum_bps',
  '1000'
]);

writeEnvIfMissing({ token, governor, treasury });

console.log(`Deployed ${networkName} DAO contracts:`);
console.log(`TOKEN=${token}`);
console.log(`GOVERNOR=${governor}`);
console.log(`TREASURY=${treasury}`);
