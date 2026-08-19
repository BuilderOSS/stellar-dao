use core::convert::TryInto;

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, BytesN, Env, String,
    Symbol, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_macros::only_owner;
use stellar_governance::{
    governor::{
        self as governor, emit_proposal_cancelled, emit_proposal_created,
        emit_proposal_executed, emit_vote_cast, Governor, GovernorError, ProposalState,
    },
    votes::VotesClient,
};

#[cfg(feature = "mercury")]
mod retroshade {
    use super::*;
    use retroshade_sdk::Retroshade;
    use soroban_sdk::contracttype;

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ProposalCreatedIndexed {
        pub proposal_id: BytesN<32>,
        pub proposer: Address,
        pub description: String,
        pub targets: Vec<Address>,
        pub functions: Vec<Symbol>,
        pub args: Vec<Vec<Val>>,
        pub snapshot: u32,
        pub deadline: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ProposalCallIndexed {
        pub proposal_id: BytesN<32>,
        pub treasury: Address,
        pub target: Address,
        pub function: Symbol,
        pub args: Vec<Vec<Val>>,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ProposalLifecycleIndexed {
        pub proposal_id: BytesN<32>,
        pub proposer: Address,
        pub state: Symbol,
        pub eta: u64,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ProposalVoteIndexed {
        pub proposal_id: BytesN<32>,
        pub voter: Address,
        pub support: u32,
        pub weight: u128,
        pub reason: String,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct GovernorAuthorityChangedIndexed {
        pub authority: Address,
        pub enabled: bool,
        pub ledger: u32,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ParameterChangedIndexed {
        pub parameter: Symbol,
        pub old_value: u128,
        pub new_value: u128,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }
}

// TTL constants for proposal storage
// Proposals can stay active for voting_delay + voting_period + queue_delay
// Using 60 days (518,400 ledgers) to safely cover max governance timeline
const DAY_IN_LEDGERS: u32 = 17280; // ~5 seconds per ledger
const PROPOSAL_TTL_EXTEND_AMOUNT: u32 = 60 * DAY_IN_LEDGERS; // 60 days
const PROPOSAL_TTL_THRESHOLD: u32 = PROPOSAL_TTL_EXTEND_AMOUNT - DAY_IN_LEDGERS; // 59 days

#[contracttype]
enum GovernorKey {
    Treasury,
    QueueDelay,
    Proposal(BytesN<32>),
    GovernorAuthority(Address),
}

#[contracttype]
#[derive(Clone)]
struct ProposalCoreTime {
    proposer: Address,
    vote_snapshot: u32,
    vote_start: u64,  // Changed to u64 to store timestamps without conversion
    vote_end: u64,    // Changed to u64 to store timestamps without conversion
    eta: u64,
    state: ProposalState,
}

#[contract]
pub struct DaoGovernorContract;

#[contractimpl]
impl DaoGovernorContract {
    #[cfg(feature = "mercury")]
    fn proposal_state_symbol(e: &Env, state: ProposalState) -> Symbol {
        match state {
            ProposalState::Pending => Symbol::new(e, "pending"),
            ProposalState::Active => Symbol::new(e, "active"),
            ProposalState::Succeeded => Symbol::new(e, "succeeded"),
            ProposalState::Defeated => Symbol::new(e, "defeated"),
            ProposalState::Queued => Symbol::new(e, "queued"),
            ProposalState::Canceled => Symbol::new(e, "canceled"),
            ProposalState::Expired => Symbol::new(e, "expired"),
            ProposalState::Executed => Symbol::new(e, "executed"),
        }
    }

    pub fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury_contract: Address,
        voting_delay: u32,
        voting_period: u32,
        queue_delay: u32,
        proposal_threshold: u128,
        quorum_bps: u32,
    ) {
        assert!(quorum_bps <= 10_000);
        set_owner(e, &owner);
        governor::set_name(e, String::from_str(e, "MvpDaoGovernor"));
        governor::set_version(e, String::from_str(e, "1.0.0"));
        governor::set_token_contract(e, &token_contract);
        governor::set_voting_delay(e, voting_delay);
        governor::set_voting_period(e, voting_period);
        e.storage().instance().set(&GovernorKey::QueueDelay, &queue_delay);
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum_bps as u128);
        e.storage().instance().set(&GovernorKey::Treasury, &treasury_contract);
    }

    #[only_owner]
    pub fn set_treasury(e: &Env, treasury_contract: Address) {
        e.storage().instance().set(&GovernorKey::Treasury, &treasury_contract);
    }

    pub fn set_queue_delay(e: &Env, caller: Address, queue_delay: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        #[cfg(feature = "mercury")]
        let old_value = Self::queue_delay(e);

        e.storage().instance().set(&GovernorKey::QueueDelay, &queue_delay);

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "queue_delay"),
            old_value: old_value as u128,
            new_value: queue_delay as u128,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    #[only_owner]
    pub fn set_token_contract(e: &Env, token_contract: Address) {
        governor::set_token_contract(e, &token_contract);
    }

    pub fn set_voting_delay(e: &Env, caller: Address, voting_delay: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        #[cfg(feature = "mercury")]
        let old_value = Self::voting_delay(e);

        governor::set_voting_delay(e, voting_delay);

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "voting_delay"),
            old_value: old_value as u128,
            new_value: voting_delay as u128,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn set_voting_period(e: &Env, caller: Address, voting_period: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        #[cfg(feature = "mercury")]
        let old_value = Self::voting_period(e);

        governor::set_voting_period(e, voting_period);

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "voting_period"),
            old_value: old_value as u128,
            new_value: voting_period as u128,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn set_proposal_threshold(e: &Env, caller: Address, proposal_threshold: u128) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        // Prevent setting threshold to zero (would allow spam proposals)
        if proposal_threshold == 0 {
            panic_with_error!(e, GovernorError::InvalidProposalLength); // Reuse error
        }

        #[cfg(feature = "mercury")]
        let old_value = governor::get_proposal_threshold(e);

        governor::set_proposal_threshold(e, proposal_threshold);

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "proposal_threshold"),
            old_value,
            new_value: proposal_threshold,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn set_quorum_bps(e: &Env, caller: Address, quorum_bps: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        // Validate quorum is in valid range (1 to 10000 basis points)
        if quorum_bps == 0 || quorum_bps > 10_000 {
            panic_with_error!(e, GovernorError::InvalidProposalLength); // Reuse error
        }

        #[cfg(feature = "mercury")]
        let old_value = Self::quorum_bps(e) as u128;

        governor::set_quorum(e, quorum_bps as u128);

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "quorum_bps"),
            old_value,
            new_value: quorum_bps as u128,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn treasury(e: &Env) -> Address {
        e.storage().instance().get(&GovernorKey::Treasury).expect("treasury not set")
    }

    fn queue_delay(e: &Env) -> u32 {
        e.storage().instance().get(&GovernorKey::QueueDelay).unwrap_or(0)
    }

    pub fn quorum_bps(e: &Env) -> u32 {
        governor::get_quorum(e, e.ledger().sequence()) as u32
    }

    #[only_owner]
    pub fn set_governor_authority(e: &Env, authority: Address, enabled: bool) {
        e.storage().instance().set(&GovernorKey::GovernorAuthority(authority.clone()), &enabled);

        #[cfg(feature = "mercury")]
        retroshade::GovernorAuthorityChangedIndexed {
            authority,
            enabled,
            ledger: e.ledger().sequence(),
        }
        .emit(e);
    }

    pub fn governor_authority(e: &Env, authority: Address) -> bool {
        e.storage()
            .instance()
            .get(&GovernorKey::GovernorAuthority(authority))
            .unwrap_or(false)
    }

    fn ensure_governor_authority(e: &Env, caller: &Address) {
        let Some(owner) = stellar_access::ownable::get_owner(e) else {
            panic!("owner not set");
        };

        if caller == &owner || Self::governor_authority(e, caller.clone()) {
            return;
        }

        panic!("governor authority required");
    }

    fn proposal_key(proposal_id: &BytesN<32>) -> GovernorKey {
        GovernorKey::Proposal(proposal_id.clone())
    }

    /// Extends the TTL of a proposal to ensure it doesn't expire before execution
    fn extend_proposal_ttl(e: &Env, proposal_id: &BytesN<32>) {
        let key = Self::proposal_key(proposal_id);
        e.storage().persistent().extend_ttl(
            &key,
            PROPOSAL_TTL_THRESHOLD,
            PROPOSAL_TTL_EXTEND_AMOUNT,
        );
    }

    fn get_proposal(e: &Env, proposal_id: &BytesN<32>) -> ProposalCoreTime {
        let proposal = e
            .storage()
            .persistent()
            .get(&Self::proposal_key(proposal_id))
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::ProposalNotFound));

        // Extend TTL when proposal is accessed
        Self::extend_proposal_ttl(e, proposal_id);

        proposal
    }

    fn set_proposal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) {
        e.storage().persistent().set(&Self::proposal_key(proposal_id), proposal);

        // Extend TTL when proposal is updated
        Self::extend_proposal_ttl(e, proposal_id);
    }

    fn proposal_state_internal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) -> ProposalState {
        match proposal.state {
            ProposalState::Canceled | ProposalState::Executed | ProposalState::Queued | ProposalState::Expired => {
                return proposal.state;
            }
            _ => {}
        }

        let now = e.ledger().timestamp();
        let start = proposal.vote_start;  // Already u64
        let end = proposal.vote_end;      // Already u64

        if now <= start {
            return ProposalState::Pending;
        }

        if now <= end {
            return ProposalState::Active;
        }

        let quorum = Self::quorum(e, proposal.vote_snapshot);
        let counts = governor::get_proposal_vote_counts(e, proposal_id);
        let Some(participation) = counts.for_votes.checked_add(counts.abstain_votes) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };

        if participation >= quorum && counts.for_votes > counts.against_votes {
            ProposalState::Succeeded
        } else {
            ProposalState::Defeated
        }
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DaoGovernorContract {}

#[contractimpl(contracttrait)]
impl Governor for DaoGovernorContract {
    fn voting_delay(e: &Env) -> u32 {
        governor::get_voting_delay(e)
    }

    fn voting_period(e: &Env) -> u32 {
        governor::get_voting_period(e)
    }

    fn quorum(e: &Env, ledger: u32) -> u128 {
        let quorum_bps = governor::get_quorum(e, ledger);
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token).get_total_supply_at_checkpoint(&ledger);

        if quorum_bps == 0 || total_supply == 0 {
            return 0;
        }

        let Some(product) = total_supply.checked_mul(quorum_bps) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        let Some(adjusted) = product.checked_add(9_999) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        adjusted / 10_000
    }

    fn proposals_need_queuing(_e: &Env) -> bool {
        true
    }

    fn queue(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        _eta: u32,
        _operator: Address,
    ) -> BytesN<32> {
        let proposal_id = governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Succeeded => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            ProposalState::Queued => panic_with_error!(e, GovernorError::ProposalNotSuccessful),
            _ => panic_with_error!(e, GovernorError::ProposalNotSuccessful),
        }

        let now = e.ledger().timestamp();
        let eta = now
            .checked_add(Self::queue_delay(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));

        proposal.eta = eta;
        proposal.state = ProposalState::Queued;
        Self::set_proposal(e, &proposal_id, &proposal);

        #[cfg(feature = "mercury")]
        retroshade::ProposalLifecycleIndexed {
            proposal_id: proposal_id.clone(),
            proposer: proposal.proposer.clone(),
            state: Self::proposal_state_symbol(e, ProposalState::Queued),
            eta,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        proposal_id
    }

    fn proposal_state(e: &Env, proposal_id: BytesN<32>) -> ProposalState {
        let proposal = Self::get_proposal(e, &proposal_id);
        Self::proposal_state_internal(e, &proposal_id, &proposal)
    }

    fn proposal_snapshot(e: &Env, proposal_id: BytesN<32>) -> u32 {
        Self::get_proposal(e, &proposal_id).vote_snapshot
    }

    fn proposal_deadline(e: &Env, proposal_id: BytesN<32>) -> u32 {
        // Convert u64 timestamp to u32 for trait compatibility
        // This is safe for practical purposes (works until year 2106)
        Self::get_proposal(e, &proposal_id)
            .vote_end
            .try_into()
            .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow))
    }

    fn propose(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description: String,
        proposer: Address,
    ) -> BytesN<32> {
        proposer.require_auth();

        let proposal_threshold = Self::proposal_threshold(e);
        let current_ledger = e.ledger().sequence();
        let snapshot_ledger = current_ledger.saturating_sub(1);
        let token = governor::get_token_contract(e);
        let proposer_votes = VotesClient::new(e, &token).get_votes_at_checkpoint(&proposer, &snapshot_ledger);
        if proposer_votes < proposal_threshold {
            panic_with_error!(e, GovernorError::InsufficientProposerVotes);
        }

        if targets.is_empty() {
            panic_with_error!(e, GovernorError::EmptyProposal);
        }
        if targets.len() != functions.len() || targets.len() != args.len() {
            panic_with_error!(e, GovernorError::InvalidProposalLength);
        }
        if description.len() > governor::MAX_DESCRIPTION_LENGTH {
            panic_with_error!(e, GovernorError::DescriptionTooLong);
        }

        let description_hash = e.crypto().keccak256(&description.to_bytes()).to_bytes();
        let proposal_id = governor::hash_proposal(e, &targets, &functions, &args, &description_hash);

        if e.storage().persistent().has(&Self::proposal_key(&proposal_id)) {
            panic_with_error!(e, GovernorError::ProposalAlreadyExists);
        }

        let now = e.ledger().timestamp();
        let vote_start = now
            .checked_add(Self::voting_delay(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));
        let vote_end = vote_start
            .checked_add(Self::voting_period(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));

        let proposal = ProposalCoreTime {
            proposer: proposer.clone(),
            vote_snapshot: snapshot_ledger,
            vote_start,  // No conversion needed - already u64
            vote_end,    // No conversion needed - already u64
            eta: 0,
            state: ProposalState::Pending,
        };

        Self::set_proposal(e, &proposal_id, &proposal);

        emit_proposal_created(
            e,
            &proposal_id,
            &proposer,
            &targets,
            &functions,
            &args,
            proposal.vote_snapshot,
            proposal.vote_end.try_into().unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
            &description,
        );

        #[cfg(feature = "mercury")]
        retroshade::ProposalCreatedIndexed {
            proposal_id: proposal_id.clone(),
            proposer: proposer.clone(),
            description: description.clone(),
            targets: targets.clone(),
            functions: functions.clone(),
            args: args.clone(),
            snapshot: proposal.vote_snapshot,
            deadline: proposal.vote_end,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        proposal_id
    }

    fn cast_vote(
        e: &Env,
        proposal_id: BytesN<32>,
        vote_type: u32,
        reason: String,
        voter: Address,
    ) -> u128 {
        voter.require_auth();

        let proposal = Self::get_proposal(e, &proposal_id);
        if Self::proposal_state_internal(e, &proposal_id, &proposal) != ProposalState::Active {
            panic_with_error!(e, GovernorError::ProposalNotActive);
        }

        let token = governor::get_token_contract(e);
        let voter_weight = VotesClient::new(e, &token)
            .get_votes_at_checkpoint(&voter, &proposal.vote_snapshot);

        // Prevent voting with zero weight (spam/griefing protection)
        if voter_weight == 0 {
            panic_with_error!(e, GovernorError::InsufficientProposerVotes);
        }

        governor::count_vote(e, &proposal_id, &voter, vote_type, voter_weight);
        emit_vote_cast(e, &voter, &proposal_id, vote_type, voter_weight, &reason);

        #[cfg(feature = "mercury")]
        retroshade::ProposalVoteIndexed {
            proposal_id,
            voter: voter.clone(),
            support: vote_type,
            weight: voter_weight,
            reason: reason.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        voter_weight
    }

    fn execute(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        executor: Address,
    ) -> BytesN<32> {
        executor.require_auth();
        e.current_contract_address().require_auth();

        // Validate proposal parameters are consistent
        if targets.len() != functions.len() || targets.len() != args.len() {
            panic_with_error!(e, GovernorError::InvalidProposalLength);
        }

        // Validate all actions go through treasury with execute function
        let treasury = Self::treasury(e);
        let execute_symbol = Symbol::new(e, "execute");
        for i in 0..targets.len() {
            if targets.get(i).unwrap() != treasury {
                panic_with_error!(e, GovernorError::InvalidProposalLength); // Reuse error for now
            }
            if functions.get(i).unwrap() != execute_symbol {
                panic_with_error!(e, GovernorError::InvalidProposalLength); // Reuse error for now
            }
        }

        let proposal_id = governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Queued => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            _ => panic_with_error!(e, GovernorError::ProposalNotQueued),
        }

        let now = e.ledger().timestamp();
        if now < proposal.eta {
            panic_with_error!(e, GovernorError::ProposalNotQueued);
        }

        // Execute all actions through treasury
        for i in 0..args.len() {
            e.invoke_contract::<Val>(&treasury, &execute_symbol, args.get(i).unwrap());

            // Emit event for each action
            #[cfg(feature = "mercury")]
            retroshade::ProposalCallIndexed {
                proposal_id: proposal_id.clone(),
                treasury: treasury.clone(),
                target: targets.get(i).unwrap().clone(),
                function: functions.get(i).unwrap().clone(),
                args: vec![e, args.get(i).unwrap().clone()],
                timestamp: e.ledger().timestamp(),
            }
            .emit(e);
        }

        proposal.state = ProposalState::Executed;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_executed(e, &proposal_id);

        #[cfg(feature = "mercury")]
        retroshade::ProposalLifecycleIndexed {
            proposal_id: proposal_id.clone(),
            proposer: proposal.proposer.clone(),
            state: Self::proposal_state_symbol(e, ProposalState::Executed),
            eta: proposal.eta,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        proposal_id
    }

    fn cancel(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        operator: Address,
    ) -> BytesN<32> {
        let proposal_id = governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        if operator != proposal.proposer {
            panic_with_error!(e, GovernorError::ProposalNotCancellable);
        }
        operator.require_auth();

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Pending | ProposalState::Active => {}
            _ => panic_with_error!(e, GovernorError::ProposalNotCancellable),
        }

        proposal.state = ProposalState::Canceled;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_cancelled(e, &proposal_id);

        #[cfg(feature = "mercury")]
        retroshade::ProposalLifecycleIndexed {
            proposal_id: proposal_id.clone(),
            proposer: proposal.proposer.clone(),
            state: Self::proposal_state_symbol(e, ProposalState::Canceled),
            eta: proposal.eta,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);

        proposal_id
    }
}
