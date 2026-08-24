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
pub struct TreasuryInitialized {
    #[topic]
    pub owner: Address,
    pub governor: Address,
}

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

// Event helper functions

use soroban_sdk::{Env, Val, Vec};

pub fn emit_treasury_initialized(e: &Env, owner: &Address, governor: &Address) {
    TreasuryInitialized {
        owner: owner.clone(),
        governor: governor.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TreasuryInitializedIndexed {
        owner: owner.clone(),
        governor: governor.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_governor_changed(
    e: &Env,
    old_governor: &Address,
    new_governor: &Address,
    #[allow(unused_variables)] changed_by: &Address,
) {
    GovernorChanged {
        old_governor: old_governor.clone(),
        new_governor: new_governor.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::GovernorChangedIndexed {
        old_governor: old_governor.clone(),
        new_governor: new_governor.clone(),
        changed_by: changed_by.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}

pub fn emit_execute(
    e: &Env,
    governor: &Address,
    target: &Address,
    function: &Symbol,
    #[allow(unused_variables)] args: &Vec<Val>,
) {
    Execute {
        governor: governor.clone(),
        target: target.clone(),
        function: function.clone(),
    }
    .publish(e);

    #[cfg(feature = "mercury")]
    retroshade::TreasuryCallIndexed {
        governor: governor.clone(),
        target: target.clone(),
        function: function.clone(),
        args: args.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    }
    .emit(e);
}
