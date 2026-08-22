#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::contract::{AuctionContract, AuctionContractClient};

fn setup_auction_contract(
    e: &Env,
) -> (
    AuctionContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    let owner = Address::generate(e);
    let treasury = Address::generate(e);
    let token_contract = Address::generate(e); // Mock NFT token contract address

    // Deploy and initialize auction contract
    let auction_address = e.register(
        AuctionContract,
        (
            owner.clone(),
            token_contract.clone(),
            treasury.clone(),
            100_u64,         // duration: 100 ledgers
            1_000_0000_i128, // reserve price: 10 XLM (7 decimals)
            10_u32,          // 10% min bid increment
            10_u64,          // 10 ledger time buffer
            None::<Address>, // No payment token (native XLM)
        ),
    );
    let auction = AuctionContractClient::new(e, &auction_address);

    (auction, owner, treasury, token_contract, auction_address)
}

#[test]
fn test_constructor() {
    let e = Env::default();

    let (auction, owner, treasury, token_contract, _) = setup_auction_contract(&e);

    // Should start paused
    assert!(auction.paused());

    // Should have correct owner
    assert_eq!(auction.get_owner(), Some(owner));

    // Should have correct config
    let config = auction.get_config();
    assert_eq!(config.token_contract, token_contract);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 100);
    assert_eq!(config.reserve_price, 1_000_0000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 10);
    assert_eq!(config.payment_token, None);
}

#[test]
fn test_config_getters() {
    let e = Env::default();

    let (auction, _, treasury, token_contract, _) = setup_auction_contract(&e);

    let config = auction.get_config();
    assert_eq!(config.token_contract, token_contract);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 100);
    assert_eq!(config.reserve_price, 1_000_0000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 10);
    assert_eq!(config.payment_token, None);
}

#[test]
fn test_paused_state() {
    let e = Env::default();

    let (auction, _, _, _, _) = setup_auction_contract(&e);

    // Should start paused
    assert!(auction.paused());
}

// Note: Full integration tests (unpause, bidding, settlement, token minting, etc.)
// are in the e2e test suite where we can properly mock token contracts and test
// the complete auction flow with actual token interactions.
