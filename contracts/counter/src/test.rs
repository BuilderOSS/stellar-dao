#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

fn create_counter_contract<'a>(env: &Env, admin: &Address) -> CounterContractClient<'a> {
    let contract_id = env.register(CounterContract, ());
    let client = CounterContractClient::new(env, &contract_id);
    client.initialize(admin);
    client
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Global count should be 0
    assert_eq!(client.get_global_count(), 0);

    // Default cooldown should be 3600 seconds (1 hour)
    assert_eq!(client.get_cooldown_duration(), 3600);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_double_initialization() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(CounterContract, ());
    let client = CounterContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.initialize(&admin); // Should panic
}

#[test]
fn test_punch() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First punch
    let count = client.punch(&user);
    assert_eq!(count, 1);

    // Verify user counter (PERSISTENT STORAGE)
    assert_eq!(client.get_count(&user), 1);

    // Verify global counter (INSTANCE STORAGE)
    assert_eq!(client.get_global_count(), 1);

    // Verify stats (PERSISTENT STORAGE)
    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 0);
}

#[test]
fn test_kick() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First kick
    let count = client.kick(&user);
    assert_eq!(count, 2);

    // Verify user counter
    assert_eq!(client.get_count(&user), 2);

    // Verify global counter (kick adds 2)
    assert_eq!(client.get_global_count(), 2);

    // Verify stats
    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 0);
    assert_eq!(stats.total_kicks, 1);
}

#[test]
fn test_punch_and_kick_combination() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Punch (+1) = 1
    client.punch(&user);

    // Need to advance time to avoid cooldown
    env.ledger().with_mut(|li| {
        li.timestamp += 3601; // Just past 1 hour cooldown
    });

    // Kick (+2) = 3
    client.kick(&user);

    assert_eq!(client.get_count(&user), 3);
    assert_eq!(client.get_global_count(), 3);

    // Verify stats
    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 1);
}

#[test]
fn test_multiple_users() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // User 1: punch
    client.punch(&user1);

    // User 2: kick
    client.kick(&user2);

    // Verify individual counters (PERSISTENT STORAGE - each user has their own)
    assert_eq!(client.get_count(&user1), 1);
    assert_eq!(client.get_count(&user2), 2);

    // Verify global counter (INSTANCE STORAGE - sum of all actions)
    assert_eq!(client.get_global_count(), 3);
}

#[test]
#[should_panic(expected = "Still on cooldown")]
fn test_cooldown_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First punch
    client.punch(&user);

    // Verify cooldown is active (TEMPORARY STORAGE)
    assert!(client.is_on_cooldown(&user));

    // Try to punch again immediately - should panic
    client.punch(&user);
}

#[test]
fn test_cooldown_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First punch
    client.punch(&user);

    // Verify cooldown is active
    assert!(client.is_on_cooldown(&user));

    // Advance time past cooldown (default 3600 seconds)
    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Cooldown should be expired
    assert!(!client.is_on_cooldown(&user));

    // Should be able to punch again
    let count = client.punch(&user);
    assert_eq!(count, 2);
}

#[test]
fn test_cooldown_remaining() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Initially no cooldown
    assert_eq!(client.cooldown_remaining(&user), 0);

    // Punch
    client.punch(&user);

    // Should have ~3600 seconds remaining
    let remaining = client.cooldown_remaining(&user);
    assert!(remaining > 3500 && remaining <= 3600);

    // Advance time by 1000 seconds
    env.ledger().with_mut(|li| {
        li.timestamp += 1000;
    });

    // Should have ~2600 seconds remaining
    let remaining = client.cooldown_remaining(&user);
    assert!(remaining > 2500 && remaining <= 2600);

    // Advance past cooldown
    env.ledger().with_mut(|li| {
        li.timestamp += 3000;
    });

    // Should be 0
    assert_eq!(client.cooldown_remaining(&user), 0);
}

#[test]
fn test_admin_set_cooldown() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Set cooldown to 10 seconds
    client.set_cooldown_duration(&admin, &10);
    assert_eq!(client.get_cooldown_duration(), 10);

    // Punch
    client.punch(&user);

    // Advance time by 11 seconds
    env.ledger().with_mut(|li| {
        li.timestamp += 11;
    });

    // Should be able to punch again
    let count = client.punch(&user);
    assert_eq!(count, 2);
}

#[test]
fn test_admin_reset_global() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Make some punches
    client.punch(&user);

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    client.punch(&user);

    assert_eq!(client.get_global_count(), 2);

    // Admin resets global counter (INSTANCE STORAGE)
    client.reset_global(&admin);
    assert_eq!(client.get_global_count(), 0);

    // User counter should still exist (PERSISTENT STORAGE)
    assert_eq!(client.get_count(&user), 2);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_admin_only_functions() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Non-admin tries to reset - should panic
    client.reset_global(&non_admin);
}

#[test]
fn test_extend_ttl() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Punch to create counter
    client.punch(&user);

    // Manually extend TTL (demonstrates TTL management)
    client.extend_my_ttl(&user);

    // Verify counter still exists
    assert_eq!(client.get_count(&user), 1);
}

#[test]
fn test_milestone_events() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Punch 10 times to hit first milestone
    for i in 0..10 {
        if i > 0 {
            env.ledger().with_mut(|li| {
                li.timestamp += 3601;
            });
        }
        client.punch(&user);
    }

    assert_eq!(client.get_count(&user), 10);

    // Events should have been emitted (milestone at 10)
    // In a real test, you'd check env.events() here
}

#[test]
fn test_storage_types_demonstration() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // INSTANCE STORAGE: Global counter, admin, cooldown config
    // - Shared across all users
    // - Lives as long as contract exists
    assert_eq!(client.get_global_count(), 0);
    assert_eq!(client.get_cooldown_duration(), 3600);

    // PERSISTENT STORAGE: User counters and stats
    // - Individual per user
    // - Requires TTL management
    // - More expensive but important data
    client.punch(&user1);
    client.kick(&user2);

    assert_eq!(client.get_count(&user1), 1); // user1's persistent data
    assert_eq!(client.get_count(&user2), 2); // user2's persistent data

    // TEMPORARY STORAGE: Cooldowns
    // - Auto-expires after TTL
    // - Cheapest storage
    // - Perfect for short-lived data
    assert!(client.is_on_cooldown(&user1)); // user1's temporary cooldown
    assert!(client.is_on_cooldown(&user2)); // user2's temporary cooldown

    // Advance time to expire temporary storage
    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Temporary storage expired (cooldowns gone)
    assert!(!client.is_on_cooldown(&user1));
    assert!(!client.is_on_cooldown(&user2));

    // But persistent storage still exists
    assert_eq!(client.get_count(&user1), 1);
    assert_eq!(client.get_count(&user2), 2);

    // And instance storage still exists
    assert_eq!(client.get_global_count(), 3);
}

#[test]
fn test_stats_tracking() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // User doesn't exist yet
    assert!(client.get_stats(&user).is_none());

    // Punch
    client.punch(&user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 0);
    let first_timestamp = stats.last_action;

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Kick
    client.kick(&user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 1);
    assert!(stats.last_action > first_timestamp); // Timestamp should have updated

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Another punch
    client.punch(&user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 2);
    assert_eq!(stats.total_kicks, 1);
}
