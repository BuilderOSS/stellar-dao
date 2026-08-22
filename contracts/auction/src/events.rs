use soroban_sdk::{contractevent, Address, Env};

use crate::storage::PaymentType;

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionCreated {
    #[topic]
    pub token_id: u128,
    pub start_ledger: u32,
    pub end_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidPlaced {
    #[topic]
    pub token_id: u128,
    #[topic]
    pub bidder: Address,
    pub amount: i128,
    pub payment_type: PaymentType,
    pub extended: bool,
    pub new_end_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionSettled {
    #[topic]
    pub token_id: u128,
    pub winner: Option<Address>,
    pub amount: i128,
    pub payment_type: PaymentType,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurationUpdated {
    pub duration: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservePriceUpdated {
    pub reserve_price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MinBidIncrementUpdated {
    pub min_bid_increment_percent: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeBufferUpdated {
    pub time_buffer: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentTokenUpdated {
    pub payment_token: Option<Address>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    pub treasury: Address,
}

// Event publishing helpers
pub fn emit_auction_created(e: &Env, token_id: u128, start_ledger: u32, end_ledger: u32) {
    AuctionCreated {
        token_id,
        start_ledger,
        end_ledger,
    }
    .publish(e);
}

pub fn emit_bid_placed(
    e: &Env,
    token_id: u128,
    bidder: &Address,
    amount: i128,
    payment_type: &PaymentType,
    extended: bool,
    new_end_ledger: u32,
) {
    BidPlaced {
        token_id,
        bidder: bidder.clone(),
        amount,
        payment_type: payment_type.clone(),
        extended,
        new_end_ledger,
    }
    .publish(e);
}

pub fn emit_auction_settled(
    e: &Env,
    token_id: u128,
    winner: &Option<Address>,
    amount: i128,
    payment_type: &PaymentType,
) {
    AuctionSettled {
        token_id,
        winner: winner.clone(),
        amount,
        payment_type: payment_type.clone(),
    }
    .publish(e);
}

pub fn emit_duration_updated(e: &Env, duration: u64) {
    DurationUpdated { duration }.publish(e);
}

pub fn emit_reserve_price_updated(e: &Env, reserve_price: i128) {
    ReservePriceUpdated { reserve_price }.publish(e);
}

pub fn emit_min_bid_increment_updated(e: &Env, min_bid_increment_percent: u32) {
    MinBidIncrementUpdated {
        min_bid_increment_percent,
    }
    .publish(e);
}

pub fn emit_time_buffer_updated(e: &Env, time_buffer: u64) {
    TimeBufferUpdated { time_buffer }.publish(e);
}

pub fn emit_payment_token_updated(e: &Env, payment_token: &Option<Address>) {
    PaymentTokenUpdated {
        payment_token: payment_token.clone(),
    }
    .publish(e);
}

pub fn emit_treasury_updated(e: &Env, treasury: &Address) {
    TreasuryUpdated {
        treasury: treasury.clone(),
    }
    .publish(e);
}

// Mercury indexing events removed - using contract events instead
