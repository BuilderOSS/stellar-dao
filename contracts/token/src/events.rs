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

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInitialized {
    #[topic]
    pub owner: Address,
    pub uri: String,
    pub name: String,
    pub symbol: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
    pub changed_by: Address,
}

// Custom event to track minter information (OpenZeppelin's Mint event doesn't include minter)
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintWithMinter {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

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

#[allow(unused_variables)]
pub fn emit_token_transfer(
    e: &Env,
    operator: &Address,
    from: &Address,
    to: &Address,
    token_id: u32,
) {
    #[cfg(feature = "mercury")]
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

#[allow(unused_variables)]
pub fn emit_approval_changed(
    e: &Env,
    owner: &Address,
    spender: &Address,
    token_id: u32,
    expiration_ledger: u32,
) {
    #[cfg(feature = "mercury")]
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

#[allow(unused_variables)]
pub fn emit_delegate_changed(
    e: &Env,
    delegator: &Address,
    from_delegate: Option<Address>,
    to_delegate: &Address,
) {
    #[cfg(feature = "mercury")]
    retroshade::DelegateChangedIndexed {
        delegator: delegator.clone(),
        from_delegate,
        to_delegate: to_delegate.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}
