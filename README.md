# Soroban Workshop - Counter Contract

Educational Soroban smart contracts demonstrating key concepts and best practices.

## Contracts

### 🎯 Counter Contract (Featured)

**Location**: `contracts/counter/`

An educational counter contract showcasing **Soroban's Storage TTL (Time To Live)** management across all three storage types.

**Key Features**:
- ✅ **All 3 Storage Types**: Instance, Persistent, and Temporary
- ✅ **TTL Management**: Automatic and manual TTL extension patterns
- ✅ **Punch & Kick Mechanics**: +1 and +2 counter increments
- ✅ **Cooldown System**: Anti-spam using temporary storage
- ✅ **Admin Controls**: Global reset and configuration
- ✅ **Events**: Punch, kick, and milestone events
- ✅ **Comprehensive Tests**: 16 tests covering all functionality

**Quick Start**:
```bash
cd contracts/counter
make test    # Run tests
make build   # Build WASM
```

See [Counter Contract README](contracts/counter/README.md) for full documentation.

---

### 👋 Hello World Contract

**Location**: `contracts/hello-world/`

Simple starter contract for basic Soroban concepts.

---

## Project Structure

```text
.
├── contracts/
│   ├── counter/           # Storage TTL showcase contract
│   │   ├── src/
│   │   │   ├── lib.rs    # Main contract implementation
│   │   │   └── test.rs   # Comprehensive test suite
│   │   ├── Cargo.toml
│   │   ├── Makefile
│   │   └── README.md
│   └── hello-world/       # Basic example contract
│       ├── src/
│       │   ├── lib.rs
│       │   └── test.rs
│       └── Cargo.toml
├── Cargo.toml             # Workspace configuration
└── README.md
```

## Building Contracts

Build all contracts:
```bash
stellar contract build
```

Build specific contract:
```bash
stellar contract build --package counter
```

## Testing

Test all contracts:
```bash
cargo test
```

Test specific contract:
```bash
cd contracts/counter && cargo test
```

## Learning Resources

The **Counter Contract** is designed to teach:
1. **Storage Type Selection**: When to use Instance vs Persistent vs Temporary
2. **TTL Management**: How and when to extend storage TTL
3. **Cost Optimization**: Using temporary storage for ephemeral data
4. **Data Lifecycle**: Understanding when data expires and how to prevent it
5. **Cooldown Patterns**: Common anti-spam patterns

## Storage Types Overview

| Type | Use Case | TTL | Cost |
|------|----------|-----|------|
| **Instance** | Contract-wide config, global state | Shares contract lifetime | Cheapest for shared data |
| **Persistent** | User-specific important data | Manual extension required | More expensive |
| **Temporary** | Short-lived data (cooldowns) | Auto-expires | Cheapest overall |

## Counter Contract Storage Breakdown

### Instance Storage (Contract-wide)
- `Admin` - Contract administrator address
- `GlobalCount` - Total of all punches and kicks
- `CooldownSecs` - Cooldown duration configuration

### Persistent Storage (User-specific, TTL-managed)
- `UserCounter(Address)` - Individual user counter values
- `UserStats(Address)` - Detailed statistics (total punches, kicks, last action)
- **TTL**: 30-day threshold, extends to 60 days on each action

### Temporary Storage (Auto-expiring)
- `Cooldown(Address)` - Last action timestamp for cooldown enforcement
- **TTL**: 1-day threshold, extends to 2 days, then auto-expires

## Functions Overview

### Core Functions
- `punch(user)` → Increment by 1
- `kick(user)` → Increment by 2
- `extend_my_ttl(user)` → Manually extend TTL

### View Functions
- `get_count(user)` → User's counter
- `get_global_count()` → Total of all actions
- `get_stats(user)` → Detailed user statistics
- `is_on_cooldown(user)` → Check cooldown status
- `cooldown_remaining(user)` → Seconds remaining

### Admin Functions
- `initialize(admin)` → Initialize contract
- `reset_global(admin)` → Reset global counter
- `set_cooldown_duration(admin, seconds)` → Configure cooldown

## Example Usage

```rust
// Initialize contract
client.initialize(&admin);

// User punches (+1)
let count = client.punch(&user); // count = 1
// ✅ TTL automatically extended for user's data
// ✅ Cooldown set (temporary storage)

// Wait for cooldown to expire...

// User kicks (+2)
let count = client.kick(&user); // count = 3
// ✅ TTL extended again

// Check stats
let stats = client.get_stats(&user);
// stats.total_punches = 1
// stats.total_kicks = 1
```

## Storage TTL Lifecycle

```
Day 0:  User punches → Counter stored (60-day TTL)
                     → Cooldown stored (2-day TTL)

Day 2:  Cooldown expired → Auto-deleted (Temporary)
        Counter still exists → (Persistent)

Day 30: TTL warning threshold → User should extend
        Each punch/kick → Auto-extends another 60 days

Day 60: If no activity → Counter expires and is removed
```

## Requirements

- Rust 1.74+
- Stellar CLI (`stellar contract`)
- Soroban SDK v25+

## Build Output

```
WASM Size: 6,652 bytes (compact!)
Exported Functions: 12
Tests: 16 (all passing ✅)
```

## Next Steps

1. **Explore** the Counter Contract to understand Storage TTL
2. **Run tests** to see different storage behaviors in action
3. **Experiment** with TTL values and cooldown mechanics
4. **Build** your own contracts using these proven patterns

## Resources

- [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts)
- [Storage Types Guide](https://developers.stellar.org/docs/build/guides/storage)
- [TTL Management](https://developers.stellar.org/docs/build/guides/archival)
