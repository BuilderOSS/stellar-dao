export type MercuryLeaderboardMetric = 'balance' | 'combined' | 'wins' | 'punches' | 'raids';

export type MercuryActivityItem = {
  id: string;
  kind: string;
  tableName: string;
  title: string;
  summary: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
  addresses: string[];
};

export type MercuryAccountHistoryItem = MercuryActivityItem & {
  matchedAddress: string;
};

export type MercuryLeaderboardEntry = {
  address: string;
  balance: number;
  wins: number;
  punches: number;
  kicks: number;
  raids: number;
  battles: number;
  losses: number;
  actions: number;
  score: number;
  rank: number;
};

export type MercuryActivityResponse = {
  items: MercuryActivityItem[];
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  message?: string;
};

export type MercuryAccountHistoryResponse = {
  address: string;
  items: MercuryAccountHistoryItem[];
  generatedAt: string;
  message?: string;
};

export type MercuryLeaderboardResponse = {
  metric: MercuryLeaderboardMetric;
  items: MercuryLeaderboardEntry[];
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  message?: string;
};
