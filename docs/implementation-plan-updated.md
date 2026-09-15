# Nouns Builder on Stellar - Updated Implementation Plan

**Date**: 2026-09-14
**Based On**: Complete Nouns Builder analysis + MVP technical plan
**Repository Strategy**: Fresh start in new `nouns-stellar` repository

---

## Overview

Build a **production-ready Nouns-style DAO platform on Stellar**, inspired by Nouns Builder (EVM) and adapted for Soroban's capabilities. This plan incorporates learnings from:

1. **Current prototype** (`stellar-dao`) - Proven patterns and working features
2. **Nouns Builder contracts** - Elegant founder vesting, continuous auctions, governance
3. **Nouns Builder web app** - Excellent UX patterns and user flows
4. **MVP technical plan** - Stellar-specific requirements and architecture

**Timeline**: ~21 weeks (5 months)
**Approach**: Salvage proven patterns, build new architecture from scratch

---

## Phase 1: Foundation & Specification (Week 1-2)

### Week 1: Repository Setup & Infrastructure

**Tasks**:
- [ ] Create new `nouns-stellar` repository (fork or new)
- [ ] Set up monorepo structure: `/contracts`, `/apps/web`, `/packages`, `/db`, `/scripts`
- [ ] Configure tooling:
  - pnpm workspaces
  - Rust/Cargo for contracts
  - Next.js 15 with App Router
  - Tailwind CSS + shadcn/ui
  - TypeScript strict mode
  - ESLint + Prettier + Lefthook
- [ ] Port CI/CD workflow from current repo
- [ ] Set up local Stellar network (Docker)
- [ ] Configure VS Code workspace settings

**Deliverables**:
- Clean repository with proper structure
- Working local development environment
- Build/test/lint scripts functional

### Week 2: Artwork Specification & Fixtures

**Tasks**:
- [ ] Document IPFS folder structure based on `/Users/dan13ram/code/nouns/artwork/sample`
- [ ] Create TypeScript types for artwork data:
  ```typescript
  interface ArtSeed {
    background: number  // 0-1
    body: number        // 0-2
    accessory: number   // 0-2
    head: number        // 0-2
    glasses: number     // 0-2
  }

  interface TraitCounts {
    background: number
    body: number
    accessory: number
    head: number
    glasses: number
  }

  interface MetadataConfig {
    version: number
    ipfsBaseCid: string
    traitCounts: TraitCounts
  }
  ```
- [ ] Create Rust types for contracts:
  ```rust
  pub struct ArtSeed {
      pub background: u8,
      pub body: u8,
      pub accessory: u8,
      pub head: u8,
      pub glasses: u8,
  }
  ```
- [ ] Copy sample artwork to `/fixtures/artwork/sample/`
- [ ] Upload sample to IPFS, document CID
- [ ] Create deterministic seed generation algorithm:
  ```rust
  pub fn generate_seed(token_id: u32, trait_counts: &TraitCounts) -> ArtSeed {
      let hash = env.crypto().keccak256(&token_id.to_le_bytes());
      ArtSeed {
          background: hash.get(0).unwrap() % trait_counts.background,
          body: hash.get(1).unwrap() % trait_counts.body,
          // ... etc
      }
  }
  ```
- [ ] Test seed generation (verify determinism, no out-of-bounds)
- [ ] Document trait compatibility validation rules

**Deliverables**:
- Complete artwork specification document
- Fixture artwork with known CID
- Working seed generation algorithm with tests
- TypeScript + Rust types aligned

---

## Phase 2: Platform Contracts (Week 3-5)

### Week 3: Manager Contract

**Features** (from Nouns Builder):
- Implementation version/hash registry
- Upgrade transition approval system
- Publication activation times
- Emergency factory pause capability
- Multisig authority (start with single owner for MVP)

**Rust contract** (`contracts/manager/src/lib.rs`):
```rust
pub struct ImplementationVersion {
    pub name: String,      // e.g., "Token", "Governor"
    pub version: u32,
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,
    pub revoked: bool,
}

pub struct UpgradeTransition {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
    pub approved: bool,
}

// Key functions
pub fn register_implementation(
    env: Env,
    name: String,
    version: u32,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn approve_upgrade(
    env: Env,
    from_hash: BytesN<32>,
    to_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn revoke_implementation(
    env: Env,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn pause_factory(env: Env) -> Result<(), Error>;
```

**Tests**:
- [ ] Register implementation (owner only)
- [ ] Approve upgrade transition
- [ ] Revoke implementation
- [ ] Query upgrade path (valid/invalid)
- [ ] Pause/unpause factory
- [ ] Unauthorized access (should fail)

**Deliverables**:
- Working Manager contract with tests
- TypeScript bindings generated

### Week 4: DaoFactory & DaoRegistry

**DaoFactory** (`contracts/factory/src/lib.rs`):
```rust
pub struct DaoCreationParams {
    pub deployer: Address,
    pub nonce: u64,

    // Token params
    pub token_name: String,
    pub token_symbol: String,

    // Metadata params
    pub ipfs_base_cid: String,
    pub trait_counts: TraitCounts,

    // Auction params
    pub auction_duration: u64,
    pub reserve_price: i128,
    pub time_buffer: u64,
    pub payment_asset: Address,

    // Governance params
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum_bps: u32,
    pub proposal_threshold_bps: u32,

    // Founder allocations
    pub founders: Vec<FounderAllocation>,

    // Launch admin
    pub launch_admin: Option<Address>, // None = governance-only launch
}

pub fn create_dao(
    env: Env,
    params: DaoCreationParams,
) -> Result<DaoAddresses, Error> {
    // 1. Authenticate creator
    params.deployer.require_auth();

    // 2. Validate params (bounded checks)
    validate_creation_params(&params)?;

    // 3. Derive salts (domain-separated)
    let salts = derive_deployment_salts(&env, &params);

    // 4. Predict all addresses
    let addresses = predict_addresses(&env, &salts);

    // 5. Deploy all modules atomically
    deploy_token(&env, &params, &addresses)?;
    deploy_metadata_registry(&env, &params, &addresses)?;
    deploy_auction(&env, &params, &addresses)?;
    deploy_governor(&env, &params, &addresses)?;
    deploy_treasury(&env, &params, &addresses)?;

    // 6. Initialize founders (modulo-100 allocation)
    initialize_founders(&env, &addresses.token, &params.founders)?;

    // 7. Finalize authorities
    setup_final_authorities(&env, &addresses)?;

    // 8. Register in DaoRegistry
    register_dao(&env, &addresses)?;

    // 9. Emit creation event
    env.events().publish((symbol_short!("dao_create"),), addresses.clone());

    Ok(addresses)
}
```

**DaoRegistry** (`contracts/registry/src/lib.rs`):
```rust
pub struct DaoRegistration {
    pub token_address: Address,      // Canonical DAO ID
    pub creator: Address,
    pub created_ledger: u32,
    pub factory_version: u32,
    pub modules: DaoModules,
}

pub struct DaoModules {
    pub token: Address,
    pub metadata_registry: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

pub fn register_dao(
    env: Env,
    registration: DaoRegistration,
) -> Result<(), Error>;

pub fn get_dao(env: Env, token_address: Address) -> Option<DaoRegistration>;

pub fn enumerate_daos(
    env: Env,
    start: u32,
    limit: u32,
) -> Vec<Address>; // Token addresses
```

**Tests**:
- [ ] Full factory deployment (all 5 modules)
- [ ] Founder allocation (modulo-100 math)
- [ ] Address prediction correctness
- [ ] Duplicate creation prevention (same deployer + nonce)
- [ ] Failed constructor rollback
- [ ] Resource limit measurement (bounded inputs)
- [ ] Registry integration
- [ ] Creation event emission

**Deliverables**:
- DaoFactory contract with atomic deployment
- DaoRegistry contract with enumeration
- Both with comprehensive tests
- TypeScript bindings

### Week 5: MetadataRegistry Contract

**MetadataRegistry** (per-DAO instance):
```rust
pub struct MetadataConfig {
    pub version: u32,
    pub ipfs_base_cid: String,
    pub trait_counts: TraitCounts,
    pub updated_by_proposal: Option<u32>,
}

pub fn initialize(
    env: Env,
    ipfs_base_cid: String,
    trait_counts: TraitCounts,
) -> Result<(), Error>;

pub fn update_metadata(
    env: Env,
    new_ipfs_base_cid: String,
    new_trait_counts: TraitCounts,
    proposal_id: u32,
) -> Result<(), Error> {
    // 1. Only token owner (Treasury) can update
    require_token_owner(&env)?;

    // 2. Validate trait compatibility
    let current = get_current_config(&env);
    validate_trait_compatibility(&current.trait_counts, &new_trait_counts)?;

    // 3. Increment version
    let new_version = current.version + 1;

    // 4. Store new config
    storage::set_config(&env, MetadataConfig {
        version: new_version,
        ipfs_base_cid: new_ipfs_base_cid,
        trait_counts: new_trait_counts,
        updated_by_proposal: Some(proposal_id),
    });

    // 5. Emit event
    env.events().publish((symbol_short!("meta_upd"),), new_version);

    Ok(())
}

// Trait compatibility: counts can only INCREASE, never decrease
fn validate_trait_compatibility(
    current: &TraitCounts,
    new: &TraitCounts,
) -> Result<(), Error> {
    if new.background < current.background { return Err(Error::TraitCountDecreased); }
    if new.body < current.body { return Err(Error::TraitCountDecreased); }
    if new.accessory < current.accessory { return Err(Error::TraitCountDecreased); }
    if new.head < current.head { return Err(Error::TraitCountDecreased); }
    if new.glasses < current.glasses { return Err(Error::TraitCountDecreased); }
    Ok(())
}
```

**Tests**:
- [ ] Initialize metadata config
- [ ] Update with compatible traits (counts increase)
- [ ] Update with incompatible traits (should fail)
- [ ] Unauthorized update (should fail)
- [ ] Version history tracking

**Deliverables**:
- MetadataRegistry contract with tests
- Trait compatibility validation
- TypeScript bindings

---

## Phase 3: DAO Module Contracts (Week 6-9)

### Week 6: Token Contract v2

**Adapt from**: Current `/contracts/token` + Nouns Builder patterns

**Key features**:
- ✅ ERC-721-like ownership, transfers, approvals
- ✅ Delegation with checkpointed voting power
- ✅ Batch minting (1-100 tokens per call)
- ✨ **NEW**: Immutable art seed storage per token
- ✨ **NEW**: Founder allocation via modulo-100
- ✨ **NEW**: Upgrade entrypoint
- ✨ **NEW**: SEP-0050 interface compliance (optional)

**Rust additions**:
```rust
// Storage: Map<u32, ArtSeed>
pub fn mint(env: Env, to: Address, token_id: u32) -> Result<(), Error> {
    // 1. Check founder allocation (modulo-100)
    let recipient = determine_recipient(&env, token_id);

    // 2. Generate and store seed
    let metadata_registry = get_metadata_registry(&env);
    let trait_counts = metadata_registry.get_trait_counts();
    let seed = generate_seed(token_id, &trait_counts);
    storage::set_seed(&env, token_id, &seed);

    // 3. Mint NFT
    internal_mint(&env, &recipient, token_id)?;

    // 4. Callback to metadata registry (if needed)
    // metadata_registry.on_minted(token_id);

    Ok(())
}

pub fn get_seed(env: Env, token_id: u32) -> Option<ArtSeed>;

pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
    // 1. Only treasury (governance) can upgrade
    require_owner(&env)?;

    // 2. Validate upgrade with Manager
    let manager = get_manager(&env);
    let current_hash = env.deployer().current_contract_wasm_hash();
    require(manager.is_upgrade_approved(current_hash, new_wasm_hash), Error::UpgradeNotApproved);

    // 3. Update WASM
    env.deployer().update_current_contract_wasm(new_wasm_hash);

    Ok(())
}
```

**Tests**:
- [ ] Founder vesting (modulo-100 allocation works correctly)
- [ ] Founder vest expiry (tokens go to auction after expiry)
- [ ] Seed generation (deterministic, bounded)
- [ ] Seed storage and retrieval
- [ ] Batch mint (1-100 tokens)
- [ ] Delegation and voting power
- [ ] Upgrade (authorized, manager-approved)
- [ ] Upgrade (unauthorized - should fail)
- [ ] SEP-0050 compliance (if implementing)

**Deliverables**:
- Token contract v2 with seeds and upgrades
- Comprehensive tests (unit + authorization)
- TypeScript bindings

### Week 7: Governor Contract v2

**Adapt from**: Current `/contracts/governor` + Nouns Builder patterns

**Key features**:
- ✅ Proposal creation, voting, queueing, execution
- ✅ Timestamp-based voting windows
- ✅ Historical voting power snapshots
- ✨ **NEW**: Non-reentrant internal dispatch for self-actions
- ✨ **NEW**: Upgrade entrypoint
- ✨ **NEW**: Bounded maximum durations
- ✨ **NEW**: Proposal-action linkage in events
- ❌ **SKIP** (MVP): Updatable proposals (defer to v2)

**Rust additions**:
```rust
pub enum ActionTarget {
    External(Address),     // External contract call
    Governor,              // Self-action (non-reentrant)
    Treasury,              // Call to Treasury
}

pub fn execute(env: Env, proposal_id: u32) -> Result<(), Error> {
    // ... existing execute logic

    for (i, action) in proposal.actions.iter().enumerate() {
        match action.target {
            ActionTarget::External(addr) => {
                // Standard external call
                env.invoke_contract(&addr, &action.function, action.args.clone());
            },
            ActionTarget::Governor => {
                // Internal dispatch (avoid reentrancy)
                execute_governor_action(&env, &action)?;
            },
            ActionTarget::Treasury => {
                // Treasury execution
                let treasury = get_treasury(&env);
                treasury.execute_proposal_action(proposal_id, i, action);
            },
        }
    }

    Ok(())
}

fn execute_governor_action(env: &Env, action: &ProposalAction) -> Result<(), Error> {
    match action.function.as_str() {
        "update_voting_delay" => {
            let new_delay: u64 = action.args[0];
            storage::set_voting_delay(env, new_delay);
        },
        "update_voting_period" => {
            let new_period: u64 = action.args[0];
            storage::set_voting_period(env, new_period);
        },
        "upgrade" => {
            let new_wasm_hash: BytesN<32> = action.args[0];
            internal_upgrade(env, new_wasm_hash)?;
        },
        _ => return Err(Error::UnknownGovernorAction),
    }
    Ok(())
}
```

**Tests**:
- [ ] Internal dispatch (governor self-actions)
- [ ] Treasury execution (external target)
- [ ] Upgrade via proposal
- [ ] Bounded duration validation
- [ ] Proposal-action event linkage
- [ ] Multi-action atomicity
- [ ] Failed action rollback

**Deliverables**:
- Governor contract v2 with internal dispatch
- Authorization chain tests
- TypeScript bindings

### Week 8: Treasury & Auction Contracts v2

**Treasury** (`contracts/treasury`):
```rust
pub enum ActionTarget {
    External(Address),
    TreasurySelf,  // Non-reentrant self-actions
}

pub fn execute(
    env: Env,
    proposal_id: u32,
    action_index: u32,
    action: ProposalAction,
) -> Result<(), Error> {
    // 1. Only Governor can execute
    require_governor(&env)?;

    // 2. Dispatch based on target
    match action.target {
        ActionTarget::External(addr) => {
            env.invoke_contract(&addr, &action.function, action.args);
        },
        ActionTarget::TreasurySelf => {
            execute_treasury_action(&env, &action)?;
        },
    }

    // 3. Emit execution event with proposal linkage
    env.events().publish(
        (symbol_short!("exec"),),
        (proposal_id, action_index, action.target)
    );

    Ok(())
}

pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
    // Only Governor can upgrade
    require_governor(&env)?;

    // Validate with Manager
    let manager = get_manager(&env);
    let current = env.deployer().current_contract_wasm_hash();
    require(manager.is_upgrade_approved(current, new_wasm_hash), Error::NotApproved);

    env.deployer().update_current_contract_wasm(new_wasm_hash);
    Ok(())
}
```

**Auction** (`contracts/auction`):
```rust
pub struct Claim {
    pub claimant: Address,
    pub asset: Address,
    pub amount: i128,
}

// One-shot launch
pub fn launch(env: Env) -> Result<(), Error> {
    let launch_admin = storage::get_launch_admin(&env)?;

    // Either launch admin OR governance (treasury) can launch
    if env.current_contract_address() != launch_admin {
        require_owner(&env)?; // Treasury
    } else {
        launch_admin.require_auth();
    }

    // Consume launch permission
    storage::remove_launch_admin(&env);

    // Create first auction
    create_auction(&env)?;

    Ok(())
}

// Claim system for failed refunds
pub fn create_bid(env: Env, bidder: Address, amount: i128) -> Result<(), Error> {
    // ... existing bid logic

    // Refund previous bidder
    if let Some(prev_bid) = current_auction.highest_bid {
        let asset = current_auction.payment_asset;

        // Try push refund
        let refund_result = asset.transfer(&env.current_contract_address(), &prev_bid.bidder, &prev_bid.amount);

        if refund_result.is_err() {
            // Create persistent claim
            storage::create_claim(&env, Claim {
                claimant: prev_bid.bidder,
                asset,
                amount: prev_bid.amount,
            });

            env.events().publish((symbol_short!("claim_cr"),), prev_bid.bidder);
        }
    }

    Ok(())
}

pub fn claim_refund(env: Env, claimant: Address) -> Result<(), Error> {
    claimant.require_auth();

    let claim = storage::get_claim(&env, &claimant)?;

    // Transfer claim amount
    claim.asset.transfer(&env.current_contract_address(), &claimant, &claim.amount)?;

    // Clear claim
    storage::remove_claim(&env, &claimant);

    env.events().publish((symbol_short!("claim_pd"),), (claimant, claim.amount));

    Ok(())
}

// Extension cap behavior
pub fn create_bid(env: Env, bidder: Address, amount: i128) -> Result<(), Error> {
    let auction = get_current_auction(&env);
    let now = env.ledger().timestamp();
    let time_left = auction.end_time.saturating_sub(now);

    // Extend if within time buffer AND not at extension cap
    if time_left <= auction.time_buffer && auction.extensions < MAX_EXTENSIONS {
        auction.end_time = now + auction.time_buffer;
        auction.extensions += 1;
    }
    // Otherwise accept bid but don't extend

    // ... rest of bid logic
}
```

**Tests**:
- [ ] One-shot launch (admin or governance)
- [ ] Launch consumption (can't launch twice)
- [ ] Claim creation on failed refund
- [ ] Claim withdrawal
- [ ] Duplicate claim prevention
- [ ] Extension cap behavior
- [ ] Expiry requirement for settlement
- [ ] Cancellation → Treasury transfer
- [ ] Treasury internal dispatch
- [ ] Upgrade authorization

**Deliverables**:
- Treasury contract v2 with internal dispatch
- Auction contract v2 with launch, claims, cap
- Tests for all new features
- TypeScript bindings

### Week 9: E2E Contract Tests

**End-to-end scenarios**:
```rust
#[test]
fn test_full_dao_lifecycle() {
    // 1. Factory creates DAO
    let addresses = factory.create_dao(creation_params);

    // 2. Launch auction (governance-first)
    let proposal_id = governor.propose(vec![
        Action {
            target: addresses.auction,
            function: "launch",
            args: vec![],
        }
    ]);

    // 3. Vote and execute launch
    governor.cast_vote(proposal_id, VoteType::For);
    advance_time(VOTING_PERIOD);
    governor.queue(proposal_id);
    advance_time(TIMELOCK_DELAY);
    governor.execute(proposal_id);

    // 4. Bid on auction
    auction.create_bid(bidder, MIN_BID);

    // 5. Settle auction
    advance_time(AUCTION_DURATION);
    auction.settle_and_create_next();

    // 6. Create proposal with multi-actions
    let proposal_id = governor.propose(vec![
        Action { /* SAC transfer */ },
        Action { /* Governance mint */ },
    ]);

    // 7. Vote, queue, execute
    // ... voting flow

    // 8. Upgrade Token via governance
    let upgrade_proposal = governor.propose(vec![
        Action {
            target: addresses.token,
            function: "upgrade",
            args: vec![new_token_wasm_hash],
        }
    ]);

    // 9. Execute upgrade
    // ... voting + execution

    // 10. Verify new WASM active
    assert_eq!(token.current_wasm_hash(), new_token_wasm_hash);
}

#[test]
fn test_founder_vesting() {
    // Create DAO with 10% founder allocation, 2-year vest
    let founders = vec![FounderAllocation {
        address: founder_addr,
        ownership_pct: 10,
        vest_expiry: now + (2 * YEAR),
    }];

    let addresses = factory.create_dao_with_founders(founders);

    // Launch auction
    auction.launch();

    // Mint first 20 tokens, verify every 10th goes to founder
    for i in 0..20 {
        auction.settle_and_create_next();

        let owner = token.owner_of(i);
        if i % 10 == 0 {
            assert_eq!(owner, founder_addr, "Token {} should go to founder", i);
        } else {
            assert_ne!(owner, founder_addr, "Token {} should go to bidder", i);
        }
    }

    // Advance past vest expiry
    advance_time(2 * YEAR + 1);

    // Next tokens should NOT go to founder
    auction.settle_and_create_next();
    let owner = token.owner_of(20);
    assert_ne!(owner, founder_addr, "Vesting expired");
}

#[test]
fn test_unauthorized_upgrade_fails() {
    let addresses = factory.create_dao(params);

    // Attacker tries to upgrade Token directly
    let result = token.upgrade_as(attacker, new_wasm_hash);
    assert!(result.is_err(), "Should reject unauthorized upgrade");

    // Attacker tries to propose upgrade to wrong WASM
    let malicious_hash = BytesN::random();
    let proposal_id = governor.propose_as(attacker, vec![
        Action {
            target: addresses.token,
            function: "upgrade",
            args: vec![malicious_hash],
        }
    ]);

    // Even if voted through, Manager should reject unregistered upgrade
    // ... vote and execute
    let exec_result = governor.execute(proposal_id);
    assert!(exec_result.is_err(), "Manager should reject unregistered upgrade");
}
```

**Test coverage**:
- [ ] Full DAO creation → auction → proposal → upgrade lifecycle
- [ ] Founder vesting (modulo-100) across multiple mints
- [ ] Founder vest expiry
- [ ] Authorization chains (explicit Soroban auth tests)
- [ ] Unauthorized actions (should all fail)
- [ ] Cross-DAO isolation (two DAOs don't interfere)
- [ ] Upgrade validation (Manager approval required)
- [ ] Failed action rollback
- [ ] Multi-action proposal atomicity
- [ ] Claim creation and withdrawal
- [ ] Auction extension cap
- [ ] Expiry enforcement

**Deliverables**:
- Comprehensive e2e test suite
- Authorization chain verification
- Resource limit measurements
- All contracts passing tests

---

## Phase 4: Database & Indexing (Week 10-12)

### Week 10: PostgreSQL Schema (Fresh Start)

**Migration** (`db/migrations/0001_initial_schema.sql`):

```sql
-- Immutable deployment identity
CREATE TABLE registry.deployments (
    deployment_id TEXT PRIMARY KEY,  -- {token_address}:{network}:{epoch}
    token_address TEXT NOT NULL,
    network TEXT NOT NULL,
    network_passphrase TEXT NOT NULL,
    epoch TEXT NOT NULL,

    creator TEXT NOT NULL,
    created_ledger BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    factory_version INT NOT NULL,

    -- Module addresses
    metadata_registry TEXT NOT NULL,
    auction TEXT NOT NULL,
    governor TEXT NOT NULL,
    treasury TEXT NOT NULL,

    UNIQUE(token_address, network, epoch)
);

CREATE INDEX idx_deployments_created ON registry.deployments(created_at DESC);
CREATE INDEX idx_deployments_creator ON registry.deployments(creator);

-- Event envelope with full provenance
CREATE TABLE chain.raw_events (
    id TEXT PRIMARY KEY,  -- {tx_hash}:{ledger}:{op_pos}:{event_pos}
    deployment_id TEXT NOT NULL REFERENCES registry.deployments(deployment_id),

    transaction_hash TEXT NOT NULL,
    ledger BIGINT NOT NULL,
    ledger_close_time TIMESTAMP NOT NULL,
    tx_position INT NOT NULL,
    operation_position INT NOT NULL,
    event_position INT NOT NULL,

    contract_address TEXT NOT NULL,
    tx_successful BOOLEAN NOT NULL,

    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,

    indexed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_raw_events_deployment ON chain.raw_events(deployment_id, ledger DESC);
CREATE INDEX idx_raw_events_contract ON chain.raw_events(contract_address, event_type);
CREATE INDEX idx_raw_events_tx ON chain.raw_events(transaction_hash);

-- Decoded events
CREATE TABLE chain.decoded_events (
    id TEXT PRIMARY KEY REFERENCES chain.raw_events(id),
    deployment_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    decoded_data JSONB NOT NULL,
    decoder_version TEXT NOT NULL
);

-- Governance tables
CREATE TABLE governance.proposals (
    deployment_id TEXT NOT NULL,
    proposal_id INT NOT NULL,
    proposal_hash TEXT NOT NULL UNIQUE,

    proposer TEXT NOT NULL,
    created_ledger BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,

    title TEXT,
    summary TEXT,

    vote_start TIMESTAMP NOT NULL,
    vote_end TIMESTAMP NOT NULL,

    state TEXT NOT NULL,

    for_votes BIGINT DEFAULT 0,
    against_votes BIGINT DEFAULT 0,
    abstain_votes BIGINT DEFAULT 0,

    quorum_bps INT NOT NULL,
    threshold_bps INT NOT NULL,

    queued_at TIMESTAMP,
    executed_at TIMESTAMP,
    canceled_at TIMESTAMP,

    PRIMARY KEY (deployment_id, proposal_id)
);

CREATE TABLE governance.proposal_actions (
    deployment_id TEXT NOT NULL,
    proposal_id INT NOT NULL,
    action_index INT NOT NULL,

    target_address TEXT NOT NULL,
    function_name TEXT NOT NULL,
    args JSONB NOT NULL,

    executed BOOLEAN DEFAULT FALSE,
    execution_tx_hash TEXT,

    PRIMARY KEY (deployment_id, proposal_id, action_index),
    FOREIGN KEY (deployment_id, proposal_id)
        REFERENCES governance.proposals(deployment_id, proposal_id)
);

CREATE TABLE governance.votes (
    deployment_id TEXT NOT NULL,
    proposal_id INT NOT NULL,
    voter TEXT NOT NULL,

    vote_type TEXT NOT NULL,  -- 'for', 'against', 'abstain'
    voting_power BIGINT NOT NULL,

    voted_at TIMESTAMP NOT NULL,
    tx_hash TEXT NOT NULL,

    PRIMARY KEY (deployment_id, proposal_id, voter),
    FOREIGN KEY (deployment_id, proposal_id)
        REFERENCES governance.proposals(deployment_id, proposal_id)
);

-- Token tables
CREATE TABLE token.inventory (
    deployment_id TEXT NOT NULL,
    token_id INT NOT NULL,

    owner TEXT NOT NULL,
    minted_at TIMESTAMP NOT NULL,
    minted_by TEXT NOT NULL,  -- 'auction', 'founder', 'governance'

    seed_background INT NOT NULL,
    seed_body INT NOT NULL,
    seed_accessory INT NOT NULL,
    seed_head INT NOT NULL,
    seed_glasses INT NOT NULL,

    PRIMARY KEY (deployment_id, token_id)
);

CREATE TABLE token.members (
    deployment_id TEXT NOT NULL,
    address TEXT NOT NULL,

    token_count INT NOT NULL DEFAULT 0,
    delegated_to TEXT,
    voting_power BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (deployment_id, address)
);

-- Auction tables
CREATE TABLE auction.auctions (
    deployment_id TEXT NOT NULL,
    token_id INT NOT NULL,

    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    extensions INT NOT NULL DEFAULT 0,

    reserve_price BIGINT NOT NULL,
    payment_asset TEXT NOT NULL,

    winner TEXT,
    winning_bid BIGINT,

    settled_at TIMESTAMP,
    canceled_at TIMESTAMP,

    PRIMARY KEY (deployment_id, token_id)
);

CREATE TABLE auction.bids (
    deployment_id TEXT NOT NULL,
    token_id INT NOT NULL,
    bid_index INT NOT NULL,

    bidder TEXT NOT NULL,
    amount BIGINT NOT NULL,

    bid_at TIMESTAMP NOT NULL,
    tx_hash TEXT NOT NULL,

    refunded BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (deployment_id, token_id, bid_index),
    FOREIGN KEY (deployment_id, token_id)
        REFERENCES auction.auctions(deployment_id, token_id)
);

CREATE TABLE auction.claims (
    deployment_id TEXT NOT NULL,
    claimant TEXT NOT NULL,

    asset TEXT NOT NULL,
    amount BIGINT NOT NULL,

    created_at TIMESTAMP NOT NULL,
    claimed_at TIMESTAMP,

    PRIMARY KEY (deployment_id, claimant)
);

-- App views (denormalized for performance)
CREATE VIEW app.proposal_list AS
SELECT
    p.deployment_id,
    p.proposal_id,
    p.proposal_hash,
    p.proposer,
    p.title,
    p.summary,
    p.state,
    p.vote_start,
    p.vote_end,
    p.for_votes,
    p.against_votes,
    p.abstain_votes,
    COUNT(DISTINCT v.voter) as voter_count,
    COUNT(DISTINCT pa.action_index) as action_count
FROM governance.proposals p
LEFT JOIN governance.votes v ON p.deployment_id = v.deployment_id AND p.proposal_id = v.proposal_id
LEFT JOIN governance.proposal_actions pa ON p.deployment_id = pa.deployment_id AND p.proposal_id = pa.proposal_id
GROUP BY p.deployment_id, p.proposal_id;

CREATE VIEW app.activity_feed AS
SELECT * FROM (
    SELECT
        deployment_id,
        'proposal_created' as activity_type,
        created_at as timestamp,
        jsonb_build_object(
            'proposal_id', proposal_id,
            'proposer', proposer,
            'title', title
        ) as data
    FROM governance.proposals

    UNION ALL

    SELECT
        deployment_id,
        'vote_cast' as activity_type,
        voted_at as timestamp,
        jsonb_build_object(
            'proposal_id', proposal_id,
            'voter', voter,
            'vote_type', vote_type,
            'voting_power', voting_power
        ) as data
    FROM governance.votes

    UNION ALL

    SELECT
        deployment_id,
        'bid_placed' as activity_type,
        bid_at as timestamp,
        jsonb_build_object(
            'token_id', token_id,
            'bidder', bidder,
            'amount', amount
        ) as data
    FROM auction.bids

    UNION ALL

    SELECT
        deployment_id,
        'auction_settled' as activity_type,
        settled_at as timestamp,
        jsonb_build_object(
            'token_id', token_id,
            'winner', winner,
            'winning_bid', winning_bid
        ) as data
    FROM auction.auctions
    WHERE settled_at IS NOT NULL
) activities
ORDER BY timestamp DESC;
```

**Migration script improvements**:
```typescript
// db/migrate.ts
async function runMigrations() {
    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        // Enable error stopping
        await client.query('SET SESSION ON_ERROR_STOP = true')

        // Run migrations
        const migrations = await fs.readdir('./db/migrations')
        for (const file of migrations.sort()) {
            const sql = await fs.readFile(`./db/migrations/${file}`, 'utf-8')
            await client.query(sql)
            console.log(`✅ ${file}`)
        }

        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('❌ Migration failed:', error)
        throw error
    } finally {
        client.release()
    }
}
```

**Deliverables**:
- Complete fresh database schema
- Deployment identity with network epoch
- Event envelope with full provenance
- Corrected projections (auction extensions, executed actions, voter counts)
- Fail-fast migration runner
- Database seed script for testing

### Week 11: Goldsky Pipeline v2

**Architecture**:
```
Stellar Network
    ↓
Goldsky Stellar Events Source (platform contracts)
    ↓
factory_events transform (filter by Factory address)
    ↓
registry_events transform (filter by Registry address)
    ↓
dao_discovery transform (extract child addresses from creation events)
    ↓
dao_events transform (filter by dynamically discovered DAO addresses)
    ↓
raw_events transform (decode XDR-JSON)
    ↓
decoded_events transform (extract event data)
    ↓
activity_feed transform (user-friendly summaries)
    ↓
PostgreSQL (Neon) destination
```

**Controller** (new component):
```typescript
// packages/goldsky/src/controller.ts

interface OnboardingJob {
    daoId: string
    tokenAddress: string
    modules: DaoModules
    creationLedger: number
    status: 'pending' | 'registering' | 'backfilling' | 'complete' | 'failed'
    pipelineRevision?: string
    backfillProgress?: number
    error?: string
}

class DaoOnboardingController {
    async observeFactoryEvents() {
        // 1. Poll Factory contract for creation events
        const events = await fetchFactoryEvents()

        for (const event of events) {
            if (event.type === 'dao_create') {
                await this.onboardDao(event.data)
            }
        }
    }

    async onboardDao(creationData: DaoCreationEvent) {
        const job: OnboardingJob = {
            daoId: creationData.tokenAddress,
            tokenAddress: creationData.tokenAddress,
            modules: creationData.modules,
            creationLedger: creationData.ledger,
            status: 'pending',
        }

        try {
            // 2. Register in database
            job.status = 'registering'
            await db.registerDeployment(creationData)

            // 3. Update Goldsky pipeline filters
            job.status = 'backfilling'
            const revision = await this.updateGoldskyFilters(job.modules)
            job.pipelineRevision = revision

            // 4. Trigger backfill from creation ledger
            await this.triggerBackfill(job.modules, job.creationLedger)

            // 5. Monitor backfill progress
            await this.monitorBackfill(job)

            job.status = 'complete'
        } catch (error) {
            job.status = 'failed'
            job.error = error.message
        }

        await db.saveOnboardingJob(job)
    }

    async updateGoldskyFilters(modules: DaoModules): Promise<string> {
        // Add module addresses to Goldsky source filters
        const pipeline = await goldsky.getPipeline()
        const currentFilters = pipeline.sources[0].filters.addresses

        const newFilters = [
            ...currentFilters,
            modules.token,
            modules.metadata_registry,
            modules.auction,
            modules.governor,
            modules.treasury,
        ]

        await goldsky.updatePipeline({
            sources: [{
                ...pipeline.sources[0],
                filters: { addresses: newFilters },
            }],
        })

        return pipeline.version
    }

    async triggerBackfill(modules: DaoModules, fromLedger: number) {
        // Goldsky backfill API call
        await goldsky.backfill({
            addresses: Object.values(modules),
            fromLedger,
            toLedger: 'latest',
        })
    }
}
```

**Event decoders** (adapt from current):
```javascript
// packages/goldsky/src/decoded-events.script.js

export function decodeEvent(rawEvent) {
    const topic = rawEvent.topic_0

    switch (topic) {
        // Factory events
        case 'dao_create':
            return decodeFactoryCreation(rawEvent)

        // Manager events
        case 'impl_reg':
            return decodeImplementationRegistered(rawEvent)
        case 'upg_appr':
            return decodeUpgradeApproved(rawEvent)

        // Token events
        case 'Transfer':
            return decodeTransfer(rawEvent)
        case 'Delegate':
            return decodeDelegate(rawEvent)

        // Governor events
        case 'ProposalCreated':
            return decodeProposalCreated(rawEvent)
        case 'VoteCast':
            return decodeVoteCast(rawEvent)
        case 'ProposalQueued':
            return decodeProposalQueued(rawEvent)
        case 'ProposalExecuted':
            return decodeProposalExecuted(rawEvent)

        // Auction events
        case 'AuctionCreated':
            return decodeAuctionCreated(rawEvent)
        case 'BidPlaced':
            return decodeBidPlaced(rawEvent)
        case 'AuctionSettled':
            return decodeAuctionSettled(rawEvent)
        case 'ClaimCreated':
            return decodeClaimCreated(rawEvent)

        // Treasury events
        case 'Execute':
            return decodeTreasuryExecution(rawEvent)

        // Metadata events
        case 'MetadataUpdated':
            return decodeMetadataUpdated(rawEvent)

        default:
            return { type: 'unknown', raw: rawEvent }
    }
}

function decodeProposalCreated(event) {
    const data = parseScVal(event.data)

    return {
        type: 'proposal_created',
        proposal_id: data.proposal_id,
        proposal_hash: data.proposal_hash,
        proposer: data.proposer,
        actions: data.actions.map(a => ({
            target: a.target,
            function: a.function,
            args: a.args,
        })),
        title: data.metadata?.title,
        summary: data.metadata?.summary,
        vote_start: data.vote_start,
        vote_end: data.vote_end,
    }
}

// ... 60+ event decoders
```

**Tests** (adapt from current):
```typescript
// packages/goldsky/test/decoded-events.test.ts

describe('Event Decoders', () => {
    test('decodes Factory creation event', () => {
        const rawEvent = {
            topic_0: 'dao_create',
            data: /* XDR-JSON fixture */,
        }

        const decoded = decodeEvent(rawEvent)

        expect(decoded.type).toBe('dao_create')
        expect(decoded.token_address).toBe('CABC...')
        expect(decoded.modules).toHaveProperty('governor')
    })

    // ... tests for all 60+ events
})
```

**Deliverables**:
- Goldsky pipeline configuration for multi-DAO
- Onboarding controller with backfill
- Event decoders for all 8 contracts (~60+ events)
- Activity feed transform
- Comprehensive decoder tests

### Week 12: Data Access Layer

**Query library** (adapt from `apps/web/src/lib/goldsky.ts`):
```typescript
// apps/web/src/lib/data/proposals.ts

export async function getProposals(deploymentId: string) {
    const result = await db.query(`
        SELECT * FROM app.proposal_list
        WHERE deployment_id = $1
        ORDER BY proposal_id DESC
        LIMIT 100
    `, [deploymentId])

    return result.rows
}

export async function getProposal(deploymentId: string, proposalId: number) {
    const result = await db.query(`
        SELECT
            p.*,
            json_agg(DISTINCT pa.*) FILTER (WHERE pa.action_index IS NOT NULL) as actions,
            json_agg(DISTINCT v.*) FILTER (WHERE v.voter IS NOT NULL) as votes
        FROM governance.proposals p
        LEFT JOIN governance.proposal_actions pa
            ON p.deployment_id = pa.deployment_id AND p.proposal_id = pa.proposal_id
        LEFT JOIN governance.votes v
            ON p.deployment_id = v.deployment_id AND p.proposal_id = v.proposal_id
        WHERE p.deployment_id = $1 AND p.proposal_id = $2
        GROUP BY p.deployment_id, p.proposal_id
    `, [deploymentId, proposalId])

    if (result.rows.length === 0) {
        return null
    }

    return result.rows[0]
}

// CRITICAL: All queries MUST include deployment_id filter
```

**API routes** (scoped to deployment):
```typescript
// apps/web/src/app/api/dao/[daoId]/proposals/route.ts

export async function GET(
    req: Request,
    { params }: { params: { daoId: string } }
) {
    // 1. Resolve deployment from daoId (token address)
    const deployment = await getDeployment(params.daoId)

    if (!deployment) {
        return Response.json({ error: 'DAO not found' }, { status: 404 })
    }

    // 2. Query proposals with deployment_id filter
    const proposals = await getProposals(deployment.deployment_id)

    return Response.json({ proposals })
}
```

**Health checks**:
```typescript
// apps/web/src/app/api/health/route.ts

export async function GET() {
    const [dbHealth, goldskyHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkGoldskyHealth(),
    ])

    return Response.json({
        database: dbHealth,
        goldsky: goldskyHealth,
        overall: dbHealth.ok && goldskyHealth.ok ? 'healthy' : 'degraded',
    })
}

async function checkDatabaseHealth() {
    try {
        const result = await db.query('SELECT NOW()')
        return { ok: true, latency: Date.now() - startTime }
    } catch (error) {
        return { ok: false, error: error.message }
    }
}

async function checkGoldskyHealth() {
    // Check per-deployment readiness
    const deployments = await db.query('SELECT deployment_id FROM registry.deployments')

    const readiness = await Promise.all(
        deployments.rows.map(async d => {
            const lastEvent = await db.query(`
                SELECT MAX(ledger) as last_ledger
                FROM chain.raw_events
                WHERE deployment_id = $1
            `, [d.deployment_id])

            const rpcLedger = await stellarRpc.getLatestLedger()
            const lag = rpcLedger - lastEvent.rows[0].last_ledger

            return {
                deployment_id: d.deployment_id,
                last_indexed_ledger: lastEvent.rows[0].last_ledger,
                current_ledger: rpcLedger,
                lag,
                healthy: lag < 10, // Less than 10 ledgers behind
            }
        })
    )

    return {
        ok: readiness.every(r => r.healthy),
        deployments: readiness,
    }
}
```

**Deliverables**:
- Complete data access layer (all queries scoped)
- API routes for all DAO resources
- Health check endpoints (database, Goldsky, per-deployment)
- Database-backed API tests (fixtures with 2 DAOs)

---

## Phase 5: Frontend - Core Architecture (Week 13-14)

### Week 13: Multi-DAO Routing & Context

**Route structure**:
```
apps/web/src/app/
├── page.tsx                                    # Homepage
├── explore/page.tsx                            # DAO directory
├── dashboard/page.tsx                          # User dashboard
├── create/page.tsx                             # DAO creation wizard
└── dao/[daoId]/
    ├── page.tsx                                # Pre-auction admin OR redirect to latest auction
    ├── auctions/[tokenId]/page.tsx            # Main DAO page with auction
    ├── proposals/
    │   ├── page.tsx                            # Proposal list
    │   ├── create/page.tsx                     # Create proposal (draft + transactions)
    │   ├── [proposalId]/page.tsx              # Proposal detail + voting
    │   └── review/page.tsx                     # Review before submit
    ├── treasury/page.tsx                       # Treasury assets
    ├── members/page.tsx                        # Token holders
    ├── tokens/[tokenId]/page.tsx              # Individual token detail
    └── admin/page.tsx                          # Admin settings
```

**DAO context provider**:
```typescript
// apps/web/src/contexts/dao-context.tsx

interface DaoContext {
    daoId: string               // Token address
    deploymentId: string        // {token}:{network}:{epoch}
    deployment: Deployment
    modules: DaoModules
    network: Network
    rpcUrl: string
    passphrase: string
}

function DaoProvider({ daoId, children }: { daoId: string, children: ReactNode }) {
    const { data: deployment, error } = useSWR(`/api/dao/${daoId}`, fetcher)

    if (error) return <ErrorState error={error} />
    if (!deployment) return <LoadingState />

    const context: DaoContext = {
        daoId,
        deploymentId: deployment.deployment_id,
        deployment,
        modules: deployment.modules,
        network: deployment.network,
        rpcUrl: deployment.rpc_url,
        passphrase: deployment.network_passphrase,
    }

    return (
        <daoContext.Provider value={context}>
            {children}
        </daoContext.Provider>
    )
}

export function useDaoContext() {
    const context = useContext(daoContext)
    if (!context) throw new Error('useDaoContext must be used within DaoProvider')
    return context
}

// Usage in layout:
// apps/web/src/app/dao/[daoId]/layout.tsx

export default function DaoLayout({ params, children }) {
    return (
        <DaoProvider daoId={params.daoId}>
            <DaoShell>
                {children}
            </DaoShell>
        </DaoProvider>
    )
}
```

**SWR key partitioning**:
```typescript
// apps/web/src/lib/hooks/use-dao-proposals.ts

export function useDaoProposals() {
    const { deploymentId } = useDaoContext()

    // Key is scoped to deployment
    return useSWR(`/api/dao/${deploymentId}/proposals`, fetcher)
}

// apps/web/src/lib/hooks/use-dao-auction.ts

export function useDaoAuction(tokenId: number) {
    const { deploymentId } = useDaoContext()

    return useSWR(`/api/dao/${deploymentId}/auctions/${tokenId}`, fetcher)
}

// Zustand stores also partitioned
// apps/web/src/stores/proposal-composer-store.ts

interface ProposalDraft {
    daoId: string          // Partition key
    title: string
    summary: string
    transactions: Transaction[]
}

export const useProposalStore = create<ProposalStore>((set, get) => ({
    drafts: new Map<string, ProposalDraft>(),

    getDraft(daoId: string) {
        return get().drafts.get(daoId)
    },

    setTitle(daoId: string, title: string) {
        const draft = get().getDraft(daoId) || { daoId, title: '', summary: '', transactions: [] }
        draft.title = title
        get().drafts.set(daoId, draft)
    },
}))
```

**Tailwind + shadcn/ui setup**:
```typescript
// tailwind.config.ts

export default {
    darkMode: ['class'],
    content: [
        './src/app/**/*.{ts,tsx}',
        './src/components/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                // ... shadcn/ui color variables
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
}

// Install shadcn/ui components:
// npx shadcn-ui@latest init
// npx shadcn-ui@latest add button card dialog input badge tabs
```

**Deliverables**:
- Multi-DAO routing structure
- DAO context provider
- SWR key partitioning
- Zustand store partitioning
- Tailwind + shadcn/ui configured
- Base layout components

### Week 14: UI Foundation & Component Library

**Base components** (using shadcn/ui):
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add select
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add dropdown-menu
```

**Custom components**:
```typescript
// apps/web/src/components/address-display.tsx

export function AddressDisplay({ address, copyable = true }: { address: string, copyable?: boolean }) {
    const [copied, setCopied] = useState(false)

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`

    const handleCopy = () => {
        navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="flex items-center gap-2">
            <code className="text-sm font-mono">{short}</code>
            {copyable && (
                <Button variant="ghost" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
            )}
        </div>
    )
}

// apps/web/src/components/proposal-state-badge.tsx

const STATE_STYLES = {
    pending: 'bg-gray-100 text-gray-800',
    active: 'bg-blue-100 text-blue-800',
    succeeded: 'bg-green-100 text-green-800',
    defeated: 'bg-red-100 text-red-800',
    queued: 'bg-purple-100 text-purple-800',
    executed: 'bg-teal-100 text-teal-800',
    canceled: 'bg-gray-100 text-gray-800',
    expired: 'bg-orange-100 text-orange-800',
}

export function ProposalStateBadge({ state }: { state: ProposalState }) {
    return (
        <Badge className={STATE_STYLES[state]}>
            {state.toUpperCase()}
        </Badge>
    )
}

// apps/web/src/components/countdown.tsx

export function Countdown({ endTime }: { endTime: Date }) {
    const [timeLeft, setTimeLeft] = useState(getTimeLeft(endTime))

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(getTimeLeft(endTime))
        }, 1000)

        return () => clearInterval(interval)
    }, [endTime])

    if (timeLeft.total <= 0) {
        return <span className="text-red-600 font-semibold">Ended</span>
    }

    return (
        <div className="flex gap-4">
            <TimeUnit value={timeLeft.days} label="days" />
            <TimeUnit value={timeLeft.hours} label="hours" />
            <TimeUnit value={timeLeft.minutes} label="min" />
            <TimeUnit value={timeLeft.seconds} label="sec" />
        </div>
    )
}

// apps/web/src/components/transaction-status.tsx

export function TransactionStatus({ status, hash }: { status: TxStatus, hash?: string }) {
    return (
        <div className="flex items-center gap-3">
            {status === 'preparing' && <Loader2 className="animate-spin" />}
            {status === 'awaiting_signature' && <Wallet className="text-blue-500" />}
            {status === 'submitted' && <Loader2 className="animate-spin text-blue-500" />}
            {status === 'confirmed' && <Check className="text-green-500" />}
            {status === 'failed' && <X className="text-red-500" />}

            <div className="flex flex-col">
                <span className="font-medium capitalize">{status.replace('_', ' ')}</span>
                {hash && (
                    <a
                        href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                    >
                        View on Explorer ↗
                    </a>
                )}
            </div>
        </div>
    )
}
```

**Loading states**:
```typescript
// apps/web/src/components/skeletons.tsx

export function ProposalSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-20 w-full" />
            </CardContent>
        </Card>
    )
}

export function AuctionSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-64 w-full" /> {/* Image */}
            <Skeleton className="h-12 w-full" /> {/* Countdown */}
            <Skeleton className="h-8 w-48" />   {/* Current bid */}
        </div>
    )
}
```

**Deliverables**:
- shadcn/ui component library installed
- Custom DAO-specific components
- Loading skeletons
- Transaction status indicators
- Responsive layouts
- Dark mode toggle

---

## Phase 6: Frontend - Creation & Discovery (Week 15-16)

### Week 15: DAO Creation Wizard

**Adapt from**: Nouns Builder `/create` 6-step wizard

**File structure**:
```
apps/web/src/app/create/
├── page.tsx                    # Main wizard container
├── _components/
│   ├── wizard-nav.tsx          # Left sidebar navigation
│   ├── step-1-general.tsx
│   ├── step-2-artwork.tsx
│   ├── step-3-auction.tsx
│   ├── step-4-governance.tsx
│   ├── step-5-founders.tsx
│   ├── step-6-review.tsx
│   └── ipfs-upload-modal.tsx
└── _lib/
    ├── validation.ts
    ├── ipfs-upload.ts
    └── create-store.ts
```

**Wizard state** (Zustand):
```typescript
// apps/web/src/app/create/_lib/create-store.ts

interface CreateDaoStore {
    currentStep: number

    // Step 1: General
    name: string
    symbol: string
    description: string

    // Step 2: Artwork
    artworkCid: string | null
    artworkFiles: File[]
    traitCounts: TraitCounts
    uploadProgress: number

    // Step 3: Auction
    auctionDuration: number
    reservePrice: string
    timeBuffer: number
    paymentAsset: string

    // Step 4: Governance
    votingDelay: number
    votingPeriod: number
    quorumBps: number
    proposalThresholdBps: number

    // Step 5: Founders
    founders: FounderAllocation[]
    launchAdmin: 'creator' | 'governance' | 'custom'
    customLaunchAdmin?: string

    // Actions
    setStep: (step: number) => void
    updateField: (field: string, value: any) => void
    addFounder: () => void
    removeFounder: (index: number) => void
    reset: () => void
}
```

**Step 2: Artwork Upload**:
```typescript
// apps/web/src/app/create/_components/step-2-artwork.tsx

export function ArtworkStep() {
    const [files, setFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [previewSeeds, setPreviewSeeds] = useState<ArtSeed[]>([])

    const { artworkCid, updateField } = useCreateStore()

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files || [])
        setFiles(selected)

        // Validate structure
        const validation = validateArtworkStructure(selected)
        if (!validation.valid) {
            toast.error(validation.error)
            return
        }

        // Generate previews
        const previews = await generatePreviews(selected, 5)
        setPreviewSeeds(previews)
    }

    const handleUpload = async () => {
        setUploading(true)

        try {
            // Server-side upload
            const formData = new FormData()
            files.forEach(f => formData.append('files', f))

            const response = await fetch('/api/ipfs/upload', {
                method: 'POST',
                body: formData,
                // Track progress
                onUploadProgress: (e) => {
                    setProgress((e.loaded / e.total) * 100)
                },
            })

            const { cid, traitCounts } = await response.json()

            updateField('artworkCid', cid)
            updateField('traitCounts', traitCounts)

            toast.success('Artwork uploaded to IPFS!')
        } catch (error) {
            toast.error('Upload failed: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Upload Artwork</h2>
                <p className="text-muted-foreground">
                    Upload trait layers following the Nouns Builder format.
                </p>
            </div>

            {!artworkCid ? (
                <>
                    <Input
                        type="file"
                        multiple
                        webkitdirectory=""
                        onChange={handleFileSelect}
                    />

                    {files.length > 0 && (
                        <>
                            <div className="grid grid-cols-5 gap-4">
                                {previewSeeds.map((seed, i) => (
                                    <PreviewToken key={i} seed={seed} files={files} />
                                ))}
                            </div>

                            <Button onClick={handleUpload} disabled={uploading}>
                                {uploading ? (
                                    <>
                                        <Loader2 className="animate-spin mr-2" />
                                        Uploading... {progress.toFixed(0)}%
                                    </>
                                ) : (
                                    'Upload to IPFS'
                                )}
                            </Button>
                        </>
                    )}
                </>
            ) : (
                <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                    <Check className="text-green-600" />
                    <div>
                        <p className="font-medium">Artwork uploaded!</p>
                        <p className="text-sm text-muted-foreground">CID: {artworkCid}</p>
                    </div>
                    <Button variant="outline" onClick={() => updateField('artworkCid', null)}>
                        Change
                    </Button>
                </div>
            )}
        </div>
    )
}
```

**Step 6: Review & Deploy**:
```typescript
// apps/web/src/app/create/_components/step-6-review.tsx

export function ReviewStep() {
    const store = useCreateStore()
    const [deploying, setDeploying] = useState(false)
    const [txHash, setTxHash] = useState<string>()
    const [daoId, setDaoId] = useState<string>()

    const handleDeploy = async () => {
        setDeploying(true)

        try {
            // 1. Build creation params
            const params: DaoCreationParams = {
                deployer: account.address,
                nonce: Date.now(),
                token_name: store.name,
                token_symbol: store.symbol,
                ipfs_base_cid: store.artworkCid,
                trait_counts: store.traitCounts,
                auction_duration: store.auctionDuration,
                reserve_price: parseUnits(store.reservePrice, 7),
                time_buffer: store.timeBuffer,
                payment_asset: store.paymentAsset,
                voting_delay: store.votingDelay,
                voting_period: store.votingPeriod,
                quorum_bps: store.quorumBps,
                proposal_threshold_bps: store.proposalThresholdBps,
                founders: store.founders,
                launch_admin: resolveLaunchAdmin(),
            }

            // 2. Sign and submit via Factory
            const tx = await factoryContract.createDao(params)
            const hash = await signAndSubmit(tx)
            setTxHash(hash)

            // 3. Wait for confirmation
            const result = await pollTransactionStatus(hash)

            if (result.status === 'success') {
                // Extract token address from creation event
                const tokenAddress = result.events.find(e => e.type === 'dao_create').data.token_address
                setDaoId(tokenAddress)

                toast.success('DAO created successfully!')

                // 4. Wait for indexing
                await waitForIndexing(tokenAddress)

                // 5. Redirect to DAO page
                router.push(`/dao/${tokenAddress}`)
            } else {
                throw new Error('Deployment failed: ' + result.error)
            }
        } catch (error) {
            toast.error('Deployment failed: ' + error.message)
        } finally {
            setDeploying(false)
        }
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Review & Deploy</h2>

            {/* Collapsible sections for each step */}
            <Accordion type="multiple">
                <AccordionItem value="general">
                    <AccordionTrigger>General Settings</AccordionTrigger>
                    <AccordionContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <dt>Name:</dt>
                            <dd>{store.name}</dd>
                            <dt>Symbol:</dt>
                            <dd>{store.symbol}</dd>
                            <dt>Description:</dt>
                            <dd>{store.description}</dd>
                        </dl>
                        <Button variant="ghost" onClick={() => store.setStep(0)}>Edit</Button>
                    </AccordionContent>
                </AccordionItem>

                {/* ... similar for other steps */}
            </Accordion>

            {!deploying && !daoId && (
                <Button size="lg" onClick={handleDeploy} className="w-full">
                    Deploy DAO
                </Button>
            )}

            {deploying && (
                <Card>
                    <CardHeader>
                        <CardTitle>Deploying...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <TransactionStatus status="submitted" hash={txHash} />
                    </CardContent>
                </Card>
            )}

            {daoId && (
                <Card>
                    <CardHeader>
                        <CardTitle>Success!</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p>Your DAO has been created.</p>
                        <AddressDisplay address={daoId} />
                        <Button onClick={() => router.push(`/dao/${daoId}`)}>
                            Go to DAO
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
```

**Deliverables**:
- 6-step DAO creation wizard
- IPFS upload with progress
- Artwork preview generation
- Form validation (per step)
- Draft persistence (Zustand + localStorage)
- Factory deployment integration
- Transaction confirmation flow
- Post-deploy redirect with indexing wait

### Week 16: DAO Discovery & Directory

**Directory page** (`/explore`):
```typescript
// apps/web/src/app/explore/page.tsx

export default function ExplorePage() {
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<SortOption>('newest')
    const [page, setPage] = useState(1)

    const { data, isLoading } = useSWR(
        `/api/daos?search=${search}&sort=${sort}&page=${page}`,
        fetcher
    )

    return (
        <div className="container mx-auto py-8 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold">Explore DAOs</h1>
                <Button asChild>
                    <Link href="/create">Create DAO</Link>
                </Button>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex gap-4">
                <Input
                    placeholder="Search DAOs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-md"
                />

                <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                        <SelectItem value="most_active">Most Active</SelectItem>
                        <SelectItem value="most_tokens">Most Tokens</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* DAO Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <DaoCardSkeleton key={i} />
                    ))}
                </div>
            ) : data.daos.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="No DAOs found"
                    description={search ? "Try a different search term" : "Be the first to create a DAO!"}
                    action={<Button asChild><Link href="/create">Create DAO</Link></Button>}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {data.daos.map(dao => (
                            <DaoCard key={dao.token_address} dao={dao} />
                        ))}
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => p - 1)}
                            disabled={page === 1}
                        >
                            Previous
                        </Button>
                        <span className="flex items-center px-4">
                            Page {page} of {data.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= data.totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}

// apps/web/src/components/dao-card.tsx

export function DaoCard({ dao }: { dao: DaoSummary }) {
    const [favorited, setFavorited] = useState(false)

    const toggleFavorite = () => {
        // Max 50 favorites
        if (!favorited && getFavoriteCount() >= 50) {
            toast.error('Maximum 50 favorites')
            return
        }

        setFavorited(!favorited)
        toggleFavoriteDao(dao.token_address)
    }

    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                            <Link href={`/dao/${dao.token_address}`} className="hover:underline">
                                {dao.name}
                            </Link>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            {dao.description}
                        </p>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFavorite}
                    >
                        <Heart className={favorited ? 'fill-red-500 text-red-500' : ''} />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Stats */}
                <div className="flex gap-4 text-sm">
                    <div>
                        <span className="font-semibold">{dao.token_count}</span>
                        <span className="text-muted-foreground"> tokens</span>
                    </div>
                    <div>
                        <span className="font-semibold">{dao.proposal_count}</span>
                        <span className="text-muted-foreground"> proposals</span>
                    </div>
                    <div>
                        <span className="font-semibold">{dao.member_count}</span>
                        <span className="text-muted-foreground"> members</span>
                    </div>
                </div>

                {/* Auction Status */}
                {dao.current_auction && (
                    <div className="pt-4 border-t">
                        <div className="text-sm text-muted-foreground">Current Auction</div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="font-semibold">
                                {formatAmount(dao.current_auction.highest_bid)} XLM
                            </span>
                            <Countdown endTime={dao.current_auction.end_time} />
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter>
                <Button asChild variant="outline" className="w-full">
                    <Link href={`/dao/${dao.token_address}`}>
                        View DAO
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}
```

**Dashboard** (`/dashboard`):
```typescript
// apps/web/src/app/dashboard/page.tsx

export default function DashboardPage() {
    const { address } = useAccount()

    const { data: userDaos } = useSWR(
        address ? `/api/user/${address}/daos` : null,
        fetcher
    )

    const { data: activeProposals } = useSWR(
        address ? `/api/user/${address}/proposals/active` : null,
        fetcher
    )

    if (!address) {
        return (
            <div className="container mx-auto py-16">
                <EmptyState
                    icon={Wallet}
                    title="Connect Your Wallet"
                    description="Connect your wallet to view your DAOs and active proposals"
                    action={<WalletConnectButton />}
                />
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            <h1 className="text-4xl font-bold">Dashboard</h1>

            {/* My DAOs */}
            <section>
                <h2 className="text-2xl font-semibold mb-4">My DAOs</h2>
                {userDaos?.length === 0 ? (
                    <EmptyState
                        title="No DAOs yet"
                        description="You haven't joined or created any DAOs"
                        action={<Button asChild><Link href="/explore">Explore DAOs</Link></Button>}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {userDaos?.map(dao => (
                            <DaoCard key={dao.token_address} dao={dao} />
                        ))}
                    </div>
                )}
            </section>

            {/* Active Proposals */}
            <section>
                <h2 className="text-2xl font-semibold mb-4">Active Proposals</h2>
                {activeProposals?.length === 0 ? (
                    <p className="text-muted-foreground">No active proposals</p>
                ) : (
                    <div className="space-y-4">
                        {activeProposals?.map(proposal => (
                            <ProposalCard key={proposal.proposal_id} proposal={proposal} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
```

**Deliverables**:
- Explore page with search, filter, pagination
- DAO cards with stats and auction status
- Favorite system (local storage, max 50)
- Dashboard with user's DAOs and proposals
- Empty states
- Skeleton loaders

---

## Phase 7: Frontend - DAO Pages (Week 17-18)

### Week 17: Auction & Proposals

**Auction page** (`/dao/[daoId]/auctions/[tokenId]/page.tsx`):

Adapt from Nouns Builder auction interface with:
- Large token image (rendered from seed + IPFS)
- Countdown timer (1s updates)
- Current bid display
- Bid input with validation
- Recent bids list
- Claim balance UI (for failed refunds)
- Pre-launch state handling

**Proposal creation** (`/dao/[daoId]/proposals/create/page.tsx`):

2-stage flow:
1. Draft (title, summary)
2. Transactions (action queue)

Then redirect to `/review` page

**Proposal detail** (`/dao/[daoId]/proposals/[proposalId]/page.tsx`):

Tabs:
- Details (description, actions)
- Votes (breakdown, voter list)
- Vote interface (if active)

**Deliverables**:
- Auction page with bidding
- Pre-launch state UI
- Claim balance UI
- Proposal creation (2-stage)
- Proposal detail with voting
- Transaction queue component
- Real-time countdown
- Exact decimal handling (bigint)

### Week 18: Treasury, Members, Tokens

**Treasury page**:
- Asset balances (RPC authoritative)
- Execution history with proposal linkage
- Scoped and paginated

**Members page**:
- Token holders list
- Ownership count, delegated power, snapshot power

**Token detail page**:
- Seed rendering from IPFS + metadata
- Owner transfer action
- Delegation display

**Admin page**:
- Settings for governance-owned contracts
- Link to create proposals for changes
- Not direct forms (requires governance)

**Deliverables**:
- All DAO pages functional
- Token rendering from seeds
- Member voting power calculations
- Treasury asset display
- Admin configuration UI

---

## Phase 8: Polish & Recovery (Week 19)

### Transaction Recovery

Persist pending operations:
- Hash, context, DAO
- Reload resume confirmation
- Wallet/network revalidation

### State Handling

- Loading, empty, unavailable, stale, awaiting-indexing
- Explicit readiness indicators
- Retry actions
- Toast notifications

### Accessibility

- Keyboard navigation
- ARIA labels
- Focus management
- Screen reader announcements
- Mobile-first responsive

**Deliverables**:
- Transaction recovery working
- All state variants handled
- Accessibility audit passed
- Mobile layouts tested

---

## Phase 9: Integration & Testnet (Week 20-21)

### Week 20: Testnet Deployment

- Deploy platform contracts (Manager, Factory, Registry)
- Create 2 test DAOs via UI
- Verify automatic indexing

### Week 21: Acceptance Testing

Run MVP completion checklist (docs/mvp-technical-plan.md §10):
- [ ] Create two distinct DAOs with IPFS artwork
- [ ] Automatic indexing (no manual config)
- [ ] DAO-qualified links remain isolated
- [ ] Pre-launch → launch flow
- [ ] Auction scenarios (XLM, SAC, claims, extensions)
- [ ] Token rendering and metadata updates
- [ ] Proposal creation, voting, execution
- [ ] Treasury transfers and governance minting
- [ ] Module upgrade via proposal
- [ ] Directory, proposals, auctions have correct history
- [ ] Transaction state recovery
- [ ] TTL renewal procedures

**Deliverables**:
- All checklist items passing
- Testnet evidence documented
- Known issues logged
- Production deployment plan

---

## Summary

**Total Timeline**: 21 weeks (5 months)

**Key Salvage from Current Repo**:
- Contract test patterns (~2 weeks saved)
- Deployment orchestration (~1 week saved)
- Goldsky decoder structure (~1 week saved)
- Component designs (~1 week saved)

**Nouns Builder Patterns Applied**:
- ✅ Modulo-100 founder vesting
- ✅ Continuous auction with time buffer
- ✅ 6-step creation wizard
- ✅ Transaction queue for proposals
- ✅ Multi-signer proposals
- ✅ Tabbed DAO interface
- ✅ Real-time auction UI

**Stellar-Specific Innovations**:
- ✨ Deterministic artwork seeds (not pseudo-random)
- ✨ One-shot launch admin
- ✨ Pull-based refund claims
- ✨ WASM upgrades (not proxy pattern)
- ✨ Runtime DAO discovery (not subgraph)
- ✨ Awaiting indexing states

**Next Steps**:
1. Create `nouns-stellar` repository
2. Begin Phase 1: Foundation setup
3. Reference this plan + Nouns analysis throughout

---

**References**:
- Nouns Builder Complete Reference: `/Users/dan13ram/code/nouns/stellar-dao/docs/nouns-reference-complete.md`
- MVP Technical Plan: `/Users/dan13ram/code/nouns/stellar-dao/docs/mvp-technical-plan.md`
- Salvage Reference: `/Users/dan13ram/code/nouns/stellar-dao/docs/salvage-reference.md`
- Fresh Start Assessment: `/Users/dan13ram/code/nouns/stellar-dao/docs/fresh-start-assessment.md`
