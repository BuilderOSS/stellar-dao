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
    pub struct ProposalCallIndexed {
        pub treasury: Address,
        pub target: Address,
        pub function: Symbol,
        pub timestamp: u64,
    }
}

#[contracttype]
enum GovernorKey {
    Treasury,
    Proposal(BytesN<32>),
}

#[contracttype]
#[derive(Clone)]
struct ProposalCoreTime {
    proposer: Address,
    vote_snapshot: u32,
    vote_start: u32,
    vote_end: u32,
    state: ProposalState,
}

#[contract]
pub struct DaoGovernorContract;

#[contractimpl]
impl DaoGovernorContract {
    pub fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury_contract: Address,
        voting_delay: u32,
        voting_period: u32,
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
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum_bps as u128);
        e.storage().instance().set(&GovernorKey::Treasury, &treasury_contract);
    }

    #[only_owner]
    pub fn set_treasury(e: &Env, treasury_contract: Address) {
        e.storage().instance().set(&GovernorKey::Treasury, &treasury_contract);
    }

    #[only_owner]
    pub fn set_token_contract(e: &Env, token_contract: Address) {
        governor::set_token_contract(e, &token_contract);
    }

    #[only_owner]
    pub fn set_voting_delay(e: &Env, voting_delay: u32) {
        governor::set_voting_delay(e, voting_delay);
    }

    #[only_owner]
    pub fn set_voting_period(e: &Env, voting_period: u32) {
        governor::set_voting_period(e, voting_period);
    }

    #[only_owner]
    pub fn set_proposal_threshold(e: &Env, proposal_threshold: u128) {
        governor::set_proposal_threshold(e, proposal_threshold);
    }

    #[only_owner]
    pub fn set_quorum_bps(e: &Env, quorum_bps: u32) {
        assert!(quorum_bps <= 10_000);
        governor::set_quorum(e, quorum_bps as u128);
    }

    pub fn treasury(e: &Env) -> Address {
        e.storage().instance().get(&GovernorKey::Treasury).expect("treasury not set")
    }

    fn proposal_key(proposal_id: &BytesN<32>) -> GovernorKey {
        GovernorKey::Proposal(proposal_id.clone())
    }

    fn get_proposal(e: &Env, proposal_id: &BytesN<32>) -> ProposalCoreTime {
        e.storage()
            .persistent()
            .get(&Self::proposal_key(proposal_id))
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::ProposalNotFound))
    }

    fn set_proposal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) {
        e.storage().persistent().set(&Self::proposal_key(proposal_id), proposal);
    }

    fn proposal_state_internal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) -> ProposalState {
        match proposal.state {
            ProposalState::Canceled | ProposalState::Executed | ProposalState::Queued | ProposalState::Expired => {
                return proposal.state;
            }
            _ => {}
        }

        let now = e.ledger().timestamp();
        let start = proposal.vote_start as u64;
        let end = proposal.vote_end as u64;

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
        false
    }

    fn proposal_state(e: &Env, proposal_id: BytesN<32>) -> ProposalState {
        let proposal = Self::get_proposal(e, &proposal_id);
        Self::proposal_state_internal(e, &proposal_id, &proposal)
    }

    fn proposal_snapshot(e: &Env, proposal_id: BytesN<32>) -> u32 {
        Self::get_proposal(e, &proposal_id).vote_snapshot
    }

    fn proposal_deadline(e: &Env, proposal_id: BytesN<32>) -> u32 {
        Self::get_proposal(e, &proposal_id).vote_end
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
            vote_start: vote_start.try_into().unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
            vote_end: vote_end.try_into().unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow)),
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
            proposal.vote_end,
            &description,
        );

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
        governor::count_vote(e, &proposal_id, &voter, vote_type, voter_weight);
        emit_vote_cast(e, &voter, &proposal_id, vote_type, voter_weight, &reason);
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

        assert!(targets.len() == 1);
        assert!(functions.len() == 1);

        let treasury = Self::treasury(e);
        assert!(targets.get_unchecked(0) == treasury);
        assert!(functions.get_unchecked(0) == Symbol::new(e, "execute"));

        let proposal_id = governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Succeeded => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            _ => panic_with_error!(e, GovernorError::ProposalNotSuccessful),
        }

        e.invoke_contract::<Val>(&treasury, &Symbol::new(e, "execute"), args.get_unchecked(0));

        proposal.state = ProposalState::Executed;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_executed(e, &proposal_id);

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

        proposal_id
    }
}
