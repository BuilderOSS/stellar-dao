# Soroban Counter Contract - Storage TTL Showcase

An educational counter contract demonstrating Soroban's **Storage TTL (Time To Live)** management across all three storage types.

## Overview

This contract implements a simple counter with "Punch" (+1) and "Kick" (+2) mechanics, but its real purpose is to showcase Soroban's unique storage architecture and TTL management system.

## Key Features

### Storage Types Demonstration

The contract uses all **3 Soroban storage types**, each with different characteristics:

#### 1. **Instance Storage** (Contract-wide, shared lifetime)
- `Admin` - Contract administrator address
- `GlobalCount` - Total of all counters
- `CooldownSecs` - Cooldown configuration
- **Characteristics**: Lives as long as the contract exists, cheapest for contract-wide data

#### 2. **Persistent Storage** (User-specific, requires TTL management)
- `UserCounter(Address)` - Individual user counters
- `UserStats(Address)` - Detailed statistics (total punches, kicks, last action)
- **Characteristics**: More expensive but important data, requires manual TTL extension

#### 3. **Temporary Storage** (Short-lived, auto-expires)
- `Cooldown(Address)` - Last action timestamp for cooldown enforcement
- **Characteristics**: Cheapest storage, perfect for ephemeral data, auto-expires

### TTL Management

The contract demonstrates proper TTL extension patterns:

- **Automatic TTL Extension**: Every `punch()` and `kick()` extends the user's counter TTL
- **Manual TTL Extension**: Users can call `extend_my_ttl()` to prevent expiry
- **Different TTL Values**:
  - Persistent data: 30-day threshold, extends to 60 days
  - Temporary data: 1-day threshold, extends to 2 days

### Core Functions

#### Write Operations
- `initialize(admin)` - Initialize contract with admin address
- `punch(user)` - Increment counter by 1, extend TTL, set cooldown
- `kick(user)` - Increment counter by 2, extend TTL, set cooldown
- `extend_my_ttl(user)` - Manually extend your counter's TTL

#### View Functions
- `get_count(user)` - Get user's counter value
- `get_global_count()` - Get total of all actions
- `get_stats(user)` - Get detailed user statistics
- `is_on_cooldown(user)` - Check if user is on cooldown
- `cooldown_remaining(user)` - Get seconds remaining on cooldown
- `get_cooldown_duration()` - Get current cooldown setting

#### Admin Functions
- `reset_global(admin)` - Reset global counter to 0
- `set_cooldown_duration(admin, seconds)` - Configure cooldown period

## Building and Testing

### Build
```bash
make build
# or
stellar contract build --package counter
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

## Usage Example

```rust
// Initialize contract
client.initialize(&admin);

// User punches (+1)
let count = client.punch(&user); // count = 1
// TTL automatically extended for user's data
// Cooldown set (temporary storage)

// Wait for cooldown to expire...
// (In production: ~1 hour, configurable)

// User kicks (+2)
let count = client.kick(&user); // count = 3
// TTL extended again

// Manually extend TTL to keep data alive longer
client.extend_my_ttl(&user);

// Check remaining cooldown
let remaining = client.cooldown_remaining(&user); // seconds

// View stats
let stats = client.get_stats(&user);
// stats.total_punches = 1
// stats.total_kicks = 1
// stats.last_action = <timestamp>
```

## Storage TTL Lifecycle

```
1. User punches → Counter stored in PERSISTENT with 60-day TTL
                → Cooldown stored in TEMPORARY with 2-day TTL

2. After 1 hour → Cooldown can be checked (TEMPORARY still valid)
                → User can punch/kick again

3. After 2 days → Cooldown expired (TEMPORARY auto-deleted)
                → Counter still exists (PERSISTENT)

4. After 30 days of inactivity → TTL warning threshold
                               → User should call extend_my_ttl()

5. If user doesn't extend → Counter expires after 60 days
                          → Data removed from ledger

6. Each punch/kick → Automatically extends TTL another 60 days
```

## Events

The contract emits events for:
- `punch` - When a user punches
- `kick` - When a user kicks
- `milestone` - When reaching 10, 50, 100, 500, or 1000 count

## Educational Value

This contract teaches:

1. **Storage Type Selection**: When to use Instance vs Persistent vs Temporary
2. **TTL Management**: How and when to extend storage TTL
3. **Cost Optimization**: Using temporary storage for ephemeral data (cooldowns)
4. **Data Lifecycle**: Understanding when data expires and how to prevent it
5. **Cooldown Patterns**: Common anti-spam pattern using temporary storage

## Constants

```rust
DAY_IN_LEDGERS = 17,280 (~1 day at 5 seconds per ledger)

Persistent Storage:
- Threshold: 30 days
- Extend to: 60 days

Temporary Storage:
- Threshold: 1 day
- Extend to: 2 days
```

## WASM Build

The contract compiles to a compact **6.5 KB** WASM file with 12 exported functions.

## License

This is an educational contract for demonstrating Soroban storage TTL features.
