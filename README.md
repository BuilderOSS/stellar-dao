# Stellar DAO

Single-DAO governance MVP on Stellar/Soroban with Rust contracts, generated TypeScript bindings, a Next.js web app, and Mercury read models.

## DAO Flow

1. The token contract mints transferable NFT voting units.
2. A proposer creates a proposal using checkpointed voting power.
3. Token holders vote during timestamp-based voting windows.
4. A successful proposal waits through the queue delay.
5. The governor executes approved calls through the governor-authorized treasury.

The default deployment minimums are 300 seconds for voting delay, voting period, and queue delay. Quorum is configured in basis points.

## Repository Layout

- `contracts/token` - NFT governance token, delegation, checkpoints, and mint authority.
- `contracts/governor` - proposal lifecycle, voting, quorum, queueing, and execution.
- `contracts/treasury` - governor-only arbitrary contract-call boundary.
- `contracts/auction` - perpetual SAC-funded NFT auctions.
- `contracts/e2e` - cross-contract integration tests.
- `apps/web` - Next.js governance interface.
- `packages/*-bindings` - generated TypeScript clients.
- `configs` - deployment inputs.
- `deploys` - deployment outputs and contract addresses.
- `scripts` - build, deploy, binding, config, local network, and Mercury tooling.

## Requirements

- Node.js and pnpm 10.12.4
- Rust with the `wasm32v1-none` target
- Docker for the local Stellar network flow
- Stellar CLI tooling used by the deployment scripts

## Quick Start

```bash
pnpm install
pnpm dao:bindings
pnpm dao:local:up
pnpm dev
```

`pnpm dao:local:up` starts the local network, builds and deploys the DAO contracts, writes deployment output under `deploys/`, and regenerates `apps/web/src/config/deployments.generated.ts`.

The web app selects a generated deployment with:

```dotenv
NEXT_PUBLIC_DAO_NETWORK=local
NEXT_PUBLIC_DAO_LABEL=local
```

Copy `apps/web/.env.example` to `apps/web/.env.local` only when needed. Contract IDs, RPC settings, passphrases, token metadata, governance settings, and Mercury program metadata are generated from deployment outputs. Do not maintain those values as separate manual environment variables.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck

pnpm dao:build
pnpm dao:build:mercury
pnpm dao:bindings
pnpm dao:generate-config
pnpm dao:test:unit
pnpm dao:test:e2e
pnpm dao:test:all

pnpm dao:local:up
pnpm dao:local:down
pnpm dao:setup:local
pnpm dao:deploy:local
pnpm dao:deploy:testnet
```

Use `dao:setup:local` when the local network is already running and you need to redeploy and regenerate frontend configuration.

## Deployment Configuration

Edit the appropriate input before deploying:

- `configs/local.json`
- `configs/testnet.json`

Inputs include network, label, admin address, RPC URL, passphrase, token metadata, governance timings, proposal threshold, quorum, and web base URL.

Deployment commands write JSON artifacts to `deploys/`. Run `pnpm dao:generate-config` after changing deployment artifacts to regenerate the frontend configuration.

## Mercury

Mercury provides indexed read models for proposals, votes, tokens, authorities, members, activity, and program status. Contract execution does not depend on Mercury.

```bash
pnpm mercury:deploy:local
pnpm mercury:deploy:testnet
pnpm mercury:list
pnpm mercury:tables
pnpm mercury:status
```

Set `MERCURY_JWT` only if the web app or Mercury scripts need authenticated Mercury access.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm dao:test:all
```

Regenerate bindings after changing a contract interface:

```bash
pnpm dao:bindings
```
