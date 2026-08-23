use soroban_sdk::{contract, contractimpl, contracterror, contracttype, panic_with_error, Address, Env, String};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::votes::{emit_delegate_changed, get_delegate, Votes, VotesStorageKey};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    /// Batch mint amount is invalid (must be 1-100)
    InvalidBatchMintAmount = 1101,
    /// Owner not set in contract storage
    OwnerNotSet = 1102,
    /// Minter is not authorized to mint tokens
    MintAuthorityNotAllowed = 1103,
}

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
}

// Standard contract events
use soroban_sdk::contractevent;

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mint {
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

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub owner: Address,
    #[topic]
    pub spender: Address,
    pub token_id: u32,
    pub expiration_ledger: u32,
}

const MAX_BATCH_MINT: u32 = 100;

// TTL constants for delegation storage
// Delegations should persist long-term as they represent voting power delegation
const DAY_IN_LEDGERS: u32 = 17280; // ~5 seconds per ledger
const DELEGATION_TTL_EXTEND_AMOUNT: u32 = 365 * DAY_IN_LEDGERS; // 1 year
const DELEGATION_TTL_THRESHOLD: u32 = DELEGATION_TTL_EXTEND_AMOUNT - DAY_IN_LEDGERS; // ~364 days

#[contracttype]
enum TokenKey {
    MintAuthority(Address),
}

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
