#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

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
    GlobalCount,  // Total of all counters
    CooldownSecs, // Cooldown configuration

    // PERSISTENT STORAGE - User-specific data (important, needs manual TTL management)
    UserCounter(Address), // Individual user counter
    UserStats(Address),   // Detailed user statistics

    // TEMPORARY STORAGE - Short-lived data (auto-expires, cheap)
    Cooldown(Address), // Last action timestamp for cooldown
}

// User statistics structure
#[derive(Clone)]
#[contracttype]
pub struct UserStats {
    pub total_punches: u32,
    pub total_kicks: u32,
    pub last_action: u64,
}

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    /// Initialize the contract with an admin address
    /// Stores admin in INSTANCE storage
    pub fn initialize(env: Env, admin: Address) {
        // Ensure contract hasn't been initialized
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }

        // Store admin in INSTANCE storage
        env.storage().instance().set(&DataKey::Admin, &admin);

        // Initialize global counter in INSTANCE storage
        env.storage().instance().set(&DataKey::GlobalCount, &0u32);

        // Set default cooldown to 1 hour (3600 seconds)
        env.storage().instance().set(&DataKey::CooldownSecs, &3600u64);

        // Extend instance storage TTL
        env.storage().instance().extend_ttl(
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    /// PUNCH - Increment counter by 1
    /// Demonstrates: Persistent storage, Temporary storage, TTL extension, Events
    pub fn punch(env: Env, user: Address) -> u32 {
        user.require_auth();

        // Check cooldown (TEMPORARY STORAGE)
        Self::check_cooldown(&env, &user);

        // Get current counter (PERSISTENT STORAGE)
        let count = Self::get_user_counter(&env, &user);
        let new_count = count + 1;

        // Update counter (PERSISTENT STORAGE with TTL extension)
        env.storage()
            .persistent()
            .set(&DataKey::UserCounter(user.clone()), &new_count);

        // Extend TTL for user's counter
        env.storage().persistent().extend_ttl(
            &DataKey::UserCounter(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        // Update stats (PERSISTENT STORAGE)
        Self::update_stats(&env, &user, true);

        // Update global counter (INSTANCE STORAGE)
        Self::increment_global(&env);

        // Set cooldown (TEMPORARY STORAGE)
        Self::set_cooldown(&env, &user);

        // Emit event
        env.events()
            .publish((symbol_short!("punch"), user.clone()), new_count);

        // Check for milestones
        Self::check_milestone(&env, &user, new_count);

        new_count
    }

    /// KICK - Increment counter by 2
    /// Demonstrates: Same as punch but with double increment
    pub fn kick(env: Env, user: Address) -> u32 {
        user.require_auth();

        // Check cooldown (TEMPORARY STORAGE)
        Self::check_cooldown(&env, &user);

        // Get current counter (PERSISTENT STORAGE)
        let count = Self::get_user_counter(&env, &user);
        let new_count = count + 2;

        // Update counter (PERSISTENT STORAGE with TTL extension)
        env.storage()
            .persistent()
            .set(&DataKey::UserCounter(user.clone()), &new_count);

        // Extend TTL for user's counter
        env.storage().persistent().extend_ttl(
            &DataKey::UserCounter(user.clone()),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        // Update stats (PERSISTENT STORAGE)
        Self::update_stats(&env, &user, false);

        // Update global counter (INSTANCE STORAGE)
        Self::increment_global(&env);
        Self::increment_global(&env); // Kick increments by 2

        // Set cooldown (TEMPORARY STORAGE)
        Self::set_cooldown(&env, &user);

        // Emit event
        env.events()
            .publish((symbol_short!("kick"), user.clone()), new_count);

        // Check for milestones
        Self::check_milestone(&env, &user, new_count);

        new_count
    }

    /// Manually extend TTL for your counter
    /// Demonstrates: Manual TTL extension to prevent expiry
    pub fn extend_my_ttl(env: Env, user: Address) {
        user.require_auth();

        // Extend user counter TTL
        if env
            .storage()
            .persistent()
            .has(&DataKey::UserCounter(user.clone()))
        {
            env.storage().persistent().extend_ttl(
                &DataKey::UserCounter(user.clone()),
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

    // ===== VIEW FUNCTIONS =====

    /// Get user's counter value
    pub fn get_count(env: Env, user: Address) -> u32 {
        Self::get_user_counter(&env, &user)
    }

    /// Get global counter (sum of all actions)
    pub fn get_global_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GlobalCount)
            .unwrap_or(0)
    }

    /// Get user's detailed statistics
    pub fn get_stats(env: Env, user: Address) -> Option<UserStats> {
        env.storage()
            .persistent()
            .get(&DataKey::UserStats(user))
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

    /// Reset global counter (admin only)
    pub fn reset_global(env: Env, admin: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        env.storage().instance().set(&DataKey::GlobalCount, &0u32);
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

    fn get_user_counter(env: &Env, user: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::UserCounter(user.clone()))
            .unwrap_or(0)
    }

    fn increment_global(env: &Env) {
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::GlobalCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::GlobalCount, &(current + 1));
    }

    fn update_stats(env: &Env, user: &Address, is_punch: bool) {
        let mut stats: UserStats = env
            .storage()
            .persistent()
            .get(&DataKey::UserStats(user.clone()))
            .unwrap_or(UserStats {
                total_punches: 0,
                total_kicks: 0,
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

    fn check_milestone(env: &Env, user: &Address, count: u32) {
        // Emit milestone events at certain thresholds
        if count == 10 || count == 50 || count == 100 || count == 500 || count == 1000 {
            env.events()
                .publish((symbol_short!("milestone"), user.clone()), count);
        }
    }
}

mod test;
