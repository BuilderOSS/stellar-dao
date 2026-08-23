use core::convert::TryInto;

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracterror, contracttype, panic_with_error, vec, Address, BytesN,
    Env, IntoVal, String, Symbol, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::{
    governor::{
        self as governor, emit_proposal_cancelled, emit_proposal_created, emit_proposal_executed,
        emit_vote_cast, Governor, GovernorError, ProposalState,
    },
    votes::VotesClient,
};
use stellar_macros::only_owner;

// Custom errors for governor contract-specific validations
// Using 1000+ range to avoid conflicts with stellar_governance library errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CustomGovernorError {
    /// Queue delay below minimum (must be >= 1 day)
    InvalidQueueDelay = 1500,
    /// Proposal threshold exceeds total token supply
    InvalidProposalThreshold = 1501,
    /// Quorum basis points invalid (must be <= 10000)
    InvalidQuorumBps = 1502,
    /// Owner not set in contract storage
    OwnerNotSet = 1503,
    /// Caller is not authorized to perform this action
    UnauthorizedCaller = 1504,
}

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
        pub vote_start: u64,
        pub deadline: u32,
        pub action_count: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct ProposalCallIndexed {
        pub proposal_id: BytesN<32>,
        pub executor: Address,
        pub treasury: Address,
        pub target: Address,
        pub function: Symbol,
        pub args: Vec<Vec<Val>>,
        pub action_index: u32,
        pub action_count: u32,
        pub ledger: u32,
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
        pub old_enabled: bool,
        pub enabled: bool,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct GovernorInitializedIndexed {
        pub owner: Address,
        pub name: String,
        pub version: String,
        pub token_contract: Address,
        pub treasury_contract: Address,
        pub voting_delay: u32,
        pub voting_period: u32,
        pub queue_delay: u32,
        pub proposal_threshold: u128,
        pub quorum_bps: u32,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TreasuryChangedIndexed {
        pub old_treasury: Address,
        pub new_treasury: Address,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TokenContractChangedIndexed {
        pub old_token_contract: Address,
        pub new_token_contract: Address,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
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

// Basis points constants for quorum calculation
// BPS = basis points (1 BPS = 0.01%)
const BPS_DENOMINATOR: u128 = 10_000; // 100.00% = 10,000 basis points
const BPS_ROUNDING_ADJUSTMENT: u128 = BPS_DENOMINATOR - 1; // 9,999 for ceiling division

// Proposal expiration period for queued proposals
// After ETA + 14 days, queued proposals become expired and cannot be executed
// Non-queued proposals (Pending, Active, Succeeded, Defeated) can stay forever
const PROPOSAL_EXPIRATION_PERIOD: u64 = 1_209_600; // 14 days in seconds (14 * 24 * 3600)

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
    vote_start: u64, // Changed to u64 to store timestamps without conversion
    vote_end: u64,   // Changed to u64 to store timestamps without conversion
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
        assert!(quorum_bps <= BPS_DENOMINATOR as u32);
        set_owner(e, &owner);
        governor::set_name(e, String::from_str(e, "MvpDaoGovernor"));
        governor::set_version(e, String::from_str(e, "1.0.0"));
        governor::set_token_contract(e, &token_contract);
        governor::set_voting_delay(e, voting_delay);
        governor::set_voting_period(e, voting_period);
        e.storage()
            .instance()
            .set(&GovernorKey::QueueDelay, &queue_delay);
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum_bps as u128);
        e.storage()
            .instance()
            .set(&GovernorKey::Treasury, &treasury_contract);

        #[cfg(feature = "mercury")]
        retroshade::GovernorInitializedIndexed {
            owner,
            name: String::from_str(e, "MvpDaoGovernor"),
            version: String::from_str(e, "1.0.0"),
            token_contract,
            treasury_contract,
            voting_delay,
            voting_period,
            queue_delay,
            proposal_threshold,
            quorum_bps,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    #[only_owner]
    pub fn set_treasury(e: &Env, treasury_contract: Address) {
        #[cfg(feature = "mercury")]
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");
        #[cfg(feature = "mercury")]
        let old_treasury = Self::treasury(e);

        let old_treasury_for_event = Self::treasury(e);

        e.storage()
            .instance()
            .set(&GovernorKey::Treasury, &treasury_contract);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (
                Symbol::new(e, "treasury_changed"),
                old_treasury_for_event.clone(),
                treasury_contract.clone(),
            ),
            ()
        );

        #[cfg(feature = "mercury")]
        retroshade::TreasuryChangedIndexed {
            old_treasury,
            new_treasury: treasury_contract,
            changed_by,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn set_queue_delay(e: &Env, caller: Address, queue_delay: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        // Enforce minimum queue delay of 1 day (86400 seconds) for security
        const MIN_QUEUE_DELAY: u32 = 86400; // 1 day in seconds
        if queue_delay < MIN_QUEUE_DELAY {
            panic_with_error!(e, CustomGovernorError::InvalidQueueDelay);
        }

        let old_value = Self::queue_delay(e);

        e.storage()
            .instance()
            .set(&GovernorKey::QueueDelay, &queue_delay);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "queue_delay_changed"), caller.clone()),
            (old_value, queue_delay)
        );

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
        #[cfg(feature = "mercury")]
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");

        let old_token_contract = governor::get_token_contract(e);
        governor::set_token_contract(e, &token_contract);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (
                Symbol::new(e, "token_contract_changed"),
                old_token_contract.clone(),
                token_contract.clone(),
            ),
            ()
        );

        #[cfg(feature = "mercury")]
        retroshade::TokenContractChangedIndexed {
            old_token_contract,
            new_token_contract: token_contract,
            changed_by,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn set_voting_delay(e: &Env, caller: Address, voting_delay: u32) {
        caller.require_auth();
        Self::ensure_governor_authority(e, &caller);

        let old_value = Self::voting_delay(e);

        governor::set_voting_delay(e, voting_delay);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "voting_delay_changed"), caller.clone()),
            (old_value, voting_delay)
        );

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

        let old_value = Self::voting_period(e);

        governor::set_voting_period(e, voting_period);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "voting_period_changed"), caller.clone()),
            (old_value, voting_period)
        );

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
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }

        // Validate threshold doesn't exceed total supply (would lock governance)
        // Only check if tokens exist (total_supply > 0)
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token)
            .get_total_supply_at_checkpoint(&e.ledger().sequence().saturating_sub(1));
        if total_supply > 0 && proposal_threshold > total_supply {
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }

        let old_value = governor::get_proposal_threshold(e);

        governor::set_proposal_threshold(e, proposal_threshold);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "proposal_threshold_changed"), caller.clone()),
            (old_value, proposal_threshold)
        );

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
        if quorum_bps == 0 || quorum_bps > BPS_DENOMINATOR as u32 {
            panic_with_error!(e, CustomGovernorError::InvalidQuorumBps);
        }

        let old_value = Self::quorum_bps(e);

        governor::set_quorum(e, quorum_bps as u128);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "quorum_bps_changed"), caller.clone()),
            (old_value, quorum_bps)
        );

        #[cfg(feature = "mercury")]
        retroshade::ParameterChangedIndexed {
            parameter: Symbol::new(e, "quorum_bps"),
            old_value: old_value as u128,
            new_value: quorum_bps as u128,
            changed_by: caller.clone(),
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }

    pub fn treasury(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&GovernorKey::Treasury)
            .expect("treasury not set")
    }

    fn queue_delay(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&GovernorKey::QueueDelay)
            .unwrap_or(0)
    }

    pub fn quorum_bps(e: &Env) -> u32 {
        governor::get_quorum(e, e.ledger().sequence()) as u32
    }

    #[only_owner]
    pub fn set_governor_authority(e: &Env, authority: Address, enabled: bool) {
        #[cfg(feature = "mercury")]
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");
        #[cfg(feature = "mercury")]
        let old_enabled = Self::governor_authority(e, authority.clone());

        let old_enabled_for_event = Self::governor_authority(e, authority.clone());

        e.storage()
            .instance()
            .set(&GovernorKey::GovernorAuthority(authority.clone()), &enabled);

        // Emit standard event with topics for efficient filtering
        e.events().publish(
            (Symbol::new(e, "governor_authority_changed"), authority.clone()),
            (old_enabled_for_event, enabled)
        );

        #[cfg(feature = "mercury")]
        retroshade::GovernorAuthorityChangedIndexed {
            authority,
            old_enabled,
            enabled,
            changed_by,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
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
            panic_with_error!(e, CustomGovernorError::OwnerNotSet);
        };

        if caller == &owner || Self::governor_authority(e, caller.clone()) {
            return;
        }

        panic_with_error!(e, CustomGovernorError::UnauthorizedCaller);
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
        e.storage()
            .persistent()
            .set(&Self::proposal_key(proposal_id), proposal);

        // Extend TTL when proposal is updated
        Self::extend_proposal_ttl(e, proposal_id);
    }

    fn proposal_state_internal(
        e: &Env,
        proposal_id: &BytesN<32>,
        proposal: &ProposalCoreTime,
    ) -> ProposalState {
        match proposal.state {
            ProposalState::Queued => {
                // Check if queued proposal has expired (14 days after ETA)
                let now = e.ledger().timestamp();
                let Some(expiration_time) = proposal.eta.checked_add(PROPOSAL_EXPIRATION_PERIOD)
                else {
                    panic_with_error!(e, GovernorError::MathOverflow);
                };
                if now >= expiration_time {
                    return ProposalState::Expired;
                }
                return ProposalState::Queued;
            }
            ProposalState::Canceled | ProposalState::Executed | ProposalState::Expired => {
                return proposal.state;
            }
            _ => {}
        }

        let now = e.ledger().timestamp();
        let start = proposal.vote_start; // Already u64
        let end = proposal.vote_end; // Already u64

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

        // Calculate quorum with ceiling division (rounds up)
        // Formula: (total_supply * quorum_bps + (BPS_DENOMINATOR - 1)) / BPS_DENOMINATOR
        // Example: 1% of 100 = (100 * 100 + 9999) / 10000 = 10999 / 10000 = 1 (rounds up)
        // This ensures we never require less than the intended quorum percentage
        let Some(product) = total_supply.checked_mul(quorum_bps) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        let Some(adjusted) = product.checked_add(BPS_ROUNDING_ADJUSTMENT) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        adjusted / BPS_DENOMINATOR
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
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
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
        let proposer_votes =
            VotesClient::new(e, &token).get_votes_at_checkpoint(&proposer, &snapshot_ledger);
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
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);

        if e.storage()
            .persistent()
            .has(&Self::proposal_key(&proposal_id))
        {
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
            vote_start, // No conversion needed - already u64
            vote_end,   // No conversion needed - already u64
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
            proposal
                .vote_end
                .try_into()
                .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
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
            vote_start: proposal.vote_start,
            deadline: proposal
                .vote_end
                .try_into()
                .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
            action_count: targets
                .len()
                .try_into()
                .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
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
        let voter_weight =
            VotesClient::new(e, &token).get_votes_at_checkpoint(&voter, &proposal.vote_snapshot);

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

        // CHECKS: Validate proposal parameters are consistent
        if targets.len() != functions.len() || targets.len() != args.len() {
            panic_with_error!(e, GovernorError::InvalidProposalLength);
        }

        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        // CHECKS: Validate proposal state
        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Queued => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            _ => panic_with_error!(e, GovernorError::ProposalNotQueued),
        }

        let now = e.ledger().timestamp();
        if now < proposal.eta {
            panic_with_error!(e, GovernorError::ProposalNotQueued);
        }

        // EFFECTS: Update state BEFORE external calls to prevent reentrancy
        // This ensures that if any external call attempts to re-enter execute(),
        // the proposal will already be marked as Executed and the call will fail
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

        // INTERACTIONS: Now safe to make external calls
        // Execute all actions through treasury
        // Targets and functions are now the actual contracts/functions to call
        // We wrap them to call treasury.execute(target, function, args)
        let treasury = Self::treasury(e);
        let execute_symbol = Symbol::new(e, "execute");

        #[cfg(feature = "mercury")]
        let action_count: u32 = targets
            .len()
            .try_into()
            .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow));

        for i in 0..targets.len() {
            let target = targets.get(i).unwrap();
            let function = functions.get(i).unwrap();
            let call_args = args.get(i).unwrap();
            let treasury_args = vec![
                e,
                target.clone().into_val(e),
                function.clone().into_val(e),
                call_args.clone().into_val(e),
            ];

            // Authorize this contract to call treasury.execute for the approved action.
            // The treasury contract handles authorizing the final downstream call itself.
            e.authorize_as_current_contract(vec![
                e,
                InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: treasury.clone(),
                        fn_name: execute_symbol.clone(),
                        args: treasury_args.clone(),
                    },
                    sub_invocations: vec![e],
                }),
            ]);

            #[cfg(feature = "mercury")]
            let action_index: u32 = i
                .try_into()
                .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow));

            // Build args for treasury.execute(target, function, args)
            e.invoke_contract::<Val>(&treasury, &execute_symbol, treasury_args);

            // Emit event for each action
            #[cfg(feature = "mercury")]
            retroshade::ProposalCallIndexed {
                proposal_id: proposal_id.clone(),
                executor: executor.clone(),
                treasury: treasury.clone(),
                target: target.clone(),
                function: function.clone(),
                args: vec![e, call_args.clone()],
                action_index,
                action_count,
                ledger: e.ledger().sequence(),
                timestamp: e.ledger().timestamp(),
            }
            .emit(e);
        }

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
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
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
