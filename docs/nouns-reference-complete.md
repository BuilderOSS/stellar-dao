# Nouns Builder Reference - Complete Analysis for Stellar Port

**Date**: 2026-09-14
**Purpose**: Complete reference documentation from Nouns Builder (EVM) for the Stellar DAO implementation

---

## Table of Contents
1. [Contract Architecture](#1-contract-architecture)
2. [Artwork & Metadata System](#2-artwork--metadata-system)
3. [Web App UX & User Flows](#3-web-app-ux--user-flows)
4. [Key Patterns for Soroban Port](#4-key-patterns-for-soroban-port)
5. [Stellar Implementation Decisions](#5-stellar-implementation-decisions)

---

## 1. Contract Architecture

### 1.1 Overall Structure (EVM)

**Nouns Builder** uses a **Manager-Factory pattern** with **UUPS upgradeable proxies** (ERC-1967):

```
Manager (Factory + Upgrade Coordinator)
  ├─> Token Proxy → Token Implementation (ERC-721Votes)
  ├─> MetadataRenderer Proxy → MetadataRenderer Implementation
  ├─> Auction Proxy → Auction Implementation
  ├─> Governor Proxy → Governor Implementation
  └─> Treasury Proxy → Treasury Implementation (Timelock)

DAOFactory (CREATE3)
  └─> Provides cross-chain deterministic addresses
```

**For Stellar**: Similar structure, but adapted:
- Manager → Platform contracts (Manager, Factory, Registry)
- UUPS proxies → Soroban WASM upgrades
- CREATE3 determinism → Soroban salt-based deployment

### 1.2 Key Contracts Summary

| Contract | EVM Location | Purpose | Stellar Equivalent |
|----------|--------------|---------|-------------------|
| **Manager** | `src/manager/Manager.sol` | DAO factory, upgrade registry | Manager.rs (platform) |
| **Token** | `src/token/Token.sol` | ERC-721Votes with founder vesting | Token.rs (with seeds) |
| **MetadataRenderer** | `src/token/metadata/MetadataRenderer.sol` | On-chain generative metadata | MetadataRegistry.rs |
| **Auction** | `src/auction/Auction.sol` | Continuous English auctions | Auction.rs |
| **Governor** | `src/governance/governor/Governor.sol` | Proposal & voting | Governor.rs |
| **Treasury** | `src/governance/treasury/Treasury.sol` | Timelock execution | Treasury.rs |

### 1.3 Critical Patterns

#### **A. Founder Vesting (Modulo-100 Allocation)**

```solidity
// EVM implementation
uint256 baseTokenId = 0;
uint256 schedule = 100 / founderPct; // e.g., 10% = every 10th token

for (uint256 j; j < founderPct; ++j) {
    tokenRecipient[baseTokenId] = founder;
    baseTokenId = (baseTokenId + schedule) % 100;
}

// At mint time:
uint256 baseId = tokenId % 100;
if (tokenRecipient[baseId].wallet != address(0)) {
    // Check if vesting expired
    if (block.timestamp < tokenRecipient[baseId].vestExpiry) {
        // Mint to founder
        _mint(tokenRecipient[baseId].wallet, tokenId);
    } else {
        // Mint to auction (vesting ended)
        _mint(auction, tokenId);
    }
}
```

**Soroban adaptation**:
```rust
pub struct FounderAllocation {
    pub address: Address,
    pub ownership_pct: u8,  // 1-99
    pub vest_expiry: u64,   // Timestamp
}

// Storage: Map<u32, FounderAllocation> where key is tokenId % 100
pub fn initialize_founders(
    env: &Env,
    founders: Vec<FounderAllocation>
) {
    for founder in founders {
        let schedule = 100 / founder.ownership_pct;
        let mut base_id = 0u32;

        for _ in 0..founder.ownership_pct {
            storage::set_token_recipient(env, base_id, &founder);
            base_id = (base_id + schedule) % 100;
        }
    }
}

pub fn mint_to_recipient(env: &Env, token_id: u32) -> Address {
    let base_id = token_id % 100;

    if let Some(founder) = storage::get_token_recipient(env, base_id) {
        if env.ledger().timestamp() < founder.vest_expiry {
            return founder.address; // Mint to founder
        }
    }

    get_auction_address(env) // Mint to auction
}
```

**Key insight**: This elegantly distributes founder tokens predictably across the entire collection lifetime.

#### **B. Continuous Auction Lifecycle**

```solidity
// EVM: settleCurrentAndCreateNewAuction()
function settleCurrentAndCreateNewAuction() external {
    _settleAuction();  // Transfer token, distribute ETH
    _createAuction();  // Mint next token, start new auction
}

// Reward distribution:
uint256 founderReward = (bid * founderRewardBps) / 10_000;
uint256 builderReward = (bid * builderRewardBps) / 10_000;
uint256 referralReward = (bid * referralRewardBps) / 10_000;
uint256 treasuryAmount = bid - founderReward - builderReward - referralReward;
```

**Soroban adaptation**:
- SAC asset transfers instead of ETH
- Similar reward split logic
- Separate `settle()` and `create_next()` for clarity
- Pull-based refunds with claim accounting (per MVP plan)

#### **C. Proposal Updatability (Governor V3)**

```solidity
// EVM: Proposals can be updated within a window
uint256 updatePeriodEnd = proposal.timeCreated + settings.proposalUpdatablePeriod;

if (block.timestamp < updatePeriodEnd) {
    // Update allowed: creates NEW proposal ID, stores replacement mapping
    bytes32 newProposalId = hashProposal(newTargets, newValues, newCalldatas, descriptionHash, proposer);
    proposals[newProposalId] = proposals[oldProposalId]; // Copy state
    replacedProposals[oldProposalId] = newProposalId;    // Track replacement
}

// State check prioritizes Updatable over Pending
function state(bytes32 proposalId) returns (ProposalState) {
    if (block.timestamp < proposal.updatePeriodEnd) return Updatable;
    if (block.timestamp < proposal.voteStart) return Pending;
    // ... etc
}
```

**Soroban decision**:
- **Skip updatable proposals in MVP** (adds significant complexity)
- Nouns uses this for proposal iteration without governance overhead
- Can be added in future versions if needed
- Focus on core governance first

#### **D. Multi-Signer Proposals (EIP-712)**

```solidity
// EVM: Up to 16 co-signers on proposals
struct Signature {
    address signer;
    bytes signature; // EIP-712 typed signature
}

function proposeWithSignatures(
    address[] targets,
    uint256[] values,
    bytes[] calldatas,
    string description,
    Signature[] signatures // Max 16, must be sorted by address
) external {
    // Verify combined voting power of proposer + signers meets threshold
    uint256 totalVotes = getVotes(msg.sender, block.number - 1);

    for (uint i = 0; i < signatures.length; i++) {
        address signer = _recoverSigner(proposalHash, signatures[i]);
        totalVotes += getVotes(signer, block.number - 1);
    }

    require(totalVotes >= proposalThreshold(), "Below threshold");
}
```

**Soroban adaptation**:
- Use Ed25519 signatures instead of ECDSA
- Same concept: aggregate voting power across signers
- Must enforce sorted order for gas efficiency
- Define custom domain separator for signature verification

---

## 2. Artwork & Metadata System

### 2.1 IPFS Folder Structure (Actual Sample)

**From `/Users/dan13ram/code/nouns/artwork/sample`**:

```
artwork/
├── 0-backgrounds/          # Layer 0 (renders first)
│   ├── bg-cool.png
│   └── bg-warm.png
├── 1-bodies/               # Layer 1
│   ├── body-blue-sky.png
│   ├── body-darkbrown.png
│   └── body-rust.png
├── 2-accessories/          # Layer 2
│   ├── accessory-flash.png
│   ├── accessory-txt-cc2.png
│   └── accessory-txt-ico.png
├── 3-heads/                # Layer 3
│   ├── head-goldcoin.png
│   ├── head-hotdog.png
│   └── head-ufo.png
└── 4-glasses/              # Layer 4 (renders last)
    ├── glasses-square-black-rgb.png
    ├── glasses-square-guava.png
    └── glasses-square-teal.png
```

**Key characteristics**:
- ✅ Numeric directory prefixes (0-4) define rendering order
- ✅ Category prefix in filenames (e.g., `bg-`, `body-`)
- ✅ All images 600x600 PNG
- ✅ Accessory layer uses grayscale (transparency only)
- ❌ No manifest.json (structure is purely filesystem-based)
- ✅ 14 total images across 5 trait categories

**Trait counts**:
- Backgrounds: 2 options
- Bodies: 3 options
- Accessories: 3 options
- Heads: 3 options
- Glasses: 3 options
- **Total combinations**: 2 × 3 × 3 × 3 × 3 = **162 unique NFTs**

### 2.2 MetadataRenderer Contract (EVM)

**From `/Users/dan13ram/code/nouns/protocol/main/src/token/metadata/MetadataRenderer.sol`**:

```solidity
struct Property {
    string name;      // e.g., "Background"
    Item[] items;     // e.g., ["Cool", "Warm"]
}

struct Item {
    uint16 referenceSlot; // Index into ipfsData array
    string name;          // e.g., "Cool"
}

struct IPFSGroup {
    string baseUri;   // e.g., "ipfs://Qmabc.../artwork/"
    string extension; // e.g., ".png"
}

// Pseudo-random seed generation (UNSAFE - block-based randomness)
function _generateSeed(uint256 tokenId) private view returns (uint256) {
    return uint256(keccak256(abi.encode(
        tokenId,
        blockhash(block.number - 1), // Manipulable
        block.prevrandao,             // Manipulable
        block.timestamp
    )));
}

// Trait selection
function onMinted(uint256 tokenId) external {
    uint256 seed = _generateSeed(tokenId);
    uint16[16] memory attrs;

    for (uint i = 0; i < numProperties; i++) {
        uint256 numItems = properties[i].items.length;
        attrs[i] = uint16(seed % numItems); // Select item
        seed >>= 16; // Shift for next property
    }

    attributes[tokenId] = attrs; // Store permanently
}

// Image URL generation
function tokenURI(uint256 tokenId) external view returns (string memory) {
    uint16[16] memory attrs = attributes[tokenId];
    string memory queryString = "?contractAddress={address}&tokenId={id}";

    for (uint i = 0; i < numProperties; i++) {
        Item memory item = properties[i].items[attrs[i]];
        IPFSGroup memory ipfs = ipfsData[item.referenceSlot];

        queryString += string.concat(
            "&images=",
            ipfs.baseUri,
            "/",
            properties[i].name,
            "/",
            item.name,
            ipfs.extension
        );
    }

    return string.concat(rendererBase, queryString);
}
```

**Image rendering happens off-chain** at `rendererBase` URL with query string parameters.

### 2.3 Soroban Metadata Strategy

**Key differences from EVM**:

| Aspect | EVM Nouns Builder | Stellar Adaptation |
|--------|-------------------|-------------------|
| **Randomness** | Block hash (unsafe) | **Deterministic from token ID** (per MVP plan) |
| **Seed storage** | Trait indices (uint16[16]) | Full seed struct (background, body, etc.) |
| **Image rendering** | Off-chain renderer service | Off-chain API route in Next.js app |
| **Metadata** | On-chain JSON generation | On-chain storage, off-chain assembly |
| **IPFS reference** | Query string with multiple URLs | Base CID + path resolution |

**Soroban implementation**:

```rust
// Immutable seed stored on-chain
pub struct ArtSeed {
    pub background: u8,  // 0-1 (2 options)
    pub body: u8,        // 0-2 (3 options)
    pub accessory: u8,   // 0-2 (3 options)
    pub head: u8,        // 0-2 (3 options)
    pub glasses: u8,     // 0-2 (3 options)
}

// Deterministic generation (SAFE - reproducible)
pub fn generate_seed(token_id: u32, trait_counts: &TraitCounts) -> ArtSeed {
    let hash = env.crypto().keccak256(&token_id.to_le_bytes());

    ArtSeed {
        background: hash.get(0).unwrap() % trait_counts.background,
        body: hash.get(1).unwrap() % trait_counts.body,
        accessory: hash.get(2).unwrap() % trait_counts.accessory,
        head: hash.get(3).unwrap() % trait_counts.head,
        glasses: hash.get(4).unwrap() % trait_counts.glasses,
    }
}

// MetadataRegistry contract stores IPFS manifest
pub struct MetadataConfig {
    pub version: u32,
    pub ipfs_base_cid: String,  // e.g., "QmXxx"
    pub trait_counts: TraitCounts,
}

// Token contract stores seeds
pub fn mint(env: Env, to: Address, token_id: u32) {
    let metadata_registry = get_metadata_registry(&env);
    let config: MetadataConfig = metadata_registry.get_config();

    let seed = generate_seed(token_id, &config.trait_counts);
    storage::set_seed(&env, token_id, &seed);

    // ... rest of mint logic
}
```

**Off-chain rendering** (Next.js API route):

```typescript
// apps/web/src/app/api/dao/[daoId]/token/[tokenId]/image.png/route.ts

export async function GET(req, { params }) {
  // 1. Fetch seed from contract (RPC)
  const seed = await tokenContract.getSeed(params.tokenId)

  // 2. Fetch metadata config (IPFS base CID, trait counts)
  const config = await metadataRegistry.getConfig()

  // 3. Build IPFS URLs for each layer
  const layers = [
    `ipfs://${config.ipfs_base_cid}/0-backgrounds/bg-${backgroundNames[seed.background]}.png`,
    `ipfs://${config.ipfs_base_cid}/1-bodies/body-${bodyNames[seed.body]}.png`,
    // ... etc
  ]

  // 4. Fetch and composite images
  const image = await compositeImages(layers)

  // 5. Return with immutable cache (seed never changes)
  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
```

---

## 3. Web App UX & User Flows

### 3.1 Page Structure (EVM Nouns Builder)

**From `/Users/dan13ram/code/nouns/builder/staging/apps/web`**:

| Route | Purpose | Key Features |
|-------|---------|--------------|
| **`/`** | Homepage | Marketing content, DAO feed, authenticated → dashboard |
| **`/explore`** | DAO directory | Search, filter, pagination, favorites |
| **`/dashboard`** | Personal dashboard | User's DAOs, active proposals, auctions |
| **`/create`** | DAO creation wizard | 6-step flow (general, auction, veto, allocation, artwork, deploy) |
| **`/dao/[network]/[token]`** | Pre-auction admin | Mint reserves, enable minters, unpause |
| **`/dao/[network]/[token]/[tokenId]`** | Active DAO page | Auction, tabs (about, feed, treasury, proposals, admin) |
| **`/dao/[network]/[token]/proposal/create`** | Create proposal | 2-stage (draft, transactions, review) |
| **`/dao/[network]/[token]/vote/[id]`** | Proposal detail | Tabs (details, votes, propdates), voting interface |

### 3.2 Key User Flows

#### **A. DAO Creation** (6-step wizard at `/create`)

```
Step 1: General
├─ DAO name
├─ Token symbol
├─ Description
└─ Website (optional)

Step 2: Auction Settings
├─ Duration (seconds)
├─ Reserve price (ETH)
└─ Time buffer

Step 3: Veto Power
├─ Enable veto (checkbox)
└─ Veto address (if enabled)

Step 4: Allocation
├─ Founder allocations (address, %, end date)
├─ Contribution allocations
└─ Validation (total ≤ 100%)

Step 5: Artwork
├─ Upload layers (multi-trait)
├─ OR base images (1:1 tokens)
├─ IPFS upload progress
└─ Preview

Step 6: Deploy
├─ Review all settings
├─ Edit any section
├─ Multi-tx deployment
│   ├─ 1. Deploy metadata
│   ├─ 2. Deploy auction
│   ├─ 3. Deploy token
│   ├─ 4. Deploy governor
│   ├─ 5. Deploy treasury
│   └─ 6. Initialize
└─ Success → DAO page
```

**State persistence**: Zustand store with local storage

**Stellar adaptation**:
- Use Factory atomic deployment (single tx instead of 6)
- Same step structure for form data
- IPFS upload via server-side Pinata
- Add: Launch admin selection (per MVP plan)
- Add: Governance parameter configuration

#### **B. Proposal Creation** (2-stage at `/proposal/create`)

```
Stage 1: Draft
├─ Title (required, validated)
├─ Summary (markdown)
├─ Discussion URL (optional)
└─ Represented address (optional, ENS)

Stage 2: Transactions
├─ Transaction type dropdown (20+ types)
├─ Dynamic form per type
├─ Add to queue
├─ Queue sidebar (reorder, edit, remove)
└─ Continue → Review

Stage 3: Review (separate page)
├─ All metadata + transactions
├─ Edit buttons
├─ Simulation/validation
└─ Submit → Proposal page
```

**Transaction types** include:
- Send ETH/tokens
- Custom contract calls
- Pause/resume auctions
- DAO settings (auction, governance params)
- Droposal (NFT mint proposals)
- Creator coins
- Stream tokens
- Delegate nominations
- Treasury operations

**Stellar adaptation**:
- Use SAC assets instead of ETH
- Simpler transaction types initially (transfer, mint, configure, upgrade)
- Exact encoding validation (per MVP plan)
- Multi-action support with typed dispatch

#### **C. Auction Interface** (`/dao/[network]/[token]/[tokenId]`)

```
Main View
├─ Large token image
├─ Countdown (1s updates)
├─ Current bid (amount, bidder)
├─ Place bid section
│   ├─ Amount input (min bid validation)
│   ├─ Balance check
│   ├─ High bid warning modal
│   └─ Bid button
├─ Recent bids (last 10)
└─ Token picker (switch to historical)

Tabs
├─ About (DAO description)
├─ Feed (activity)
├─ Treasury (assets)
├─ Proposals (list)
├─ Candidates (if supported)
├─ Gallery (coins/drops)
├─ Admin (if owner)
└─ Contracts (addresses)

Auction End
├─ "Auction Ended" message
├─ Settle button (anyone can trigger)
└─ Auto-create next auction
```

**Real-time features**:
- Countdown updates every second
- Poll for new bids every 10s
- Optimistic UI on bid submission
- Auto-refresh on settle

**Stellar adaptation**:
- SAC asset bidding (default native XLM)
- Pre-launch state (paused, not-yet-started)
- One-shot launch action
- Claim balance UI for failed refunds
- Extension cap behavior (accept bids, don't extend)

#### **D. Voting Flow** (`/dao/[network]/[token]/vote/[id]`)

```
Proposal Header
├─ Proposal number
├─ State badge (active, succeeded, etc.)
└─ Proposer info

Details Tab
├─ Description (markdown)
├─ Transaction list (expandable cards)
├─ Discussion link
└─ Represented address

Votes Tab
├─ Vote breakdown (For/Against/Abstain)
├─ Progress bars (quorum, threshold)
├─ Voting buttons (if active)
├─ Vote confirmation modal
└─ Recent voters list

Propdates Tab (if EAS supported)
└─ Timeline of proposal updates
```

**Stellar adaptation**:
- Similar structure
- Snapshot voting power display
- Historical voting power vs current
- Queue/execute actions when eligible
- Upgrade proposals with version/hash display

### 3.3 State Management Patterns

**Zustand stores** (EVM app):
- `useDaoStore` - Current DAO context (addresses, chain)
- `useProposalStore` - Proposal creation draft (title, summary, transactions)
- `useFormStore` - DAO creation form (6 steps, IPFS progress)
- `useChainStore` - Selected chain
- `favoriteDaosStore` - Local storage favorites (max 50)

**SWR for data**:
- Dashboard data, proposals, auctions
- Cache with revalidation
- Optimistic updates

**Stellar adaptation**:
- Add DAO context provider (deployment ID, modules, network)
- Partition SWR keys by deployment
- Transaction recovery store (pending tx hash/context)
- Multi-DAO isolation

### 3.4 Key UX Patterns to Replicate

1. **Multi-step wizards** - DAO creation, proposal creation
2. **Tabbed interfaces** - DAO page (about, feed, proposals, etc.)
3. **Progressive disclosure** - Expandable sections, accordions
4. **Real-time updates** - Auction countdown, bid polling
5. **Optimistic UI** - Instant feedback on actions
6. **Validation & helpers** - Inline errors, helper text
7. **Empty states** - Guide users on next actions
8. **Skeleton loaders** - Improve perceived performance
9. **Favorites** - Local storage with limit (50)
10. **Search + filter + pagination** - DAO discovery
11. **Transaction queue** - Reorder, edit, remove in proposal composer
12. **Responsive design** - Mobile-first approach
13. **Smart redirects** - Latest auction, proposal number → hex ID
14. **Warning modals** - High bids, dangerous actions
15. **Breadcrumbs/back buttons** - Clear navigation

---

## 4. Key Patterns for Soroban Port

### 4.1 Contract Patterns

| Pattern | EVM Implementation | Soroban Adaptation |
|---------|-------------------|-------------------|
| **Proxy-Implementation** | UUPS delegatecall | `env.deployer().update_current_contract_wasm()` |
| **Founder Vesting** | Modulo-100 allocation | Same logic, Map<u32, Founder> storage |
| **Timelock** | Timestamp + grace period | Same, use ledger timestamp |
| **Continuous Auction** | settle+create in one tx | Separate for clarity, same flow |
| **Pseudo-Random** | Blockhash (UNSAFE) | **Deterministic from token ID** |
| **Multi-Sig Proposals** | EIP-712 signatures | Ed25519 signatures, same aggregation |
| **Upgrade Registry** | Manager allowlist | Same pattern |
| **Proposal States** | Enum with priority order | Same state machine |
| **Storage Versioning** | Append-only inheritance | Explicit version enum + migration |

### 4.2 Security Considerations

**EVM gotchas to avoid**:
1. ❌ Block-based randomness (miners can manipulate)
2. ❌ Reentrancy (Soroban has different model)
3. ❌ Storage slot collisions (Soroban uses structured data)
4. ❌ Gas optimization hacks (different fee model)

**Must preserve**:
1. ✅ Founder vesting math (modulo-100)
2. ✅ Auction timing (time buffer extensions)
3. ✅ Proposal lifecycle (state machine)
4. ✅ Timelock delays (security-critical)
5. ✅ Upgrade authorization (governance control)

### 4.3 Critical Differences

| Aspect | EVM | Soroban |
|--------|-----|---------|
| **Upgrades** | Proxy delegatecall | WASM hash replacement |
| **Randomness** | Block variables | Deterministic or VRF |
| **Signatures** | ECDSA (secp256k1) | Ed25519 |
| **Events** | Topics + data | Soroban events |
| **Storage** | Slot-based | Structured key-value |
| **Execution** | Call/delegatecall | Invoke contract |
| **Tokens** | ERC-20/721 | SAC/custom |
| **Fees** | Gas (variable pricing) | Network fees (resource-based) |

---

## 5. Stellar Implementation Decisions

### 5.1 What to Port Directly

✅ **Founder Vesting Logic**
- Modulo-100 allocation is elegant and proven
- Works identically in Soroban

✅ **Auction Time Buffer**
- Extension on late bids is core to UX
- Prevents sniping

✅ **Proposal State Machine**
- State priority order is well-designed
- Port state enum and transitions

✅ **Timelock Pattern**
- Queue → delay → execute is security best practice
- Use ledger timestamps

✅ **Reward Split Logic**
- Founder, builder, referral, treasury split
- Adapt for SAC assets

✅ **Multi-Step Creation Wizard**
- 6-step flow is intuitive
- Add launch admin selection

✅ **Tabbed DAO Interface**
- Organizes complex DAO data well
- Port tab structure

✅ **Transaction Queue (Proposal Composer)**
- Reorder, edit, remove is powerful
- Critical for multi-action proposals

### 5.2 What to Adapt

🔄 **Metadata Generation**
- EVM: Pseudo-random on-chain
- **Stellar**: Deterministic from token ID (safer, reproducible)

🔄 **Image Rendering**
- EVM: Off-chain renderer service
- **Stellar**: Next.js API route with IPFS compositing

🔄 **Upgrades**
- EVM: UUPS proxy pattern
- **Stellar**: Direct WASM replacement via Manager approval

🔄 **Signatures**
- EVM: EIP-712 ECDSA
- **Stellar**: Custom domain separator + Ed25519

🔄 **Token Standard**
- EVM: ERC-721Votes
- **Stellar**: Custom NFT with delegation (no standard yet)

🔄 **Asset Handling**
- EVM: ETH + ERC-20
- **Stellar**: SAC (native XLM + issued assets)

### 5.3 What to Skip (Initially)

❌ **Updatable Proposals** (Governor V3 feature)
- Adds significant complexity
- Can be added in future versions
- Focus on core governance first

❌ **Proposal Candidates** (Pre-proposal discussion)
- Nice-to-have, not critical
- Requires separate attestation system
- Defer to v2

❌ **Creator Coins** (ERC-20 for creators)
- Nouns Builder-specific feature
- Not core to Nounish DAO mechanics
- Not in MVP scope

❌ **Droposals** (NFT mint proposals)
- Specific to ecosystem partnerships
- Defer to future

❌ **Cross-Chain Bridging**
- Not relevant to single-chain Stellar deployment
- Skip entirely

❌ **Gnosis Safe Integration**
- Stellar doesn't have Safe equivalent yet
- Focus on EOA wallets first

### 5.4 New Features for Stellar

✨ **One-Shot Launch Admin**
- Not in EVM version (auctions auto-start)
- Stellar allows paused launch + explicit unpause
- Critical for governance-first launch

✨ **Persistent Claim Accounting**
- EVM: Direct refund transfers
- **Stellar**: Pull-based claims for failed transfers
- Better UX for recoverable funds

✨ **Runtime DAO Discovery**
- EVM: Subgraph-based discovery
- **Stellar**: Factory + Registry with automatic indexing
- No external indexer dependency for discovery

✨ **Immutable Art Seeds**
- EVM: Trait indices (pseudo-random)
- **Stellar**: Full seed struct (deterministic)
- More transparent and reproducible

✨ **Awaiting Indexing States**
- EVM: Relies on quick finality
- **Stellar**: Explicit indexing lag handling
- Better UX for pending data

---

## Summary

### Core Nouns Builder Patterns to Preserve
1. ✅ Modulo-100 founder vesting
2. ✅ Continuous auction with time buffer
3. ✅ Proposal state machine with timelock
4. ✅ Multi-signer proposals with aggregated voting power
5. ✅ Reward split (founder, builder, treasury)
6. ✅ Manager-based upgrade registry
7. ✅ 6-step DAO creation wizard
8. ✅ Transaction queue for proposals
9. ✅ Tabbed DAO interface
10. ✅ Real-time auction UI

### Key Adaptations for Stellar
1. 🔄 Deterministic seeds (not pseudo-random)
2. 🔄 WASM upgrades (not proxy pattern)
3. 🔄 SAC assets (not ETH/ERC-20)
4. 🔄 Ed25519 signatures (not ECDSA)
5. 🔄 Pull-based claims (not push refunds)
6. 🔄 One-shot launch (not auto-start)
7. 🔄 Factory atomic deployment (not multi-tx)
8. 🔄 Runtime DAO discovery (not env config)

### Nouns Builder Learnings Applied
- **UX**: Multi-step wizards work exceptionally well
- **State**: Zustand + SWR is solid pattern
- **Discovery**: Search + filter + favorites is essential
- **Auctions**: Real-time countdown + polling is critical
- **Proposals**: Transaction queue with reorder is powerful
- **Validation**: Inline errors + helper text reduces mistakes
- **Loading**: Skeleton loaders improve perceived perf
- **Mobile**: Mobile-first responsive design is non-negotiable

---

**References**:
- Nouns Builder Contracts: `/Users/dan13ram/code/nouns/protocol/main`
- Nouns Builder Web App: `/Users/dan13ram/code/nouns/builder/staging/apps/web`
- Artwork Sample: `/Users/dan13ram/code/nouns/artwork/sample`
- MVP Technical Plan: `/Users/dan13ram/code/nouns/stellar-dao/docs/mvp-technical-plan.md`

This document serves as the complete reference for porting Nouns Builder to Stellar.
