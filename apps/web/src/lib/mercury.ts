import type {
  MercuryAccountHistoryItem,
  MercuryAccountHistoryResponse,
  MercuryActivityItem,
  MercuryActivityResponse,
  MercuryLeaderboardEntry,
  MercuryLeaderboardMetric,
  MercuryLeaderboardResponse
} from '@/lib/mercury-types';

type MercuryConfig = {
  baseUrl: string;
  jwt: string;
  programId: number;
  projectName: string;
};

type MercuryTableRow = Record<string, unknown> & {
  _mercury_event_id?: unknown;
  contract_id?: unknown;
  ledger?: unknown;
  timestamp?: unknown;
  transaction?: unknown;
};

type MercuryTable = {
  table_name: string;
  project_name_plain?: string;
};

type ParticipantStats = {
  address: string;
  balance: number;
  wins: number;
  punches: number;
  kicks: number;
  raids: number;
  battles: number;
  losses: number;
  actions: number;
};

type ActivityMeta = {
  title: string;
  summarize: (row: MercuryTableRow) => string;
  addresses: (row: MercuryTableRow) => string[];
};

const PROGRAM_TABLE_SUFFIXES: Record<string, ActivityMeta> = {
  charge_up_indexed: {
    title: 'Charge Up',
    summarize: (row) => `Charged up to ${stringifyCell(row.new_balance)} points`,
    addresses: (row) => collectAddresses(row, ['user'])
  },
  punch_indexed: {
    title: 'Punch',
    summarize: (row) => `Drained ${stringifyCell(row.moved)} point(s) from ${shortenValue(asString(row.to))}`,
    addresses: (row) => collectAddresses(row, ['from', 'to'])
  },
  kick_indexed: {
    title: 'Kick',
    summarize: (row) => `Drained ${stringifyCell(row.moved)} point(s) from ${shortenValue(asString(row.to))}`,
    addresses: (row) => collectAddresses(row, ['from', 'to'])
  },
  joint_punch_indexed: {
    title: 'Joint Punch',
    summarize: (row) => `Allies drained ${stringifyCell(row.moved)} point(s) from ${shortenValue(asString(row.target))}`,
    addresses: (row) => collectAddresses(row, ['user1', 'user2', 'target'])
  },
  heavy_kick_indexed: {
    title: 'Heavy Kick',
    summarize: (row) => `Allies drained ${stringifyCell(row.moved)} point(s) from ${shortenValue(asString(row.target))}`,
    addresses: (row) => collectAddresses(row, ['user1', 'user2', 'user3', 'target'])
  },
  transfer_points_indexed: {
    title: 'Transfer Points',
    summarize: (row) => `Moved ${stringifyCell(row.amount)} point(s) from ${shortenValue(asString(row.from))} to ${shortenValue(asString(row.to))}`,
    addresses: (row) => collectAddresses(row, ['from', 'to'])
  },
  battle_indexed: {
    title: 'Battle',
    summarize: (row) => `Winner ${shortenValue(asString(row.winner))} drained ${stringifyCell(row.drained)} point(s)`,
    addresses: (row) => collectAddresses(row, ['attacker', 'defender', 'winner', 'loser'])
  },
  admin_indexed: {
    title: 'Admin',
    summarize: (row) => `Admin action ${stringifyCell(row.action)} for ${stringifyCell(row.seconds)}s`,
    addresses: (row) => collectAddresses(row, ['admin'])
  },
  mint_indexed: {
    title: 'Mint',
    summarize: (row) => `Minted ${stringifyCell(row.amount)} point(s) to ${shortenValue(asString(row.to))}`,
    addresses: (row) => collectAddresses(row, ['to'])
  },
  burn_indexed: {
    title: 'Burn',
    summarize: (row) => `Burned ${stringifyCell(row.amount)} point(s) from ${shortenValue(asString(row.from))}`,
    addresses: (row) => collectAddresses(row, ['from'])
  },
  transfer_indexed: {
    title: 'Transfer',
    summarize: (row) => `Transferred ${stringifyCell(row.amount)} point(s) from ${shortenValue(asString(row.from))} to ${shortenValue(asString(row.to))}`,
    addresses: (row) => collectAddresses(row, ['from', 'to'])
  },
  approve_indexed: {
    title: 'Approve',
    summarize: (row) => `Approved ${stringifyCell(row.amount)} point(s) for ${shortenValue(asString(row.spender))}`,
    addresses: (row) => collectAddresses(row, ['from', 'spender'])
  }
};

const TABLE_PREFIX = 'program_';

function getConfig(): MercuryConfig | null {
  const jwt = process.env.MERCURY_JWT?.trim() ?? '';
  const baseUrl = (process.env.MERCURY_BASE_URL?.trim() ?? 'https://testnet.mercurydata.app/rest').replace(/\/$/, '');
  const programId = Number.parseInt(process.env.MERCURY_RETROSHADE_PROGRAM_ID ?? '14', 10);
  const projectName = process.env.MERCURY_RETROSHADE_PROJECT?.trim() ?? 'punch-arena-retroshade';

  if (!jwt || !baseUrl || !Number.isFinite(programId) || programId <= 0) {
    return null;
  }

  return { baseUrl, jwt, programId, projectName };
}

function stringifyCell(value: unknown) {
  if (value === null || typeof value === 'undefined') return '—';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value);
  return '—';
}

function shortenValue(value: string) {
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

function normalizeTableName(tableName: string, programId: number) {
  const prefix = `${TABLE_PREFIX}${programId}_`;
  if (!tableName.startsWith(prefix)) {
    return null;
  }

  const suffix = tableName.slice(prefix.length);
  return { prefix, suffix };
}

async function mercuryFetchJson<T>(config: MercuryConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.jwt}`,
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

async function listTables(config: MercuryConfig) {
  return mercuryFetchJson<MercuryTable[]>(config, '/retroshade/tables');
}

async function queryTable(config: MercuryConfig, tableName: string, limit: number) {
  const query = `SELECT * FROM retroshade.${tableName} ORDER BY ledger DESC, timestamp DESC LIMIT ${limit}`;
  return mercuryFetchJson<MercuryTableRow[]>(config, '/retroshade/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
}

function isRelevantTable(table: MercuryTable, config: MercuryConfig) {
  const normalized = normalizeTableName(table.table_name, config.programId);
  if (!normalized) {
    return false;
  }

  return table.project_name_plain === config.projectName || table.table_name.startsWith(`program_${config.programId}_`);
}

function toActivityItem(tableName: string, row: MercuryTableRow, programId: number): MercuryActivityItem | null {
  const normalized = normalizeTableName(tableName, programId);
  if (!normalized) {
    return null;
  }

  const meta = PROGRAM_TABLE_SUFFIXES[normalized.suffix];
  if (!meta) {
    return null;
  }

  const id = asString(row._mercury_event_id) || `${tableName}:${asString(row.transaction)}:${asNumber(row.ledger)}`;
  const txHash = asString(row.transaction);
  const contractId = asString(row.contract_id);

  return {
    id,
    kind: normalized.suffix.replace(/_indexed$/, ''),
    tableName,
    title: meta.title,
    summary: meta.summarize(row),
    ledger: asNumber(row.ledger),
    timestamp: asNumber(row.timestamp),
    txHash,
    contractId,
    addresses: meta.addresses(row)
  };
}

function applyBalance(stats: ParticipantStats, nextBalance: number) {
  stats.balance = Math.max(0, nextBalance);
}

function applyDelta(stats: ParticipantStats, delta: number) {
  stats.balance = Math.max(0, stats.balance + delta);
}

function ensureStats(store: Map<string, ParticipantStats>, address: string) {
  const existing = store.get(address);
  if (existing) {
    return existing;
  }

  const next = {
    address,
    balance: 0,
    wins: 0,
    punches: 0,
    kicks: 0,
    raids: 0,
    battles: 0,
    losses: 0,
    actions: 0
  } satisfies ParticipantStats;

  store.set(address, next);
  return next;
}

function applyStatsForRow(store: Map<string, ParticipantStats>, tableName: string, row: MercuryTableRow, programId: number) {
  const normalized = normalizeTableName(tableName, programId);
  if (!normalized) return;

  const suffix = normalized.suffix;
  const kind = suffix.replace(/_indexed$/, '');
  const meta = PROGRAM_TABLE_SUFFIXES[suffix];

  if (kind === 'mint' || kind === 'burn' || kind === 'transfer' || kind === 'approve') {
    return;
  }

  const participants = meta?.addresses(row) ?? [];

  for (const address of participants) {
    ensureStats(store, address).actions += 1;
  }

  if (kind === 'charge_up') {
    const user = asString(row.user);
    if (user) {
      applyBalance(ensureStats(store, user), asNumber(row.new_balance));
    }
    return;
  }

  if (kind === 'mint') {
    const to = asString(row.to);
    if (to) {
      applyDelta(ensureStats(store, to), asNumber(row.amount));
    }
    return;
  }

  if (kind === 'burn') {
    const from = asString(row.from);
    if (from) {
      applyDelta(ensureStats(store, from), -asNumber(row.amount));
    }
    return;
  }

  if (kind === 'transfer' || kind === 'transfer_points') {
    const from = asString(row.from);
    const to = asString(row.to);
    if (from) {
      applyBalance(ensureStats(store, from), asNumber(row.from_balance));
    }
    if (to) {
      applyBalance(ensureStats(store, to), asNumber(row.to_balance));
    }
    return;
  }

  if (kind === 'approve') {
    return;
  }

  if (kind === 'punch' || kind === 'kick') {
    const from = asString(row.from);
    const to = asString(row.to);
    const moved = asNumber(row.moved);
    const actorBalance = asNumber(row.actor_balance);

    if (from) {
      const actor = ensureStats(store, from);
      if (kind === 'punch') actor.punches += 1;
      if (kind === 'kick') actor.kicks += 1;
      applyBalance(actor, actorBalance);
    }

    if (to) {
      applyDelta(ensureStats(store, to), -moved);
    }
    return;
  }

  if (kind === 'joint_punch' || kind === 'heavy_kick') {
    const target = asString(row.target);
    const moved = asNumber(row.moved);

    for (const field of ['user1', 'user2', 'user3'] as const) {
      const address = asString(row[field]);
      if (!address) continue;
      const signer = ensureStats(store, address);
      signer.raids += 1;
      applyBalance(signer, asNumber(row[`${field}_balance`]));
    }

    if (target) {
      applyDelta(ensureStats(store, target), -moved);
    }
    return;
  }

  if (kind === 'battle') {
    const attacker = asString(row.attacker);
    const defender = asString(row.defender);
    const winner = asString(row.winner);
    const loser = asString(row.loser);

    if (attacker) {
      const stat = ensureStats(store, attacker);
      stat.battles += 1;
      applyBalance(stat, asNumber(row.attacker_balance));
    }

    if (defender) {
      const stat = ensureStats(store, defender);
      stat.battles += 1;
      applyBalance(stat, asNumber(row.defender_balance));
    }

    if (winner) {
      ensureStats(store, winner).wins += 1;
    }

    if (loser) {
      ensureStats(store, loser).losses += 1;
    }
  }
}

async function loadDataset(config: MercuryConfig, limitPerTable: number) {
  const tables = await listTables(config);
  const relevantTables = tables.filter((table) => isRelevantTable(table, config));
  const rows = await Promise.allSettled(relevantTables.map((table) => queryTable(config, table.table_name, limitPerTable)));

  return relevantTables.flatMap((table, index) => {
    const result = rows[index];
    if (result.status !== 'fulfilled') {
      return [] as Array<{ tableName: string; row: MercuryTableRow }>;
    }

    return result.value.map((row) => ({ tableName: table.table_name, row }));
  });
}

function sortActivities(items: MercuryActivityItem[]) {
  return items.sort((left, right) => {
    if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
    if (right.ledger !== left.ledger) return right.ledger - left.ledger;
    return left.id.localeCompare(right.id);
  });
}

function sortRowsChronologically(
  left: { tableName: string; row: MercuryTableRow },
  right: { tableName: string; row: MercuryTableRow }
) {
  const leftLedger = asNumber(left.row.ledger);
  const rightLedger = asNumber(right.row.ledger);
  if (leftLedger !== rightLedger) return leftLedger - rightLedger;

  const leftTimestamp = asNumber(left.row.timestamp);
  const rightTimestamp = asNumber(right.row.timestamp);
  if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp;

  return left.tableName.localeCompare(right.tableName);
}

function toLeaderboardEntries(store: Map<string, ParticipantStats>, metric: MercuryLeaderboardMetric) {
  const entries = [...store.values()].map((stat): MercuryLeaderboardEntry => {
    const score = stat.balance + stat.wins * 10 + stat.punches * 2 + stat.kicks * 2 + stat.raids * 4 + stat.battles * 3 - stat.losses * 2;

    return {
      address: stat.address,
      balance: stat.balance,
      wins: stat.wins,
      punches: stat.punches,
      kicks: stat.kicks,
      raids: stat.raids,
      battles: stat.battles,
      losses: stat.losses,
      actions: stat.actions,
      score,
      rank: 0
    };
  });

  entries.sort((left, right) => {
    const leftValue = metric === 'combined' ? left.score : left[metric as Exclude<MercuryLeaderboardMetric, 'combined'>];
    const rightValue = metric === 'combined' ? right.score : right[metric as Exclude<MercuryLeaderboardMetric, 'combined'>];

    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }

    if (right.balance !== left.balance) {
      return right.balance - left.balance;
    }

    return left.address.localeCompare(right.address);
  });

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function getMercuryActivityFeed(page = 1, pageSize = 20): Promise<MercuryActivityResponse> {
  const config = getConfig();
  if (!config) {
    return {
      items: [],
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total: 0,
      hasMore: false,
      message: 'Mercury is not configured yet.'
    };
  }

  const dataset = await loadDataset(config, 500);
  const items = dataset
    .map(({ tableName, row }) => toActivityItem(tableName, row, config.programId))
    .filter((item): item is MercuryActivityItem => Boolean(item));
  const total = items.length;
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const start = (safePage - 1) * safePageSize;
  const pagedItems = sortActivities(items).slice(start, start + safePageSize);

  return {
    items: pagedItems,
    generatedAt: new Date().toISOString(),
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: start + safePageSize < total
  };
}

export async function getMercuryAccountHistory(address: string, limit = 20): Promise<MercuryAccountHistoryResponse> {
  const config = getConfig();
  if (!config) {
    return {
      address,
      items: [],
      generatedAt: new Date().toISOString(),
      message: 'Mercury is not configured yet.'
    };
  }

  if (!address.trim()) {
    return {
      address,
      items: [],
      generatedAt: new Date().toISOString(),
      message: 'Connect a wallet to view indexed history.'
    };
  }

  const feed = await getMercuryActivityFeed(1, 500);
  const items = feed.items
    .filter((item) => item.addresses.includes(address))
    .map((item): MercuryAccountHistoryItem => ({ ...item, matchedAddress: address }));

  return {
    address,
    items: items.slice(0, limit),
    generatedAt: new Date().toISOString(),
    message: feed.message
  };
}

export async function getMercuryLeaderboards(metric: MercuryLeaderboardMetric = 'balance', page = 1, pageSize = 20): Promise<MercuryLeaderboardResponse> {
  const config = getConfig();
  if (!config) {
    return {
      metric,
      items: [],
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total: 0,
      hasMore: false,
      message: 'Mercury is not configured yet.'
    };
  }

  const dataset = await loadDataset(config, 500);
  const store = new Map<string, ParticipantStats>();

  for (const { tableName, row } of [...dataset].sort(sortRowsChronologically)) {
    applyStatsForRow(store, tableName, row, config.programId);
  }

  const entries = toLeaderboardEntries(store, metric);
  const total = entries.length;
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    metric,
    items: entries.slice(start, start + safePageSize),
    generatedAt: new Date().toISOString(),
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: start + safePageSize < total
  };
}
