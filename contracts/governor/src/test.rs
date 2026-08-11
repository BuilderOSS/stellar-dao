extern crate std;

use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};
use soroban_sdk::{contract, contractimpl, symbol_short, testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke}, vec, Address, BytesN, Env, IntoVal, String, Val, Vec};
use stellar_governance::governor::ProposalState;

use crate::{DaoGovernorContract, DaoGovernorContractClient};

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

fn setup() -> (Env, DaoTokenContractClient<'static>, DaoTreasuryContractClient<'static>, DaoGovernorContractClient<'static>, TargetContractClient<'static>, Address) {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    let governor_id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            10_u32,
            100_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    treasury.set_governor(&governor_id);

    (e, token, treasury, governor, target, owner)
}

fn proposal_args(e: &Env, target: &Address) -> Vec<Vec<Val>> {
    let call_args: Vec<Val> = vec![
        e,
        target.clone().into_val(e),
        symbol_short!("set_value").into_val(e),
        vec![e, 42_u32].into_val(e),
    ];
    vec![e, call_args]
}

fn description_hash(e: &Env, description: &String) -> BytesN<32> {
    e.crypto().keccak256(&description.to_bytes()).to_bytes()
}

#[test]
fn full_governance_flow_executes_treasury_call() {
    let (e, token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    token.mint(&proposer, &1);
    assert_eq!(token.get_votes(&proposer), 1);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, treasury_address.clone()];
    let functions = vec![&e, symbol_short!("execute")];
    let args = proposal_args(&e, &target.address);
    let description = String::from_str(&e, "Call target through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Pending);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
#[should_panic(expected = "#5002")]
fn propose_fails_below_threshold() {
    let (e, _token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, treasury_address.clone()];
    let functions = vec![&e, symbol_short!("execute")];
    let args = proposal_args(&e, &target.address);
    let description = String::from_str(&e, "Not enough votes");

    let _ = governor.propose(&targets, &functions, &args, &description, &proposer);
}

#[test]
#[should_panic]
fn execute_rejects_non_treasury_target() {
    let (e, token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    token.mint(&proposer, &1);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = vec![&e, vec![&e, 42_u32].into_val(&e)];
    let description = String::from_str(&e, "Call target directly");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_111);

    let _ = governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
}

#[test]
#[should_panic(expected = "#5008")]
fn execute_cannot_run_twice() {
    let (e, token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    token.mint(&proposer, &1);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, treasury_address.clone()];
    let functions = vec![&e, symbol_short!("execute")];
    let args = proposal_args(&e, &target.address);
    let description = String::from_str(&e, "Execute twice");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_111);

    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
}

#[test]
fn quorum_uses_total_supply_bps() {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let governor_id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            0_u32,
            100_u32,
            1_u128,
            3_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    for token_id in 0..10_u32 {
        token.mint(&owner, &token_id);
    }

    e.ledger().set_sequence_number(102);

    assert_eq!(governor.quorum(&(e.ledger().sequence() - 1)), 3);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn set_treasury_requires_owner() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let attacker = Address::generate(&e);
    let new_treasury = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let governor_id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            token_id,
            treasury_id,
            10_u32,
            100_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    e.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_treasury",
            args: (&new_treasury,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_treasury(&new_treasury);
}
