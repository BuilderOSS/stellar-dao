use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::votes::{emit_delegate_changed as emit_library_delegate_changed, get_delegate, Votes, VotesStorageKey};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

use crate::error::TokenError;
use crate::events::{emit_batch_mint, emit_mint_authority_changed, emit_token_initialized, emit_token_mint};
#[cfg(feature = "mercury")]
use crate::events::{emit_approval_changed, emit_delegate_changed, emit_token_transfer};
use crate::storage::*;

#[contract]
pub struct DaoTokenContract;

#[contractimpl]
impl DaoTokenContract {
    pub fn __constructor(e: &Env, owner: Address, uri: String, name: String, symbol: String) {
        Base::set_metadata(e, uri.clone(), name.clone(), symbol.clone());
        set_owner(e, &owner);
        emit_token_initialized(e, &owner, &uri, &name, &symbol);
    }

    #[only_owner]
    pub fn set_mint_authority(e: &Env, authority: Address, enabled: bool) {
        let old_enabled = Self::mint_authority(e, authority.clone());
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");

        e.storage()
            .instance()
            .set(&TokenKey::MintAuthority(authority.clone()), &enabled);

        emit_mint_authority_changed(e, &authority, old_enabled, enabled, &changed_by);
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
        // Note: OpenZeppelin's NonFungibleVotes::sequential_mint() automatically emits standard Mint event

        emit_token_mint(e, minter, to, token_id);
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

        for _ in 0..amount {
            let token_id = NonFungibleVotes::sequential_mint(e, to);
            last_token_id = token_id;
        }

        emit_batch_mint(e, minter, to, amount, last_token_id);
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
        // Note: OpenZeppelin's NonFungibleVotes::transfer() automatically emits standard Transfer event

        #[cfg(feature = "mercury")]
        emit_token_transfer(e, from, from, to, token_id);
    }

    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer_from(e, spender, from, to, token_id);
        // Note: OpenZeppelin's NonFungibleVotes::transfer_from() automatically emits standard Transfer event

        #[cfg(feature = "mercury")]
        emit_token_transfer(e, spender, from, to, token_id);
    }

    pub fn approve(
        e: &Env,
        owner: &Address,
        spender: &Address,
        token_id: u32,
        expiration_ledger: u32,
    ) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);
        // Note: OpenZeppelin's Base::approve() automatically emits standard Approve event

        #[cfg(feature = "mercury")]
        emit_approval_changed(e, owner, spender, token_id, expiration_ledger);
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
            emit_library_delegate_changed(e, account, None, account);

            // Emit custom retroshade event
            #[cfg(feature = "mercury")]
            emit_delegate_changed(e, account, None, account);

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
