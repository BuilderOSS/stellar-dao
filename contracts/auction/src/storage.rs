use soroban_sdk::{contracttype, Address, Env};

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
    /// Duration of each auction in ledgers
    pub duration: u64,
    /// Minimum first bid amount
    pub reserve_price: i128,
    /// Minimum bid increment as percentage (e.g., 10 = 10%)
    pub min_bid_increment_percent: u32,
    /// Time buffer in ledgers - extends auction if bid placed near end
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
    /// Ledger sequence when auction started
    pub start_ledger: u32,
    /// Ledger sequence when auction ends
    pub end_ledger: u32,
    /// Whether auction has been settled
    pub settled: bool,
    /// Payment type for this auction
    pub payment_currency: PaymentType,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum PaymentType {
    /// Native XLM payment
    Native,
    /// SAC token payment
    SAC(Address),
}

// Storage helpers
pub fn get_config(e: &Env) -> AuctionConfig {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

pub fn set_config(e: &Env, config: &AuctionConfig) {
    e.storage().instance().set(&DataKey::Config, config);
}

pub fn get_auction(e: &Env) -> AuctionState {
    e.storage().instance().get(&DataKey::Auction).unwrap()
}

pub fn set_auction(e: &Env, auction: &AuctionState) {
    e.storage().instance().set(&DataKey::Auction, auction);
}

pub fn is_launched(e: &Env) -> bool {
    e.storage()
        .instance()
        .get(&DataKey::Launched)
        .unwrap_or(false)
}

pub fn set_launched(e: &Env, launched: bool) {
    e.storage().instance().set(&DataKey::Launched, &launched);
}
