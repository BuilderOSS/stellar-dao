export type TokenInventoryItem = {
  address: string;
  balance: string;
  delegated_to: string | null;
  voting_power: string;
  last_updated_ledger: number;
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
