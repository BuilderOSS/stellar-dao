#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, MuxedAddress, String,
};

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
    TotalSupply,  // SEP-0041: Total token supply
    TokenName,    // SEP-0041: Token name
    TokenSymbol,  // SEP-0041: Token symbol
    Decimals,     // SEP-0041: Token decimals

    // PERSISTENT STORAGE - User-specific data (important, needs manual TTL management)
    Balance(Address),         // SEP-0041: Token balance (replaces UserCounter)
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
    pub total_punches: u32,
    pub total_kicks: u32,
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
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
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

        // Initialize global counter in INSTANCE storage
        env.storage().instance().set(&DataKey::GlobalCount, &0u32);

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

    /// PUNCH - Actor punches target, minting 1 token to target
    /// Demonstrates: Token minting, action-based gameplay, TTL extension
    pub fn punch(env: Env, from: Address, to: Address) -> i128 {
        // Only the actor (from) needs to authorize
        from.require_auth();

        // Check cooldown for actor (TEMPORARY STORAGE)
        Self::check_cooldown(&env, &from);

        // Mint 1 token to the target
        Self::mint(&env, &to, 1);

        // Update stats for the actor (who performed the punch)
        Self::update_stats(&env, &from, true);

        // Update global counter (INSTANCE STORAGE)
        Self::increment_global(&env);

        // Set cooldown for actor (TEMPORARY STORAGE)
        Self::set_cooldown(&env, &from);

        // Get target's new balance
        let new_balance = Self::get_balance(&env, &to);

        // Emit event
        env.events().publish(
            (symbol_short!("punch"), from.clone(), to.clone()),
            new_balance,
        );

        // Check for milestones for target
        Self::check_milestone(&env, &to, new_balance as u32);

        new_balance
    }

    /// KICK - Actor kicks target, minting 2 tokens to target
    /// Demonstrates: Token minting with higher reward
    pub fn kick(env: Env, from: Address, to: Address) -> i128 {
        // Only the actor (from) needs to authorize
        from.require_auth();

        // Check cooldown for actor (TEMPORARY STORAGE)
        Self::check_cooldown(&env, &from);

        // Mint 2 tokens to the target
        Self::mint(&env, &to, 2);

        // Update stats for the actor (who performed the kick)
        Self::update_stats(&env, &from, false);

        // Update global counter (INSTANCE STORAGE) - kick adds 2
        Self::increment_global(&env);
        Self::increment_global(&env);

        // Set cooldown for actor (TEMPORARY STORAGE)
        Self::set_cooldown(&env, &from);

        // Get target's new balance
        let new_balance = Self::get_balance(&env, &to);

        // Emit event
        env.events().publish(
            (symbol_short!("kick"), from.clone(), to.clone()),
            new_balance,
        );

        // Check for milestones for target
        Self::check_milestone(&env, &to, new_balance as u32);

        new_balance
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

    /// JOINT PUNCH - Two users jointly punch a target, minting 4 tokens total
    /// Demonstrates: Multi-signature authorization with require_auth() x2
    pub fn joint_punch(env: Env, user1: Address, user2: Address, target: Address) -> i128 {
        // Both users must authorize this action
        user1.require_auth();
        user2.require_auth();

        // Check cooldowns for both actors
        Self::check_cooldown(&env, &user1);
        Self::check_cooldown(&env, &user2);

        // Mint 4 tokens total to target (2 per user)
        Self::mint(&env, &target, 4);

        // Update stats for both actors (mark as punches)
        Self::update_stats(&env, &user1, true);
        Self::update_stats(&env, &user2, true);

        // Global counter gets fixed bonus of +10
        for _ in 0..10 {
            Self::increment_global(&env);
        }

        // Set cooldowns for both actors
        Self::set_cooldown(&env, &user1);
        Self::set_cooldown(&env, &user2);

        // Get target's new balance
        let new_balance = Self::get_balance(&env, &target);

        // Emit event with both actors and target
        env.events().publish(
            (
                symbol_short!("j_punch"),
                user1.clone(),
                user2.clone(),
                target.clone(),
            ),
            new_balance,
        );

        new_balance
    }

    /// HEAVY KICK - Three users jointly kick a target, minting 6 tokens total
    /// Demonstrates: Triple multi-signature authorization
    pub fn heavy_kick(
        env: Env,
        user1: Address,
        user2: Address,
        user3: Address,
        target: Address,
    ) -> i128 {
        // All three users must authorize
        user1.require_auth();
        user2.require_auth();
        user3.require_auth();

        // Check cooldowns for all actors
        Self::check_cooldown(&env, &user1);
        Self::check_cooldown(&env, &user2);
        Self::check_cooldown(&env, &user3);

        // Mint 6 tokens total to target (2 per user)
        Self::mint(&env, &target, 6);

        // Update stats for all actors (mark as kicks)
        Self::update_stats(&env, &user1, false);
        Self::update_stats(&env, &user2, false);
        Self::update_stats(&env, &user3, false);

        // Global counter gets super bonus of +20
        for _ in 0..20 {
            Self::increment_global(&env);
        }

        // Set cooldowns for all actors
        Self::set_cooldown(&env, &user1);
        Self::set_cooldown(&env, &user2);
        Self::set_cooldown(&env, &user3);

        // Get target's new balance
        let new_balance = Self::get_balance(&env, &target);

        // Emit event with all three actors and target
        env.events().publish(
            (
                symbol_short!("h_kick"),
                user1.clone(),
                user2.clone(),
                user3.clone(),
                target.clone(),
            ),
            new_balance,
        );

        new_balance
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

    /// BATTLE - Two users battle, winner determined by token balance
    /// Demonstrates: Competitive multi-sig with mint/burn mechanics
    pub fn battle(env: Env, attacker: Address, defender: Address) -> bool {
        // Both users must authorize the battle
        attacker.require_auth();
        defender.require_auth();

        // Check cooldowns for both
        Self::check_cooldown(&env, &attacker);
        Self::check_cooldown(&env, &defender);

        // Get current token balances
        let attacker_balance = Self::get_balance(&env, &attacker);
        let defender_balance = Self::get_balance(&env, &defender);

        // Winner has higher balance (attacker wins ties)
        let attacker_wins = attacker_balance >= defender_balance;

        // Update balances using mint/burn
        if attacker_wins {
            // Attacker wins: mint 5 to attacker, burn 3 from defender
            Self::mint(&env, &attacker, 5);
            if defender_balance >= 3 {
                Self::burn_internal(&env, &defender, 3);
            } else if defender_balance > 0 {
                Self::burn_internal(&env, &defender, defender_balance);
            }
        } else {
            // Defender wins: mint 5 to defender, burn 3 from attacker
            Self::mint(&env, &defender, 5);
            if attacker_balance >= 3 {
                Self::burn_internal(&env, &attacker, 3);
            } else if attacker_balance > 0 {
                Self::burn_internal(&env, &attacker, attacker_balance);
            }
        }

        // Update battle records
        Self::update_battle_record(&env, &attacker, attacker_wins);
        Self::update_battle_record(&env, &defender, !attacker_wins);

        // Global counter gets +2 (net gain from competition)
        Self::increment_global(&env);
        Self::increment_global(&env);

        // Set cooldowns
        Self::set_cooldown(&env, &attacker);
        Self::set_cooldown(&env, &defender);

        // Emit battle event
        if attacker_wins {
            env.events().publish(
                (symbol_short!("battle"), symbol_short!("win")),
                attacker.clone(),
            );
        } else {
            env.events().publish(
                (symbol_short!("battle"), symbol_short!("win")),
                defender.clone(),
            );
        }

        attacker_wins
    }

    // ===== VIEW FUNCTIONS =====

    /// Get user's token balance (SEP-0041 compatible via balance() too)
    pub fn get_count(env: Env, user: Address) -> i128 {
        Self::get_balance(&env, &user)
    }

    /// Get global counter (sum of all actions)
    pub fn get_global_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GlobalCount)
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

    // Removed: get_user_counter - now using get_balance from SEP-0041

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
impl token::TokenInterface for CounterContract {
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
