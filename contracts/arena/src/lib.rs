#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, MuxedAddress, String,
};
use core::cmp::min;

// Default TTL values (in ledgers, ~5 seconds per ledger)
const DAY_IN_LEDGERS: u32 = 17280; // ~1 day
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS; // 30 days
const PERSISTENT_EXTEND_TO: u32 = 60 * DAY_IN_LEDGERS; // 60 days
const TEMPORARY_LIFETIME_THRESHOLD: u32 = DAY_IN_LEDGERS; // 1 day
const TEMPORARY_EXTEND_TO: u32 = 2 * DAY_IN_LEDGERS; // 2 days

// Storage Keys - Different types showcase different storage strategies
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    // INSTANCE STORAGE - Contract-wide data (shares contract's lifetime)
    Admin,        // Contract administrator
    ActionCount,  // Total gameplay actions
    CooldownSecs, // Cooldown configuration
    TotalSupply,  // SEP-0041: Total token supply
    TokenName,    // SEP-0041: Token name
    TokenSymbol,  // SEP-0041: Token symbol
    Decimals,     // SEP-0041: Token decimals

    // PERSISTENT STORAGE - User-specific data (important, needs manual TTL management)
    Balance(Address),         // SEP-0041: Token balance
    UserStats(Address),       // Detailed user statistics
    BattleRecord(Address),    // Battle wins/losses record
    Allowance(Address, Address), // SEP-0041: Spending allowance (owner, spender)

    // TEMPORARY STORAGE - Short-lived data (auto-expires, cheap)
    Cooldown(Address), // Last action timestamp for cooldown
}

// User statistics structure
#[derive(Clone)]
#[contracttype]
pub struct UserStats {
    pub charge_ups: u32,
    pub total_punches: u32,
    pub total_kicks: u32,
    pub total_battles: u32,
    pub total_raids: u32,
    pub last_action: u64,
}

// Battle record structure
#[derive(Clone)]
#[contracttype]
pub struct BattleRecord {
    pub wins: u32,
    pub losses: u32,
    pub total_battles: u32,
}

// Allowance with expiration
#[derive(Clone)]
#[contracttype]
pub struct AllowanceValue {
    pub amount: i128,
    pub live_until_ledger: u32,
}

#[contract]
pub struct ArenaContract;

#[contractimpl]
impl ArenaContract {
    /// Initialize the contract with token metadata and admin
    /// SEP-0041 compliant initialization
    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        decimals: u32,
    ) {
        // Ensure contract hasn't been initialized
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }

        // Store admin in INSTANCE storage
        env.storage().instance().set(&DataKey::Admin, &admin);

        // Initialize action count in INSTANCE storage
        env.storage().instance().set(&DataKey::ActionCount, &0u32);

        // Set default cooldown to 1 hour (3600 seconds)
        env.storage().instance().set(&DataKey::CooldownSecs, &3600u64);

        // SEP-0041: Initialize token metadata
        env.storage().instance().set(&DataKey::TokenName, &name);
        env.storage().instance().set(&DataKey::TokenSymbol, &symbol);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);

        // Extend instance storage TTL
        env.storage().instance().extend_ttl(
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    /// CHARGE UP - Actor mints 1 point to themselves
    /// Demonstrates: Self-growth, cooldown management, TTL extension
    pub fn charge_up(env: Env, user: Address) -> i128 {
        user.require_auth();

        Self::check_cooldown(&env, &user);
        Self::mint(&env, &user, 1);
        Self::update_charge_stats(&env, &user);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &user);

        let new_balance = Self::get_balance(&env, &user);
        env.events()
            .publish((symbol_short!("charge"), user.clone()), new_balance);
        Self::check_milestone(&env, &user, new_balance as u32);

        1
    }

    /// PUNCH - Actor drains up to 1 point from target and gains it
    /// Demonstrates: Light unilateral attack, bounded drain, TTL extension
    pub fn punch(env: Env, from: Address, to: Address) -> i128 {
        from.require_auth();

        Self::check_cooldown(&env, &from);

        let moved = Self::move_points(&env, &to, &from, 1);

        Self::update_stats(&env, &from, true);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &from);

        let actor_balance = Self::get_balance(&env, &from);
        env.events().publish(
            (symbol_short!("punch"), from.clone(), to.clone()),
            (moved, actor_balance),
        );
        Self::check_milestone(&env, &from, actor_balance as u32);

        moved
    }

    /// KICK - Actor drains up to 2 points from target and gains them
    /// Demonstrates: Stronger unilateral attack, bounded drain, TTL extension
    pub fn kick(env: Env, from: Address, to: Address) -> i128 {
        from.require_auth();

        Self::check_cooldown(&env, &from);

        let moved = Self::move_points(&env, &to, &from, 2);

        Self::update_stats(&env, &from, false);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &from);

        let actor_balance = Self::get_balance(&env, &from);
        env.events().publish(
            (symbol_short!("kick"), from.clone(), to.clone()),
            (moved, actor_balance),
        );
        Self::check_milestone(&env, &from, actor_balance as u32);

        moved
    }

    /// Manually extend TTL for your balance and stats
    /// Demonstrates: Manual TTL extension to prevent expiry
    pub fn extend_my_ttl(env: Env, user: Address) {
        user.require_auth();

        // Extend user balance TTL
        if env
            .storage()
            .persistent()
            .has(&DataKey::Balance(user.clone()))
        {
            env.storage().persistent().extend_ttl(
                &DataKey::Balance(user.clone()),
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_EXTEND_TO,
            );

            // Extend stats TTL too
            env.storage().persistent().extend_ttl(
                &DataKey::UserStats(user.clone()),
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_EXTEND_TO,
            );
        }
    }

    // ===== MULTI-SIGNATURE FUNCTIONS =====

    /// JOINT PUNCH - Two allied users drain up to 4 points from a target
    /// Demonstrates: Multi-signature raid with bounded point transfer
    pub fn joint_punch(env: Env, user1: Address, user2: Address, target: Address) -> i128 {
        user1.require_auth();
        user2.require_auth();

        Self::check_cooldown(&env, &user1);
        Self::check_cooldown(&env, &user2);

        let moved = Self::distribute_points(&env, &target, &[user1.clone(), user2.clone()], 4);

        Self::update_raid_stats(&env, &user1);
        Self::update_raid_stats(&env, &user2);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &user1);
        Self::set_cooldown(&env, &user2);

        let user1_balance = Self::get_balance(&env, &user1);
        let user2_balance = Self::get_balance(&env, &user2);
        env.events().publish(
            (
                symbol_short!("j_punch"),
                user1.clone(),
                user2.clone(),
                target.clone(),
            ),
            (moved, user1_balance, user2_balance),
        );

        Self::check_milestone(&env, &user1, user1_balance as u32);
        Self::check_milestone(&env, &user2, user2_balance as u32);

        moved
    }

    /// HEAVY KICK - Three allied users drain up to 6 points from a target
    /// Demonstrates: Triple-signature raid with bounded point transfer
    pub fn heavy_kick(
        env: Env,
        user1: Address,
        user2: Address,
        user3: Address,
        target: Address,
    ) -> i128 {
        user1.require_auth();
        user2.require_auth();
        user3.require_auth();

        Self::check_cooldown(&env, &user1);
        Self::check_cooldown(&env, &user2);
        Self::check_cooldown(&env, &user3);

        let moved = Self::distribute_points(
            &env,
            &target,
            &[user1.clone(), user2.clone(), user3.clone()],
            6,
        );

        Self::update_raid_stats(&env, &user1);
        Self::update_raid_stats(&env, &user2);
        Self::update_raid_stats(&env, &user3);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &user1);
        Self::set_cooldown(&env, &user2);
        Self::set_cooldown(&env, &user3);

        let user1_balance = Self::get_balance(&env, &user1);
        let user2_balance = Self::get_balance(&env, &user2);
        let user3_balance = Self::get_balance(&env, &user3);
        env.events().publish(
            (
                symbol_short!("h_kick"),
                user1.clone(),
                user2.clone(),
                user3.clone(),
                target.clone(),
            ),
            (moved, user1_balance, user2_balance, user3_balance),
        );

        Self::check_milestone(&env, &user1, user1_balance as u32);
        Self::check_milestone(&env, &user2, user2_balance as u32);
        Self::check_milestone(&env, &user3, user3_balance as u32);

        moved
    }

    /// TRANSFER POINTS - Transfer tokens between two users
    /// Demonstrates: Both sender and receiver must authorize (SEP-0041 compliant)
    pub fn transfer_points(env: Env, from: Address, to: Address, amount: i128) {
        // Both users must authorize the transfer
        from.require_auth();
        to.require_auth();

        // Check cooldown only for sender
        Self::check_cooldown(&env, &from);

        // Use internal transfer (validates balance, updates storage, emits event)
        Self::transfer_internal(&env, &from, &to, amount);

        // Set cooldown only for sender
        Self::set_cooldown(&env, &from);
    }

    /// BATTLE - Two users duel, winner drains up to 3 points from the loser
    /// Demonstrates: Opt-in PvP with bounded point transfer
    pub fn battle(env: Env, attacker: Address, defender: Address) -> bool {
        attacker.require_auth();
        defender.require_auth();

        Self::check_cooldown(&env, &attacker);
        Self::check_cooldown(&env, &defender);

        let attacker_balance = Self::get_balance(&env, &attacker);
        let defender_balance = Self::get_balance(&env, &defender);

        let attacker_wins = attacker_balance >= defender_balance;

        let (winner, loser) = if attacker_wins {
            (attacker.clone(), defender.clone())
        } else {
            (defender.clone(), attacker.clone())
        };
        let drained = Self::move_points(&env, &loser, &winner, 3);

        Self::update_battle_record(&env, &attacker, attacker_wins);
        Self::update_battle_record(&env, &defender, !attacker_wins);
        Self::update_battle_stats(&env, &attacker);
        Self::update_battle_stats(&env, &defender);
        Self::increment_global(&env);
        Self::set_cooldown(&env, &attacker);
        Self::set_cooldown(&env, &defender);

        env.events().publish(
            (symbol_short!("battle"), symbol_short!("win")),
            (winner.clone(), loser.clone(), drained),
        );

        Self::check_milestone(&env, &winner, Self::get_balance(&env, &winner) as u32);

        attacker_wins
    }

    // ===== VIEW FUNCTIONS =====

    /// Get user's token balance (SEP-0041 compatible via balance() too)
    pub fn get_count(env: Env, user: Address) -> i128 {
        Self::get_balance(&env, &user)
    }

    /// Get action count (sum of all actions)
    pub fn get_action_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ActionCount)
            .unwrap_or(0)
    }

    /// Get total token supply (SEP-0041)
    pub fn get_total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// Get user's detailed statistics
    pub fn get_stats(env: Env, user: Address) -> Option<UserStats> {
        env.storage()
            .persistent()
            .get(&DataKey::UserStats(user))
    }

    /// Get user's battle record
    pub fn get_battle_record(env: Env, user: Address) -> Option<BattleRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::BattleRecord(user))
    }

    /// Check if user is on cooldown
    pub fn is_on_cooldown(env: Env, user: Address) -> bool {
        let cooldown_key = DataKey::Cooldown(user);

        if !env.storage().temporary().has(&cooldown_key) {
            return false;
        }

        let last_action: u64 = env.storage().temporary().get(&cooldown_key).unwrap();
        let cooldown_secs: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CooldownSecs)
            .unwrap_or(3600);

        let current_time = env.ledger().timestamp();
        current_time < last_action + cooldown_secs
    }

    /// Get seconds remaining on cooldown
    pub fn cooldown_remaining(env: Env, user: Address) -> u64 {
        if !Self::is_on_cooldown(env.clone(), user.clone()) {
            return 0;
        }

        let cooldown_key = DataKey::Cooldown(user);
        let last_action: u64 = env.storage().temporary().get(&cooldown_key).unwrap();
        let cooldown_secs: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CooldownSecs)
            .unwrap_or(3600);

        let current_time = env.ledger().timestamp();
        let ready_time = last_action + cooldown_secs;

        if ready_time > current_time {
            ready_time - current_time
        } else {
            0
        }
    }

    // ===== ADMIN FUNCTIONS =====

    /// Reset action count (admin only)
    pub fn reset_action_count(env: Env, admin: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        env.storage().instance().set(&DataKey::ActionCount, &0u32);
    }

    /// Set cooldown duration in seconds (admin only)
    pub fn set_cooldown_duration(env: Env, admin: Address, seconds: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        env.storage()
            .instance()
            .set(&DataKey::CooldownSecs, &seconds);
    }

    /// Get current cooldown configuration
    pub fn get_cooldown_duration(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CooldownSecs)
            .unwrap_or(3600)
    }

    // ===== HELPER FUNCTIONS =====

    fn require_admin(env: &Env, address: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialized");

        if admin != *address {
            panic!("Not authorized");
        }
    }

    // Removed: legacy balance helper - now using get_balance from SEP-0041

    fn increment_global(env: &Env) {
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ActionCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::ActionCount, &(current + 1));
    }

    fn update_stats(env: &Env, user: &Address, is_punch: bool) {
        let mut stats: UserStats = env
            .storage()
            .persistent()
            .get(&DataKey::UserStats(user.clone()))
            .unwrap_or(UserStats {
                charge_ups: 0,
                total_punches: 0,
                total_kicks: 0,
                total_battles: 0,
                total_raids: 0,
                last_action: 0,
            });

        if is_punch {
            stats.total_punches += 1;
        } else {
            stats.total_kicks += 1;
        }
        stats.last_action = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::UserStats(user.clone()), &stats);

        // Extend stats TTL
        env.storage().persistent().extend_ttl(
            &DataKey::UserStats(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    fn update_charge_stats(env: &Env, user: &Address) {
        let mut stats: UserStats = env
            .storage()
            .persistent()
            .get(&DataKey::UserStats(user.clone()))
            .unwrap_or(UserStats {
                charge_ups: 0,
                total_punches: 0,
                total_kicks: 0,
                total_battles: 0,
                total_raids: 0,
                last_action: 0,
            });

        stats.charge_ups += 1;
        stats.last_action = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::UserStats(user.clone()), &stats);
        env.storage().persistent().extend_ttl(
            &DataKey::UserStats(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    fn update_raid_stats(env: &Env, user: &Address) {
        let mut stats: UserStats = env
            .storage()
            .persistent()
            .get(&DataKey::UserStats(user.clone()))
            .unwrap_or(UserStats {
                charge_ups: 0,
                total_punches: 0,
                total_kicks: 0,
                total_battles: 0,
                total_raids: 0,
                last_action: 0,
            });

        stats.total_raids += 1;
        stats.last_action = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::UserStats(user.clone()), &stats);
        env.storage().persistent().extend_ttl(
            &DataKey::UserStats(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    fn update_battle_stats(env: &Env, user: &Address) {
        let mut stats: UserStats = env
            .storage()
            .persistent()
            .get(&DataKey::UserStats(user.clone()))
            .unwrap_or(UserStats {
                charge_ups: 0,
                total_punches: 0,
                total_kicks: 0,
                total_battles: 0,
                total_raids: 0,
                last_action: 0,
            });

        stats.total_battles += 1;
        stats.last_action = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::UserStats(user.clone()), &stats);
        env.storage().persistent().extend_ttl(
            &DataKey::UserStats(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    fn check_cooldown(env: &Env, user: &Address) {
        if Self::is_on_cooldown(env.clone(), user.clone()) {
            panic!("Still on cooldown");
        }
    }

    fn set_cooldown(env: &Env, user: &Address) {
        let current_time = env.ledger().timestamp();
        env.storage()
            .temporary()
            .set(&DataKey::Cooldown(user.clone()), &current_time);

        // Extend temporary storage TTL
        env.storage().temporary().extend_ttl(
            &DataKey::Cooldown(user.clone()),
            TEMPORARY_LIFETIME_THRESHOLD,
            TEMPORARY_EXTEND_TO,
        );
    }

    fn move_points(env: &Env, from: &Address, to: &Address, requested: i128) -> i128 {
        let available = Self::get_balance(env, from);
        let moved = min(available, requested);

        if moved <= 0 {
            return 0;
        }

        Self::set_balance(env, from, available - moved);
        let target_balance = Self::get_balance(env, to);
        Self::set_balance(env, to, target_balance + moved);

        moved
    }

    fn distribute_points(env: &Env, from: &Address, recipients: &[Address], requested: i128) -> i128 {
        let available = Self::get_balance(env, from);
        let moved = min(available, requested);

        if moved <= 0 || recipients.is_empty() {
            return 0;
        }

        Self::set_balance(env, from, available - moved);

        let count = recipients.len() as i128;
        let base_share = moved / count;
        let remainder = moved % count;

        for (index, recipient) in recipients.iter().enumerate() {
            let extra = if (index as i128) < remainder { 1 } else { 0 };
            let current = Self::get_balance(env, recipient);
            Self::set_balance(env, recipient, current + base_share + extra);
        }

        moved
    }

    fn check_milestone(env: &Env, user: &Address, count: u32) {
        // Emit milestone events at certain thresholds
        if count == 10 || count == 50 || count == 100 || count == 500 || count == 1000 {
            env.events()
                .publish((symbol_short!("milestone"), user.clone()), count);
        }
    }

    // ===== SEP-0041 TOKEN INTERFACE FUNCTIONS =====

    fn get_balance(env: &Env, addr: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(addr.clone()))
            .unwrap_or(0)
    }

    fn set_balance(env: &Env, addr: &Address, amount: i128) {
        env.storage()
            .persistent()
            .set(&DataKey::Balance(addr.clone()), &amount);

        env.storage().persistent().extend_ttl(
            &DataKey::Balance(addr.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    fn mint(env: &Env, to: &Address, amount: i128) {
        let balance = Self::get_balance(env, to);
        Self::set_balance(env, to, balance + amount);

        let total_supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(total_supply + amount));

        // SEP-0041: Emit mint event
        // Topics: "mint", to
        // Data: amount
        env.events()
            .publish((symbol_short!("mint"), to.clone()), amount);
    }

    fn burn_internal(env: &Env, from: &Address, amount: i128) {
        let balance = Self::get_balance(env, from);
        if balance < amount {
            panic!("Insufficient balance to burn");
        }
        Self::set_balance(env, from, balance - amount);

        let total_supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(total_supply - amount));

        // SEP-0041: Emit burn event
        // Topics: "burn", from
        // Data: amount
        env.events()
            .publish((symbol_short!("burn"), from.clone()), amount);
    }

    fn transfer_internal(env: &Env, from: &Address, to: &Address, amount: i128) {
        let from_balance = Self::get_balance(env, from);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        Self::set_balance(env, from, from_balance - amount);
        let to_balance = Self::get_balance(env, to);
        Self::set_balance(env, to, to_balance + amount);

        // SEP-0041: Emit transfer event
        // Topics: "transfer", from, to
        // Data: amount
        env.events().publish(
            (symbol_short!("transfer"), from.clone(), to.clone()),
            amount,
        );
    }

    fn get_allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
        let allowance_val: Option<AllowanceValue> = env
            .storage()
            .persistent()
            .get(&DataKey::Allowance(from.clone(), spender.clone()));

        match allowance_val {
            Some(val) => {
                // SEP-0041: Check if allowance has expired
                if val.live_until_ledger < env.ledger().sequence() {
                    0 // Expired allowance is treated as zero
                } else {
                    val.amount
                }
            }
            None => 0,
        }
    }

    fn set_allowance(
        env: &Env,
        from: &Address,
        spender: &Address,
        amount: i128,
        live_until_ledger: u32,
    ) {
        let allowance_val = AllowanceValue {
            amount,
            live_until_ledger,
        };

        env.storage().persistent().set(
            &DataKey::Allowance(from.clone(), spender.clone()),
            &allowance_val,
        );

        env.storage().persistent().extend_ttl(
            &DataKey::Allowance(from.clone(), spender.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        // SEP-0041: Emit approve event
        // Topics: "approve", from, spender
        // Data: amount, live_until_ledger
        env.events().publish(
            (symbol_short!("approve"), from.clone(), spender.clone()),
            (amount, live_until_ledger),
        );
    }

    fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
        let allowance = Self::get_allowance(env, from, spender);
        if allowance < amount {
            panic!("Insufficient allowance");
        }

        // Get the current allowance value to preserve expiration
        let allowance_val: AllowanceValue = env
            .storage()
            .persistent()
            .get(&DataKey::Allowance(from.clone(), spender.clone()))
            .unwrap();

        Self::set_allowance(
            env,
            from,
            spender,
            allowance - amount,
            allowance_val.live_until_ledger,
        );
    }

    fn update_battle_record(env: &Env, user: &Address, won: bool) {
        let mut record: BattleRecord = env
            .storage()
            .persistent()
            .get(&DataKey::BattleRecord(user.clone()))
            .unwrap_or(BattleRecord {
                wins: 0,
                losses: 0,
                total_battles: 0,
            });

        if won {
            record.wins += 1;
        } else {
            record.losses += 1;
        }
        record.total_battles += 1;

        env.storage()
            .persistent()
            .set(&DataKey::BattleRecord(user.clone()), &record);

        env.storage().persistent().extend_ttl(
            &DataKey::BattleRecord(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }
}

// SEP-0041 Token Interface Implementation
#[contractimpl]
impl token::TokenInterface for ArenaContract {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        Self::get_allowance(&env, &from, &spender)
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, live_until_ledger: u32) {
        from.require_auth();
        Self::set_allowance(&env, &from, &spender, amount, live_until_ledger);
    }

    fn balance(env: Env, id: Address) -> i128 {
        Self::get_balance(&env, &id)
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::burn_internal(&env, &from, amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        Self::spend_allowance(&env, &from, &spender, amount);
        Self::burn_internal(&env, &from, amount);
    }

    fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap_or(0)
    }

    fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::TokenName)
            .unwrap_or(String::from_str(&env, ""))
    }

    fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::TokenSymbol)
            .unwrap_or(String::from_str(&env, ""))
    }

    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        // MuxedAddress contains an address() method to get the underlying Address
        let to_addr = to.address();
        Self::transfer_internal(&env, &from, &to_addr, amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        Self::spend_allowance(&env, &from, &spender, amount);
        Self::transfer_internal(&env, &from, &to, amount);
    }
}

mod test;
