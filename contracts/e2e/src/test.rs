extern crate std;

use governor::{DaoGovernorContract, DaoGovernorContractClient};
use soroban_sdk::{contract, contractimpl, symbol_short, Symbol, testutils::{Address as _, Ledger}, vec, Address, BytesN, Env, IntoVal, String, Val, Vec};
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

// Malicious contract that attempts reentrancy during execution
#[contract]
pub struct MaliciousReentrantContract;

#[contractimpl]
impl MaliciousReentrantContract {
    /// Attempts to re-enter governor.execute() during execution
    /// This should fail because the proposal state is updated before external calls
    pub fn reentry(
        e: &Env,
        governor: Address,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
        executor: Address,
    ) {
        // Mark that attack was attempted
        e.storage().instance().set(&symbol_short!("attack"), &1);

        // Try to re-enter execute() - should fail with ProposalAlreadyExecuted
        let gov_client = DaoGovernorContractClient::new(e, &governor);
        gov_client.execute(&targets, &functions, &args, &desc_hash, &executor);

        // If we get here, the reentrancy attack succeeded (BAD!)
        e.storage().instance().set(&symbol_short!("success"), &true);
    }

    pub fn get_attack_count(e: &Env) -> u32 {
        e.storage().instance().get(&symbol_short!("attack")).unwrap_or(0)
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
            300_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    treasury.set_governor(&governor_id);
    token.set_mint_authority(&treasury.address, &true);

    (e, token, treasury, governor, target, owner)
}

fn proposal_args(e: &Env) -> Vec<Vec<Val>> {
    // Args for calling target.set_value(42)
    vec![e, vec![e, 42_u32.into_val(e)]]
}

fn mint_proposal_args(e: &Env, treasury: &Address, recipient: &Address) -> Vec<Vec<Val>> {
    // Args for calling token.mint(treasury, recipient)
    vec![e, vec![e, treasury.clone().into_val(e), recipient.clone().into_val(e)]]
}

fn batch_mint_proposal_args(e: &Env, treasury: &Address, recipient: &Address, amount: u32) -> Vec<Vec<Val>> {
    // Args for calling token.batch_mint(treasury, recipient, amount)
    vec![e, vec![e, treasury.clone().into_val(e), recipient.clone().into_val(e), amount.into_val(e)]]
}

fn description_hash(e: &Env, description: &String) -> BytesN<32> {
    e.crypto().keccak256(&description.to_bytes()).to_bytes()
}

#[test]
fn dao_flow_executes_treasury_call() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Call target through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.queue(&targets, &functions, &args, &desc_hash, &2_411_u32, &proposer);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
fn transfer_after_snapshot_does_not_change_vote_outcome() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    let token_id = token.mint(&owner, &alice);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Snapshot transfer test");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &alice);

    e.ledger().set_timestamp(2_011);
    // Transfer token after snapshot - bob receives token but had 0 power at snapshot
    token.transfer(&alice, &bob, &token_id);

    // Alice can still vote (had power at snapshot)
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "alice yes"), &alice);

    e.ledger().set_timestamp(2_111);
    // Proposal succeeds with alice's vote
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    let _ = desc_hash;
    let _ = bob; // Bob can't vote (zero weight at snapshot)
}

#[test]
fn dao_flow_mints_token_via_treasury_execution() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let proposer = Address::generate(&e);
    let recipient = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, symbol_short!("mint")];
    let args = mint_proposal_args(&e, &treasury_address, &recipient);
    let description = String::from_str(&e, "Mint token through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.queue(&targets, &functions, &args, &desc_hash, &2_411_u32, &proposer);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(token.balance(&recipient), 1);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
fn dao_flow_batch_mints_tokens_via_treasury() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let proposer = Address::generate(&e);
    let recipient = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "batch_mint")];
    let args = batch_mint_proposal_args(&e, &treasury_address, &recipient, 10);
    let description = String::from_str(&e, "Batch mint 10 tokens through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.queue(&targets, &functions, &args, &desc_hash, &2_411_u32, &proposer);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(token.balance(&recipient), 10);
    assert_eq!(token.get_votes(&recipient), 10);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
fn governor_authority_can_modify_governance_parameters() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let authorized_governor = Address::generate(&e);

    // Owner grants governor authority
    governor.set_governor_authority(&authorized_governor, &true);
    assert!(governor.governor_authority(&authorized_governor));

    // Authorized governor can modify voting delay
    governor.set_voting_delay(&authorized_governor, &20);
    assert_eq!(governor.voting_delay(), 20);

    // Authorized governor can modify voting period
    governor.set_voting_period(&authorized_governor, &200);
    assert_eq!(governor.voting_period(), 200);

    // Authorized governor can modify proposal threshold
    governor.set_proposal_threshold(&authorized_governor, &5);
    assert_eq!(governor.proposal_threshold(), 5);

    // Authorized governor can modify quorum
    governor.set_quorum_bps(&authorized_governor, &2000);
    assert_eq!(governor.quorum_bps(), 2000);

    // Authorized governor can modify queue delay
    governor.set_queue_delay(&authorized_governor, &500);

    let _ = token;
    let _ = owner;
}

#[test]
fn proposal_flow_with_modified_governance_parameters() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let authorized_governor = Address::generate(&e);

    // Mint 10 tokens to proposer using batch mint
    let last_token_id = token.batch_mint(&owner, &proposer, &10);
    assert_eq!(last_token_id, 9);
    assert_eq!(token.get_votes(&proposer), 10);

    // Grant governor authority and modify parameters
    governor.set_governor_authority(&authorized_governor, &true);
    governor.set_voting_delay(&authorized_governor, &5); // Shorter delay
    governor.set_voting_period(&authorized_governor, &50); // Shorter period
    governor.set_proposal_threshold(&authorized_governor, &5); // Higher threshold
    governor.set_quorum_bps(&authorized_governor, &5000); // 50% quorum

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test with modified parameters");
    let desc_hash = description_hash(&e, &description);

    // Propose with new threshold (needs 5 votes, proposer has 10)
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Vote starts after 5 seconds (new voting delay)
    e.ledger().set_timestamp(2_006);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Vote ends after 50 seconds (new voting period)
    e.ledger().set_timestamp(2_056);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    governor.queue(&targets, &functions, &args, &desc_hash, &2_356_u32, &proposer);

    e.ledger().set_timestamp(2_356);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Executed);
}

#[test]
#[should_panic(expected = "HostError: Error(Context, InvalidAction)")]
fn reentrancy_attack_is_prevented() {
    // NOTE: Soroban provides built-in reentrancy protection at the platform level
    // When a malicious contract attempts to re-enter during execution,
    // the platform blocks it with: Error(Context, InvalidAction) - "Contract re-entry is not allowed"
    //
    // Our CEI pattern (updating state before external calls) provides additional protection
    // as a best practice and defense-in-depth strategy.
    let (e, token, treasury, governor, _target, owner) = setup();

    // Register malicious contract
    let malicious_id = e.register(MaliciousReentrantContract, ());
    let malicious = MaliciousReentrantContractClient::new(&e, &malicious_id);

    // Create proposer with voting power
    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create a malicious proposal that will attempt reentrancy
    // The proposal will call malicious.reentry(), which will try to re-execute the same proposal
    let targets = vec![&e, malicious_id.clone()];
    let functions = vec![&e, symbol_short!("reentry")];

    // Prepare arguments for the reentry call
    let attack_targets = vec![&e, malicious_id.clone()];
    let attack_functions = vec![&e, symbol_short!("reentry")];
    let attack_args: Vec<Vec<Val>> = vec![&e, vec![&e]];
    let description = String::from_str(&e, "Reentrancy attack test");
    let desc_hash = description_hash(&e, &description);

    // Args: (governor, targets, functions, args, desc_hash, executor)
    let args = vec![
        &e,
        vec![
            &e,
            governor.address.clone().into_val(&e),
            attack_targets.into_val(&e),
            attack_functions.into_val(&e),
            attack_args.into_val(&e),
            desc_hash.into_val(&e),
            proposer.clone().into_val(&e),
        ],
    ];

    // Create the proposal
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Vote on the proposal
    e.ledger().set_timestamp(2_011); // After voting delay
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Wait for voting period to end
    e.ledger().set_timestamp(2_111); // After voting period
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Succeeded);

    // Queue the proposal
    governor.queue(&targets, &functions, &args, &desc_hash, &2_411_u32, &proposer);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Execute the proposal - this will trigger the reentrancy attack
    e.ledger().set_timestamp(2_412); // After ETA

    // The execution will:
    // 1. Mark proposal as Executed (CEI pattern)
    // 2. Call malicious.reentry()
    // 3. Malicious contract tries to re-enter execute()
    // 4. Soroban blocks reentrancy with Error(Context, InvalidAction)
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    // If we get here without panic, the test will fail
    // The should_panic annotation ensures the test passes only if reentrancy is blocked
}
