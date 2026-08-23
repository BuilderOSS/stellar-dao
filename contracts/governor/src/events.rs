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
