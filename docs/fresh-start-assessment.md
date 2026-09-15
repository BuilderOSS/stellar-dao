# Fresh Start Assessment - Nouns Builder on Stellar

**Date**: 2026-09-14
**Decision**: Start fresh in new `nouns-stellar` repository
**Reason**: MVP requires fundamental architecture changes incompatible with current implementation

## Executive Summary

The current `stellar-dao` repository contains a **functional single-DAO prototype** demonstrating core governance mechanics. However, the MVP technical plan requires:

- **8 contracts** (4 platform + 4 DAO modules) vs current 4
- **Multi-DAO architecture** vs single-DAO
- **Governance ownership from creation** vs admin-controlled
- **Upgrade capability** in all modules (currently absent)
- **Factory-based atomic deployment** vs manual deployment
- **IPFS artwork integration** vs generated SVG
- **Runtime DAO discovery** vs environment-based config

These are **breaking architectural changes**, not incremental improvements. Starting fresh allows:

1. Clean contract authority model from inception
2. Multi-DAO routing throughout the stack
3. Proper data isolation without migration complexity
4. Modern Tailwind stack vs Panda CSS
5. Clean git history focused on production architecture

## What We're Salvaging (Significant Value)

### Contracts (~40% reusable patterns)
- ✅ **Test structure**: Unit test patterns, e2e integration approach
- ✅ **Logic flows**: Proposal states, voting checkpoints, delegation mechanics
- ✅ **Soroban patterns**: Storage helpers, event emission, error handling
- ❌ **Authority model**: Complete rewrite needed (admin → governance)
- ❌ **Upgrade capability**: New from scratch
- ❌ **Internal dispatch**: Non-reentrant pattern is new

**Files to reference**:
- `/contracts/*/src/test.rs` - Test patterns
- `/contracts/e2e/src/test.rs` - E2E structure
- `/contracts/governor/src/proposal.rs` - State machine logic
- `/contracts/token/src/delegation.rs` - Checkpoint patterns

### Deployment & Scripts (~60% reusable)
- ✅ **Orchestration approach**: Sequential deployment with address prediction
- ✅ **Binding generation**: TypeScript client generation workflow
- ✅ **Local network**: Docker-based Soroban network setup
- 🔄 **Adapt for**: Atomic factory deployment, 8 contracts vs 4

**Files to port**:
- `/scripts/deploy-dao.mjs` - Orchestration pattern (adapt for factory)
- `/scripts/generate-dao-bindings.mjs` - Keep as-is
- `/scripts/dao-local-up.mjs` - Keep local network setup

### Goldsky Pipeline (~70% reusable)
- ✅ **Decoder structure**: XDR-JSON event decoding pattern
- ✅ **Transform pipeline**: raw → decoded → activity feed
- ✅ **Test patterns**: Fixture-based decoder tests
- 🔄 **Adapt for**: Multi-DAO discovery, registry events, new contract events

**Files to reference**:
- `/packages/goldsky/src/decoded-events.script.js` - Decoder pattern
- `/packages/goldsky/src/activity-feed.script.js` - Transform pattern
- `/packages/goldsky/test/*.test.mjs` - Test fixtures

### Database Schema (~50% reusable concepts)
- ✅ **View patterns**: Aggregated proposal_detail, denormalized activity_feed
- ✅ **Event storage**: Raw + decoded table pattern
- ❌ **Identity model**: Complete rewrite (label/network → token address + epoch)
- ❌ **Migrations**: Start fresh, don't port

**Concepts to reuse**:
- Separation of raw events, decoded events, and app views
- Activity feed aggregation across contracts
- Proposal detail with actions and votes joined
- Member voting power calculations

**Don't port**: Actual migration files, deployment_id derivation

### Frontend (~50% component designs, 0% routing architecture)
- ✅ **Component designs**: Proposal cards, voting panels, admin forms
- ✅ **Hook patterns**: SWR data fetching, transaction confirmation
- ✅ **State management**: Zustand for wallet and multi-step flows
- ❌ **Routing**: Complete rewrite for `/dao/[daoId]/...`
- ❌ **Styling**: Switch Panda CSS → Tailwind
- ❌ **DAO selection**: Rewrite for runtime discovery

**Components to redesign in Tailwind**:
- `/apps/web/src/components/proposal/proposal-*.tsx` - Visual designs
- `/apps/web/src/components/auction/auction-*.tsx` - Auction UI patterns
- `/apps/web/src/components/admin/authority-panel.tsx` - Admin patterns
- `/apps/web/src/components/ui/*` - Base components (port to shadcn/ui)

**Patterns to reuse**:
- `/apps/web/src/lib/transaction-confirmation.ts` - Polling pattern
- `/apps/web/src/lib/transaction-feedback.ts` - Toast notifications
- `/apps/web/src/stores/proposal-composer-store.ts` - Multi-step state pattern

**Don't port**:
- All `page.tsx` files (routing architecture changes)
- `dao-config.ts` (env-based selection → runtime discovery)
- Panda CSS config and styled components

## Critical Gaps vs MVP Plan

### Platform Layer (0% complete - entirely new)
| Component | Status | Effort |
|-----------|--------|--------|
| Manager contract | Not started | 2 weeks |
| DaoFactory contract | Not started | 2 weeks |
| DaoRegistry contract | Not started | 1 week |
| MetadataRegistry contract | Not started | 1 week |
| Factory tests | Not started | 1 week |

### Contract Upgrades (0% complete - breaking change)
- All 4 DAO modules need `update_current_contract_wasm` entrypoints
- Manager validation on upgrade execution
- Version/hash tracking in storage
- State schema compatibility planning
- **Effort**: 1 week per contract (4 weeks total)

### Authority Model (0% complete - fundamental redesign)
| Change | Current | Required | Effort |
|--------|---------|----------|--------|
| Token ownership | Admin | Treasury (governance) | 1 week |
| Governor authority | Admin | Self-governance | 1 week |
| Treasury owner | Admin | Governor-controlled | 1 week |
| Auction owner | Admin | Treasury (governance) | 1 week |
| Mint authority | Admin | Auction + Treasury | Included above |
| Launch admin | Auto-start | One-shot capability | 1 week |

### Non-Reentrant Dispatch (0% complete - new pattern)
- Governor self-actions (settings, upgrade) via internal dispatch
- Treasury self-actions via internal dispatch
- External module calls through existing execution path
- **Effort**: 1 week

### Auction Claims (0% complete - new feature)
- Persistent asset-scoped claim balances
- Push-first, fall back to claimable pattern
- Claim entrypoint with authorization
- TTL management
- **Effort**: 1 week

### Token Art & Metadata (0% complete - entirely new)
| Feature | Status | Effort |
|---------|--------|--------|
| IPFS artwork format spec | Awaiting examples | 3 days |
| Art seed storage (contract) | Not started | 3 days |
| Seed generation determinism | Not started | 2 days |
| IPFS upload/pinning (frontend) | Not started | 1 week |
| Metadata rendering (frontend) | Not started | 1 week |
| Governance updates w/ compatibility | Not started | 1 week |

### Multi-DAO Architecture (0% complete - pervasive change)
| Layer | Current | Required | Effort |
|-------|---------|----------|--------|
| Routing | `/proposals` | `/dao/[daoId]/proposals` | 1 week |
| Context | env config | Runtime DAO context | 3 days |
| API scoping | Global | Per-deployment filtering | 1 week |
| SWR keys | Unscoped | Partitioned by DAO | 2 days |
| Drafts | Global | Per-DAO isolation | 2 days |
| Database identity | label+network | token address + epoch | 1 week |
| Goldsky onboarding | Fixed addresses | Automatic discovery | 2 weeks |

### Data Corrections (30% complete - projections need fixes)
| Issue | Current | Required | Effort |
|-------|---------|----------|--------|
| Auction end time | Static | Reflect extensions | 2 days |
| Executed actions | Always null | Proposal linkage | 3 days |
| Voter counts | Confused w/ weight | Separate count vs power | 2 days |
| Proposal numbers | Replay-derived | Canonical from events | 3 days |
| Event envelope | Missing fields | Full ordering + success | 1 week |
| Migration errors | Silent failures | Fail-fast w/ rollback | 2 days |

### UX Enhancements (20% complete - partial patterns exist)
| Feature | Status | Effort |
|---------|--------|--------|
| Transaction recovery | Partial (no reload) | 1 week |
| Exact decimal handling | Mostly correct | 2 days (validation) |
| Awaiting indexing states | Missing | 3 days |
| Accessibility (ARIA, keyboard) | Basic | 1 week |
| Claim balance UI | Not started | 3 days |
| Pre-launch state | Not started | 3 days |
| Upgrade summaries | Not started | 1 week |

## Effort Summary

| Category | Effort | Notes |
|----------|--------|-------|
| **Platform contracts** | 6 weeks | Manager, Factory, Registry, MetadataRegistry + tests |
| **DAO contract updates** | 8 weeks | Upgrades, authority, claims, seeds, dispatch + tests |
| **Database & indexing** | 3 weeks | Fresh schema, multi-DAO pipeline, controller |
| **Frontend architecture** | 4 weeks | Routing, context, Tailwind, creation flow |
| **Frontend DAO pages** | 3 weeks | Adapt existing to multi-DAO |
| **Polish & verification** | 2 weeks | Accessibility, recovery, testnet |

**Total: ~26 weeks (6.5 months)** from scratch

**With salvage: ~21 weeks (5 months)** - saves ~20% by reusing:
- Contract test patterns
- Deployment orchestration
- Goldsky decoder structure
- Component designs
- Data layer concepts

## Technology Stack Changes

| Layer | Current | New | Reason |
|-------|---------|-----|--------|
| **Styling** | Panda CSS | Tailwind | Industry standard, easier onboarding |
| **Components** | Ark UI | shadcn/ui | Tailwind-native, better docs |
| **Routing** | Single-DAO | Multi-DAO | `/dao/[daoId]/...` |
| **DAO Config** | Environment vars | Runtime discovery | Registry-based |
| **Contracts** | 4 modules | 8 total | +Platform layer |
| **Database ID** | label+network | token address+epoch | Immutable identity |

## Repository Strategy

**Chosen**: Fork to `nouns-stellar` (or similar)

**Rationale**:
1. Preserves git history for reference
2. Clear "v2" branding
3. Can cherry-pick commits/patterns
4. Easy to compare implementations
5. Protects current working state

**Alternative considered**: Brand new repo
- Pro: Cleaner start
- Con: Loses git history value
- Con: More manual file copying

## Nouns Builder Compatibility

**Approach**: Inspired by Nouns, optimized for Stellar

**What this means**:
- ✅ Nouns aesthetic (generative artwork, daily auctions)
- ✅ DAO-governed treasury and parameters
- ✅ Compatible IPFS artwork structure (to be specified)
- 🔄 Stellar-specific: Soroban contracts, SAC assets, upgrade system
- 🔄 Optimizations: One-shot launch, internal dispatch, claim system

**Not a direct port**: Adapting Nouns DAO concepts to Stellar's capabilities

## Immediate Next Steps

1. **Await artwork examples** from user to document IPFS format
2. **Create `nouns-stellar` repository** when ready to implement
3. **Use this repo as reference** throughout new implementation
4. **Document artwork spec** in Phase 1 of new repo

## Reference Documents

- Primary: `/docs/mvp-technical-plan.md` - Complete implementation requirements
- This doc: High-level salvage strategy and gap analysis
- New repo will have: Detailed implementation decisions and progress tracking

## Key Learnings from Prototype

### What Worked Well ✅
- Soroban contract development workflow
- Generated TypeScript bindings
- Goldsky event indexing approach
- Next.js app structure
- Local development setup
- Deployment script orchestration

### What Needs Rework ❌
- Single-DAO assumption throughout
- Admin ownership model
- No upgrade paths
- Panda CSS learning curve
- Environment-based configuration
- Database identity model

### What's Proven 🎯
- Stellar/Soroban can support complex governance
- Full-stack integration (contracts → indexing → web) is viable
- Checkpointed voting and delegation works
- SAC asset integration is straightforward
- Goldsky + PostgreSQL is powerful for DAO UX

---

**Status**: Planning complete, awaiting artwork examples to begin Phase 1 in new repo.
