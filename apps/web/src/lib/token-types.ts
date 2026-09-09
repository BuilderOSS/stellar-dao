export type TokenInventoryItem = {
  address: string;
  owned_token_count: string;
  delegated_to: string | null;
  voting_power: string;
  last_activity_ledger: number;
};

export type TokenInventoryResponse = {
  items: TokenInventoryItem[];
  totalSupply: string;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
  message?: string;
};

export type TokenMetadataResponse = {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
};
