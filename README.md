# Test DAO on Stellar

Single-DAO governance MVP on Stellar/Soroban with Rust contracts, generated TypeScript bindings, a Next.js web app, and Mercury-backed read models.

The project proves the core DAO loop:

- mint transferable NFT voting tokens
- create proposals with snapshot voting power
- vote with historical token checkpoints
- queue successful proposals
- execute approved calls through a governor-authorized treasury
- administer mint and governance authorities from the web app

## Workspace

- `contracts/token` - transferable NFT governance token with voting checkpoints and delegation
- `contracts/governor` - timestamp-based governor with proposal creation, voting, queueing, and execution
- `contracts/treasury` - governor-authorized execution boundary
- `contracts/e2e` - end-to-end contract tests
- `packages/token-bindings` - generated TypeScript token client
- `packages/governor-bindings` - generated TypeScript governor client
- `packages/treasury-bindings` - generated TypeScript treasury client
- `apps/web` - Next.js governance web app
- `configs` - local and testnet deployment inputs
- `deploys` - generated deployment outputs with contract IDs
- `scripts` - contract build, deploy, local network, bindings, and Mercury helpers
- `docs/mvp-dao-technical-plan.md` - current technical plan

## Features

- Single admin bootstrap across token, governor, and treasury
- NFT voting token where each token contributes one voting unit
- Default self-delegation on mint and first receipt
- Delegation preserved on transfer
- Snapshot-based voting power for proposal creation and voting
- Timestamp-based voting delay, voting period, queue delay, and execution ETA
- Proposal quorum based on total supply at snapshot, configured in basis points
- Contract-accurate quorum UI using `For + Abstain` participation and `For > Against` approval
- Proposal action preview before queueing and execution
- Governor-controlled treasury execution
- Owner, token admin, and governance admin web sections
- Mint and governance authority tracking through Mercury
- Mercury-backed proposals, votes, token inventory, members, activity feed, and program status
- Transaction lifecycle toasts and inline callouts for local form or access issues

## Requirements

- Node.js and pnpm `10.12.4`
- Rust toolchain with the Soroban/Stellar contract target available
- Docker for the local Stellar container flow
- Stellar CLI tooling expected by the deploy scripts

## Quick Start

```bash
pnpm install
pnpm dao:bindings
pnpm dao:local:up
pnpm dev
```

`pnpm dao:local:up` starts a local Stellar container, builds the DAO contracts, deploys token/governor/treasury, and writes `apps/web/.env.local`.

Open the web app with:

```bash
pnpm dev
```

## Common Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

Contract and deployment commands:

```bash
pnpm dao:build
pnpm dao:build:mercury
pnpm dao:bindings
pnpm dao:test:e2e
pnpm dao:local:up
pnpm dao:local:down
pnpm dao:setup:local
pnpm dao:deploy:local
pnpm dao:deploy:testnet
pnpm mercury:deploy:local
pnpm mercury:deploy:testnet
```

## Local Network

```bash
pnpm dao:local:up
pnpm dao:local:down
```

Use `dao:local:up` for the full local bootstrap. Use `dao:setup:local` when the local network is already running and you only need to rebuild, deploy, and rewrite web environment values.

## Deployments

```bash
pnpm dao:deploy:local
pnpm dao:deploy:testnet
```

Deployment inputs live in:

- `configs/local.json`
- `configs/testnet.json`

Use those files to configure network settings, admin address, token metadata, voting delay, voting period, queue delay, proposal threshold, quorum, and web base URL.

Each deployment writes a corresponding output in `deploys/` with the deployment inputs, contract IDs, and derived frontend environment values.

## Mercury

Mercury is used for indexed read surfaces. Contract execution remains independent from indexing, and the app reconciles critical proposal state with direct Soroban RPC reads where possible.

Mercury deployment commands:

```bash
pnpm mercury:deploy:local
pnpm mercury:deploy:testnet
```

The web app can read Mercury-backed data for:

- activity feed
- program status
- proposal list and lifecycle data
- proposal votes
- token inventory
- mint authorities
- governance authorities
- member directory

## Environment

Use `apps/web/.env.example` as the template.

Core public values:

- `NEXT_PUBLIC_STELLAR_NETWORK`
- `NEXT_PUBLIC_STELLAR_RPC_URL`
- `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS`
- `NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_ID`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_CONTRACT_ID`
- `NEXT_PUBLIC_STELLAR_TREASURY_CONTRACT_ID`

Mercury values:

- `NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROJECT`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROJECT`
- `NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROJECT`
- `MERCURY_JWT`
- `MERCURY_BASE_URL`

Token metadata values:

- `NEXT_PUBLIC_STELLAR_TOKEN_NAME`
- `NEXT_PUBLIC_STELLAR_TOKEN_SYMBOL`
- `NEXT_PUBLIC_STELLAR_TOKEN_DESCRIPTION`

## Web Routes

Public routes:

- `/` - governance dashboard and DAO overview
- `/proposals` - proposal list and creation eligibility
- `/proposals/create` - proposal composer and action builder
- `/proposals/[proposalId]` - proposal timeline, action preview, vote summary, vote panel, queue/execute controls, and vote history
- `/treasury` - treasury address and execution history
- `/members` - voting power/member directory
- `/token/[tokenId]` - token detail page

Admin routes:

- `/admin` - role-aware admin dashboard
- `/admin/owner` - owner authority management
- `/admin/token` - mint authority token minting
- `/admin/governance` - governance authority settings updates

## API Routes

- `/api/proposals` - proposal list with live state reconciliation
- `/api/proposals/[proposalId]` - proposal detail with live state and fallback Mercury data
- `/api/mercury/proposals/[proposalId]/votes` - indexed proposal votes
- `/api/mercury/activity-feed` - indexed DAO activity feed
- `/api/mercury/program-status` - Mercury program health/status
- `/api/mercury/mint-authorities` - indexed mint authorities
- `/api/mercury/governor-authorities` - indexed governance authorities
- `/api/tokens` - token inventory
- `/api/token/[tokenId]` - NFT metadata JSON
- `/api/token/[tokenId]/image.svg` - deterministic token SVG image

## Verification

Run web checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Run contract e2e tests:

```bash
pnpm dao:test:e2e
```

Regenerate bindings after contract interface changes:

```bash
pnpm dao:bindings
```

## Notes

- This repo is intentionally scoped to one test DAO, not a DAO factory or multi-DAO platform.
- `docs/mvp-dao-technical-plan.md` is the canonical technical plan.
- The web app uses toasts for transaction lifecycle feedback and inline callouts for local user-actionable warnings/errors.
