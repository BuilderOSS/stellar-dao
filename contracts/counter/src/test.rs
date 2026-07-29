#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn create_arena_contract<'a>(env: &Env, admin: &Address) -> ArenaContractClient<'a> {
    let contract_id = env.register(ArenaContract, ());
    let client = ArenaContractClient::new(env, &contract_id);
    client.initialize(
        admin,
        &String::from_str(env, "Arena Token"),
        &String::from_str(env, "ARENA"),
        &7,
    );
    client.set_cooldown_duration(&admin, &0);
    client
}

fn charge_up_times(client: &ArenaContractClient, user: &Address, times: u32) {
    for _ in 0..times {
        client.charge_up(&user);
    }
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(ArenaContract, ());
    let client = ArenaContractClient::new(&env, &contract_id);
    client.initialize(
        &admin,
        &String::from_str(&env, "Arena Token"),
        &String::from_str(&env, "ARENA"),
        &7,
    );

    assert_eq!(client.get_global_count(), 0);
    assert_eq!(client.get_cooldown_duration(), 3600);
    assert_eq!(client.get_total_supply(), 0);
}

#[test]
fn test_charge_up() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    assert_eq!(client.charge_up(&user), 1);
    assert_eq!(client.get_count(&user), 1);
    assert_eq!(client.get_total_supply(), 1);

    let stats = client.get_stats(&user).unwrap();
    assert_eq!(stats.charge_ups, 1);
    assert_eq!(stats.total_punches, 0);
    assert_eq!(client.get_global_count(), 1);
}

#[test]
fn test_light_attacks_transfer_points() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let target = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    charge_up_times(&client, &target, 3);

    assert_eq!(client.punch(&attacker, &target), 1);
    assert_eq!(client.get_count(&attacker), 1);
    assert_eq!(client.get_count(&target), 2);

    assert_eq!(client.kick(&attacker, &target), 2);
    assert_eq!(client.get_count(&attacker), 3);
    assert_eq!(client.get_count(&target), 0);

    let stats = client.get_stats(&attacker).unwrap();
    assert_eq!(stats.total_punches, 1);
    assert_eq!(stats.total_kicks, 1);
}

#[test]
fn test_battle_transfers_points() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let defender = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    charge_up_times(&client, &attacker, 2);
    charge_up_times(&client, &defender, 1);

    assert!(client.battle(&attacker, &defender));
    assert_eq!(client.get_count(&attacker), 3);
    assert_eq!(client.get_count(&defender), 0);

    let attacker_stats = client.get_stats(&attacker).unwrap();
    let defender_stats = client.get_stats(&defender).unwrap();
    assert_eq!(attacker_stats.total_battles, 1);
    assert_eq!(defender_stats.total_battles, 1);

    let attacker_record = client.get_battle_record(&attacker).unwrap();
    let defender_record = client.get_battle_record(&defender).unwrap();
    assert_eq!(attacker_record.wins, 1);
    assert_eq!(defender_record.losses, 1);
}

#[test]
fn test_raids_split_points() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let target = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    charge_up_times(&client, &target, 5);

    assert_eq!(client.joint_punch(&user1, &user2, &target), 4);
    assert_eq!(client.get_count(&user1), 2);
    assert_eq!(client.get_count(&user2), 2);
    assert_eq!(client.get_count(&target), 1);

    assert_eq!(client.heavy_kick(&user1, &user2, &user3, &target), 1);
    assert_eq!(client.get_count(&user1), 3);
    assert_eq!(client.get_count(&user2), 2);
    assert_eq!(client.get_count(&user3), 0);
    assert_eq!(client.get_count(&target), 0);

    let user1_stats = client.get_stats(&user1).unwrap();
    let user2_stats = client.get_stats(&user2).unwrap();
    let user3_stats = client.get_stats(&user3).unwrap();
    assert_eq!(user1_stats.total_raids, 2);
    assert_eq!(user2_stats.total_raids, 2);
    assert_eq!(user3_stats.total_raids, 1);
}

#[test]
fn test_transfer_and_allowance() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let spender = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    charge_up_times(&client, &from, 3);

    client.transfer_points(&from, &to, &2);
    assert_eq!(client.get_count(&from), 1);
    assert_eq!(client.get_count(&to), 2);

    client.approve(&from, &spender, &1, &1000);
    client.transfer_from(&spender, &from, &to, &1);
    assert_eq!(client.get_count(&from), 0);
    assert_eq!(client.get_count(&to), 3);
}

#[test]
fn test_burn_and_admin_tools() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let client = create_arena_contract(&env, &admin);

    charge_up_times(&client, &user, 2);
    assert_eq!(client.get_total_supply(), 2);

    client.burn(&user, &1);
    assert_eq!(client.get_count(&user), 1);
    assert_eq!(client.get_total_supply(), 1);

    client.reset_global(&admin);
    assert_eq!(client.get_global_count(), 0);

    client.extend_my_ttl(&user);
    assert_eq!(client.get_count(&user), 1);
}
