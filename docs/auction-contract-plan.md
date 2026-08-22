# Stellar Auction Contract Implementation Plan

## Overview
Create a simple MVP auction contract for the Stellar DAO that continuously runs auctions for governance tokens, supporting both native XLM and SAC token bids.

## Architecture & Design Decisions

### Core Features (Based on Nouns Reference)
- **Continuous Auction Model**: Auto-create next auction after settlement (like Nouns)
- **Token Minting**: Mint token at auction creation, hold in contract, transfer on settle
- **Dual Currency Support**: Accept both native XLM and configurable SAC tokens
- **Pausable**: Owner can pause/unpause auction operations
- **Configurable**: Owner can modify settings only when paused
- **Treasury Integration**: Send proceeds to existing DAO treasury

### Key Differences from EVM Reference
- **No ReentrancyGuard needed**: Soroban uses different execution model
- **Simplified rewards**: No protocol/builder/referral rewards (MVP)
- **Single token type**: Only NFT governance tokens (no multi-token support)
- **No upgradeability**: Direct deployment (no UUPS proxy pattern)

## Contract Structure

### File Organization
```
contracts/auction/
├── src/
│   ├── contract.rs        # Main contract implementation
│   ├── storage.rs         # Storage types and keys
│   ├── events.rs          # Event definitions
│   ├── error.rs           # Custom error types
│   └── test.rs            # Unit tests
├── Cargo.toml
└── README.md
```

## Implementation Steps

### 1. Setup Contract Scaffold (`contracts/auction/`)
- Create new Soroban contract package
- Add dependencies (soroban-sdk, stellar-access for Ownable, stellar-contract-utils for Pausable)
- Define project structure matching existing contracts

### 2. Define Storage Schema (`src/storage.rs`)

#### AuctionConfig Struct
```rust
pub struct AuctionConfig {
    pub token_contract: Address,           // Governance token to mint
    pub treasury: Address,                 // Recipient of proceeds
    pub duration: u64,                     // Auction duration in ledgers
    pub reserve_price: i128,               // Minimum first bid
    pub min_bid_increment_percent: u32,    // e.g., 10 for 10%
    pub time_buffer: u64,                  // Extend if bid near end
    pub payment_token: Option<Address>,    // SAC token (None = native XLM)
}
```

#### AuctionState Struct
```rust
pub struct AuctionState {
    pub token_id: u128,                    // Current NFT being auctioned
    pub highest_bid: i128,                 // Current winning bid
    pub highest_bidder: Option<Address>,   // Current winner
    pub start_ledger: u32,                 // When auction started
    pub end_ledger: u32,                   // When auction ends
    pub settled: bool,                     // If auction was settled
    pub payment_currency: PaymentType,     // XLM or SAC
}
```

#### PaymentType Enum
```rust
pub enum PaymentType {
    Native,
    SAC(Address),
}
```

### 3. Define Events (`src/events.rs`)
Following Mercury indexing pattern from token contract:
- `AuctionCreated { token_id, start_ledger, end_ledger }`
- `BidPlaced { token_id, bidder, amount, payment_type, extended, new_end_ledger }`
- `AuctionSettled { token_id, winner, amount, payment_type }`
- `ConfigUpdated { field, old_value, new_value }`

### 4. Define Errors (`src/error.rs`)
```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    InvalidTokenId = 1,
    AuctionOver = 2,
    AuctionNotStarted = 3,
    AuctionActive = 4,
    AuctionSettled = 5,
    ReservePriceNotMet = 6,
    MinBidNotMet = 7,
    InvalidConfig = 8,
    MintFailed = 9,
    TransferFailed = 10,
    NoPaymentTokenSet = 11,
}
```

### 5. Implement Core Contract (`src/contract.rs`)

#### Constructor
```rust
pub fn __constructor(
    e: &Env,
    owner: Address,
    token_contract: Address,
    treasury: Address,
    duration: u64,
    reserve_price: i128,
    min_bid_increment_percent: u32,
    time_buffer: u64,
    payment_token: Option<Address>,
)
```
- Set owner (using stellar-access Ownable)
- Initialize as paused
- Store config
- Emit initialization event

#### Auction Management Functions
- `unpause()` - Start first auction or resume (#[only_owner])
  - If first auction: mint token, create auction state
  - If resuming: create new auction if previous settled
- `pause()` - Pause auction (#[only_owner])
- `settle_auction()` - Settle current auction (#[when_paused])
  - Transfer token to winner
  - Send proceeds to treasury
  - Mark as settled

#### Bidding Logic
- `create_bid(token_id: u128)` - Bid with native XLM (#[when_not_paused])
  - Validate token_id matches current auction
  - Check auction not ended
  - Validate bid >= reserve or >= last_bid + increment
  - Refund previous bidder
  - Update highest bid/bidder
  - Extend auction if bid within time_buffer
  - Emit BidPlaced event

- `create_bid_with_token(token_id: u128, amount: i128)` - Bid with SAC token (#[when_not_paused])
  - Require payment_token configured
  - Transfer tokens from bidder to contract
  - Same validation as XLM bid
  - Refund previous bidder in same token
  - Store payment type with bid

- `settle_and_create_new()` - Public settle + create next (#[when_not_paused])
  - Validate auction ended
  - Settle current auction
  - Immediately create next auction

#### Configuration Functions (only when paused)
- `set_duration(duration: u64)` (#[only_owner] #[when_paused])
- `set_reserve_price(price: i128)` (#[only_owner] #[when_paused])
- `set_min_bid_increment(percent: u32)` (#[only_owner] #[when_paused])
- `set_time_buffer(buffer: u64)` (#[only_owner] #[when_paused])
- `set_payment_token(token: Option<Address>)` (#[only_owner] #[when_paused])
- `set_treasury(treasury: Address)` (#[only_owner] #[when_paused])

#### Read Functions
- `get_auction()` - Current auction state
- `get_config()` - Current configuration
- `get_payment_token()` - Current payment token

### 6. Token Integration
- Use `TokenClient` to call `mint()` on token contract
- Auction contract needs mint_authority from token
- Transfer minted token to winner via `transfer()`

### 7. Payment Handling
- **Native XLM**: Use `e.current_contract_address().transfer(&recipient, &amount)`
- **SAC Token**: Use `StellarAssetClient` for `transfer_from()` and `transfer()`
- Track payment type per auction to ensure consistent refunds/settlements

### 8. Unit Tests (`src/test.rs`)
Test coverage for:
- Constructor initialization
- Pause/unpause functionality
- Auction creation
- First bid validation (reserve price)
- Subsequent bid validation (minimum increment)
- Bid refunds
- Time extension logic
- Settlement logic
- Config updates when paused
- Error cases (bid on wrong token, bid after ended, etc.)

### 9. E2E Integration Tests (`contracts/e2e/`)
Add test scenarios:
- **Full auction lifecycle with XLM**:
  - Deploy contracts
  - Grant mint authority
  - Unpause and create first auction
  - Place multiple bids
  - Settle and auto-create next
- **Full auction lifecycle with SAC token**:
  - Same as above but with SAC token bids
- **Time extension testing**:
  - Bid near end triggers extension
- **Config updates**:
  - Pause, update settings, unpause
- **Edge cases**:
  - Auction with no bids (token should be burned or held)
  - Multiple consecutive auctions
  - Treasury receives correct proceeds

### 10. Update Deployment Scripts
- Add auction contract to deployment flow in `scripts/`
- Deploy order:
  1. Token contract
  2. Treasury contract
  3. Governor contract
  4. **Auction contract** (new)
  5. Grant auction contract mint_authority on token
- Update TypeScript deployment helpers
- Add auction config to deployment JSON

### 11. Frontend Integration (Future)
- Add auction queries to `src/lib/contracts/`
- Create auction UI components
- Display current auction, countdown, bid history
- Bid placement with currency selection

## Dependencies

### Cargo.toml
```toml
[package]
name = "dao-auction"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "27.0.6"

[dependencies.stellar-access]
git = "https://github.com/OpenZeppelin/stellar-contracts"
rev = "fbfde38"

[dependencies.stellar-contract-utils]
git = "https://github.com/OpenZeppelin/stellar-contracts"
rev = "fbfde38"

[dependencies.stellar-macros]
git = "https://github.com/OpenZeppelin/stellar-contracts"
rev = "fbfde38"

[dev-dependencies]
soroban-sdk = { version = "27.0.6", features = ["testutils"] }

[features]
testutils = ["soroban-sdk/testutils"]

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true

[profile.release-with-logs]
inherits = "release"
debug-assertions = true
```

## Security Considerations
- ✅ CEI Pattern: State changes before external calls
- ✅ Owner-only config changes when paused
- ✅ Bid validation (reserve price, increments)
- ✅ Proper refunds to previous bidders
- ✅ Auction state validation (not settled, not ended)
- ✅ Token authorization checks
- ✅ Payment type consistency (refund in same currency as bid)

## Success Criteria
- [ ] Contract compiles without errors
- [ ] All unit tests pass
- [ ] Integration tests demonstrate full auction lifecycle
- [ ] Successfully deployed to testnet
- [ ] Can mint tokens and run auctions
- [ ] Both XLM and SAC token bidding work
- [ ] Proceeds correctly sent to treasury
- [ ] Config updates work when paused
- [ ] Time extension works correctly
- [ ] Bid refunds work correctly

## Timeline Estimate
- Setup scaffold: 30 min
- Storage/events/errors: 1 hour
- Core contract logic: 3-4 hours
- Unit tests: 2 hours
- E2E tests: 2 hours
- Deployment integration: 1 hour
- **Total: ~10 hours**

## References
- EVM Auction: `/Users/dan13ram/code/nouns/protocol/updatable-proposals/src/auction/Auction.sol`
- OpenZeppelin Stellar Contracts: `~/code/openzeppelin/stellar-contracts`
- Existing DAO Contracts: `/Users/dan13ram/code/dan13ram/test-dao-stellar/contracts/`
