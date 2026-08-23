use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttype, vec, Address, Env, Symbol, Val, Vec,
};
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

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TreasuryInitializedIndexed {
        pub owner: Address,
        pub governor: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct GovernorChangedIndexed {
        pub old_governor: Address,
        pub new_governor: Address,
        pub changed_by: Address,
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
        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        #[cfg(feature = "mercury")]
        retroshade::TreasuryInitializedIndexed {
            owner,
            governor,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    #[only_owner]
    pub fn set_governor(e: &Env, governor: Address) {
        #[cfg(feature = "mercury")]
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");
        #[cfg(feature = "mercury")]
        let old_governor = Self::governor(e);

        let old_governor_for_event = Self::governor(e);

        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (
                Symbol::new(e, "governor_changed"),
                old_governor_for_event.clone(),
                governor.clone(),
            ),
            ()
        );

        #[cfg(feature = "mercury")]
        retroshade::GovernorChangedIndexed {
            old_governor,
            new_governor: governor,
            changed_by,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn governor(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&TreasuryKey::Governor)
            .expect("governor not set")
    }

    pub fn execute(e: &Env, target: Address, function: Symbol, args: Vec<Val>) -> Val {
        let governor = Self::governor(e);
        governor.require_auth();

        // Authorize this Treasury contract as the authorizer of the
        // immediate target function invocation.
        //
        // If deeper downstream invocations require Treasury authorization,
        // those invocations must also be represented in `sub_invocations`.
        e.authorize_as_current_contract(vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: target.clone(),
                    fn_name: function.clone(),
                    args: args.clone(),
                },
                sub_invocations: vec![e],
            }),
        ]);

        let result = e.invoke_contract::<Val>(&target, &function, args.clone());

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "execute"), governor.clone(), target.clone()),
            (function.clone(),)
        );

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
