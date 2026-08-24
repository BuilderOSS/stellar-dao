//! Event definitions and emission helpers for the Token contract.
//!
//! This module defines two types of events:
//!
//! 1. **Standard Soroban Events** - Published via `contractevent` macro for on-chain indexing
//! 2. **Mercury-Indexed Events** - Retroshade SDK events (when `mercury` feature is enabled)
//!    for enhanced off-chain querying via Mercury data indexer
//!
//! Most NFT lifecycle events (Transfer, Mint, Approve) are emitted automatically by
//! OpenZeppelin's Base and NonFungibleVotes implementations. This module only defines
//! custom events that add information not included in the standard events, such as
//! tracking the minter address and batch minting operations.

use soroban_sdk::{contractevent, Address};

#[cfg(feature = "mercury")]
mod retroshade {
    use super::*;
    use retroshade_sdk::Retroshade;
    use soroban_sdk::contracttype;

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenInitializedIndexed {
        pub owner: Address,
        pub uri: String,
        pub name: String,
        pub symbol: String,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenMintIndexed {
        pub minter: Address,
        pub to: Address,
        pub token_id: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenTransferIndexed {
        pub operator: Address,
        pub from: Address,
        pub to: Address,
        pub token_id: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ApprovalChangedIndexed {
        pub owner: Address,
        pub spender: Address,
        pub token_id: u32,
        pub expiration_ledger: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct MintAuthorityChangedIndexed {
        pub authority: Address,
        pub old_enabled: bool,
        pub enabled: bool,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct DelegateChangedIndexed {
        pub delegator: Address,
        pub from_delegate: Option<Address>,
        pub to_delegate: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct BatchMintIndexed {
        pub minter: Address,
        pub to: Address,
        pub amount: u32,
        pub last_token_id: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }
}

// Standard contract events

/// Emitted when the token contract is initialized.
///
/// Contains the initial owner and token metadata. This event is emitted once
/// during contract deployment via the `__constructor` function.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInitialized {
    #[topic]
    pub owner: Address,
    pub uri: String,
    pub name: String,
    pub symbol: String,
}

/// Emitted when minting authority is granted or revoked for an address.
///
/// Tracks changes to mint permissions, including who made the change (always the owner).
/// The owner always has implicit minting authority regardless of this flag.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
    pub changed_by: Address,
}

/// Custom event to track minter information during single token mints.
///
/// OpenZeppelin's standard Mint event doesn't include the minter address, only
/// the recipient. This custom event supplements it by tracking who performed the mint,
/// which is useful for auditing and analytics (e.g., distinguishing owner mints
/// from auction contract mints).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintWithMinter {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

/// Emitted when multiple tokens are minted in a single batch operation.
///
/// Supplements the individual Mint events (emitted per token) with a summary
/// of the batch operation, including the total amount and final token ID.
/// Useful for tracking bulk minting operations like initial distribution.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchMint {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub amount: u32,
    pub last_token_id: u32,
}

// Note: Transfer, Approve, and standard Mint events are emitted automatically by OpenZeppelin's Base trait
// We only define custom events here that add additional information or functionality

// Event helper functions

use soroban_sdk::{Env, String};

/// Emits a TokenInitialized event in both standard and Mercury-indexed formats.
///
/// Called once during contract initialization to record the deployment parameters.
pub fn emit_token_initialized(
    e: &Env,
    owner: &Address,
    uri: &String,
    name: &String,
    symbol: &String,
) {
    TokenInitialized {
        owner: owner.clone(),
        uri: uri.clone(),
        name: name.clone(),
        symbol: symbol.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TokenInitializedIndexed {
        owner: owner.clone(),
        uri: uri.clone(),
        name: name.clone(),
        symbol: symbol.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_mint_authority_changed(
    e: &Env,
    authority: &Address,
    old_enabled: bool,
    enabled: bool,
    changed_by: &Address,
) {
    MintAuthorityChanged {
        authority: authority.clone(),
        old_enabled,
        enabled,
        changed_by: changed_by.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::MintAuthorityChangedIndexed {
        authority: authority.clone(),
        old_enabled,
        enabled,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_token_mint(e: &Env, minter: &Address, to: &Address, token_id: u32) {
    MintWithMinter {
        minter: minter.clone(),
        to: to.clone(),
        token_id,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TokenMintIndexed {
        minter: minter.clone(),
        to: to.clone(),
        token_id,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_batch_mint(e: &Env, minter: &Address, to: &Address, amount: u32, last_token_id: u32) {
    BatchMint {
        minter: minter.clone(),
        to: to.clone(),
        amount,
        last_token_id,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::BatchMintIndexed {
        minter: minter.clone(),
        to: to.clone(),
        amount,
        last_token_id,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_token_transfer(
    e: &Env,
    operator: &Address,
    from: &Address,
    to: &Address,
    token_id: u32,
) {
    retroshade::TokenTransferIndexed {
        operator: operator.clone(),
        from: from.clone(),
        to: to.clone(),
        token_id,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_approval_changed(
    e: &Env,
    owner: &Address,
    spender: &Address,
    token_id: u32,
    expiration_ledger: u32,
) {
    retroshade::ApprovalChangedIndexed {
        owner: owner.clone(),
        spender: spender.clone(),
        token_id,
        expiration_ledger,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_delegate_changed(
    e: &Env,
    delegator: &Address,
    from_delegate: Option<Address>,
    to_delegate: &Address,
) {
    retroshade::DelegateChangedIndexed {
        delegator: delegator.clone(),
        from_delegate,
        to_delegate: to_delegate.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}
