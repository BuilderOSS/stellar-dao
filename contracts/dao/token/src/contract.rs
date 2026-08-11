use soroban_sdk::{contract, contractimpl, Address, Env, String};
use stellar_access::ownable::{set_owner, Ownable};
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
    pub fn mint(e: &Env, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::mint(e, to, token_id);
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
    }

    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        NonFungibleVotes::transfer_from(e, spender, from, to, token_id);
    }

    fn ensure_self_delegate(e: &Env, account: &Address) {
        if get_delegate(e, account).is_none() {
            e.storage().persistent().set(&VotesStorageKey::Delegatee(account.clone()), account);
            emit_delegate_changed(e, account, None, account);
        }
    }
}

#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}

#[contractimpl(contracttrait)]
impl Ownable for DaoTokenContract {}
