# Punch Arena

Soroban contracts plus a Next.js frontend with Stellar Wallets Kit and generated TypeScript contract clients.

## Workspace

- `contracts/arena` - Soroban token contract
- `packages/arena-bindings` - committed generated TS bindings
- `apps/web` - Next.js frontend

## Quick Start

```bash
pnpm install
pnpm arena:setup:local
pnpm dev
```

## Local Network

```bash
pnpm arena:local:up
pnpm arena:local:down
```

`pnpm arena:local:up` starts a local Stellar container, creates a funded local identity, deploys and initializes the contract, and writes `apps/web/.env.local` for the frontend.

## Testnet Deploy

```bash
pnpm arena:deploy:testnet
```

Set `NEXT_PUBLIC_STELLAR_TESTNET_CONTRACT_ID` in `apps/web/.env.local` if you deploy separately.

## Contracts

### 🎯 Arena Token (Featured)

**Location**: `contracts/arena/`

A fully **SEP-0041 compliant fungible token** with unique action-based minting mechanics, showcasing **Soroban's Storage TTL (Time To Live)** management across all three storage types.

**Key Features**:
- ✅ **SEP-0041 Compliant**: Full implementation of Stellar's fungible token standard
- ✅ **Action-Based Minting**: Punch (+1 token) and Kick (+2 tokens) mechanics
- ✅ **Multi-Signature Support**: `joint_punch`, `heavy_kick`, and `transfer_points` with multi-auth
- ✅ **Battle System**: Competitive token burning with wagering
- ✅ **Allowance Expiration**: Time-limited approvals with `live_until_ledger`
- ✅ **All 3 Storage Types**: Instance, Persistent, and Temporary
- ✅ **TTL Management**: Automatic and manual TTL extension patterns
- ✅ **Cooldown System**: Anti-spam using temporary storage
- ✅ **SEP-0041 Events**: mint, burn, transfer, approve events
- ✅ **Comprehensive Tests**: 16 tests covering all functionality

**Quick Start**:
```bash
cd contracts/arena
make test    # Run tests
make build   # Build WASM
```

See [Arena Token README](contracts/arena/README.md) for full documentation.

---

## Project Structure

```text
.
├── apps/
│   └── web/               # Next.js app
├── contracts/
│   └── arena/           # SEP-0041 token with Storage TTL showcase
│       ├── src/
│       │   ├── lib.rs    # Main contract implementation (850+ lines)
│       │   └── test.rs   # Comprehensive test suite (29 tests)
│       ├── Cargo.toml
│       ├── Makefile
│       └── README.md
├── packages/
│   └── contracts/
│       └── arena/       # Committed generated TS bindings
├── Cargo.toml             # Workspace configuration
├── package.json           # PNPM scripts and workspace config
├── pnpm-workspace.yaml
└── README.md
```

## Building

Build the contract and frontend:
```bash
stellar contract build --package arena
pnpm --dir apps/web build
# or
cd contracts/arena && make build
```

## Testing

Run all tests:
```bash
cargo test
# or
cd contracts/arena && make test
```

## SEP-0041 Token Standard

The Arena Token implements the complete [SEP-0041 Token Interface](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md), making it compatible with all Stellar wallets, DEXs, and DeFi protocols.

### Standard Functions Implemented

| Function | Description |
|----------|-------------|
| `name()` | Token name |
| `symbol()` | Token symbol |
| `decimals()` | Decimal places |
| `balance(id)` | Get balance |
| `transfer(from, to, amount)` | Transfer tokens |
| `transfer_from(spender, from, to, amount)` | Transfer with allowance |
| `approve(from, spender, amount, live_until_ledger)` | Approve with expiration |
| `allowance(from, spender)` | Get allowance (auto-expires) |
| `burn(from, amount)` | Burn tokens |
| `burn_from(spender, from, amount)` | Burn with allowance |

### Unique Token Features

**Action-Based Minting**: Tokens are minted through interactive actions
```rust
// Alice punches Bob → Bob receives 1 token
client.punch(&alice, &bob);

// Alice kicks Charlie → Charlie receives 2 tokens
client.kick(&alice, &charlie);
```

**Multi-Signature Minting**: Collaborative token minting
```rust
// Alice and Bob jointly punch Charlie → Charlie receives 4 tokens
client.joint_punch(&alice, &bob, &charlie);  // Both must sign
```

**Battle System**: Competitive token mechanism
```rust
// Alice challenges Bob with 10 tokens staked
let alice_wins = client.battle(&alice, &bob, &10);
// Winner gets all staked tokens, loser's tokens burned
```

## Learning Resources

The **Arena Token** is designed to teach:

1. **SEP-0041 Token Standard**: Complete implementation of Stellar's fungible token interface
2. **Allowance Expiration**: Time-limited approvals with `live_until_ledger`
3. **Storage Type Selection**: When to use Instance vs Persistent vs Temporary
4. **TTL Management**: How and when to extend storage TTL
5. **Cost Optimization**: Using temporary storage for ephemeral data
6. **Multi-Signature Authorization**: `require_auth()` patterns with multiple signers
7. **Action-Based Mechanics**: Alternative token distribution models
8. **Event Emission**: Proper event patterns for mint, burn, transfer, approve
9. **Data Lifecycle**: Understanding when data expires and how to prevent it
10. **Cooldown Patterns**: Common anti-spam patterns

## Storage Types Overview

| Type | Use Case | TTL | Cost |
|------|----------|-----|------|
| **Instance** | Contract-wide config, token metadata | Shares contract lifetime | Cheapest for shared data |
| **Persistent** | Token balances, allowances, user data | Manual extension required | More expensive |
| **Temporary** | Short-lived data (cooldowns) | Auto-expires | Cheapest overall |

## Arena Token Storage Breakdown

### Instance Storage (Contract-wide)
- `Admin` - Contract administrator address
- `TokenName`, `TokenSymbol`, `Decimals` - Token metadata (SEP-0041)
- `TotalSupply` - Total token supply (SEP-0041)
- `GlobalCount` - Total of all minted tokens
- `CooldownSecs` - Cooldown duration configuration

### Persistent Storage (User-specific, TTL-managed)
- `Balance(Address)` - Token balances (SEP-0041)
- `Allowance(Address, Address)` - Allowances with expiration (SEP-0041)
- `UserStats(Address)` - Detailed statistics (total punches, kicks, last action)
- `BattleRecord(Address)` - Win/loss records
- **TTL**: 30-day threshold, extends to 60 days on each action

### Temporary Storage (Auto-expiring)
- `Cooldown(Address)` - Last action timestamp for cooldown enforcement
- **TTL**: 1-day threshold, extends to 2 days, then auto-expires

## Functions Overview

### SEP-0041 Token Functions
```rust
// Initialize with token metadata
initialize(admin, name, symbol, decimals)

// Token standard functions
name() → String
symbol() → String
decimals() → u32
balance(id) → i128
transfer(from, to, amount)
transfer_from(spender, from, to, amount)
approve(from, spender, amount, live_until_ledger)
allowance(from, spender) → i128
burn(from, amount)
burn_from(spender, from, amount)
```

### Action-Based Minting Functions
```rust
punch(from, to) → i128                    // Mint 1 token to 'to'
kick(from, to) → i128                     // Mint 2 tokens to 'to'
joint_punch(user1, user2, target) → i128  // Mint 4 tokens (multi-sig)
heavy_kick(user1, user2, target) → i128   // Mint 6 tokens (multi-sig)
transfer_points(from, to, approver, amount) // 3-party transfer
```

### Battle & Admin Functions
```rust
battle(challenger, opponent, amount) → bool
reset_action_count(admin)
set_cooldown_duration(admin, seconds)
extend_my_ttl(user)
```

### View Functions
```rust
get_count(user) → i128                    // Same as balance()
get_action_count() → u32
get_total_supply() → i128
get_stats(user) → Option<UserStats>
get_battle_record(user) → Option<BattleRecord>
is_on_cooldown(user) → bool
cooldown_remaining(user) → u64
get_cooldown_duration() → u64
```

## Example Usage

### Token Initialization
```rust
use soroban_sdk::String;

client.initialize(
    &admin,
    &String::from_str(&env, "Arena Token"),
    &String::from_str(&env, "CNTR"),
    &7,  // 7 decimals
);
```

### Action-Based Token Distribution
```rust
// Alice punches Bob → Bob gets 1 token
client.punch(&alice, &bob);
assert_eq!(client.balance(&bob), 1);

// Wait for cooldown (1 hour default)...

// Alice kicks Bob → Bob gets 2 more tokens
client.kick(&alice, &bob);
assert_eq!(client.balance(&bob), 3);
```

### Standard Token Operations
```rust
// Transfer tokens
client.transfer(&alice, &bob, &100);

// Approve with expiration
client.approve(&alice, &bob, &50, &1000000);  // Expires at ledger 1000000

// Transfer from allowance
client.transfer_from(&bob, &alice, &charlie, &25);

// Burn tokens
client.burn(&alice, &10);
```

### Multi-Signature Actions
```rust
// Both Alice and Bob must sign this transaction
client.joint_punch(&alice, &bob, &charlie);  // Charlie gets 4 tokens
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
- `mint(to, amount)` - Token minting
- `burn(from, amount)` - Token burning
- `transfer(from, to, amount)` - Transfers
- `approve(from, spender, amount, live_until_ledger)` - Allowance approval

### Custom Events
- `punch(user, target, new_balance)` - Punch action
- `kick(user, target, new_balance)` - Kick action
- `milestone(user, count)` - Reaching 10, 50, 100, 500, or 1000 tokens

## Requirements

- Rust 1.74+
- Stellar CLI (`stellar contract`)
- Soroban SDK v25+

## Build Output

```
WASM Size: 16,500 bytes
Exported Functions: 28
Tests: 16 (all passing ✅)
```

## SEP-0041 Compliance

- ✅ All 10 required functions implemented
- ✅ Events emitted for mint, burn, transfer, approve
- ✅ Allowance expiration with `live_until_ledger`
- ✅ Expired allowances return 0
- ✅ MuxedAddress support in transfer
- ✅ Authorization checks on all mutating functions
- ✅ Integer overflow protection

## Next Steps

1. **Explore** the Arena Token contract to understand SEP-0041 and Storage TTL
2. **Run tests** to see token operations and storage behaviors in action
3. **Deploy** to testnet and interact with the token
4. **Experiment** with action-based minting and multi-sig operations
5. **Build** your own SEP-0041 tokens using these proven patterns

## Resources

- [SEP-0041 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md)
- [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts)
- [Storage Types Guide](https://developers.stellar.org/docs/build/guides/storage)
- [TTL Management](https://developers.stellar.org/docs/build/guides/archival)
- [Authorization Patterns](https://developers.stellar.org/docs/build/guides/auth)
- [Token Interface](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/index.html)
