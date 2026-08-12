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
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
  addresses: string[];
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
