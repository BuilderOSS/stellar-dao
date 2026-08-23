use soroban_sdk::{contractevent, Address, Symbol};

#[cfg(feature = "mercury")]
mod retroshade {
    use super::*;
    use retroshade_sdk::Retroshade;
    use soroban_sdk::contracttype;

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TreasuryCallIndexed {
        pub governor: Address,
        pub target: Address,
        pub function: Symbol,
        pub args: Vec<Val>,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct TreasuryInitializedIndexed {
        pub owner: Address,
        pub governor: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }

    #[derive(Retroshade)]
    #[contracttype]
    pub struct GovernorChangedIndexed {
        pub old_governor: Address,
        pub new_governor: Address,
        pub changed_by: Address,
        pub ledger: u32,
        pub timestamp: u64,
    }
}

// Standard contract events

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorChanged {
    #[topic]
    pub old_governor: Address,
    #[topic]
    pub new_governor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Execute {
    #[topic]
    pub governor: Address,
    #[topic]
    pub target: Address,
    pub function: Symbol,
}
