use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::error::AuctionError;

// Storage TTL constants - extend for ~30 days (518,400 seconds)
const LEDGERS_TO_LIVE: u32 = 518_400;
const MAX_TTL: u32 = 518_400;

// Maximum number of time extensions allowed per auction to prevent DoS
pub const MAX_AUCTION_EXTENSIONS: u32 = 10;

#[derive(Clone, Debug)]
#[contracttype]
pub enum DataKey {
    Config,
    Auction,
    Launched,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct AuctionConfig {
    /// The governance token contract to mint NFTs from
    pub token_contract: Address,
    /// The treasury address to receive auction proceeds
    pub treasury: Address,
    /// Duration of each auction in seconds
    pub duration: u64,
    /// Minimum first bid amount
    pub reserve_price: i128,
    /// Minimum bid increment as percentage (e.g., 10 = 10%)
    pub min_bid_increment_percent: u32,
    /// Time buffer in seconds - extends auction if bid placed near end
    pub time_buffer: u64,
    /// Optional SAC token for payments (None = native XLM only)
    pub payment_token: Option<Address>,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct AuctionState {
    /// The token ID being auctioned
    pub token_id: u128,
    /// Current highest bid amount
    pub highest_bid: i128,
    /// Current highest bidder (None if no bids yet)
    pub highest_bidder: Option<Address>,
    /// Timestamp when auction started
    pub start_time: u64,
    /// Timestamp when auction ends
    pub end_time: u64,
    /// Whether auction has been settled
    pub settled: bool,
    /// Payment type for this auction (locked on first bid)
    pub payment_currency: PaymentType,
    /// Number of time extensions applied to this auction
    pub extension_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum PaymentType {
    /// Native XLM payment
    Native,
    /// SAC token payment
    SAC(Address),
}

// Storage helpers with TTL management
pub fn get_config(e: &Env) -> AuctionConfig {
    // Extend TTL on read to prevent expiration
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotInitialized))
}

pub fn set_config(e: &Env, config: &AuctionConfig) {
    e.storage().instance().set(&DataKey::Config, config);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}

pub fn get_auction(e: &Env) -> AuctionState {
    if !is_launched(e) {
        panic_with_error!(e, AuctionError::NotLaunched);
    }
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Auction)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotInitialized))
}

pub fn set_auction(e: &Env, auction: &AuctionState) {
    e.storage().instance().set(&DataKey::Auction, auction);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}

pub fn is_launched(e: &Env) -> bool {
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Launched)
        .unwrap_or(false)
}

pub fn set_launched(e: &Env, launched: bool) {
    e.storage().instance().set(&DataKey::Launched, &launched);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}
