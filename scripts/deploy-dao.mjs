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
    ? `dao:${config.label}:${networkName}:${packageName}:${hash}:${saltSuffix}`
    : `dao:${config.label}:${networkName}:${packageName}:${hash}`;
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

  let txMetadata = null;
  if (!exists.ok) {
    const result = runQuiet('stellar', [
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

    if (!result.ok) {
      console.error('Deploy output:', result.stdout);
      console.error('Deploy error:', result.stderr);
      throw new Error(`Failed to deploy ${packageName}`);
    }

    console.log(result.stdout);
    console.error(result.stderr);

    // Parse transaction metadata from stellar CLI output
    const output = result.stdout + result.stderr;
    const txHashMatch = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);

    txMetadata = {
      deployedAt: new Date().toISOString()
    };

    if (txHashMatch) {
      txMetadata.txHash = txHashMatch[1];
    }
  }

  return { id, txMetadata };
}

async function writeDeployArtifact(contracts, transactions) {
  if (!(await confirmOverwrite(deployArtifactPath))) {
    console.log(`Skipped writing ${deployArtifactPath}.`);
    return;
  }

  const artifact = {
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
  };

  if (transactions && (transactions.token || transactions.governor || transactions.treasury)) {
    artifact.transactions = transactions;
  }

  mkdirSync('deploys', { recursive: true });
  writeFileSync(deployArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
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

    const tokenDeploy = deployIfMissing('token', `dao-token-${networkName}`, [
      '--owner',
      adminAddress,
      '--uri',
      tokenBaseUri,
      '--name',
      config.token.name,
      '--symbol',
      config.token.symbol
    ]);

    const treasuryDeploy = deployIfMissing('treasury', `dao-treasury-${networkName}`, [
      '--owner',
      adminAddress,
      '--governor',
      governor
    ]);

    const governorDeploy = deployIfMissing('governor', `dao-governor-${networkName}`, [
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

    const transactions = {
      token: tokenDeploy.txMetadata,
      treasury: treasuryDeploy.txMetadata,
      governor: governorDeploy.txMetadata
    };

    await writeDeployArtifact({ token, governor, treasury }, transactions);

    console.log(`Deployed ${networkName} DAO contracts:`);
    console.log(`TOKEN=${token}`);
    console.log(`GOVERNOR=${governor}`);
    console.log(`TREASURY=${treasury}`);
  } finally {
    cleanupTempConfig();
  }
}

await main();
