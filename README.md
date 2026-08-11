# DAO Contracts

Soroban DAO contracts with a Next.js frontend and generated TypeScript bindings.

## Workspace

- `contracts/token` - transferable NFT voting token
- `contracts/governor` - timestamp-based governor
- `contracts/treasury` - governor-authorized treasury
- `packages/token-bindings` - generated TS bindings
- `packages/governor-bindings` - generated TS bindings
- `packages/treasury-bindings` - generated TS bindings
- `apps/web` - frontend

## Features

- Single admin bootstrap across token, governor, and treasury
- 1 NFT = 1 vote
- Delegation preserved on transfer
- Default self-delegation on mint and first receipt
- Timestamp-based voting windows
- Quorum based on total supply at snapshot, in basis points
- Governor-controlled treasury execution
- Owner-gated bootstrap config only

## Quick Start

```bash
pnpm install
pnpm dao:bindings
pnpm dao:setup:local
pnpm dev
```

## Local Network

```bash
pnpm dao:local:up
pnpm dao:local:down
```

`pnpm dao:local:up` starts a local Stellar container, builds the DAO contracts, deploys token/governor/treasury, and writes `apps/web/.env.local`.

## Bindings

```bash
pnpm dao:bindings
```

Regenerates the three DAO client packages.

## Deploy

```bash
pnpm dao:deploy:local
pnpm dao:deploy:testnet
```

## Environment

Use `apps/web/.env.example` as the template.

Set these values:

- `NEXT_PUBLIC_STELLAR_NETWORK`
- `NEXT_PUBLIC_STELLAR_RPC_URL`
- `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS`
- `NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_ID`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_ID`
- `NEXT_PUBLIC_STELLAR_TREASURY_ID`

The example file includes comments for local and testnet values.
