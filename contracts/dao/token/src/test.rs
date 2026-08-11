extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{DaoTokenContract, DaoTokenContractClient};

fn setup() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let contract_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let client = DaoTokenContractClient::new(&e, &contract_id);
    (e, client, owner)
}

#[test]
fn mint_defaults_to_self_delegate() {
    let (e, client, _) = setup();
    let alice = Address::generate(&e);

    client.mint(&alice, &1);

    assert_eq!(client.balance(&alice), 1);
    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
    assert_eq!(client.get_votes(&alice), 1);
}

#[test]
fn transfer_preserves_existing_delegate() {
    let (e, client, _) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let carol = Address::generate(&e);

    client.mint(&alice, &1);
    client.delegate(&bob, &carol);
    client.transfer(&alice, &bob, &1);

    assert_eq!(client.balance(&bob), 1);
    assert_eq!(client.get_delegate(&bob), Some(carol.clone()));
    assert_eq!(client.get_votes(&carol), 1);
}

#[test]
fn explicit_delegation_moves_votes() {
    let (e, client, _) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    client.mint(&alice, &1);
    client.delegate(&alice, &bob);

    assert_eq!(client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 1);
}
