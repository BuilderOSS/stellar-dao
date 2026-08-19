import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import type {
  MercuryActivityItem,
  MercuryProgramConfig,
  MercuryProgramKey,
  MercuryMintAuthorityItem,
  MercuryProposalDetailItem,
  MercuryProposalDetailResponse,
  MercuryProgramStatusItem,
  MercuryProposalVoteItem,
  MercuryProposalVotesResponse
} from '@/lib/mercury-types';

type MercuryTable = {
  table_name: string;
  project_name_plain?: string;
};

type MercuryTableRow = Record<string, unknown> & {
  _mercury_event_id?: unknown;
  contract_id?: unknown;
  ledger?: unknown;
  timestamp?: unknown;
  transaction?: unknown;
};

type MercuryStatusResponse = {
  program_id: number;
  project_name: string;
  running: boolean;
  last_success_ledger: number | null;
  last_error_ledger: number | null;
  last_error_message: string | null;
  total_executions: number;
  total_errors: number;
  avg_execution_ms: number | null;
};

const TABLE_SUFFIXES: Record<string, { title: string; summarize: (row: MercuryTableRow) => string; addresses: (row: MercuryTableRow) => string[] }> = {
  token_mint_indexed: {
    title: 'Mint',
    summarize: (row) => `Minted token #${stringify(row.token_id)} to ${shorten(stringify(row.to))}`,
    addresses: (row) => collectAddresses(row, ['to'])
  },
  token_transfer_indexed: {
    title: 'Transfer',
    summarize: (row) => `Transferred token #${stringify(row.token_id)} from ${shorten(stringify(row.from))} to ${shorten(stringify(row.to))}`,
    addresses: (row) => collectAddresses(row, ['from', 'to'])
  },
  mint_authority_changed_indexed: {
    title: 'Mint Authority Change',
    summarize: (row) => `${shorten(stringify(row.authority))} ${Boolean(row.enabled) ? 'allowed' : 'revoked'} to mint`,
    addresses: (row) => collectAddresses(row, ['authority'])
  },
  delegate_changed_indexed: {
    title: 'Delegate Change',
    summarize: (row) => `Delegation updated for ${shorten(stringify(row.delegator))}`,
    addresses: (row) => collectAddresses(row, ['delegator', 'to_delegate'])
  },
  proposal_created_indexed: {
    title: 'Proposal Created',
    summarize: (row) => `Proposal ${shorten(stringify(row.proposal_id))} created`,
    addresses: (row) => collectAddresses(row, ['proposer'])
  },
  proposal_call_indexed: {
    title: 'Proposal Call',
    summarize: (row) => `Proposal ${shorten(stringify(row.proposal_id))} executed through treasury`,
    addresses: (row) => collectAddresses(row, ['treasury', 'target'])
  },
  proposal_lifecycle_indexed: {
    title: 'Proposal Lifecycle',
    summarize: (row) => `Proposal ${shorten(stringify(row.proposal_id))} is now ${stringify(row.state)}`,
    addresses: (row) => collectAddresses(row, ['proposer'])
  },
  proposal_vote_indexed: {
    title: 'Vote Cast',
    summarize: (row) => `Vote ${stringify(row.support)} cast by ${shorten(stringify(row.voter))}`,
    addresses: (row) => collectAddresses(row, ['voter'])
  },
  treasury_call_indexed: {
    title: 'Treasury Call',
    summarize: (row) => `Treasury executed ${stringify(row.function)} on ${shorten(stringify(row.target))}`,
    addresses: (row) => collectAddresses(row, ['governor', 'target'])
  }
};

function stringify(value: unknown) {
  if (value === null || typeof value === 'undefined') return '—';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value);
  return '—';
}

function shorten(value: string) {
  if (!value) return '—';
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item));
  }

  return [];
}

function asNestedStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asStringArray(item));
  }

  return [];
}

function asBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (typeof value === 'number') return value !== 0;
  return false;
}

function collectAddresses(row: MercuryTableRow, fields: string[]) {
  const addresses = new Set<string>();
  for (const field of fields) {
    const value = asString(row[field]);
    if (value) {
      addresses.add(value);
    }
  }
  return [...addresses];
}

function getConfig(): { baseUrl: string; jwt: string; adminAddress: string; programs: MercuryProgramConfig[] } | null {
  const network = getDefaultDaoNetwork();
  const config = getDaoNetworkConfig(network);
  const baseUrl = (process.env.MERCURY_BASE_URL?.trim() ?? config.rpcUrl).replace(/\/$/, '');
  const jwt = process.env.MERCURY_JWT?.trim() ?? '';

  const programs = [
    {
      key: 'token' as const,
      label: 'Token',
      programId: Number.parseInt(config.tokenMercuryProgramId || (process.env.NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROGRAM_ID ?? '0'), 10),
      projectName: config.tokenMercuryProject || process.env.NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROJECT || ''
    },
    {
      key: 'governor' as const,
      label: 'Governor',
      programId: Number.parseInt(config.governorMercuryProgramId || (process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROGRAM_ID ?? '0'), 10),
      projectName: config.governorMercuryProject || process.env.NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROJECT || ''
    },
    {
      key: 'treasury' as const,
      label: 'Treasury',
      programId: Number.parseInt(config.treasuryMercuryProgramId || (process.env.NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROGRAM_ID ?? '0'), 10),
      projectName: config.treasuryMercuryProject || process.env.NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROJECT || ''
    }
  ].filter((item) => Number.isFinite(item.programId) && item.programId > 0 && item.projectName);

  if (!jwt || !baseUrl || !programs.length) {
    return null;
  }

  return { baseUrl, jwt, adminAddress: config.adminAddress, programs };
}

async function mercuryFetchJson<T>(baseUrl: string, jwt: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Mercury request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function listTables(baseUrl: string, jwt: string) {
  return mercuryFetchJson<MercuryTable[]>(baseUrl, jwt, '/retroshade/tables');
}

async function queryTable(baseUrl: string, jwt: string, tableName: string, limit: number) {
  const query = `SELECT * FROM retroshade.${tableName} ORDER BY ledger DESC LIMIT ${limit}`;
  return mercuryFetchJson<MercuryTableRow[]>(baseUrl, jwt, '/retroshade/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
}

function isProgramTable(table: MercuryTable, program: MercuryProgramConfig) {
  return table.table_name.startsWith(`program_${program.programId}_`) && table.project_name_plain === program.projectName;
}

function toActivityItem(program: MercuryProgramConfig, tableName: string, row: MercuryTableRow): MercuryActivityItem | null {
  const suffix = tableName.replace(`program_${program.programId}_`, '');
  const meta = TABLE_SUFFIXES[suffix];
  if (!meta) return null;

  const id = asString(row._mercury_event_id) || `${tableName}:${asString(row.transaction)}:${asNumber(row.ledger)}`;
  const proposalId = asString(row.proposal_id) || asString(row.proposalId);

  return {
    id,
    programKey: program.key,
    programId: program.programId,
    projectName: program.projectName,
    tableName,
    kind: suffix.replace(/_indexed$/, ''),
    title: meta.title,
    summary: meta.summarize(row),
    proposalId: proposalId || undefined,
    ledger: asNumber(row.ledger),
    timestamp: asNumber(row.timestamp),
    txHash: asString(row.transaction),
    contractId: asString(row.contract_id),
    addresses: meta.addresses(row)
  };
}

export async function getMercuryActivityFeed(limit = 25) {
  const config = getConfig();
  if (!config) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Mercury is not configured.' };
  }

  const tables = await listTables(config.baseUrl, config.jwt);
  const relevantTables = config.programs.flatMap((program) =>
    tables.filter((table) => isProgramTable(table, program)).map((table) => ({ program, table }))
  );

  const rows = await Promise.all(relevantTables.map(async ({ program, table }) => {
    const data = await queryTable(config.baseUrl, config.jwt, table.table_name, limit);
    return data.map((row) => toActivityItem(program, table.table_name, row)).filter((item): item is MercuryActivityItem => Boolean(item));
  }));

  const items = rows.flat().sort((a, b) => b.timestamp - a.timestamp || b.ledger - a.ledger).slice(0, limit * 2);
  return { items, generatedAt: new Date().toISOString() };
}

export async function getMercuryProgramStatuses() {
  const config = getConfig();
  if (!config) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Mercury is not configured.' };
  }

  const items = await Promise.all(config.programs.map(async (program): Promise<MercuryProgramStatusItem> => {
    const status = await mercuryFetchJson<MercuryStatusResponse>(config.baseUrl, config.jwt, `/retroshade/${program.programId}/status`);
    return {
      key: program.key,
      label: program.label,
      programId: program.programId,
      projectName: program.projectName,
      running: status.running,
      totalExecutions: status.total_executions,
      totalErrors: status.total_errors,
      lastSuccessLedger: status.last_success_ledger,
      lastErrorLedger: status.last_error_ledger,
      lastErrorMessage: status.last_error_message,
      avgExecutionMs: status.avg_execution_ms
    };
  }));

  return { items, generatedAt: new Date().toISOString() };
}

export async function getMercuryMintAuthorities() {
  const config = getConfig();
  if (!config) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Mercury is not configured.' };
  }

  const tokenProgram = config.programs.find((program) => program.key === 'token');
  if (!tokenProgram) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Token Mercury program is not configured.' };
  }

  const tables = await listTables(config.baseUrl, config.jwt);
  const relevantTables = tables.filter((table) => isProgramTable(table, tokenProgram) && table.table_name.endsWith('_mint_authority_changed_indexed'));
  const rows = await Promise.all(relevantTables.map(async (table) => {
    const data = await queryTable(config.baseUrl, config.jwt, table.table_name, 100);
    const items: MercuryMintAuthorityItem[] = [];

    for (const row of data) {
      const authority = asString(row.authority);
      if (!authority) continue;

      items.push({
        authority,
        enabled: asBoolean(row.enabled),
        ledger: asNumber(row.ledger),
        timestamp: asNumber(row.timestamp),
        txHash: asString(row.transaction),
        contractId: asString(row.contract_id),
        source: 'mercury' as const
      });
    }

    return items;
  }));

  const latest = new Map<string, MercuryMintAuthorityItem>();
  for (const item of rows.flat().sort((a, b) => b.ledger - a.ledger || b.timestamp - a.timestamp)) {
    if (!latest.has(item.authority)) {
      latest.set(item.authority, item);
    }
  }

  const owner = config.adminAddress;
  const items = [...latest.values()].filter((item) => item.enabled);
  if (owner && !items.some((item) => item.authority === owner)) {
    items.unshift({
      authority: owner,
      enabled: true,
      ledger: 0,
      timestamp: 0,
      txHash: '',
      contractId: '',
      source: 'owner'
    });
  }

  return { items, generatedAt: new Date().toISOString() };
}

export async function getMercuryProposalVotes(proposalId: string): Promise<MercuryProposalVotesResponse> {
  const config = getConfig();
  if (!config) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Mercury is not configured.' };
  }

  const governorProgram = config.programs.find((program) => program.key === 'governor');
  if (!governorProgram) {
    return { items: [], generatedAt: new Date().toISOString(), message: 'Governor Mercury program is not configured.' };
  }

  const tables = await listTables(config.baseUrl, config.jwt);
  const relevantTables = tables.filter((table) => isProgramTable(table, governorProgram) && table.table_name.endsWith('_proposal_vote_indexed'));
  const rows = await Promise.all(relevantTables.map(async (table) => {
    const data = await queryTable(config.baseUrl, config.jwt, table.table_name, 100);
    const items: MercuryProposalVoteItem[] = [];

    for (const row of data) {
      const rowProposalId = asString(row.proposal_id) || asString(row.proposalId);
      if (!rowProposalId || rowProposalId !== proposalId) continue;

      const voter = asString(row.voter);
      if (!voter) continue;

      items.push({
        id: asString(row._mercury_event_id) || `${table.table_name}:${asString(row.transaction)}:${asNumber(row.ledger)}`,
        proposalId: rowProposalId,
        voter,
        support: asNumber(row.support),
        weight: stringify(row.weight),
        reason: asString(row.reason),
        ledger: asNumber(row.ledger),
        timestamp: asNumber(row.timestamp),
        txHash: asString(row.transaction),
        contractId: asString(row.contract_id)
      });
    }

    return items;
  }));

  const items = rows.flat().sort((a, b) => b.timestamp - a.timestamp || b.ledger - a.ledger);
  return { items, generatedAt: new Date().toISOString() };
}

export async function getMercuryProposalDetail(proposalId: string): Promise<MercuryProposalDetailResponse> {
  const config = getConfig();
  if (!config) {
    return {
      proposalId,
      proposer: '',
      description: '',
      targets: [],
      functions: [],
      args: [],
      snapshot: 0,
      deadline: 0,
      vote_snapshot: 0,
      vote_end: 0,
      vote_start: 0,
      label: 'Pending',
      ledger: 0,
      timestamp: 0,
      txHash: '',
      contractId: '',
      generatedAt: new Date().toISOString(),
      message: 'Mercury is not configured.'
    };
  }

  const governorProgram = config.programs.find((program) => program.key === 'governor');
  if (!governorProgram) {
    return {
      proposalId,
      proposer: '',
      description: '',
      targets: [],
      functions: [],
      args: [],
      snapshot: 0,
      deadline: 0,
      vote_snapshot: 0,
      vote_end: 0,
      vote_start: 0,
      label: 'Pending',
      ledger: 0,
      timestamp: 0,
      txHash: '',
      contractId: '',
      generatedAt: new Date().toISOString(),
      message: 'Governor Mercury program is not configured.'
    };
  }

  const tables = await listTables(config.baseUrl, config.jwt);
  const relevantTables = tables.filter((table) => isProgramTable(table, governorProgram) && table.table_name.endsWith('_proposal_created_indexed'));
  for (const table of relevantTables) {
    const data = await queryTable(config.baseUrl, config.jwt, table.table_name, 100);
    const row = data.find((item) => (asString(item.proposal_id) || asString(item.proposalId)) === proposalId);
    if (!row) continue;

    return {
      proposalId,
      proposer: asString(row.proposer),
      description: asString(row.description),
      targets: asStringArray(row.targets),
      functions: asStringArray(row.functions),
      args: asNestedStringArray(row.args),
      snapshot: asNumber(row.snapshot),
      deadline: asNumber(row.deadline),
      vote_snapshot: asNumber(row.snapshot),
      vote_end: asNumber(row.deadline),
      vote_start: asNumber(row.snapshot) + 1,
      label: 'Pending',
      ledger: asNumber(row.ledger),
      timestamp: asNumber(row.timestamp),
      txHash: asString(row.transaction),
      contractId: asString(row.contract_id),
      generatedAt: new Date().toISOString()
    };
  }

    return {
      proposalId,
      proposer: '',
      description: '',
      targets: [],
      functions: [],
      args: [],
      snapshot: 0,
      deadline: 0,
      vote_snapshot: 0,
      vote_end: 0,
      vote_start: 0,
      label: 'Pending',
      ledger: 0,
      timestamp: 0,
      txHash: '',
      contractId: '',
      generatedAt: new Date().toISOString(),
    message: 'Proposal not found.'
  };
}
