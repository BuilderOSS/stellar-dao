export type MercuryProgramKey = 'token' | 'governor' | 'treasury';

export type MercuryProgramConfig = {
  key: MercuryProgramKey;
  label: string;
  programId: number;
  projectName: string;
};

export type MercuryActivityItem = {
  id: string;
  programKey: MercuryProgramKey;
  programId: number;
  projectName: string;
  tableName: string;
  kind: string;
  title: string;
  summary: string;
  proposalId?: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
  addresses: string[];
};

export type MercuryProposalVoteItem = {
  id: string;
  proposalId: string;
  voter: string;
  support: number;
  weight: string;
  reason: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

export type MercuryProposalDetailItem = {
  proposalId: string;
  proposer: string;
  description: string;
  targets: string[];
  functions: string[];
  args: string[][];
  snapshot: number;
  deadline: number;
  vote_snapshot: number;
  vote_end: number;
  vote_start: number;
  label: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

export type MercuryProposalVotesResponse = {
  items: MercuryProposalVoteItem[];
  generatedAt: string;
  message?: string;
};

export type MercuryProposalDetailResponse = MercuryProposalDetailItem & {
  generatedAt: string;
  message?: string;
};

export type MercuryMintAuthorityItem = {
  authority: string;
  enabled: boolean;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
  source: 'owner' | 'mercury';
};

export type MercuryActivityResponse = {
  items: MercuryActivityItem[];
  generatedAt: string;
  message?: string;
};

export type MercuryMintAuthorityResponse = {
  items: MercuryMintAuthorityItem[];
  generatedAt: string;
  message?: string;
};

export type MercuryProgramStatusItem = {
  key: MercuryProgramKey;
  label: string;
  programId: number;
  projectName: string;
  running: boolean;
  totalExecutions: number;
  totalErrors: number;
  lastSuccessLedger: number | null;
  lastErrorLedger: number | null;
  lastErrorMessage: string | null;
  avgExecutionMs: number | null;
};

export type MercuryProgramStatusResponse = {
  items: MercuryProgramStatusItem[];
  generatedAt: string;
  message?: string;
};
