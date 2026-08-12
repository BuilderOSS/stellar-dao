use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};
use stellar_access::ownable::{get_owner, set_owner, Ownable};
use stellar_governance::votes::{emit_delegate_changed, get_delegate, Votes, VotesStorageKey};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

#[cfg(feature = "mercury")]
mod retroshade {
    use super::*;
    use retroshade_sdk::Retroshade;
    use soroban_sdk::contracttype;

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenMintIndexed {
        pub to: Address,
        pub token_id: u32,
        pub ledger: u32,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenTransferIndexed {
        pub from: Address,
        pub to: Address,
        pub token_id: u32,
        pub ledger: u32,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct DelegateChangedIndexed {
        pub delegator: Address,
        pub from_delegate: Option<Address>,
        pub to_delegate: Address,
        pub ledger: u32,
    }
}

#[contracttype]
enum TokenKey {
    MintAuthority(Address),
}

#[contract]
pub struct DaoTokenContract;

#[contractimpl]
impl DaoTokenContract {
    pub fn __constructor(e: &Env, owner: Address, uri: String, name: String, symbol: String) {
        Base::set_metadata(e, uri, name, symbol);
        set_owner(e, &owner);
    }

    #[only_owner]
    pub fn set_mint_authority(e: &Env, authority: Address, enabled: bool) {
        e.storage().instance().set(&TokenKey::MintAuthority(authority), &enabled);
    }

    pub fn mint_authority(e: &Env, authority: Address) -> bool {
        e.storage().instance().get(&TokenKey::MintAuthority(authority)).unwrap_or(false)
    }

    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);
        let token_id = NonFungibleVotes::sequential_mint(e, to);

        #[cfg(feature = "mercury")]
        retroshade::TokenMintIndexed {
            to: to.clone(),
            token_id,
            ledger: e.ledger().sequence(),
        }
        .emit(e);

        token_id
    }

    pub fn balance(e: &Env, account: &Address) -> u32 {
        Base::balance(e, account)
    }

    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        Base::owner_of(e, token_id)
    }

    pub fn approve(e: &Env, owner: &Address, spender: &Address, token_id: u32, expiration_ledger: u32) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);
    }

    pub fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer(e, from, to, token_id);

        #[cfg(feature = "mercury")]
        retroshade::TokenTransferIndexed {
            from: from.clone(),
            to: to.clone(),
            token_id,
            ledger: e.ledger().sequence(),
        }
        .emit(e);
    }

    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer_from(e, spender, from, to, token_id);

        #[cfg(feature = "mercury")]
        retroshade::TokenTransferIndexed {
            from: from.clone(),
            to: to.clone(),
            token_id,
            ledger: e.ledger().sequence(),
        }
        .emit(e);
    }

    fn ensure_self_delegate(e: &Env, account: &Address) {
        if get_delegate(e, account).is_none() {
            e.storage().persistent().set(&VotesStorageKey::Delegatee(account.clone()), account);
            emit_delegate_changed(e, account, None, account);

            #[cfg(feature = "mercury")]
            retroshade::DelegateChangedIndexed {
                delegator: account.clone(),
                from_delegate: None,
                to_delegate: account.clone(),
                ledger: e.ledger().sequence(),
            }
            .emit(e);
        }
    }

    fn ensure_mint_authority(e: &Env, minter: &Address) {
        let Some(owner) = get_owner(e) else {
            panic!("owner not set");
        };

        if minter == &owner || Self::mint_authority(e, minter.clone()) {
            return;
        }

        panic!("mint authority not allowed");
    }
}

#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}

#[contractimpl(contracttrait)]
impl Ownable for DaoTokenContract {}
