import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { run, runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const configPath = args.find((arg) => arg !== '--force');

if (!configPath) {
  throw new Error('Usage: node scripts/deploy-dao.mjs <config.json> [--force]');
}

const defaultDeployConfig = {
  network: 'local',
  label: 'local',
  adminAddress: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
  webBaseUrl: 'https://test-dao-stellar-web.vercel.app',
  rpcUrl: 'http://localhost:8000/rpc',
  networkPassphrase: 'Standalone Network ; February 2017',
  token: {
    name: 'DAO Vote NFT',
    symbol: 'vDAO',
    description: 'Default DAO voting NFT'
  },
  governor: {
    votingDelay: 10,
    votingPeriod: 100,
    queueDelay: 300,
    proposalThreshold: 1,
    quorumBps: 1000
  }
};

const config = loadDeployConfig(configPath);
const networkName = config.network;
const identityName = `${networkName}-dev`;
const envPath = 'apps/web/.env.local';
const adminAddress = config.adminAddress;
const webBaseUrl = config.webBaseUrl;
const tokenBaseUri = `${webBaseUrl.replace(/\/$/, '')}/api/token/`;
const rpcUrl = config.rpcUrl;
const networkPassphrase = config.networkPassphrase;
const saltSuffix = process.env.DAO_DEPLOY_SALT_SUFFIX?.trim() ?? '';
const contractBuildDir = 'target/wasm32v1-none/release';
const deployArtifactPath = `deploys/${config.label}-${networkName}.json`;

function loadDeployConfig(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!['local', 'testnet', 'mainnet'].includes(parsed.network)) {
    throw new Error(`Config ${filePath} must define network as local, testnet, or mainnet`);
  }
  if (!parsed.label) {
    throw new Error(`Config ${filePath} must define label`);
  }
  if (!parsed.rpcUrl || !parsed.networkPassphrase) {
    throw new Error(`Config ${filePath} must define rpcUrl and networkPassphrase`);
  }
  if (!parsed.token?.description) {
    throw new Error(`Config ${filePath} must define token.description`);
  }

  return {
    ...defaultDeployConfig,
    ...parsed,
    token: {
      ...defaultDeployConfig.token,
      ...parsed.token
    },
    governor: {
      ...defaultDeployConfig.governor,
      ...parsed.governor
    }
  };
}

async function confirmOverwrite(filePath) {
  if (force || !existsSync(filePath)) {
    return true;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`Refusing to overwrite ${filePath} without --force in non-interactive mode`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Overwrite ${filePath}? [y/N] `);
  rl.close();

  return ['y', 'yes'].includes(answer.trim().toLowerCase());
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
      `NEXT_PUBLIC_STELLAR_RPC_URL=${rpcUrl}`,
      `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=${networkPassphrase}`,
      `NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS=${adminAddress}`,
      `NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_ID=${contracts.token}`,
      `NEXT_PUBLIC_STELLAR_GOVERNOR_ID=${contracts.governor}`,
      `NEXT_PUBLIC_STELLAR_TREASURY_ID=${contracts.treasury}`,
      `NEXT_PUBLIC_STELLAR_TOKEN_NAME=${config.token.name}`,
      `NEXT_PUBLIC_STELLAR_TOKEN_SYMBOL=${config.token.symbol}`,
      `NEXT_PUBLIC_STELLAR_TOKEN_DESCRIPTION=${config.token.description}`
    ].join('\n') + '\n'
  );
}

async function writeDeployArtifact(contracts) {
  if (!(await confirmOverwrite(deployArtifactPath))) {
    console.log(`Skipped writing ${deployArtifactPath}.`);
    return;
  }

  mkdirSync('deploys', { recursive: true });
  writeFileSync(
    deployArtifactPath,
    `${JSON.stringify(
      {
        network: networkName,
        label: config.label,
        config: {
          label: config.label,
          adminAddress,
          webBaseUrl,
          rpcUrl,
          networkPassphrase,
          token: config.token,
          governor: config.governor
        },
        contracts,
        outputs: {
          tokenBaseUri,
          identityName,
          saltSuffix: saltSuffix || null,
          deployArtifactPath
        }
      },
      null,
      2
    )}\n`
  );
}

function cleanupTempConfig() {
  if (!configPath.startsWith('/tmp/') && !configPath.includes('.tmp.')) {
    return;
  }

  try {
    rmSync(configPath);
  } catch {
    // best effort cleanup
  }
}

async function main() {
  try {
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
      config.token.name,
      '--symbol',
      config.token.symbol
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
      String(config.governor.votingDelay),
      '--voting_period',
      String(config.governor.votingPeriod),
      '--queue_delay',
      String(config.governor.queueDelay),
      '--proposal_threshold',
      String(config.governor.proposalThreshold),
      '--quorum_bps',
      String(config.governor.quorumBps)
    ]);

    writeEnvIfMissing({ token, governor, treasury });
    await writeDeployArtifact({ token, governor, treasury });

    console.log(`Deployed ${networkName} DAO contracts:`);
    console.log(`TOKEN=${token}`);
    console.log(`GOVERNOR=${governor}`);
    console.log(`TREASURY=${treasury}`);
  } finally {
    cleanupTempConfig();
  }
}

await main();
