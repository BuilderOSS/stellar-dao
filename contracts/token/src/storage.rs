use soroban_sdk::{contracttype, Address};

pub const MAX_BATCH_MINT: u32 = 100;

// TTL constants for delegation storage
// Delegations should persist long-term as they represent voting power delegation
pub const DAY_IN_LEDGERS: u32 = 17280; // ~5 seconds per ledger
pub const DELEGATION_TTL_EXTEND_AMOUNT: u32 = 365 * DAY_IN_LEDGERS; // 1 year
pub const DELEGATION_TTL_THRESHOLD: u32 = DELEGATION_TTL_EXTEND_AMOUNT - DAY_IN_LEDGERS; // ~364 days

#[contracttype]
pub enum TokenKey {
    MintAuthority(Address),
}
