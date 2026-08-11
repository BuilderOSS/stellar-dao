extern crate std;

use governor::{DaoGovernorContract, DaoGovernorContractClient};
use soroban_sdk::{contract, contractimpl, symbol_short, testutils::{Address as _, Ledger}, vec, Address, BytesN, Env, IntoVal, String, Val, Vec};
use stellar_governance::governor::ProposalState;
use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};

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

    let treasury_id = e.register(DaoTreasuryContract, (Address::generate(&e),));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    let governor_id = e.register(
        DaoGovernorContract,
        (
            token_id.clone(),
            treasury_id.clone(),
            10_u32,
            100_u32,
            1_u128,
            1_u128,
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
fn dao_flow_executes_treasury_call() {
    let (e, token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    token.mint(&proposer, &1);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, treasury_address.clone()];
    let functions = vec![&e, symbol_short!("execute")];
    let args = proposal_args(&e, &target.address);
    let description = String::from_str(&e, "Call target through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
fn transfer_after_snapshot_does_not_change_vote_outcome() {
    let (e, token, _treasury, governor, target, _) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    token.mint(&alice, &1);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, treasury_address.clone()];
    let functions = vec![&e, symbol_short!("execute")];
    let args = proposal_args(&e, &target.address);
    let description = String::from_str(&e, "Snapshot transfer test");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &alice);

    e.ledger().set_timestamp(2_011);
    token.transfer(&alice, &bob, &1);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "bob yes"), &bob);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Defeated);

    let _ = desc_hash;
}
