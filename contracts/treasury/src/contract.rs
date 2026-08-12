use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Val, Vec};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_macros::only_owner;

#[cfg(feature = "mercury")]
mod retroshade {
    use super::*;
    use retroshade_sdk::Retroshade;
    use soroban_sdk::contracttype;

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TreasuryCallIndexed {
        pub governor: Address,
        pub target: Address,
        pub function: Symbol,
        pub args: Vec<Val>,
        pub ledger: u32,
        pub timestamp: u64,
    }
}

#[contracttype]
enum TreasuryKey {
    Governor,
}

#[contract]
pub struct DaoTreasuryContract;

#[contractimpl]
impl DaoTreasuryContract {
    pub fn __constructor(e: &Env, owner: Address, governor: Address) {
        set_owner(e, &owner);
        e.storage().instance().set(&TreasuryKey::Governor, &governor);
    }

    #[only_owner]
    pub fn set_governor(e: &Env, governor: Address) {
        e.storage().instance().set(&TreasuryKey::Governor, &governor);
    }

    pub fn governor(e: &Env) -> Address {
        e.storage().instance().get(&TreasuryKey::Governor).expect("governor not set")
    }

    pub fn execute(e: &Env, target: Address, function: Symbol, args: Vec<Val>) -> Val {
        let governor = Self::governor(e);
        governor.require_auth();
        let result = e.invoke_contract::<Val>(&target, &function, args.clone());

        #[cfg(feature = "mercury")]
        retroshade::TreasuryCallIndexed {
            governor: governor.clone(),
            target: target.clone(),
            function: function.clone(),
            args,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        result
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DaoTreasuryContract {}
