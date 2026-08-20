import { existsSync, readFileSync } from 'node:fs';

const envPath = 'apps/web/.env.local';
const defaultBaseUrl = 'https://testnet.mercurydata.app/rest';

function usage() {
  console.log(`Mercury utility

Usage:
  node scripts/mercury.mjs list [--json]
  node scripts/mercury.mjs tables [--program <id>] [--json]
  node scripts/mercury.mjs status --program <id> [--json]
  node scripts/mercury.mjs query --program <id> --table <name> [--limit <n>] [--where <sql>] [--columns <cols>] [--order <col>] [--asc] [--count] [--json]
  node scripts/mercury.mjs query --program <id> --tables
  node scripts/mercury.mjs query --program <id> --describe <table>
  node scripts/mercury.mjs query --sql <sql> [--json]
  node scripts/mercury.mjs delete-plan --keep <id[,id...]> [--json]

Examples:
  pnpm mercury:list
  pnpm mercury:tables -- --program 15
  pnpm mercury:status -- --program 15
  pnpm mercury:query -- --program 15 --table mint_indexed --limit 10
  pnpm mercury:query -- --program 40 --table proposal_vote --count
  pnpm mercury:delete:plan -- --keep 15`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const env = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }

  return env;
}

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }

    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (typeof inlineValue !== 'undefined') {
      flags[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return flags;
}

function requireProgram(value) {
  const program = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(program) || program <= 0) {
    throw new Error('A positive --program id is required.');
  }

  return program;
}

function requireLimit(value, fallback = 25) {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const limit = Number.parseInt(String(value), 10);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    throw new Error('--limit must be a positive integer no larger than 1000.');
  }

  return limit;
}

function parseKeepIds(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((item) => Number.isInteger(item) && item > 0)
  );
}

function ensureIdentifier(value, label) {
  const raw = String(value ?? '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
    throw new Error(`${label} must be a simple SQL identifier.`);
  }

  return raw;
}

function ensureTableName(value) {
  const raw = String(value ?? '').trim();
  if (!/^program_\d+_[A-Za-z0-9_]+$/.test(raw)) {
    throw new Error(`Unsafe table name: ${raw}`);
  }

  return raw;
}

function formatValue(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function printRows(rows) {
  if (!Array.isArray(rows)) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!rows.length) {
    console.log('(no rows)');
    return;
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.min(
        80,
        Math.max(column.length, ...rows.map((row) => formatValue(row[column]).length))
      )
    ])
  );
  const render = (row) => columns.map((column) => formatValue(row[column]).slice(0, widths[column]).padEnd(widths[column])).join('  ');

  console.log(render(Object.fromEntries(columns.map((column) => [column, column]))));
  console.log(columns.map((column) => '-'.repeat(widths[column])).join('  '));
  for (const row of rows) {
    console.log(render(row));
  }
}

function printJsonOrRows(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  printRows(value);
}

function getConfig() {
  const fileEnv = loadEnvFile(envPath);
  const baseUrl = (process.env.MERCURY_BASE_URL || fileEnv.MERCURY_BASE_URL || defaultBaseUrl).replace(/\/$/, '');
  const jwt = process.env.MERCURY_JWT || fileEnv.MERCURY_JWT || '';

  if (!jwt) {
    throw new Error(`MERCURY_JWT is required. Set it in the environment or ${envPath}.`);
  }

  return { baseUrl, jwt };
}

async function mercuryFetch(path, init = {}) {
  const { baseUrl, jwt } = getConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Mercury ${path} failed with HTTP ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function listPrograms() {
  return mercuryFetch('/retroshade/list');
}

async function listTables() {
  return mercuryFetch('/retroshade/tables');
}

async function querySql(sql) {
  return mercuryFetch('/retroshade/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
}

function tablesForProgram(tables, program) {
  return tables.filter((table) => table.table_name.startsWith(`program_${program}_`));
}

function resolveTable(tables, program, input) {
  if (!input) {
    throw new Error('--table is required unless using --sql, --tables, or --describe.');
  }

  const programTables = tablesForProgram(tables, program);
  const raw = String(input).trim();
  const full = raw.startsWith('program_') ? raw : `program_${program}_${raw}`;
  const exact = programTables.find((table) => table.table_name === full);
  if (exact) {
    return ensureTableName(exact.table_name);
  }

  const matches = programTables.filter((table) => {
    const suffix = table.table_name.replace(`program_${program}_`, '');
    return suffix === raw || suffix.includes(raw);
  });

  if (matches.length === 1) {
    return ensureTableName(matches[0].table_name);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous table "${raw}". Matches: ${matches.map((table) => table.table_name).join(', ')}`);
  }

  throw new Error(`No table found for program ${program} matching "${raw}".`);
}

function buildQuery(tableName, flags) {
  const limit = requireLimit(flags.limit);
  if (flags.count) {
    return `SELECT COUNT(*) AS count FROM retroshade.${tableName}`;
  }

  const columns = flags.columns
    ? String(flags.columns).split(',').map((column) => ensureIdentifier(column.trim(), 'Column')).join(', ')
    : '*';
  const parts = [`SELECT ${columns} FROM retroshade.${tableName}`];

  if (flags.where) {
    parts.push(`WHERE ${flags.where}`);
  }

  const order = flags.order ? ensureIdentifier(flags.order, 'Order column') : 'ledger';
  parts.push(`ORDER BY ${order} ${flags.asc ? 'ASC' : 'DESC'}`);
  parts.push(`LIMIT ${limit}`);
  return parts.join(' ');
}

async function countRows(tableName) {
  try {
    const rows = await querySql(`SELECT COUNT(*) AS count FROM retroshade.${ensureTableName(tableName)}`);
    return rows?.[0]?.count ?? rows?.[0]?.COUNT ?? 'unknown';
  } catch (error) {
    return `error: ${error.message}`;
  }
}

async function runList(flags) {
  const programs = await listPrograms();
  printJsonOrRows(programs, flags.json);
}

async function runTables(flags) {
  const tables = await listTables();
  const filtered = flags.program ? tablesForProgram(tables, requireProgram(flags.program)) : tables;
  printJsonOrRows(filtered, flags.json);
}

async function runStatus(flags) {
  const program = requireProgram(flags.program);
  const status = await mercuryFetch(`/retroshade/${program}/status`);
  printJsonOrRows([status], flags.json);
}

async function runQuery(flags) {
  if (flags.sql) {
    printJsonOrRows(await querySql(flags.sql), flags.json);
    return;
  }

  const program = requireProgram(flags.program);
  const tables = await listTables();

  if (flags.tables) {
    printJsonOrRows(tablesForProgram(tables, program), flags.json);
    return;
  }

  if (flags.describe) {
    const tableName = resolveTable(tables, program, flags.describe);
    const rows = await querySql(`SELECT * FROM retroshade.${tableName} LIMIT 1`);
    const columns = rows[0] ? Object.keys(rows[0]).map((column) => ({ table_name: tableName, column })) : [];
    printJsonOrRows(columns, flags.json);
    return;
  }

  const tableName = resolveTable(tables, program, flags.table);
  const sql = buildQuery(tableName, flags);
  const rows = await querySql(sql);

  if (!flags.json) {
    console.log(sql);
    console.log('');
  }
  printJsonOrRows(rows, flags.json);
}

async function runDeletePlan(flags) {
  const keepIds = parseKeepIds(flags.keep);
  if (!keepIds.size) {
    throw new Error('--keep <id[,id...]> is required for delete-plan.');
  }

  const [programs, tables] = await Promise.all([listPrograms(), listTables()]);
  const candidates = programs.filter((program) => !keepIds.has(program.id));
  const rows = [];

  for (const program of candidates) {
    const programTables = tablesForProgram(tables, program.id);
    const rowCounts = [];
    for (const table of programTables) {
      rowCounts.push(`${table.table_name}:${await countRows(table.table_name)}`);
    }

    rows.push({
      action: 'would_delete',
      id: program.id,
      project_name: program.project_name,
      running: program.running,
      contracts: program.contracts?.join(',') ?? '',
      tables: programTables.length,
      row_counts: rowCounts.join('; ')
    });
  }

  if (!flags.json) {
    console.log(`Keeping program ids: ${[...keepIds].join(', ')}`);
    console.log('No deletion was performed. This is a plan only.');
    console.log('');
  }
  printJsonOrRows(rows, flags.json);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);

  if (!command || command === 'help' || flags.help) {
    usage();
    return;
  }

  if (command === 'list') return runList(flags);
  if (command === 'tables') return runTables(flags);
  if (command === 'status') return runStatus(flags);
  if (command === 'query') return runQuery(flags);
  if (command === 'delete-plan') return runDeletePlan(flags);

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
