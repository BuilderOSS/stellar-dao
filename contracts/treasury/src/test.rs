extern crate std;

use soroban_sdk::{contract, contractimpl, symbol_short, testutils::Address as _, vec, Address, Env, IntoVal, Val, Vec};
use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};

use crate::{DaoTreasuryContract, DaoTreasuryContractClient};

#[contract]
pub struct TargetContract;

#[contractimpl]
impl TargetContract {
    pub fn set_value(e: &Env, value: u32) -> u32 {
        e.storage().instance().set(&symbol_short!("value"), &value);
        value
    }

    pub fn get_value(e: &Env) -> u32 {
        e.storage().instance().get(&symbol_short!("value")).unwrap_or(0)
    }
}

#[test]
fn treasury_executes_arbitrary_call_for_governor() {
    let e = Env::default();
    e.mock_all_auths();

    let governor = Address::generate(&e);
    let treasury_id = e.register(DaoTreasuryContract, (governor.clone(),));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    let args: Vec<Val> = vec![&e, 7_u32.into_val(&e)];
    treasury.execute(&target.address, &symbol_short!("set_value"), &args);

    assert_eq!(target.get_value(), 7);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn treasury_rejects_non_governor() {
    let e = Env::default();
    let governor = Address::generate(&e);
    let attacker = Address::generate(&e);
    let treasury_id = e.register(DaoTreasuryContract, (governor.clone(),));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    let args: Vec<Val> = vec![&e, 7_u32.into_val(&e)];
    e.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &treasury.address,
            fn_name: "execute",
            args: (&target.address, symbol_short!("set_value"), &args).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    treasury.execute(&target.address, &symbol_short!("set_value"), &args);
}
