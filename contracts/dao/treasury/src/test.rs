extern crate std;

use soroban_sdk::{contract, contractimpl, symbol_short, testutils::Address as _, vec, Address, Env, IntoVal, Val, Vec};

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
