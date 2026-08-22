extern crate std;

use auction::{AuctionContract, AuctionContractClient};
use governor::{DaoGovernorContract, DaoGovernorContractClient};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::AccountFlags,
    Address, BytesN, Env, IntoVal, String, Symbol, Val, Vec,
};
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
        e.storage()
            .instance()
            .get(&symbol_short!("value"))
            .unwrap_or(0)
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
        e.storage()
            .instance()
            .get(&symbol_short!("attack"))
            .unwrap_or(0)
    }
}

fn setup() -> (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoGovernorContractClient<'static>,
    TargetContractClient<'static>,
    Address,
) {
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
    vec![
        e,
        vec![
            e,
            treasury.clone().into_val(e),
            recipient.clone().into_val(e),
        ],
    ]
}

fn batch_mint_proposal_args(
    e: &Env,
    treasury: &Address,
    recipient: &Address,
    amount: u32,
) -> Vec<Vec<Val>> {
    // Args for calling token.batch_mint(treasury, recipient, amount)
    vec![
        e,
        vec![
            e,
            treasury.clone().into_val(e),
            recipient.clone().into_val(e),
            amount.into_val(e),
        ],
    ]
}

fn transfer_proposal_args_i128(
    e: &Env,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Vec<Vec<Val>> {
    vec![
        e,
        vec![
            e,
            from.clone().into_val(e),
            to.clone().into_val(e),
            amount.into_val(e),
        ],
    ]
}

fn transfer_proposal_args_u32(
    e: &Env,
    from: &Address,
    to: &Address,
    token_id: u32,
) -> Vec<Vec<Val>> {
    vec![
        e,
        vec![
            e,
            from.clone().into_val(e),
            to.clone().into_val(e),
            token_id.into_val(e),
        ],
    ]
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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(token.balance(&recipient), 1);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn sac_classic_asset_without_auth_requirement_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());
    let asset_client = TokenClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &proposer);

    let amount = 100_i128;
    sac.mint(&treasury.address, &amount);
    assert_eq!(asset_client.balance(&treasury.address), amount);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, asset.address().clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args = transfer_proposal_args_i128(&e, &treasury.address, &target.address, amount);
    let description = String::from_str(&e, "Transfer classic asset from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(asset_client.balance(&treasury.address), 0);
    assert_eq!(asset_client.balance(&target.address), amount);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn sac_classic_asset_with_auth_requirement_rejects_unauthorized_treasury() {
    let (e, token, treasury, _governor, _target, owner) = setup();
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &Address::generate(&e));

    asset.issuer().set_flag(AccountFlags::RequiredFlag);
    sac.mint(&treasury.address, &100_i128);
}

#[test]
fn sac_classic_asset_with_auth_requirement_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());
    let asset_client = TokenClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &proposer);

    asset.issuer().set_flag(AccountFlags::RequiredFlag);
    sac.set_authorized(&treasury.address, &true);
    sac.set_authorized(&target.address, &true);
    sac.mint(&treasury.address, &100_i128);
    assert_eq!(asset_client.balance(&treasury.address), 100);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, asset.address().clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args = transfer_proposal_args_i128(&e, &treasury.address, &target.address, 100);
    let description = String::from_str(&e, "Transfer auth-required classic asset from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(asset_client.balance(&treasury.address), 0);
    assert_eq!(asset_client.balance(&target.address), 100);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn governance_token_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let proposer_token_id = token.mint(&owner, &proposer);
    let treasury_token_id = token.mint(&owner, &treasury.address);
    assert_eq!(token.balance(&treasury.address), 1);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args =
        transfer_proposal_args_u32(&e, &treasury.address, &target.address, treasury_token_id);
    let description = String::from_str(&e, "Transfer governance token from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    e.ledger().set_timestamp(2_011);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_111);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(token.balance(&treasury.address), 0);
    assert_eq!(token.balance(&target.address), 1);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );

    let _ = proposer_token_id;
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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_411);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(token.balance(&recipient), 10);
    assert_eq!(token.get_votes(&recipient), 10);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_356_u32, &proposer,
    );

    e.ledger().set_timestamp(2_356);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
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
    let (e, token, _treasury, governor, _target, owner) = setup();

    // Register malicious contract
    let malicious_id = e.register(MaliciousReentrantContract, ());
    let _malicious = MaliciousReentrantContractClient::new(&e, &malicious_id);

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
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal
    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
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

#[test]
fn treasury_batch_mint_with_explicit_auth() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};

    let e = Env::default();
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
    let _governor = DaoGovernorContractClient::new(&e, &governor_id);

    let recipient = Address::generate(&e);

    // Setup - grant treasury mint authority
    e.mock_all_auths();
    treasury.set_governor(&governor_id);
    token.set_mint_authority(&treasury.address, &true);

    let batch_mint_args: Vec<Val> = vec![
        &e,
        treasury.address.clone().into_val(&e),
        recipient.clone().into_val(&e),
        3u32.into_val(&e),
    ];

    // Now test treasury calling batch_mint with explicit authorization
    e.mock_auths(&[MockAuth {
        address: &governor_id,
        invoke: &MockAuthInvoke {
            contract: &treasury_id,
            fn_name: "execute",
            args: (&token_id, &Symbol::new(&e, "batch_mint"), &batch_mint_args).into_val(&e),
            sub_invokes: &[
                // Treasury itself needs to authorize the batch_mint call where it's the minter
                MockAuthInvoke {
                    contract: &token_id,
                    fn_name: "batch_mint",
                    args: (&treasury.address, &recipient, &3u32).into_val(&e),
                    sub_invokes: &[],
                },
            ],
        },
    }]);

    // Call treasury.execute which should call token.batch_mint
    treasury.execute(&token_id, &Symbol::new(&e, "batch_mint"), &batch_mint_args);

    // Verify the tokens were minted
    assert_eq!(token.balance(&recipient), 3);
    assert_eq!(token.get_votes(&recipient), 3);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
}

// ============================================================================
// AUCTION CONTRACT E2E TESTS
// ============================================================================


fn setup_auction() -> (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    AuctionContractClient<'static>,
    Address,  // owner
    Address,  // payment token
    StellarAssetClient<'static>,  // payment token client
) {
    let e = Env::default();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);

    // Deploy DAO token (NFT)
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

    // Deploy treasury
    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    // Create payment token (SAC - like USDC)
    let payment_token_admin = Address::generate(&e);
    let payment_token_contract = e.register_stellar_asset_contract_v2(payment_token_admin.clone());
    let payment_token = payment_token_contract.address();
    let payment_client = StellarAssetClient::new(&e, &payment_token);

    // Deploy auction contract
    let auction_id = e.register(
        AuctionContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            100_u64,  // duration: 100 ledgers
            100_0000000_i128,  // reserve price: 100 USDC
            10_u32,  // min bid increment: 10%
            10_u64,  // time buffer: 10 ledgers
            Some(payment_token.clone()),  // payment token
        ),
    );
    let auction = AuctionContractClient::new(&e, &auction_id);

    e.mock_all_auths();

    // Grant mint authority to auction contract
    token.set_mint_authority(&auction_id, &true);

    (e, token, treasury, auction, owner, payment_token, payment_client)
}

#[test]
fn test_auction_full_lifecycle() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);

    // Mint payment tokens to bidders
    payment_client.mint(&bidder1, &1000_0000000);
    payment_client.mint(&bidder2, &2000_0000000);

    // Unpause to start first auction
    auction.unpause(&owner);

    // Get auction state
    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;
    assert_eq!(auction_state.highest_bid, 0);
    assert_eq!(auction_state.highest_bidder, None);
    assert!(!auction_state.settled);

    // Bidder 1 places first bid at reserve price
    auction.create_bid(&bidder1, &token_id, &100_0000000);

    let auction_state = auction.get_auction();
    assert_eq!(auction_state.highest_bid, 100_0000000);
    assert_eq!(auction_state.highest_bidder, Some(bidder1.clone()));

    // Bidder 2 places higher bid (110 USDC - 10% increment)
    auction.create_bid(&bidder2, &token_id, &110_0000000);

    let auction_state = auction.get_auction();
    assert_eq!(auction_state.highest_bid, 110_0000000);
    assert_eq!(auction_state.highest_bidder, Some(bidder2.clone()));

    // Bidder 1 should have been refunded
    assert_eq!(payment_client.balance(&bidder1), 1000_0000000);
    assert_eq!(payment_client.balance(&bidder2), 2000_0000000 - 110_0000000);

    // Advance past auction end
    e.ledger().set_sequence_number(auction_state.end_ledger + 1);

    // Settle and create new auction
    auction.settle_and_create_new();

    // Verify bidder2 received the NFT
    assert_eq!(token.balance(&bidder2), 1);

    // Verify treasury received payment
    assert_eq!(payment_client.balance(&treasury.address), 110_0000000);

    // Verify new auction was created
    let new_auction_state = auction.get_auction();
    assert_ne!(new_auction_state.token_id, token_id);
    assert_eq!(new_auction_state.highest_bid, 0);
    assert!(!new_auction_state.settled);
}

#[test]
fn test_auction_time_extension() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;
    let original_end = auction_state.end_ledger;

    // Advance to within time buffer (5 ledgers before end)
    e.ledger().set_sequence_number(original_end - 5);

    // Place bid - should extend auction
    auction.create_bid(&bidder, &token_id, &100_0000000);

    let auction_state = auction.get_auction();
    let config = auction.get_config();
    
    // End time should be extended by time_buffer
    assert_eq!(auction_state.end_ledger, e.ledger().sequence() + config.time_buffer as u32);
    assert!(auction_state.end_ledger > original_end);
}

#[test]
fn test_auction_no_bids_keeps_token() {
    let (e, token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();

    // Token should exist (minted to auction contract)
    assert_eq!(token.balance(&auction.address), 1);

    // Advance past auction end without bids
    e.ledger().set_sequence_number(auction_state.end_ledger + 1);

    // Settle auction
    auction.settle_and_create_new();

    // Token remains with auction contract (no burn function)
    // Plus a new token was minted for the new auction
    assert_eq!(token.balance(&auction.address), 2);  // Old unsold token + new auction token
}

#[test]
fn test_auction_config_updates_only_when_paused() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Contract starts paused, config updates should work
    auction.set_duration(&200);
    auction.set_reserve_price(&200_0000000);
    auction.set_min_bid_increment(&15);

    let config = auction.get_config();
    assert_eq!(config.duration, 200);
    assert_eq!(config.reserve_price, 200_0000000);
    assert_eq!(config.min_bid_increment_percent, 15);

    // Unpause
    auction.unpause(&owner);

    // Config updates should fail when not paused
    let result = auction.try_set_duration(&300);
    assert!(result.is_err());
}

#[test]
fn test_auction_multiple_consecutive_auctions() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidders = [
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
    ];

    // Mint payment tokens to all bidders
    for bidder in &bidders {
        payment_client.mint(bidder, &1000_0000000);
    }

    // Start auctions
    auction.unpause(&owner);

    // Run 3 consecutive auctions
    for i in 0..3 {
        let auction_state = auction.get_auction();
        let token_id = auction_state.token_id;

        // Each bidder bids on their respective auction
        auction.create_bid(&bidders[i], &token_id, &100_0000000);

        // Advance and settle
        e.ledger().set_sequence_number(auction_state.end_ledger + 1);
        auction.settle_and_create_new();

        // Verify winner received NFT
        assert_eq!(token.balance(&bidders[i]), 1);
    }

    // Treasury should have received 3 payments
    assert_eq!(payment_client.balance(&treasury.address), 300_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]  // ReservePriceNotMet
fn test_auction_bid_below_reserve() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    
    // Try to bid below reserve price (should panic)
    auction.create_bid(&bidder, &auction_state.token_id, &50_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]  // MinBidNotMet
fn test_auction_bid_below_min_increment() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);

    payment_client.mint(&bidder1, &1000_0000000);
    payment_client.mint(&bidder2, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // First bid at reserve
    auction.create_bid(&bidder1, &token_id, &100_0000000);

    // Try to bid with insufficient increment (should panic)
    // Min increment is 10%, so need at least 110 USDC
    auction.create_bid(&bidder2, &token_id, &105_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]  // InvalidTokenId
fn test_auction_bid_wrong_token_id() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let wrong_token_id = auction_state.token_id + 999;

    // Try to bid on wrong token ID (should panic)
    auction.create_bid(&bidder, &wrong_token_id, &100_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]  // AuctionOver
fn test_auction_bid_after_end() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Advance past auction end
    e.ledger().set_sequence_number(auction_state.end_ledger + 1);

    // Try to bid after auction ended (should panic)
    auction.create_bid(&bidder, &token_id, &100_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]  // NotLaunched
fn test_auction_get_auction_before_launch() {
    let (_e, _token, _treasury, auction, _owner, _payment_token, _payment_client) = setup_auction();

    // Try to get auction before unpause/launch (should panic)
    auction.get_auction();
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]  // AuctionActive
fn test_auction_settle_while_active() {
    let (e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    auction.unpause(&owner);

    let auction_state = auction.get_auction();

    // Try to settle while auction is still active (should panic)
    e.ledger().set_sequence_number(auction_state.end_ledger - 10);
    auction.settle_and_create_new();
}

#[test]
fn test_auction_pause_and_resume() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place a bid
    auction.create_bid(&bidder, &token_id, &100_0000000);

    // Pause the auction
    auction.pause(&owner);
    assert!(auction.paused());

    // Settle the current auction while paused
    e.ledger().set_sequence_number(auction_state.end_ledger + 1);
    auction.settle_auction();

    // Verify settlement happened
    assert_eq!(token.balance(&bidder), 1);
    assert_eq!(payment_client.balance(&treasury.address), 100_0000000);

    // Unpause to resume - should create new auction
    auction.unpause(&owner);
    assert!(!auction.paused());

    // Verify new auction was created
    let new_auction_state = auction.get_auction();
    assert_ne!(new_auction_state.token_id, token_id);
    assert_eq!(new_auction_state.highest_bid, 0);
}

#[test]
fn test_auction_ownership_remains_with_deployer() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Initially owned by owner
    assert_eq!(auction.get_owner(), Some(owner.clone()));

    // Unpause - ownership should remain with original owner
    auction.unpause(&owner);

    // Ownership should still be with original owner
    assert_eq!(auction.get_owner(), Some(owner.clone()));
}

#[test]
fn test_auction_set_treasury() {
    let (e, _token, _treasury, auction, _owner, _payment_token, _payment_client) = setup_auction();

    let new_treasury = Address::generate(&e);

    // Update treasury while paused
    auction.set_treasury(&new_treasury);

    let config = auction.get_config();
    assert_eq!(config.treasury, new_treasury);
}

#[test]
#[should_panic]
fn test_auction_config_update_when_unpaused() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Unpause
    auction.unpause(&owner);

    // Try to update config while unpaused (should fail)
    auction.set_duration(&300);
}

#[test]
fn test_auction_settle_auction_vs_settle_and_create() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &2000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place bid
    auction.create_bid(&bidder, &token_id, &100_0000000);

    // Advance past end
    e.ledger().set_sequence_number(auction_state.end_ledger + 1);

    // Pause and use settle_auction instead of settle_and_create_new
    auction.pause(&owner);
    auction.settle_auction();

    // Verify settlement
    assert_eq!(token.balance(&bidder), 1);
    assert_eq!(payment_client.balance(&treasury.address), 100_0000000);

    // The auction should be settled but no new auction created yet
    let settled_auction = auction.get_auction();
    assert!(settled_auction.settled);

    // When we unpause, a new auction should be created
    auction.unpause(&owner);
    let new_auction = auction.get_auction();
    assert_ne!(new_auction.token_id, token_id);
    assert!(!new_auction.settled);
}

// ============================================================================
// Native XLM Payment Tests
// ============================================================================

fn setup_auction_native_xlm() -> (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    AuctionContractClient<'static>,
    Address,  // owner
) {
    let e = Env::default();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);

    // Deploy DAO token (NFT)
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

    // Deploy treasury
    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    // Deploy auction contract WITHOUT payment token (native XLM)
    let auction_id = e.register(
        AuctionContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            100_u64,  // duration: 100 ledgers
            100_0000000_i128,  // reserve price: 100 XLM
            10_u32,  // min bid increment: 10%
            10_u64,  // time buffer: 10 ledgers
            None::<Address>,  // No payment token = native XLM
        ),
    );
    let auction = AuctionContractClient::new(&e, &auction_id);

    e.mock_all_auths();

    // Grant mint authority to auction contract
    token.set_mint_authority(&auction_id, &true);

    (e, token, treasury, auction, owner)
}

// NOTE: Native XLM payment support is not yet implemented
// The contract currently only supports SAC token payments (payment_token: Some(Address))
// Native XLM would require different transfer mechanics and is planned for future implementation
//
// #[test]
// fn test_auction_native_xlm_full_lifecycle() { ... }

#[test]
fn test_auction_payment_token_setter() {
    let (e, _token, _treasury, auction, _owner) = setup_auction_native_xlm();

    // Initially None (native XLM)
    let config = auction.get_config();
    assert_eq!(config.payment_token, None);

    // Set to a SAC token
    let payment_token = Address::generate(&e);
    auction.set_payment_token(&Some(payment_token.clone()));

    let config = auction.get_config();
    assert_eq!(config.payment_token, Some(payment_token));

    // Set back to None
    auction.set_payment_token(&None);

    let config = auction.get_config();
    assert_eq!(config.payment_token, None);
}
