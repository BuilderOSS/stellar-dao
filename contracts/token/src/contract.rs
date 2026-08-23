use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::votes::{emit_delegate_changed, get_delegate, Votes, VotesStorageKey};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

use crate::error::TokenError;
use crate::events::*;
use crate::storage::*;

#[contract]
pub struct DaoTokenContract;

#[contractimpl]
impl DaoTokenContract {
    pub fn __constructor(e: &Env, owner: Address, uri: String, name: String, symbol: String) {
        #[cfg(feature = "mercury")]
        let uri_for_event = uri.clone();
        #[cfg(feature = "mercury")]
        let name_for_event = name.clone();
        #[cfg(feature = "mercury")]
        let symbol_for_event = symbol.clone();
        Base::set_metadata(e, uri, name, symbol);
        set_owner(e, &owner);

        #[cfg(feature = "mercury")]
        retroshade::TokenInitializedIndexed {
            owner,
            uri: uri_for_event,
            name: name_for_event,
            symbol: symbol_for_event,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    #[only_owner]
    pub fn set_mint_authority(e: &Env, authority: Address, enabled: bool) {
        #[cfg(feature = "mercury")]
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");
        #[cfg(feature = "mercury")]
        let old_enabled = Self::mint_authority(e, authority.clone());

        let old_enabled_for_event = Self::mint_authority(e, authority.clone());

        e.storage()
            .instance()
            .set(&TokenKey::MintAuthority(authority.clone()), &enabled);

        // Emit standard event with topics for efficient filtering
        MintAuthorityChanged {
            authority: authority.clone(),
            old_enabled: old_enabled_for_event,
            enabled,
        }
        .publish(e);

        #[cfg(feature = "mercury")]
        retroshade::MintAuthorityChangedIndexed {
            authority,
            old_enabled,
            enabled,
            changed_by,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn mint_authority(e: &Env, authority: Address) -> bool {
        e.storage()
            .instance()
            .get(&TokenKey::MintAuthority(authority))
            .unwrap_or(false)
    }

    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);
        let token_id = NonFungibleVotes::sequential_mint(e, to);

        // Emit standard event with topics for efficient filtering
        Mint {
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

        token_id
    }

    pub fn batch_mint(e: &Env, minter: &Address, to: &Address, amount: u32) -> u32 {
        if amount == 0 || amount > MAX_BATCH_MINT {
            panic_with_error!(e, TokenError::InvalidBatchMintAmount);
        }

        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);

        let mut last_token_id = 0;

        #[cfg(feature = "mercury")]
        let ledger = e.ledger().sequence();
        #[cfg(feature = "mercury")]
        let timestamp = e.ledger().timestamp();

        for _ in 0..amount {
            let token_id = NonFungibleVotes::sequential_mint(e, to);
            last_token_id = token_id;

            #[cfg(feature = "mercury")]
            retroshade::TokenMintIndexed {
                minter: minter.clone(),
                to: to.clone(),
                token_id,
                ledger,
                timestamp,
            }
            .emit(e);
        }

        // Emit standard event for batch mint operation with topics for efficient filtering
        BatchMint {
            minter: minter.clone(),
            to: to.clone(),
            amount,
            last_token_id,
        }
        .publish(e);

        last_token_id
    }

    pub fn balance(e: &Env, account: &Address) -> u32 {
        Base::balance(e, account)
    }

    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        Base::owner_of(e, token_id)
    }

    pub fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer(e, from, to, token_id);

        // Emit standard event with topics for efficient filtering
        Transfer {
            from: from.clone(),
            to: to.clone(),
            token_id,
        }
        .publish(e);

        #[cfg(feature = "mercury")]
        retroshade::TokenTransferIndexed {
            operator: from.clone(),
            from: from.clone(),
            to: to.clone(),
            token_id,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer_from(e, spender, from, to, token_id);

        // Emit standard event with topics for efficient filtering
        Transfer {
            from: from.clone(),
            to: to.clone(),
            token_id,
        }
        .publish(e);

        #[cfg(feature = "mercury")]
        retroshade::TokenTransferIndexed {
            operator: spender.clone(),
            from: from.clone(),
            to: to.clone(),
            token_id,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn approve(
        e: &Env,
        owner: &Address,
        spender: &Address,
        token_id: u32,
        expiration_ledger: u32,
    ) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);

        // Emit standard event with topics for efficient filtering
        Approve {
            owner: owner.clone(),
            spender: spender.clone(),
            token_id,
            expiration_ledger,
        }
        .publish(e);

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

    /// Extends the TTL of delegation data to ensure it persists long-term
    fn extend_delegation_ttl(e: &Env, account: &Address) {
        let key = VotesStorageKey::Delegatee(account.clone());
        e.storage().persistent().extend_ttl(
            &key,
            DELEGATION_TTL_THRESHOLD,
            DELEGATION_TTL_EXTEND_AMOUNT,
        );
    }

    /// Ensures an account has a delegate set, defaulting to self-delegation.
    ///
    /// This function auto-delegates to self if no delegation exists, providing
    /// better UX by ensuring users automatically receive voting power when they
    /// receive tokens.
    ///
    /// Note: We cannot use `stellar_governance::votes::delegate()` here because
    /// it requires authentication from the account. Instead, we:
    /// 1. Set the delegatee storage directly (before minting/transfer)
    /// 2. Let `transfer_voting_units()` (called by mint/transfer) handle vote movement
    ///
    /// This approach is safe because:
    /// - Storage write happens before vote transfer
    /// - `transfer_voting_units()` properly updates voting power checkpoints
    /// - Events are emitted for transparency
    fn ensure_self_delegate(e: &Env, account: &Address) {
        if get_delegate(e, account).is_none() {
            // Set delegatee storage (same as library's delegate() function)
            e.storage()
                .persistent()
                .set(&VotesStorageKey::Delegatee(account.clone()), account);

            // Emit standard delegation event (same as library)
            emit_delegate_changed(e, account, None, account);

            // Emit Mercury indexing event
            #[cfg(feature = "mercury")]
            retroshade::DelegateChangedIndexed {
                delegator: account.clone(),
                from_delegate: None,
                to_delegate: account.clone(),
                ledger: e.ledger().sequence(),
                timestamp: e.ledger().timestamp(),
            }
            .emit(e);

            // Note: Vote movement happens automatically when transfer_voting_units()
            // is called by sequential_mint() or transfer(), which looks up the
            // delegatee we just set and properly updates voting power checkpoints.
        }

        // Always extend TTL when delegation is checked/used
        Self::extend_delegation_ttl(e, account);
    }

    fn ensure_mint_authority(e: &Env, minter: &Address) {
        let Some(owner) = stellar_access::ownable::get_owner(e) else {
            panic_with_error!(e, TokenError::OwnerNotSet);
        };

        if minter == &owner || Self::mint_authority(e, minter.clone()) {
            return;
        }

        panic_with_error!(e, TokenError::MintAuthorityNotAllowed);
    }
}

#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}

#[contractimpl(contracttrait)]
impl Ownable for DaoTokenContract {}
