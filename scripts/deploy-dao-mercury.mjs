import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline/promises';
import { run } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const configPath = args.find((arg) => arg !== '--force');

if (!configPath) {
  throw new Error('Usage: node scripts/deploy-dao-mercury.mjs <config.json> [--force]');
}

const defaultMercuryCliPath = join(homedir(), 'code/stellar/mercury-cli/target/release/mercury-cli');
const mercuryCliPath = process.env.MERCURY_CLI_PATH ?? defaultMercuryCliPath;
const mercuryBaseUrl = (process.env.MERCURY_BASE_URL?.trim() || 'https://testnet.mercurydata.app/rest').replace(/\/$/, '');
const mercuryJwt = process.env.MERCURY_JWT?.trim() || loadEnvValue('apps/web/.env.local', 'MERCURY_JWT');

if (!existsSync(mercuryCliPath)) {
  throw new Error(
    `Mercury CLI not found at: ${mercuryCliPath}\n\n` +
    `Please either:\n` +
    `  1. Build mercury-cli and ensure it exists at the path above\n` +
    `  2. Set MERCURY_CLI_PATH environment variable to the correct path:\n` +
    `     export MERCURY_CLI_PATH=/path/to/mercury-cli\n` +
    `     pnpm mercury:deploy:testnet`
  );
}

function loadConfig(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  const config = JSON.parse(readFileSync(filePath, 'utf8'));
  const requiredFields = [
    ['network', config.network],
    ['label', config.label]
  ];
  const missingField = requiredFields.find(([, value]) => value === undefined || value === null || value === '');
  if (missingField) {
    throw new Error(`Config ${filePath} must define ${missingField[0]}`);
  }

  return config;
}

function loadEnvValue(filePath, key) {
  if (!existsSync(filePath)) {
    return '';
  }

  const match = readFileSync(filePath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function projectName(label, network, contractName) {
  return `dao-${label}-${contractName}-${network}-v9`;
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

async function main() {
  const config = loadConfig(configPath);
  const deployArtifactPath = deriveDeployArtifactPath(configPath);

  if (!existsSync(deployArtifactPath)) {
    throw new Error(`Deploy artifact not found: ${deployArtifactPath}`);
  }

  run('pnpm', ['dao:build:mercury']);

  const deployed = JSON.parse(readFileSync(deployArtifactPath, 'utf8'));
  const requiredContracts = ['token', 'governor', 'treasury', 'auction'];
  const missingContract = requiredContracts.find((name) => deployed.contracts?.[name] === undefined);
  if (missingContract) {
    throw new Error(`Deploy artifact ${deployArtifactPath} must define contracts.${missingContract}`);
  }

  const tokenId = deployed.contracts.token;
  const governorId = deployed.contracts.governor;
  const treasuryId = deployed.contracts.treasury;
  const auctionId = deployed.contracts.auction;

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
  deployMercuryProgram(
    'target/wasm32v1-none/release/auction.wasm',
    projectName(config.label, config.network, 'auction'),
    auctionId
  );

  const programs = await listMercuryPrograms();
  const tokenProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'token'));
  const governorProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'governor'));
  const treasuryProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'treasury'));
  const auctionProgram = programs.find((program) => program.project_name === projectName(config.label, config.network, 'auction'));

  if (!tokenProgram || !governorProgram || !treasuryProgram || !auctionProgram) {
    throw new Error('Failed to read deployed Mercury program ids');
  }

  // Update deploy artifact with Mercury program metadata
  if (await confirmOverwrite(deployArtifactPath)) {
    const updatedArtifact = {
      ...deployed,
      mercury: {
        deployedAt: new Date().toISOString(),
        programs: {
          token: { program_id: tokenProgram.id, project: tokenProgram.project_name },
          governor: { program_id: governorProgram.id, project: governorProgram.project_name },
          treasury: { program_id: treasuryProgram.id, project: treasuryProgram.project_name },
          auction: { program_id: auctionProgram.id, project: auctionProgram.project_name }
        }
      }
    };
    writeFileSync(deployArtifactPath, `${JSON.stringify(updatedArtifact, null, 2)}\n`);
  } else {
    console.log(`Skipped writing ${deployArtifactPath}.`);
  }

  console.log('Mercury programs deployed successfully!');
  console.log(`TOKEN: program_id=${tokenProgram.id}, project=${tokenProgram.project_name}`);
  console.log(`GOVERNOR: program_id=${governorProgram.id}, project=${governorProgram.project_name}`);
  console.log(`TREASURY: program_id=${treasuryProgram.id}, project=${treasuryProgram.project_name}`);
  console.log(`AUCTION: program_id=${auctionProgram.id}, project=${auctionProgram.project_name}`);
}

await main();
