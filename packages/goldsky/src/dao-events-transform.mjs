const ACTOR_FIELDS = [
  'actor',
  'proposer',
  'bidder',
  'minter',
  'owner',
  'changed_by',
  'cancelled_by',
  'executor',
  'governor',
  'treasury',
  'new_treasury',
  'new_governor'
];

const ADDRESS_FIELDS = [
  'actor',
  'proposer',
  'bidder',
  'minter',
  'owner',
  'changed_by',
  'cancelled_by',
  'executor',
  'governor',
  'treasury',
  'new_treasury',
  'new_governor',
  'token_contract',
  'token_contract_id',
  'contract_id'
];

const EVENT_KIND = {
  TokenInitialized: 'token.initialized',
  MintWithMinter: 'token.mint',
  BatchMint: 'token.batch_mint',
  MintAuthorityChanged: 'token.mint_authority_changed',
  GovernorInitialized: 'governance.initialized',
  ProposalQueued: 'governance.proposal_queued',
  TreasuryChanged: 'governance.treasury_changed',
  TokenContractChanged: 'governance.token_contract_changed',
  QueueDelayChanged: 'governance.queue_delay_changed',
  VotingDelayChanged: 'governance.voting_delay_changed',
  VotingPeriodChanged: 'governance.voting_period_changed',
  ProposalThresholdChanged: 'governance.proposal_threshold_changed',
  QuorumBpsChanged: 'governance.quorum_bps_changed',
  GovernorAuthorityChanged: 'governance.authority_changed',
  TreasuryInitialized: 'treasury.initialized',
  GovernorChanged: 'treasury.governor_changed',
  Execute: 'treasury.execute',
  AuctionInitialized: 'auction.initialized',
  AuctionCreated: 'auction.created',
  BidPlaced: 'auction.bid_placed',
  AuctionSettled: 'auction.settled',
  DurationUpdated: 'auction.duration_updated',
  ReservePriceUpdated: 'auction.reserve_price_updated',
  MinBidIncrementUpdated: 'auction.min_bid_increment_updated',
  TimeBufferUpdated: 'auction.time_buffer_updated',
  PaymentTokenUpdated: 'auction.payment_token_updated',
  TreasuryUpdated: 'auction.treasury_updated',
  BidRefunded: 'auction.bid_refunded',
  AuctionCancelled: 'auction.cancelled'
};

const EVENT_TITLES = {
  TokenInitialized: 'Token initialized',
  MintWithMinter: 'Token minted',
  BatchMint: 'Batch mint completed',
  MintAuthorityChanged: 'Mint authority changed',
  GovernorInitialized: 'Governor initialized',
  ProposalQueued: 'Proposal queued',
  TreasuryChanged: 'Treasury changed',
  TokenContractChanged: 'Token contract changed',
  QueueDelayChanged: 'Queue delay updated',
  VotingDelayChanged: 'Voting delay updated',
  VotingPeriodChanged: 'Voting period updated',
  ProposalThresholdChanged: 'Proposal threshold updated',
  QuorumBpsChanged: 'Quorum updated',
  GovernorAuthorityChanged: 'Governor authority changed',
  TreasuryInitialized: 'Treasury initialized',
  GovernorChanged: 'Governor changed',
  Execute: 'Treasury executed call',
  AuctionInitialized: 'Auction initialized',
  AuctionCreated: 'Auction created',
  BidPlaced: 'Bid placed',
  AuctionSettled: 'Auction settled',
  DurationUpdated: 'Auction duration updated',
  ReservePriceUpdated: 'Reserve price updated',
  MinBidIncrementUpdated: 'Minimum bid increment updated',
  TimeBufferUpdated: 'Time buffer updated',
  PaymentTokenUpdated: 'Payment token updated',
  TreasuryUpdated: 'Treasury updated',
  BidRefunded: 'Bid refunded',
  AuctionCancelled: 'Auction cancelled'
};

function uniq(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function pickPayloadValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
    if (row.payload && row.payload[key] !== undefined && row.payload[key] !== null && row.payload[key] !== '') {
      return row.payload[key];
    }
  }
  return undefined;
}

export function normalizeGoldskyEventRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const eventId = row.event_id ?? row.id;
  const contractId = row.contract_id ?? row.contract_instance_id;
  if (!eventId || !contractId) {
    return null;
  }

  return {
    event_id: String(eventId),
    deployment_id: row.deployment_id ?? null,
    contract_instance_id: row.contract_instance_id ?? null,
    contract_id: String(contractId),
    event_type: row.event_type ?? row.event_name ?? null,
    event_name: row.event_name ?? row.event_type ?? null,
    topics: row.topics ?? null,
    data: row.data ?? null,
    payload: row.payload ?? null,
    transaction_hash: row.transaction_hash ?? null,
    operation_index: row.operation_index ?? null,
    event_index: row.event_index ?? null,
    transaction_successful: row.transaction_successful ?? null,
    ledger_sequence: row.ledger_sequence ?? null,
    ledger_hash: row.ledger_hash ?? null,
    ledger_closed_at: row.ledger_closed_at ?? null,
    transaction_index: row.transaction_index ?? null,
    operation_type: row.operation_type ?? null,
    _gs_op: row._gs_op ?? null,
    ingested_at: row.ingested_at ?? null
  };
}

export function buildActivityFeedRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const eventName = row.event_name ?? row.event_type;
  if (!eventName) {
    return null;
  }

  const kind = EVENT_KIND[eventName] ?? `contract.${String(eventName).toLowerCase()}`;
  const title = EVENT_TITLES[eventName] ?? String(eventName);
  const actor = pickPayloadValue(row, ACTOR_FIELDS) ?? null;
  const proposalId = pickPayloadValue(row, ['proposal_id']) ?? null;
  const proposalNumber = pickPayloadValue(row, ['proposal_number']) ?? null;
  const addresses = uniq(
    ADDRESS_FIELDS.map((key) => pickPayloadValue(row, [key])).filter(Boolean)
  );

  return {
    activity_id: row.event_id ?? row.id ?? null,
    deployment_id: row.deployment_id ?? null,
    kind,
    title,
    summary: buildSummary(eventName, row),
    proposal_id: proposalId,
    proposal_number: proposalNumber,
    actor,
    addresses,
    ledger_sequence: row.ledger_sequence ?? null,
    timestamp: row.timestamp ?? row.ledger_closed_at ?? null,
    transaction_hash: row.transaction_hash ?? null
  };
}

function buildSummary(eventName, row) {
  switch (eventName) {
    case 'TokenInitialized':
      return `Token ${pickPayloadValue(row, ['symbol']) ?? ''}`.trim();
    case 'MintWithMinter':
      return `Minted ${pickPayloadValue(row, ['token_id']) ?? 'token'} to ${pickPayloadValue(row, ['to']) ?? 'recipient'}`;
    case 'BatchMint':
      return `Minted ${pickPayloadValue(row, ['amount']) ?? 'batch'} tokens`;
    case 'ProposalQueued':
      return `Proposal ${pickPayloadValue(row, ['proposal_id']) ?? ''} queued`.trim();
    case 'Execute':
      return `Executed ${pickPayloadValue(row, ['function']) ?? 'call'} on ${pickPayloadValue(row, ['target']) ?? 'target'}`;
    case 'BidPlaced':
      return `Bid of ${pickPayloadValue(row, ['amount']) ?? 'unknown'} placed on token ${pickPayloadValue(row, ['token_id']) ?? 'unknown'}`;
    case 'AuctionSettled':
      return `Auction settled for token ${pickPayloadValue(row, ['token_id']) ?? 'unknown'}`;
    case 'AuctionCreated':
      return `Auction created for token ${pickPayloadValue(row, ['token_id']) ?? 'unknown'}`;
    default:
      return EVENT_TITLES[eventName] ?? String(eventName).replace(/_/g, ' ');
  }
}
