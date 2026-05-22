#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn create_counter_contract<'a>(env: &Env, admin: &Address) -> CounterContractClient<'a> {
    let contract_id = env.register(CounterContract, ());
    let client = CounterContractClient::new(env, &contract_id);
    client.initialize(
        admin,
        &String::from_str(env, "Counter Token"),
        &String::from_str(env, "CNTR"),
        &7,
    );
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

    client.initialize(
        &admin,
        &String::from_str(&env, "Counter Token"),
        &String::from_str(&env, "CNTR"),
        &7,
    );
    client.initialize(
        &admin,
        &String::from_str(&env, "Counter Token"),
        &String::from_str(&env, "CNTR"),
        &7,
    ); // Should panic
}

#[test]
fn test_punch() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First punch (user punches themselves to get tokens)
    let count = client.punch(&user, &user);
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

    // First kick (user kicks themselves to get tokens)
    let count = client.kick(&user, &user);
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
    client.punch(&user, &user);

    // Need to advance time to avoid cooldown
    env.ledger().with_mut(|li| {
        li.timestamp += 3601; // Just past 1 hour cooldown
    });

    // Kick (+2) = 3
    client.kick(&user, &user);

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

    // User 1: punch themselves
    client.punch(&user1, &user1);

    // User 2: kick themselves
    client.kick(&user2, &user2);

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
    client.punch(&user, &user);

    // Verify cooldown is active (TEMPORARY STORAGE)
    assert!(client.is_on_cooldown(&user));

    // Try to punch again immediately - should panic
    client.punch(&user, &user);
}

#[test]
fn test_cooldown_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // First punch
    client.punch(&user, &user);

    // Verify cooldown is active
    assert!(client.is_on_cooldown(&user));

    // Advance time past cooldown (default 3600 seconds)
    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Cooldown should be expired
    assert!(!client.is_on_cooldown(&user));

    // Should be able to punch again
    let count = client.punch(&user, &user);
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
    client.punch(&user, &user);

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
    client.punch(&user, &user);

    // Advance time by 11 seconds
    env.ledger().with_mut(|li| {
        li.timestamp += 11;
    });

    // Should be able to punch again
    let count = client.punch(&user, &user);
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
    client.punch(&user, &user);

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    client.punch(&user, &user);

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
    client.punch(&user, &user);

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
        client.punch(&user, &user);
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
    client.punch(&user1, &user1);
    client.kick(&user2, &user2);

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
    client.punch(&user, &user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 0);
    let first_timestamp = stats.last_action;

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Kick
    client.kick(&user, &user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 1);
    assert!(stats.last_action > first_timestamp); // Timestamp should have updated

    env.ledger().with_mut(|li| {
        li.timestamp += 3601;
    });

    // Another punch
    client.punch(&user, &user);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.total_punches, 2);
    assert_eq!(stats.total_kicks, 1);
}

// ============================================================================
// SEP-0041 Token Standard Tests
// ============================================================================

#[test]
fn test_sep0041_token_metadata() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Verify token metadata
    assert_eq!(client.name(), String::from_str(&env, "Counter Token"));
    assert_eq!(client.symbol(), String::from_str(&env, "CNTR"));
    assert_eq!(client.decimals(), 7);
}

#[test]
fn test_sep0041_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice punches herself to get tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.punch(&alice, &alice);

    assert_eq!(client.balance(&alice), 3);
    assert_eq!(client.balance(&bob), 0);

    // Alice transfers 2 tokens to Bob
    // Use Address directly in transfer by converting to String and back to MuxedAddress
    use soroban_sdk::MuxedAddress;
    let bob_str = bob.to_string();
    let bob_muxed = MuxedAddress::from_string(&bob_str);
    client.transfer(&alice, &bob_muxed, &2);

    assert_eq!(client.balance(&alice), 1);
    assert_eq!(client.balance(&bob), 2);
}

#[test]
fn test_sep0041_approve_and_allowance() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Initially no allowance
    assert_eq!(client.allowance(&alice, &bob), 0);

    // Alice approves Bob for 50 tokens, expires at ledger 1000000
    client.approve(&alice, &bob, &50, &1000000);

    // Check allowance
    assert_eq!(client.allowance(&alice, &bob), 50);
}

#[test]
fn test_sep0041_allowance_expiration() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Get current ledger sequence
    let current_ledger = env.ledger().sequence();
    let expiration_ledger = current_ledger + 100;

    // Alice approves Bob with expiration
    client.approve(&alice, &bob, &50, &expiration_ledger);
    assert_eq!(client.allowance(&alice, &bob), 50);

    // Advance ledger past expiration
    env.ledger().with_mut(|li| {
        li.sequence_number = expiration_ledger + 1;
    });

    // Allowance should now be 0 (expired)
    assert_eq!(client.allowance(&alice, &bob), 0);
}

#[test]
fn test_sep0041_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice gets some tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);

    assert_eq!(client.balance(&alice), 5);

    // Alice approves Bob for 3 tokens
    client.approve(&alice, &bob, &3, &1000000);

    // Bob transfers 2 tokens from Alice to Charlie using allowance
    client.transfer_from(&bob, &alice, &charlie, &2);

    assert_eq!(client.balance(&alice), 3);
    assert_eq!(client.balance(&charlie), 2);
    assert_eq!(client.allowance(&alice, &bob), 1); // Allowance reduced
}

#[test]
#[should_panic(expected = "Insufficient allowance")]
fn test_sep0041_transfer_from_insufficient_allowance() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice gets some tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.punch(&alice, &alice);

    // Alice approves Bob for 1 token
    client.approve(&alice, &bob, &1, &1000000);

    // Bob tries to transfer 2 tokens (more than allowance) - should panic
    client.transfer_from(&bob, &alice, &charlie, &2);
}

#[test]
fn test_sep0041_burn() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice gets some tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);

    assert_eq!(client.balance(&alice), 3);
    let initial_supply = client.get_total_supply();

    // Alice burns 2 tokens
    client.burn(&alice, &2);

    assert_eq!(client.balance(&alice), 1);
    assert_eq!(client.get_total_supply(), initial_supply - 2);
}

#[test]
fn test_sep0041_burn_from() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice gets some tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.punch(&alice, &alice);

    assert_eq!(client.balance(&alice), 4);

    // Alice approves Bob to burn 3 tokens
    client.approve(&alice, &bob, &3, &1000000);

    // Bob burns 2 tokens from Alice's balance
    client.burn_from(&bob, &alice, &2);

    assert_eq!(client.balance(&alice), 2);
    assert_eq!(client.allowance(&alice, &bob), 1); // Allowance reduced
}

#[test]
fn test_sep0041_total_supply() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Initially 0 supply
    assert_eq!(client.get_total_supply(), 0);

    // Alice punches herself (+1)
    client.punch(&alice, &alice);
    assert_eq!(client.get_total_supply(), 1);

    env.ledger().with_mut(|li| li.timestamp += 3601);

    // Bob kicks himself (+2)
    client.kick(&bob, &bob);
    assert_eq!(client.get_total_supply(), 3);

    env.ledger().with_mut(|li| li.timestamp += 3601);

    // Alice burns 1 token
    client.burn(&alice, &1);
    assert_eq!(client.get_total_supply(), 2);
}

#[test]
fn test_multi_sig_joint_punch() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let target = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice and Bob jointly punch target (both must sign)
    // Target should receive 4 tokens
    client.joint_punch(&alice, &bob, &target);

    assert_eq!(client.balance(&target), 4);
    assert_eq!(client.get_total_supply(), 4);
}

#[test]
fn test_multi_sig_heavy_kick() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);
    let target = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice, Bob, and Charlie heavy kick target (all 3 must sign)
    // Target should receive 6 tokens
    client.heavy_kick(&alice, &bob, &charlie, &target);

    assert_eq!(client.balance(&target), 6);
    assert_eq!(client.get_total_supply(), 6);
}

#[test]
fn test_multi_sig_transfer_points() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Alice gets some tokens
    client.punch(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);
    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.kick(&alice, &alice);

    assert_eq!(client.balance(&alice), 5);

    // Wait for cooldown to expire
    env.ledger().with_mut(|li| li.timestamp += 3601);

    // Alice and Bob must sign for transfer
    // Transfer 3 tokens from Alice to Bob
    client.transfer_points(&alice, &bob, &3);

    assert_eq!(client.balance(&alice), 2);
    assert_eq!(client.balance(&bob), 3);
}

#[test]
fn test_battle_system() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let client = create_counter_contract(&env, &admin);

    // Both get 10 tokens
    for _ in 0..5 {
        client.kick(&alice, &alice);
        env.ledger().with_mut(|li| li.timestamp += 3601);
    }

    for _ in 0..5 {
        client.kick(&bob, &bob);
        env.ledger().with_mut(|li| li.timestamp += 3601);
    }

    assert_eq!(client.balance(&alice), 10);
    assert_eq!(client.balance(&bob), 10);

    let initial_supply = client.get_total_supply();

    // Alice battles Bob (winner determined by balance, attacker wins ties)
    let result = client.battle(&alice, &bob);

    // Winner gets +5 tokens, loser loses 3 tokens
    // Net: +2 tokens to total supply
    assert_eq!(client.get_total_supply(), initial_supply + 2);

    if result {
        // Alice won (attacker wins ties when balances are equal)
        assert_eq!(client.balance(&alice), 15); // 10 + 5
        assert_eq!(client.balance(&bob), 7);     // 10 - 3
    } else {
        // Bob won
        assert_eq!(client.balance(&alice), 7);   // 10 - 3
        assert_eq!(client.balance(&bob), 15);    // 10 + 5
    }
}
