import { existsSync, readFileSync } from 'node:fs';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !['deploy', 'delete', 'list', 'status'].includes(command)) {
  throw new Error('Usage: node scripts/arena-retroshade.mjs <deploy|delete|list|status> [--base URL] [--jwt TOKEN]');
}

const env = loadEnv('apps/web/.env.local');
const baseUrl = (args.base ?? env.MERCURY_BASE_URL ?? 'https://testnet.mercurydata.app/rest').replace(/\/$/, '');
const jwt = (args.jwt ?? env.MERCURY_JWT ?? '').trim();

if (!jwt) {
  throw new Error('Missing MERCURY_JWT');
}

if (command === 'deploy') {
  const projectName = args.project ?? env.MERCURY_RETROSHADE_PROJECT ?? 'punch-arena-retroshade';
  const codePath = args['code-path'] ?? 'target/wasm32v1-none/release/arena.wasm';
  const contracts = csvToVec(args.contracts ?? env.NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID ?? '');

  if (!existsSync(codePath)) {
    throw new Error(`Missing code path: ${codePath}`);
  }

  if (contracts.length === 0) {
    throw new Error('Missing contract id for Retroshade deployment');
  }

  const body = {
    code: [...readFileSync(codePath)],
    project_name: projectName,
    contracts
  };

  const response = await fetch(`${baseUrl}/retroshade/deploy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  await printResponse(response);

  const program = await findProgram(baseUrl, jwt, projectName);
  if (program) {
    console.log(`Program ID: ${program.id}`);
    console.log(`Project: ${program.project_name}`);
    console.log(`Contracts: ${program.contracts.join(', ')}`);
  }
  process.exit(response.ok ? 0 : 1);
}

if (command === 'delete') {
  const programId = Number.parseInt(args['program-id'] ?? env.MERCURY_RETROSHADE_PROGRAM_ID ?? '', 10);
  const projectName = args.project ?? env.MERCURY_RETROSHADE_PROJECT ?? '';
  const resolvedProgramId = Number.isFinite(programId) && programId > 0 ? programId : await resolveProgramId(baseUrl, jwt, projectName);

  if (!resolvedProgramId) {
    throw new Error('Missing program id for Retroshade deletion');
  }

  const response = await fetch(`${baseUrl}/retroshade/${resolvedProgramId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` }
  });

  await printResponse(response);
  process.exit(response.ok ? 0 : 1);
}

if (command === 'list') {
  const response = await fetch(`${baseUrl}/retroshade/list`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });

  await printResponse(response);
  process.exit(response.ok ? 0 : 1);
}

if (command === 'status') {
  const programId = Number.parseInt(args['program-id'] ?? env.MERCURY_RETROSHADE_PROGRAM_ID ?? '', 10);
  if (!Number.isFinite(programId) || programId <= 0) {
    throw new Error('Missing program id for Retroshade status');
  }

  const response = await fetch(`${baseUrl}/retroshade/${programId}/status`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });

  await printResponse(response);
  process.exit(response.ok ? 0 : 1);
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) {
      continue;
    }

    const key = value.slice(2);
    const next = values[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function csvToVec(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function findProgram(baseUrl, jwt, projectName) {
  const response = await fetch(`${baseUrl}/retroshade/list`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });

  if (!response.ok) {
    return null;
  }

  const programs = await response.json();
  return programs.find((program) => program.project_name === projectName) ?? null;
}

async function resolveProgramId(baseUrl, jwt, projectName) {
  if (!projectName) {
    return null;
  }

  const program = await findProgram(baseUrl, jwt, projectName);
  return program?.id ?? null;
}

async function printResponse(response) {
  const text = await response.text();
  if (!text) {
    console.log(response.ok ? 'ok' : `HTTP ${response.status}`);
    return;
  }

  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }
}
