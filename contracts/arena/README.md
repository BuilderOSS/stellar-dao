# Soroban Arena Token - SEP-0041 Compliant Token with Storage TTL Showcase

An educational **SEP-0041 compliant fungible token** that demonstrates Soroban's **Storage TTL (Time To Live)** management across all three storage types, combined with unique action-based token minting mechanics.

## Overview

This contract implements a fully **SEP-0041 compliant token** with a unique twist: tokens are minted through game-like "Punch" (+1 token) and "Kick" (+2 tokens) actions. Users can perform these actions ON other users (or themselves), creating an interactive token distribution system while showcasing Soroban's storage architecture and TTL management.

## SEP-0041 Token Standard

This contract implements the complete [SEP-0041 Token Interface](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md), making it compatible with all Stellar wallets, DEXs, and DeFi protocols.

### Standard Token Functions

- ✅ `name()` - Token name
- ✅ `symbol()` - Token symbol
- ✅ `decimals()` - Decimal places
- ✅ `balance(id)` - Get balance
- ✅ `transfer(from, to, amount)` - Transfer tokens
- ✅ `transfer_from(spender, from, to, amount)` - Transfer with allowance
- ✅ `approve(from, spender, amount, live_until_ledger)` - Approve with expiration
- ✅ `allowance(from, spender)` - Get allowance (auto-expires)
- ✅ `burn(from, amount)` - Burn tokens
- ✅ `burn_from(spender, from, amount)` - Burn with allowance

### SEP-0041 Events

- ✅ `mint` - Emitted when tokens are minted
- ✅ `burn` - Emitted when tokens are burned
- ✅ `transfer` - Emitted on transfers
- ✅ `approve` - Emitted when allowance is set (includes expiration)

### Allowance Expiration

Implements SEP-0041's `live_until_ledger` parameter:
- Allowances automatically expire at specified ledger
- Expired allowances return 0
- Prevents indefinite approvals for enhanced security

## Unique Features

### Action-Based Token Minting

Unlike traditional tokens, this contract mints tokens through interactive actions:

```rust
// Alice punches Bob → Bob receives 1 point
client.punch(&alice, &bob);  // Bob's balance += 1

// Alice kicks Bob → Bob receives 2 points
client.kick(&alice, &bob);   // Bob's balance += 2

// Users can also punch/kick themselves
client.punch(&alice, &alice); // Alice's balance += 1
```

### Multi-Signature Token Minting

Demonstrates `require_auth()` patterns with multi-signature functions:

```rust
// Alice and Bob jointly punch Charlie → Charlie receives 4 points
client.joint_punch(&alice, &bob, &charlie);  // Both must sign

// Alice and Bob heavy kick Charlie → Charlie receives 6 points
client.heavy_kick(&alice, &bob, &charlie);

// Transfer points from one user to another
client.transfer_points(&alice, &bob, &charlie, &10);  // Transfer 10 points
```

### Battle System

Competitive token burning mechanism:

```rust
// Alice battles Bob
client.battle(&alice, &bob, &10);
// Winner is the higher-balance fighter and drains up to 3 points
```

## Storage Architecture

The contract showcases all **3 Soroban storage types**:

### Instance Storage (Contract-wide, shared lifetime)
- `Admin` - Contract administrator
- `TokenName`, `TokenSymbol`, `Decimals` - Token metadata
- `TotalSupply` - Total token supply
- `GlobalCount` - Total of all actions
- `CooldownSecs` - Cooldown configuration
- **Characteristics**: Lives as long as contract exists, cheapest for shared data

### Persistent Storage (User-specific, TTL-managed)
- `Balance(Address)` - Token balances (SEP-0041)
- `Allowance(Address, Address)` - Allowances with expiration (SEP-0041)
- `UserStats(Address)` - Detailed statistics (total punches, kicks, last action)
- `BattleRecord(Address)` - Win/loss records
- **Characteristics**: Requires manual TTL extension, more expensive but important

### Temporary Storage (Auto-expiring)
- `Cooldown(Address)` - Last action timestamp for cooldown enforcement
- **Characteristics**: Cheapest storage, auto-expires, perfect for ephemeral data

## TTL Management

The contract demonstrates proper TTL extension patterns:

- **Automatic TTL Extension**: Every action extends the user's data TTL
- **Manual TTL Extension**: Users can call `extend_my_ttl()` to prevent expiry
- **TTL Values**:
  - Persistent data: 30-day threshold, extends to 60 days
  - Temporary data: 1-day threshold, extends to 2 days

## Complete Function Reference

### Token Standard Functions (SEP-0041)

```rust
// Initialize with token metadata
initialize(admin: Address, name: String, symbol: String, decimals: u32)

// Token information
name() -> String
symbol() -> String
decimals() -> u32
balance(id: Address) -> i128

// Transfers
transfer(from: Address, to: MuxedAddress, amount: i128)
transfer_from(spender: Address, from: Address, to: Address, amount: i128)

// Allowances with expiration
approve(from: Address, spender: Address, amount: i128, live_until_ledger: u32)
allowance(from: Address, spender: Address) -> i128

// Burning
burn(from: Address, amount: i128)
burn_from(spender: Address, from: Address, amount: i128)

// Total supply
get_total_supply() -> i128
```

### Action-Based Minting Functions

```rust
// Single-user actions (actor punches/kicks target)
punch(from: Address, to: Address) -> i128        // Mint 1 token to 'to'
kick(from: Address, to: Address) -> i128         // Mint 2 tokens to 'to'

// Multi-signature actions (requires both signatures)
joint_punch(user1: Address, user2: Address, target: Address) -> i128   // Mint 4 tokens
heavy_kick(user1: Address, user2: Address, target: Address) -> i128    // Mint 6 tokens

// Transfer points (3-party signed transfer)
transfer_points(from: Address, to: Address, approver: Address, amount: i128)
```

### Battle System

```rust
battle(challenger: Address, opponent: Address, amount: i128) -> bool
// Returns true if challenger wins, false if opponent wins
// Winner drains up to 3 points from the loser
```

### View Functions

```rust
get_count(user: Address) -> i128                 // Same as balance()
get_action_count() -> u32                        // Total of all actions
get_stats(user: Address) -> Option<UserStats>    // Detailed user statistics
get_battle_record(user: Address) -> Option<BattleRecord>

// Cooldown management
is_on_cooldown(user: Address) -> bool
cooldown_remaining(user: Address) -> u64         // Seconds remaining
get_cooldown_duration() -> u64                   // Current cooldown setting
```

### Admin Functions

```rust
reset_action_count(admin: Address)                     // Reset action count to 0
set_cooldown_duration(admin: Address, seconds: u64)
```

### TTL Management

```rust
extend_my_ttl(user: Address)                     // Manually extend user's data TTL
```

## Building and Testing

### Build
```bash
make build
# or
stellar contract build --package arena
# Mercury retroshade build
cargo build -p arena --release --target wasm32v1-none --features mercury
```

### Test
```bash
make test
# or
cargo test
```

### Clean
```bash
make clean
```

## Usage Examples

### Token Initialization

```rust
use soroban_sdk::{String, Env};

let admin = Address::generate(&env);
client.initialize(
    &admin,
    &String::from_str(&env, "Arena Token"),
    &String::from_str(&env, "ARENA"),
    &7,  // 7 decimals
);
```

### Action-Based Token Distribution

```rust
// Alice punches Bob → Bob gets 1 point
client.punch(&alice, &bob);
assert_eq!(client.balance(&bob), 1);

// Wait for cooldown to expire (60 seconds default)
// ...

// Alice kicks Bob → Bob gets 2 more points
client.kick(&alice, &bob);
assert_eq!(client.balance(&bob), 3);

// Check Alice's cooldown
let remaining = client.cooldown_remaining(&alice); // seconds
```

### Standard Token Operations

```rust
// Transfer tokens
client.transfer(&alice, &bob, &100);

// Approve with expiration (expires at ledger 1000000)
client.approve(&alice, &bob, &50, &1000000);

// Check allowance (returns 0 if expired)
let allowance = client.allowance(&alice, &bob);

// Transfer from allowance
client.transfer_from(&bob, &alice, &charlie, &25);

// Burn tokens
client.burn(&alice, &10);
```

### Multi-Signature Actions

```rust
// Alice and Bob jointly punch Charlie → Charlie gets 4 tokens
// Both Alice and Bob must sign this transaction
client.joint_punch(&alice, &bob, &charlie);

// Heavy kick requires both signatures → 6 tokens
client.heavy_kick(&alice, &bob, &charlie);
```

### Battle System

```rust
// Alice challenges Bob with 10 tokens staked
let alice_wins = client.battle(&alice, &bob, &10);

if alice_wins {
    // Alice receives 20 tokens (her 10 + Bob's 10)
    // Bob's 10 tokens are burned
} else {
    // Bob receives 20 tokens
    // Alice's 10 tokens are burned
}

// Check battle record
let record = client.get_battle_record(&alice).unwrap();
// record.wins, record.losses, record.total_wagered
```

## Storage TTL Lifecycle

```
Day 0:  User punches → Balance stored (60-day TTL)
                     → Stats stored (60-day TTL)
                     → Cooldown stored (2-day TTL)

Day 2:  Cooldown expired → Auto-deleted (Temporary)
        Balance still exists → (Persistent)

Day 30: TTL warning threshold → User should extend
        Each action → Auto-extends another 60 days

Day 60: If no activity → Balance expires and is removed
```

## Events

### SEP-0041 Events
- `mint(to: Address, amount: i128)` - Token minting
- `burn(from: Address, amount: i128)` - Token burning
- `transfer(from: Address, to: Address, amount: i128)` - Transfers
- `approve(from: Address, spender: Address, amount: i128, live_until_ledger: u32)` - Allowance approval

### Custom Events
- `punch(user: Address, target: Address, new_balance: i128)` - Punch action
- `kick(user: Address, target: Address, new_balance: i128)` - Kick action
- `milestone(user: Address, count: i128)` - Reaching 10, 50, 100, 500, or 1000 tokens

## Educational Value

This contract teaches:

1. **SEP-0041 Token Standard**: Complete implementation of Stellar's fungible token interface
2. **Allowance Expiration**: Time-limited approvals for enhanced security
3. **Storage Type Selection**: When to use Instance vs Persistent vs Temporary
4. **TTL Management**: How and when to extend storage TTL
5. **Cost Optimization**: Using temporary storage for ephemeral data (cooldowns)
6. **Multi-Signature Authorization**: `require_auth()` patterns with multiple signers
7. **Action-Based Mechanics**: Alternative token distribution models
8. **Event Emission**: Proper event patterns for indexing and monitoring

## Technical Details

### Constants

```rust
DAY_IN_LEDGERS = 17,280 (~1 day at 5 seconds per ledger)

Persistent Storage:
- Threshold: 30 days (518,400 ledgers)
- Extend to: 60 days (1,036,800 ledgers)

Temporary Storage:
- Threshold: 1 day (17,280 ledgers)
- Extend to: 2 days (34,560 ledgers)

Default Cooldown: 60 seconds
```

### WASM Build

```
Wasm Size: 16,500 bytes
Exported Functions: 28
Tests: 16 (all passing ✅)
```

## SEP-0041 Compliance Checklist

- ✅ All 10 required functions implemented
- ✅ Events emitted for mint, burn, transfer, approve
- ✅ Allowance expiration with `live_until_ledger`
- ✅ Expired allowances return 0
- ✅ MuxedAddress support in transfer
- ✅ Authorization checks on all mutating functions
- ✅ Integer overflow protection

## Gas Payment in Multi-Signature Transactions

When multiple users sign a transaction (e.g., `joint_punch`):
- Only the `--source-account` pays all transaction fees
- All required signers must authorize, but don't pay separately
- Example: `stellar contract invoke --source alice ...` → Alice pays the entire fee

## Next Steps

1. **Deploy to Testnet**: Use `stellar contract deploy` to deploy the token
2. **Initialize Token**: Call `initialize()` with your token metadata
3. **Experiment**: Try action-based minting and multi-sig operations
4. **Test Expiration**: Observe allowance expiration behavior
5. **Monitor Events**: Use event indexing to track token operations

## Resources

- [SEP-0041 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md)
- [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts)
- [Storage Types Guide](https://developers.stellar.org/docs/build/guides/storage)
- [TTL Management](https://developers.stellar.org/docs/build/guides/archival)
- [Authorization Patterns](https://developers.stellar.org/docs/build/guides/auth)

## License

This is an educational contract for demonstrating SEP-0041 token standard and Soroban storage TTL features.
