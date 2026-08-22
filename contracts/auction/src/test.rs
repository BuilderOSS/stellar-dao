#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

use crate::{
    contract::{AuctionContract, AuctionContractClient},
    error::AuctionError,
    storage::PaymentType,
};

fn create_token_contract<'a>(e: &Env, admin: &Address) -> (Address, TokenClient<'a>) {
    let contract_address = e.register_stellar_asset_contract_v2(admin.clone());
    let token = StellarAssetClient::new(e, &contract_address.address());
    (contract_address.address(), token.client())
}

fn setup_auction_contract<'a>(
    e: &Env,
) -> (
    AuctionContractClient<'a>,
    Address,
    Address,
    Address,
    TokenClient<'a>,
) {
    let owner = Address::generate(e);
    let treasury = Address::generate(e);
    let token_admin = Address::generate(e);

    // Create NFT token contract
    let (token_address, token_client) = create_token_contract(e, &token_admin);

    // Deploy auction contract
    let auction_address = e.register(AuctionContract, ());
    let auction = AuctionContractClient::new(e, &auction_address);

    // Initialize auction
    auction.__constructor(
        &owner,
        &token_address,
        &treasury,
        &100,        // duration: 100 ledgers
        &1_000_0000, // reserve price: 10 XLM (7 decimals)
        &10,         // 10% min bid increment
        &10,         // 10 ledger time buffer
        &None,       // No payment token (native XLM)
    );

    // Grant mint authority to auction contract
    token_client.mint(&auction_address, &1); // Mint one to grant authority
                                             // Note: In real implementation, we'd need to set mint_authority

    (auction, owner, treasury, auction_address, token_client)
}

#[test]
fn test_constructor() {
    let e = Env::default();
    let (auction, owner, treasury, _, _) = setup_auction_contract(&e);

    // Should start paused
    assert!(auction.paused());

    // Should have correct owner
    assert_eq!(auction.owner(), Some(owner));

    // Should have correct config
    let config = auction.get_config();
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 100);
    assert_eq!(config.reserve_price, 1_000_0000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 10);
    assert_eq!(config.payment_token, None);
}

#[test]
fn test_unpause_creates_first_auction() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, treasury, _, _) = setup_auction_contract(&e);

    // Unpause to create first auction
    auction.unpause(&owner);

    // Should no longer be paused
    assert!(!auction.paused());

    // Should have created an auction
    let auction_state = auction.get_auction();
    assert_eq!(auction_state.token_id, 0); // First token
    assert_eq!(auction_state.highest_bid, 0);
    assert_eq!(auction_state.highest_bidder, None);
    assert!(!auction_state.settled);

    // Owner should have transferred to treasury
    assert_eq!(auction.owner(), Some(treasury));
}

#[test]
fn test_first_bid_must_meet_reserve() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, _, _, _) = setup_auction_contract(&e);
    auction.unpause(&owner);

    let bidder = Address::generate(&e);
    let auction_state = auction.get_auction();

    // Try to bid below reserve - should fail
    // This is a simplified test - in reality we'd need to handle XLM transfers properly
    // For now, we test the SAC token path which is easier to test

    // TODO: Test reserve price validation with proper XLM handling
}

#[test]
fn test_bid_with_sac_token() {
    let e = Env::default();
    e.mock_all_auths();
    e.budget().reset_unlimited();

    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_admin = Address::generate(&e);
    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);

    // Create NFT token
    let (nft_address, nft_client) = create_token_contract(&e, &token_admin);

    // Create payment token (USDC-like)
    let (payment_address, payment_client) = create_token_contract(&e, &token_admin);

    // Deploy auction
    let auction_address = e.register(AuctionContract, ());
    let auction = AuctionContractClient::new(&e, &auction_address);

    auction.__constructor(
        &owner,
        &nft_address,
        &treasury,
        &100,
        &100_0000000, // 100 USDC reserve (7 decimals)
        &10,
        &10,
        &Some(payment_address.clone()),
    );

    // Mint payment tokens to bidders
    payment_client.mint(&bidder1, &1000_0000000); // 1000 USDC
    payment_client.mint(&bidder2, &2000_0000000); // 2000 USDC

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // First bid at reserve price
    auction.create_bid_with_token(&bidder1, &token_id, &100_0000000);

    let state = auction.get_auction();
    assert_eq!(state.highest_bid, 100_0000000);
    assert_eq!(state.highest_bidder, Some(bidder1.clone()));
    assert_eq!(
        state.payment_currency,
        PaymentType::SAC(payment_address.clone())
    );

    // Second bid with minimum increment (10%)
    auction.create_bid_with_token(&bidder2, &token_id, &110_0000000);

    let state = auction.get_auction();
    assert_eq!(state.highest_bid, 110_0000000);
    assert_eq!(state.highest_bidder, Some(bidder2.clone()));

    // Bidder1 should have been refunded
    assert_eq!(payment_client.balance(&bidder1), 1000_0000000);
    assert_eq!(payment_client.balance(&bidder2), 2000_0000000 - 110_0000000);
}

#[test]
fn test_time_extension() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, _, _, _) = setup_auction_contract(&e);
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let original_end = auction_state.end_ledger;

    // Advance to near the end (within time buffer)
    e.ledger().set_sequence_number(original_end - 5);

    // Place a bid (would need proper implementation)
    // Should extend the auction

    // TODO: Complete time extension test with proper bid placement
}

#[test]
fn test_config_updates_only_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, _, _, _) = setup_auction_contract(&e);

    // Should work when paused
    auction.set_duration(&owner, &200);
    assert_eq!(auction.get_config().duration, 200);

    auction.set_reserve_price(&owner, &2_000_0000);
    assert_eq!(auction.get_config().reserve_price, 2_000_0000);

    auction.set_min_bid_increment(&owner, &15);
    assert_eq!(auction.get_config().min_bid_increment_percent, 15);

    auction.set_time_buffer(&owner, &20);
    assert_eq!(auction.get_config().time_buffer, 20);

    // Unpause
    auction.unpause(&owner);

    // Should fail when not paused
    let result = auction.try_set_duration(&owner, &300);
    assert!(result.is_err());
}

#[test]
#[should_panic(expected = "InvalidConfig")]
fn test_invalid_config() {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_address = Address::generate(&e);

    let auction_address = e.register(AuctionContract, ());
    let auction = AuctionContractClient::new(&e, &auction_address);

    // Try to initialize with zero duration
    auction.__constructor(
        &owner,
        &token_address,
        &treasury,
        &0, // Invalid: zero duration
        &1_000_0000,
        &10,
        &10,
        &None,
    );
}

#[test]
fn test_settle_auction() {
    let e = Env::default();
    e.mock_all_auths();
    e.budget().reset_unlimited();

    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_admin = Address::generate(&e);
    let bidder = Address::generate(&e);

    // Create contracts
    let (nft_address, nft_client) = create_token_contract(&e, &token_admin);
    let (payment_address, payment_client) = create_token_contract(&e, &token_admin);

    let auction_address = e.register(AuctionContract, ());
    let auction = AuctionContractClient::new(&e, &auction_address);

    auction.__constructor(
        &owner,
        &nft_address,
        &treasury,
        &100,
        &100_0000000,
        &10,
        &10,
        &Some(payment_address.clone()),
    );

    // Mint payment tokens
    payment_client.mint(&bidder, &1000_0000000);

    // Start and bid
    auction.unpause(&owner);
    let token_id = auction.get_auction().token_id;
    auction.create_bid_with_token(&bidder, &token_id, &100_0000000);

    // Advance past end
    let end_ledger = auction.get_auction().end_ledger;
    e.ledger().set_sequence_number(end_ledger + 1);

    // Settle and create new
    auction.settle_and_create_new();

    // Old auction should be settled
    // New auction should be created
    let new_state = auction.get_auction();
    assert_ne!(new_state.token_id, token_id);
    assert!(!new_state.settled);
    assert_eq!(new_state.highest_bid, 0);

    // Treasury should have received payment
    assert_eq!(payment_client.balance(&treasury), 100_0000000);
}

#[test]
fn test_auction_with_no_bids() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, _, _, nft_client) = setup_auction_contract(&e);

    auction.unpause(&owner);
    let token_id = auction.get_auction().token_id;

    // Advance past end without bids
    let end_ledger = auction.get_auction().end_ledger;
    e.ledger().set_sequence_number(end_ledger + 1);

    // Settle - token should be burned
    auction.settle_and_create_new();

    // Should have created new auction
    let new_state = auction.get_auction();
    assert_ne!(new_state.token_id, token_id);
}

#[test]
fn test_ownership_transfer() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, owner, treasury, _, _) = setup_auction_contract(&e);

    // Start paused with owner
    assert_eq!(auction.owner(), Some(owner.clone()));

    // Unpause - ownership transfers to treasury
    auction.unpause(&owner);
    assert_eq!(auction.owner(), Some(treasury));
}

#[test]
fn test_multiple_consecutive_auctions() {
    let e = Env::default();
    e.mock_all_auths();
    e.budget().reset_unlimited();

    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_admin = Address::generate(&e);

    let (nft_address, _) = create_token_contract(&e, &token_admin);
    let (payment_address, payment_client) = create_token_contract(&e, &token_admin);

    let auction_address = e.register(AuctionContract, ());
    let auction = AuctionContractClient::new(&e, &auction_address);

    auction.__constructor(
        &owner,
        &nft_address,
        &treasury,
        &100,
        &100_0000000,
        &10,
        &10,
        &Some(payment_address.clone()),
    );

    auction.unpause(&owner);

    // Run 3 auctions
    for i in 0..3 {
        let bidder = Address::generate(&e);
        payment_client.mint(&bidder, &1000_0000000);

        let token_id = auction.get_auction().token_id;
        auction.create_bid_with_token(&bidder, &token_id, &100_0000000);

        // Advance and settle
        let end_ledger = auction.get_auction().end_ledger;
        e.ledger().set_sequence_number(end_ledger + 1);

        if i < 2 {
            auction.settle_and_create_new();
        }
    }

    // Treasury should have received 3 auctions worth of payments
    // (Actually 2, since we didn't settle the last one)
    assert_eq!(payment_client.balance(&treasury), 200_0000000);
}
