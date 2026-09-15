# Salvage Reference - Files and Patterns to Reuse

**Purpose**: Quick reference for what to port/adapt when building the new `nouns-stellar` repository

## Contracts - Test Patterns & Logic

### Reuse Score: 40% (patterns, not code)

**Port these test patterns**:

```
/contracts/token/src/test.rs
├─ Unit test structure
├─ Mock environment setup
├─ Delegation checkpoint testing
└─ Transfer/approval test cases

/contracts/governor/src/test.rs
├─ Proposal lifecycle tests
├─ Voting scenarios (for/against/abstain)
├─ Quorum calculation tests
└─ Timestamp boundary tests

/contracts/treasury/src/test.rs
├─ Authorization test patterns
└─ Execution test structure

/contracts/auction/src/test.rs
├─ Bidding scenarios
├─ Settlement test cases
└─ Time extension logic tests

/contracts/e2e/src/test.rs
├─ Multi-contract integration pattern
├─ End-to-end flow structure
└─ Cross-contract authorization tests
```

**Adapt these logic patterns**:

```rust
// Proposal state machine - contracts/governor/src/proposal.rs
pub enum ProposalState {
    Pending,
    Active,
    Defeated,
    Succeeded,
    Queued,
    Expired,
    Executed,
    Canceled,
}

// Checkpoint pattern - contracts/token/src/delegation.rs
pub fn checkpoint_votes(env: &Env, delegatee: &Address, old_weight: u128, new_weight: u128)

// Vote tallying - contracts/governor/src/lib.rs
pub fn get_votes(e: Env, proposal_id: u32) -> VoteTally
```

**Don't port**: Authority setup (complete rewrite needed)

---

## Deployment Scripts

### Reuse Score: 60% (orchestration patterns)

**Port with adaptation**:

```javascript
// scripts/deploy-dao.mjs - ADAPT for factory deployment
✅ Keep: Address prediction logic
✅ Keep: Sequential deployment orchestration
✅ Keep: Deployment artifact generation
✅ Keep: WASM compilation triggering
🔄 Adapt: Deploy via factory, not individual contracts
🔄 Adapt: 8 contracts instead of 4

// scripts/generate-dao-bindings.mjs - PORT AS-IS
✅ Keep: Stellar CLI binding generation
✅ Keep: Per-contract package generation
✅ Keep: TypeScript client wrapper

// scripts/dao-local-up.mjs - PORT AS-IS
✅ Keep: Docker network setup
✅ Keep: Stellar quickstart configuration
✅ Keep: Deployment triggering

// scripts/generate-deployment-config.mjs - ADAPT
✅ Keep: Config generation pattern
🔄 Adapt: Multi-DAO support, registry integration
```

**Key pattern to preserve**:

```javascript
// Address prediction before deployment
const predictContractAddress = (deployer, wasmHash, salt) => {
  // This pattern is critical for circular references
}

// Sequential deployment with validation
async function deployContracts() {
  const addresses = predictAllAddresses()
  await deployWithAddresses(addresses)
  await validateDeployment(addresses)
  await generateArtifacts(addresses)
}
```

---

## Goldsky Pipeline

### Reuse Score: 70% (structure and patterns)

**Port these decoder patterns**:

```javascript
// packages/goldsky/src/decoded-events.script.js
✅ Event type switching structure
✅ XDR-JSON decoding helpers
✅ ScVal parsing utilities
✅ Error handling for unknown events

// Core pattern to preserve:
export function decodeEvent(rawEvent) {
  const topic = rawEvent.topic_0
  switch (topic) {
    case 'Transfer': return decodeTransfer(rawEvent)
    case 'ProposalCreated': return decodeProposalCreated(rawEvent)
    // ... etc
  }
}

// packages/goldsky/src/activity-feed.script.js
✅ Activity feed aggregation pattern
✅ User-friendly event summaries
✅ Cross-contract event correlation

// packages/goldsky/test/*.test.mjs
✅ Fixture-based test structure
✅ Decoder validation pattern
```

**Adapt for multi-DAO**:

```javascript
// NEW: Controller for automatic onboarding
// Not in current repo - implement from scratch based on:
// - Factory creation event observation
// - Dynamic filter updates
// - Backfill coordination
// Reference the pattern from activity-feed aggregation
```

**Configuration to adapt**:

```yaml
# packages/goldsky/templates/goldsky.yaml.hbs
# Current: Fixed contract addresses
# New: Dynamic addresses from registry
# Keep: Transform pipeline structure
```

---

## Database Schema

### Reuse Score: 50% (concepts, not migrations)

**Reuse these view patterns**:

```sql
-- db/migrations/0002_goldsky_views.sql

-- CONCEPT: Aggregated proposal detail
CREATE VIEW app.proposal_detail AS
SELECT
  p.*,
  json_agg(actions) as actions,
  json_agg(votes) as votes
FROM governance.proposals p
LEFT JOIN governance.proposal_actions a ON ...
LEFT JOIN governance.votes v ON ...
GROUP BY p.proposal_id;

-- CONCEPT: Activity feed across contracts
CREATE VIEW app.activity_feed AS
SELECT * FROM token_events
UNION ALL
SELECT * FROM governance_events
UNION ALL
SELECT * FROM auction_events
ORDER BY block_timestamp DESC;

-- CONCEPT: Member voting power calculation
CREATE VIEW token.members AS
SELECT
  owner,
  COUNT(*) as token_count,
  SUM(delegated_power) as voting_power
FROM token.inventory
GROUP BY owner;
```

**Don't port**:
- Actual migration files (start fresh)
- `deployment_id` derivation (fundamental change)
- Specific table structures (will change for new events)

**New patterns to add**:

```sql
-- Immutable deployment identity
CREATE TABLE registry.deployments (
  deployment_id TEXT PRIMARY KEY, -- token_address:network:epoch
  token_address TEXT NOT NULL,
  network TEXT NOT NULL,
  epoch TEXT NOT NULL,
  created_ledger BIGINT NOT NULL,
  creator TEXT NOT NULL,
  factory_version TEXT NOT NULL
);

-- Event envelope with full provenance
CREATE TABLE chain.raw_events (
  id TEXT PRIMARY KEY,
  transaction_hash TEXT NOT NULL,
  ledger BIGINT NOT NULL,
  tx_position INT NOT NULL,
  operation_position INT NOT NULL,
  event_position INT NOT NULL,
  contract_address TEXT NOT NULL,
  tx_successful BOOLEAN NOT NULL, -- NEW
  -- ... event data
);
```

---

## Frontend - Component Designs

### Reuse Score: 50% (designs, rewrite in Tailwind)

**Components to redesign in Tailwind**:

```
apps/web/src/components/proposal/
├─ proposal-state-badge.tsx         -> Redesign with Tailwind
├─ proposal-vote-panel.tsx          -> Redesign with Tailwind
├─ proposal-queue-panel.tsx         -> Redesign with Tailwind
├─ proposal-execute-panel.tsx       -> Redesign with Tailwind
├─ proposal-action-editor.tsx       -> Redesign with Tailwind (key component!)
├─ proposal-vote-summary.tsx        -> Redesign with Tailwind
├─ proposal-quorum-progress.tsx     -> Redesign with Tailwind
└─ proposal-overview.tsx            -> Redesign with Tailwind

apps/web/src/components/auction/
├─ auction-bid-form.tsx             -> Redesign with Tailwind
├─ auction-countdown.tsx            -> Redesign with Tailwind
└─ auction-settlement-panel.tsx     -> Redesign with Tailwind

apps/web/src/components/admin/
├─ authority-panel.tsx              -> Redesign with Tailwind
└─ duration-input.tsx               -> Redesign with Tailwind

apps/web/src/components/ui/
├─ button.tsx                       -> Replace with shadcn/ui
├─ card.tsx                         -> Replace with shadcn/ui
├─ input.tsx                        -> Replace with shadcn/ui
├─ badge.tsx                        -> Replace with shadcn/ui
└─ ... all others                   -> Replace with shadcn/ui
```

**Key design pattern from proposal-action-editor.tsx**:

```typescript
// Multi-action composer pattern - keep this UX
interface ProposalAction {
  type: 'transfer' | 'mint' | 'upgrade' | 'configure'
  params: Record<string, any>
}

// Allow adding/removing/reordering actions
const [actions, setActions] = useState<ProposalAction[]>([])

// Validate each action before proposal creation
const validateAction = (action: ProposalAction) => { ... }

// Encode to contract call format
const encodeActions = (actions: ProposalAction[]) => { ... }
```

---

## Frontend - Hooks and Utilities

### Reuse Score: 70% (adapt for multi-DAO)

**Port these patterns**:

```typescript
// apps/web/src/lib/transaction-confirmation.ts
✅ Transaction polling pattern
✅ Status checking logic
🔄 FIX: Handle FAILED status correctly (don't retry)
🔄 ADD: Persist hash for reload recovery

// apps/web/src/lib/transaction-feedback.ts
✅ Toast notification patterns
✅ Success/error messaging
🔄 ADD: Awaiting indexing state

// apps/web/src/stores/proposal-composer-store.ts
✅ Multi-step state management pattern
✅ Draft persistence
🔄 ADAPT: Partition by DAO

// apps/web/src/lib/voting-power.ts
✅ Checkpoint-based power calculation
✅ Snapshot logic

// apps/web/src/lib/proposal-state.ts
✅ State machine logic (matches contract)
✅ Timestamp-based state determination

// apps/web/src/lib/validate-address.ts
✅ Stellar address validation
```

**Don't port**:

```typescript
// apps/web/src/lib/dao-config.ts
❌ Environment-based DAO selection
// Replace with runtime DAO context:
const useDaoContext = () => {
  const daoId = useParams().daoId
  const { data } = useSWR(`/api/registry/${daoId}`)
  return { daoId, modules: data.modules, network: data.network }
}
```

**New patterns to add**:

```typescript
// Multi-DAO SWR key partitioning
const useDaoProposals = (daoId: string) => {
  return useSWR(`/api/dao/${daoId}/proposals`)
}

// Transaction recovery
const useTransactionRecovery = () => {
  const pending = useLocalStorage('pending-tx')
  const resume = async (hash: string) => { ... }
  return { pending, resume }
}
```

---

## Frontend - Pages (Don't Port)

### Reuse Score: 0% (architecture incompatible)

**Don't port any page.tsx files** - routing changes require complete rewrite

**But reuse these patterns**:

```typescript
// Current: apps/web/src/app/proposals/page.tsx
// Pattern to keep: List view with filters, empty states
// New location: apps/web/src/app/dao/[daoId]/proposals/page.tsx

// Current: apps/web/src/app/proposals/[id]/page.tsx
// Pattern to keep: Detail view with actions, voting panel
// New location: apps/web/src/app/dao/[daoId]/proposals/[id]/page.tsx

// Current: apps/web/src/app/auctions/page.tsx
// Pattern to keep: Current auction + history
// New location: apps/web/src/app/dao/[daoId]/auctions/page.tsx

// ALL PAGES: Rewrite with DAO context provider
```

---

## API Routes

### Reuse Score: 40% (query patterns)

**Port these query patterns**:

```typescript
// apps/web/src/lib/goldsky.ts (11,879 bytes of queries)
✅ SQL query structure
✅ PostgreSQL client usage
✅ Error handling
🔄 CRITICAL: Add deployment_id filtering to EVERY query

// Example adaptation:
// OLD:
export async function getProposals() {
  return db.query('SELECT * FROM app.proposal_list')
}

// NEW:
export async function getProposals(deploymentId: string) {
  return db.query(
    'SELECT * FROM app.proposal_list WHERE deployment_id = $1',
    [deploymentId]
  )
}
```

**Port these API patterns**:

```typescript
// apps/web/src/app/api/proposals/route.ts
✅ Next.js route handler structure
✅ Error responses (404, 500)
✅ JSON response format
🔄 ADAPT: Extract daoId, resolve deployment_id, scope queries

// apps/web/src/app/api/goldsky/health/route.ts
✅ Health check pattern
🔄 ADD: Per-deployment readiness
```

---

## What NOT to Port (Time Savers)

### Skip These Entirely ❌

1. **All Panda CSS config** (`panda.config.ts`, `styled-system/`)
2. **All page.tsx routing** (incompatible architecture)
3. **dao-config.ts** (environment-based selection)
4. **dao-session-store.ts DAO selection** (keep wallet state only)
5. **Database migrations** (start fresh schema)
6. **Deployment artifacts** (`/deploys/*.json` - will regenerate)
7. **Current contract WASMs** (need rebuild with upgrades)

### Common Mistakes to Avoid ⚠️

1. **Don't copy-paste contract code** without adding upgrade entrypoints
2. **Don't port database identity model** (fundamental change)
3. **Don't reuse unscoped API queries** (add deployment_id filtering)
4. **Don't copy Panda CSS components** (rewrite in Tailwind)
5. **Don't assume single-DAO anywhere** (thread context throughout)

---

## Recommended Port Order

### Phase 1: Scripts & Setup (Week 1)
1. ✅ `dao-local-up.mjs` - as-is
2. ✅ `generate-dao-bindings.mjs` - as-is
3. 🔄 `deploy-dao.mjs` - adapt for factory
4. ✅ GitHub Actions CI/CD - port
5. ✅ Package.json scripts structure - port

### Phase 2: Contract Tests (Week 3-5)
1. 🔄 Test file structure from `/contracts/*/src/test.rs`
2. 🔄 E2E test pattern from `/contracts/e2e/src/test.rs`
3. ✅ Mock environment setup patterns
4. ❌ Don't port: authority setup (will change)

### Phase 3: Goldsky (Week 10-11)
1. ✅ `decoded-events.script.js` structure
2. ✅ `activity-feed.script.js` pattern
3. ✅ Test fixture pattern
4. 🔄 Adapt for multi-DAO discovery

### Phase 4: Database (Week 12)
1. ✅ View aggregation concepts
2. ❌ Don't port: migrations
3. ✅ PostgreSQL client setup

### Phase 5: Frontend Utils (Week 13)
1. ✅ `transaction-confirmation.ts` (with fixes)
2. ✅ `transaction-feedback.ts`
3. ✅ `voting-power.ts`
4. ✅ `proposal-state.ts`
5. 🔄 `proposal-composer-store.ts` (adapt for DAO scoping)

### Phase 6: Components (Week 17-18)
1. Redesign all in Tailwind (reference designs, not code)
2. Use shadcn/ui for base components
3. Preserve UX patterns (action editor, voting panels)

---

## Quick Reference Checklist

When building in new repo, ask yourself:

- [ ] Is this scoped to a deployment? (if data query: yes required)
- [ ] Does this use env config? (replace with DAO context)
- [ ] Is this Panda CSS? (redesign in Tailwind)
- [ ] Is this a test pattern? (port)
- [ ] Is this a deployment script? (port/adapt)
- [ ] Is this a Goldsky decoder? (adapt)
- [ ] Is this a component design? (redesign, not copy)
- [ ] Is this a database migration? (don't port)
- [ ] Is this contract logic? (reference, don't copy)

---

**Remember**: We're salvaging **patterns and learnings**, not porting code blindly. Every file should be consciously adapted for multi-DAO architecture.
