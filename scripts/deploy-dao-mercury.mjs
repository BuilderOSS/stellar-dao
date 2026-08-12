import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './lib.mjs';

const configPath = process.argv[2];

if (!configPath) {
  throw new Error('Usage: node scripts/deploy-dao-mercury.mjs <config.json>');
}

const mercuryCliPath = process.env.MERCURY_CLI_PATH ?? '/home/dan13ram/code/stellar/mercury-cli/target/release/mercury-cli';
const mercuryBaseUrl = (process.env.MERCURY_BASE_URL?.trim() || 'https://testnet.mercurydata.app/rest').replace(/\/$/, '');
const mercuryJwt = process.env.MERCURY_JWT?.trim() || loadEnvValue('apps/web/.env.local', 'MERCURY_JWT');

function loadConfig(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadEnvValue(filePath, key) {
  if (!existsSync(filePath)) {
    return '';
  }

  const match = readFileSync(filePath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function projectName(label, network, contractName) {
  return `dao-${label}-${contractName}-${network}-v5`;
}

function deriveDeployArtifactPath(filePath) {
  const config = loadConfig(filePath);
  return `deploys/${config.label}-${config.network}.json`;
}

function deployMercuryProgram(codePath, project, contractId) {
  if (!mercuryJwt) {
    throw new Error('MERCURY_JWT must be set to deploy Mercury programs');
  }

  run(mercuryCliPath, [
    '--base',
    mercuryBaseUrl,
    '--jwt',
    mercuryJwt,
    'deploy',
    '--project',
    project,
    '--code-path',
    codePath,
    '--contracts',
    contractId
  ]);
}

async function listMercuryPrograms() {
  const response = await fetch(`${mercuryBaseUrl}/retroshade/list`, {
    headers: { Authorization: `Bearer ${mercuryJwt}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Mercury list failed with ${response.status}`);
  }

  return response.json();
}

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  return `${content.trimEnd()}\n${line}`;
}

const config = loadConfig(configPath);
const deployArtifactPath = deriveDeployArtifactPath(configPath);

if (!existsSync(deployArtifactPath)) {
  throw new Error(`Deploy artifact not found: ${deployArtifactPath}`);
}

run('pnpm', ['dao:build:mercury']);

const deployed = JSON.parse(readFileSync(deployArtifactPath, 'utf8'));
const tokenId = deployed.contracts.token;
const governorId = deployed.contracts.governor;
const treasuryId = deployed.contracts.treasury;

deployMercuryProgram(
  'target/wasm32v1-none/release/token.wasm',
  projectName(config.label, config.network, 'token'),
  tokenId
);

deployMercuryProgram(
  'target/wasm32v1-none/release/governor.wasm',
  projectName(config.label, config.network, 'governor'),
  governorId
);

deployMercuryProgram(
  'target/wasm32v1-none/release/treasury.wasm',
  projectName(config.label, config.network, 'treasury'),
  treasuryId
);

const programs = await listMercuryPrograms();
const tokenProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'token'));
const governorProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'governor'));
const treasuryProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'treasury'));

if (!tokenProgram || !governorProgram || !treasuryProgram) {
  throw new Error('Failed to read deployed Mercury program ids');
}

const envPath = 'apps/web/.env.local';
let env = readFileSync(envPath, 'utf8');
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROGRAM_ID', String(tokenProgram.id));
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROGRAM_ID', String(governorProgram.id));
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROGRAM_ID', String(treasuryProgram.id));
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROJECT', tokenProgram.project_name);
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROJECT', governorProgram.project_name);
env = upsertEnvValue(env, 'NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROJECT', treasuryProgram.project_name);
writeFileSync(envPath, `${env.trimEnd()}\n`);
