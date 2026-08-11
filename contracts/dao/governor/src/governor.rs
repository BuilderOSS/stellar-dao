use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, String, Symbol, Val, Vec};
use stellar_governance::governor::{self as governor, Governor, ProposalState};

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
        pub ledger: u32,
    }
}

#[contracttype]
enum GovernorKey {
    Treasury,
}

#[contract]
pub struct DaoGovernorContract;

#[contractimpl]
impl DaoGovernorContract {
    pub fn __constructor(
        e: &Env,
        token_contract: Address,
        treasury_contract: Address,
        voting_delay: u32,
        voting_period: u32,
        proposal_threshold: u128,
        quorum: u128,
    ) {
        governor::set_name(e, String::from_str(e, "MvpDaoGovernor"));
        governor::set_version(e, String::from_str(e, "1.0.0"));
        governor::set_token_contract(e, &token_contract);
        governor::set_voting_delay(e, voting_delay);
        governor::set_voting_period(e, voting_period);
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum);
        e.storage().instance().set(&GovernorKey::Treasury, &treasury_contract);
    }

    pub fn treasury(e: &Env) -> Address {
        e.storage().instance().get(&GovernorKey::Treasury).expect("treasury not set")
    }
}

#[contractimpl(contracttrait)]
impl Governor for DaoGovernorContract {
    fn proposals_need_queuing(_e: &Env) -> bool {
        false
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
        let snapshot = governor::get_proposal_snapshot(e, &proposal_id);
        let quorum = Self::quorum(e, snapshot);
        governor::execute(e, targets, functions, args, &description_hash, Self::proposals_need_queuing(e), quorum)
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
        let proposer = governor::get_proposal_proposer(e, &proposal_id);
        assert!(operator == proposer);
        operator.require_auth();
        governor::cancel(e, targets, functions, args, &description_hash)
    }
}
