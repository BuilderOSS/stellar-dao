export type TokenInventoryItem = {
  tokenId: number;
  owner: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

export type TokenInventoryResponse = {
  items: TokenInventoryItem[];
  totalSupply: number;
  generatedAt: string;
  message?: string;
};

export type TokenMetadataResponse = {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
};
