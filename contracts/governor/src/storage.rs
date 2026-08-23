use soroban_sdk::{contracttype, Address, BytesN};
use stellar_governance::governor::ProposalState;

// TTL constants for proposal storage
// Proposals can stay active for voting_delay + voting_period + queue_delay
// Using 60 days (518,400 ledgers) to safely cover max governance timeline
pub const DAY_IN_LEDGERS: u32 = 17280; // ~5 seconds per ledger
pub const PROPOSAL_TTL_EXTEND_AMOUNT: u32 = 60 * DAY_IN_LEDGERS; // 60 days
pub const PROPOSAL_TTL_THRESHOLD: u32 = PROPOSAL_TTL_EXTEND_AMOUNT - DAY_IN_LEDGERS; // 59 days

// Basis points constants for quorum calculation
// BPS = basis points (1 BPS = 0.01%)
pub const BPS_DENOMINATOR: u128 = 10_000; // 100.00% = 10,000 basis points
pub const BPS_ROUNDING_ADJUSTMENT: u128 = BPS_DENOMINATOR - 1; // 9,999 for ceiling division

// Proposal expiration period for queued proposals
// After ETA + 14 days, queued proposals become expired and cannot be executed
// Non-queued proposals (Pending, Active, Succeeded, Defeated) can stay forever
pub const PROPOSAL_EXPIRATION_PERIOD: u64 = 1_209_600; // 14 days in seconds (14 * 24 * 3600)

#[contracttype]
pub enum GovernorKey {
    Treasury,
    QueueDelay,
    Proposal(BytesN<32>),
    GovernorAuthority(Address),
}

#[contracttype]
#[derive(Clone)]
pub struct ProposalCoreTime {
    pub proposer: Address,
    pub vote_snapshot: u32,
    pub vote_start: u64, // Changed to u64 to store timestamps without conversion
    pub vote_end: u64,   // Changed to u64 to store timestamps without conversion
    pub eta: u64,
    pub state: ProposalState,
}
