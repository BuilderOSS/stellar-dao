# DAO Auction Contract

A continuous auction contract for the Stellar DAO governance system, inspired by Nouns DAO.

## Overview

This contract implements a perpetual auction system that:
- Mints governance NFTs at the start of each auction
- Accepts bids in native XLM or configurable SAC tokens
- Automatically settles and creates new auctions
- Sends proceeds to the DAO treasury
- Supports pausable operations with owner-controlled configuration

## Key Features

- **Continuous Auctions**: Automatically creates a new auction after settling the previous one
- **Dual Currency**: Supports both native Stellar lumens (XLM) and SAC tokens for bidding
- **Time Extension**: Extends auction duration if a bid is placed near the end
- **Pausable**: Owner can pause auctions and update configuration
- **Treasury Integration**: All proceeds automatically sent to the DAO treasury

## Architecture

```
┌─────────────────┐
│  Auction House  │
│                 │
│  - Mint NFT     │
│  - Accept Bids  │
│  - Settle       │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ Token │ │Treasury│
│       │ │       │
└───────┘ └───────┘
```

## Usage

### Initialize
```rust
auction.__constructor(
    env,
    owner,
    token_contract,
    treasury,
    duration_in_ledgers,
    reserve_price,
    min_bid_increment_percent,
    time_buffer_in_ledgers,
    payment_token, // Option<Address>
);
```

### Start Auctions
```rust
// Owner unpauses to start first auction
auction.unpause();
```

### Place Bids
```rust
// Bid with native XLM
auction.create_bid(token_id);

// Bid with SAC token
auction.create_bid_with_token(token_id, amount);
```

### Settle and Continue
```rust
// Anyone can settle once auction ends
auction.settle_and_create_new();
```

## Configuration

All configuration changes require the auction to be paused:

- `set_duration(ledgers)` - Set auction duration
- `set_reserve_price(amount)` - Set minimum first bid
- `set_min_bid_increment(percent)` - Set minimum bid increase (%)
- `set_time_buffer(ledgers)` - Set time extension buffer
- `set_payment_token(token)` - Set accepted SAC token
- `set_treasury(address)` - Set proceeds recipient

## Security

- Owner-only administrative functions
- Pausable pattern for emergency stops
- CEI pattern for state changes before external calls
- Proper bid validation and refunds
- Payment type consistency enforcement

## Testing

```bash
# Run unit tests
cargo test

# Run with logs
cargo test -- --nocapture
```

## References

- Based on [Nouns DAO Auction House](https://github.com/ourzora/nouns-protocol)
- Uses [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)
