use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, Env, Symbol, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_macros::only_owner;

use crate::events::{emit_execute, emit_governor_changed, emit_treasury_initialized};
use crate::storage::*;

#[contract]
pub struct DaoTreasuryContract;

#[contractimpl]
impl DaoTreasuryContract {
    pub fn __constructor(e: &Env, owner: Address, governor: Address) {
        set_owner(e, &owner);
        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        emit_treasury_initialized(e, &owner, &governor);
    }

    #[only_owner]
    pub fn set_governor(e: &Env, governor: Address) {
        let old_governor = Self::governor(e);
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");

        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        emit_governor_changed(e, &old_governor, &governor, &changed_by);
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

        emit_execute(e, &governor, &target, &function, &args);

        result
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DaoTreasuryContract {}
