//! Event definitions and emission helpers for the Governor contract.
//!
//! This module defines events for tracking the complete governance lifecycle including:
//! - Contract initialization and parameter changes
//! - Proposal creation, voting, queueing, and execution
//! - Detailed action-by-action execution tracking (Mercury-indexed)
//!
//! Like other contracts, this module provides dual event emission:
//! 1. Standard Soroban events for on-chain indexing
//! 2. Mercury-indexed events (when `mercury` feature is enabled) for enhanced querying
//!
//! Many core governance events (ProposalCreated, VoteCast, etc.) are emitted by the
//! stellar_governance library. Custom events here supplement those with additional
//! metadata specific to this implementation (timestamp-based voting, detailed execution tracking).

use soroban_sdk::{contractevent, Address};

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

// Standard contract events

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorInitialized {
    #[topic]
    pub owner: Address,
    pub token_contract: Address,
    pub treasury_contract: Address,
    pub voting_delay: u32,
    pub voting_period: u32,
    pub queue_delay: u32,
    pub proposal_threshold: u128,
    pub quorum_bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalQueued {
    #[topic]
    pub proposal_id: BytesN<32>,
    pub eta: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryChanged {
    #[topic]
    pub old_treasury: Address,
    #[topic]
    pub new_treasury: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenContractChanged {
    #[topic]
    pub old_token_contract: Address,
    #[topic]
    pub new_token_contract: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueDelayChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingDelayChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingPeriodChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalThresholdChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u128,
    pub new_value: u128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuorumBpsChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
}

// Event helper functions

use soroban_sdk::{BytesN, Env, String, Symbol};

pub fn emit_governor_initialized(
    e: &Env,
    owner: &Address,
    #[allow(unused_variables)] name: &String,
    #[allow(unused_variables)] version: &String,
    token_contract: &Address,
    treasury_contract: &Address,
    voting_delay: u32,
    voting_period: u32,
    queue_delay: u32,
    proposal_threshold: u128,
    quorum_bps: u32,
) {
    GovernorInitialized {
        owner: owner.clone(),
        token_contract: token_contract.clone(),
        treasury_contract: treasury_contract.clone(),
        voting_delay,
        voting_period,
        queue_delay,
        proposal_threshold,
        quorum_bps,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::GovernorInitializedIndexed {
        owner: owner.clone(),
        name: name.clone(),
        version: version.clone(),
        token_contract: token_contract.clone(),
        treasury_contract: treasury_contract.clone(),
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

pub fn emit_treasury_changed(
    e: &Env,
    old_treasury: &Address,
    new_treasury: &Address,
    #[allow(unused_variables)] changed_by: &Address,
) {
    TreasuryChanged {
        old_treasury: old_treasury.clone(),
        new_treasury: new_treasury.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TreasuryChangedIndexed {
        old_treasury: old_treasury.clone(),
        new_treasury: new_treasury.clone(),
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_token_contract_changed(
    e: &Env,
    old_token_contract: &Address,
    new_token_contract: &Address,
    #[allow(unused_variables)] changed_by: &Address,
) {
    TokenContractChanged {
        old_token_contract: old_token_contract.clone(),
        new_token_contract: new_token_contract.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TokenContractChangedIndexed {
        old_token_contract: old_token_contract.clone(),
        new_token_contract: new_token_contract.clone(),
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_queue_delay_changed(
    e: &Env,
    caller: &Address,
    old_value: u32,
    new_value: u32,
    #[allow(unused_variables)] parameter: &Symbol,
    #[allow(unused_variables)] changed_by: &Address,
) {
    QueueDelayChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::ParameterChangedIndexed {
        parameter: parameter.clone(),
        old_value: old_value as u128,
        new_value: new_value as u128,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_voting_delay_changed(
    e: &Env,
    caller: &Address,
    old_value: u32,
    new_value: u32,
    #[allow(unused_variables)] parameter: &Symbol,
    #[allow(unused_variables)] changed_by: &Address,
) {
    VotingDelayChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::ParameterChangedIndexed {
        parameter: parameter.clone(),
        old_value: old_value as u128,
        new_value: new_value as u128,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_voting_period_changed(
    e: &Env,
    caller: &Address,
    old_value: u32,
    new_value: u32,
    #[allow(unused_variables)] parameter: &Symbol,
    #[allow(unused_variables)] changed_by: &Address,
) {
    VotingPeriodChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::ParameterChangedIndexed {
        parameter: parameter.clone(),
        old_value: old_value as u128,
        new_value: new_value as u128,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_proposal_threshold_changed(
    e: &Env,
    caller: &Address,
    old_value: u128,
    new_value: u128,
    #[allow(unused_variables)] parameter: &Symbol,
    #[allow(unused_variables)] changed_by: &Address,
) {
    ProposalThresholdChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::ParameterChangedIndexed {
        parameter: parameter.clone(),
        old_value,
        new_value,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_quorum_bps_changed(
    e: &Env,
    caller: &Address,
    old_value: u32,
    new_value: u32,
    #[allow(unused_variables)] parameter: &Symbol,
    #[allow(unused_variables)] changed_by: &Address,
) {
    QuorumBpsChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::ParameterChangedIndexed {
        parameter: parameter.clone(),
        old_value: old_value as u128,
        new_value: new_value as u128,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_governor_authority_changed(
    e: &Env,
    authority: &Address,
    old_enabled: bool,
    enabled: bool,
    #[allow(unused_variables)] changed_by: &Address,
) {
    GovernorAuthorityChanged {
        authority: authority.clone(),
        old_enabled,
        enabled,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::GovernorAuthorityChangedIndexed {
        authority: authority.clone(),
        old_enabled,
        enabled,
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_proposal_queued(
    e: &Env,
    proposal_id: &BytesN<32>,
    #[allow(unused_variables)] proposer: &Address,
    eta: u64,
) {
    ProposalQueued {
        proposal_id: proposal_id.clone(),
        eta,
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    {
        let state = Symbol::new(e, "Queued");
        retroshade::ProposalLifecycleIndexed {
            proposal_id: proposal_id.clone(),
            proposer: proposer.clone(),
            state,
            eta,
            ledger: e.ledger().sequence(),
            timestamp: e.ledger().timestamp(),
        }
        .emit(e);
    }
}

#[cfg(feature = "mercury")]
pub fn emit_proposal_lifecycle(
    e: &Env,
    proposal_id: &BytesN<32>,
    proposer: &Address,
    state: &Symbol,
    eta: u64,
) {
    retroshade::ProposalLifecycleIndexed {
        proposal_id: proposal_id.clone(),
        proposer: proposer.clone(),
        state: state.clone(),
        eta,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_proposal_created_indexed(
    e: &Env,
    proposal_id: &BytesN<32>,
    proposer: &Address,
    description: &String,
    targets: &Vec<Address>,
    functions: &Vec<Symbol>,
    args: &Vec<Vec<Val>>,
    snapshot: u32,
    vote_start: u64,
    deadline: u32,
    action_count: u32,
) {
    retroshade::ProposalCreatedIndexed {
        proposal_id: proposal_id.clone(),
        proposer: proposer.clone(),
        description: description.clone(),
        targets: targets.clone(),
        functions: functions.clone(),
        args: args.clone(),
        snapshot,
        vote_start,
        deadline,
        action_count,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_proposal_vote_indexed(
    e: &Env,
    proposal_id: &BytesN<32>,
    voter: &Address,
    support: u32,
    weight: u128,
    reason: &String,
) {
    retroshade::ProposalVoteIndexed {
        proposal_id: proposal_id.clone(),
        voter: voter.clone(),
        support,
        weight,
        reason: reason.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

#[cfg(feature = "mercury")]
pub fn emit_proposal_call(
    e: &Env,
    proposal_id: &BytesN<32>,
    executor: &Address,
    treasury: &Address,
    target: &Address,
    function: &Symbol,
    args: &Vec<Vec<Val>>,
    action_index: u32,
    action_count: u32,
) {
    retroshade::ProposalCallIndexed {
        proposal_id: proposal_id.clone(),
        executor: executor.clone(),
        treasury: treasury.clone(),
        target: target.clone(),
        function: function.clone(),
        args: args.clone(),
        action_index,
        action_count,
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}
