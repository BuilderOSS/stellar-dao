# Goldsky Package

This package owns the Goldsky pipeline source, generator, and tests.

Env vars:
- `NEXT_PUBLIC_DAO_NETWORK`
- `NEXT_PUBLIC_DAO_LABEL`
- `GOLDSKY_POSTGRES_SECRET`

The generator will also read `packages/goldsky/.env` and `packages/goldsky/.env.local` when present.

Commands:
- `pnpm --dir packages/goldsky generate`
- `pnpm --dir packages/goldsky test`

The generator reads `deploys/<label>-<network>.json`, inlines the Goldsky transform scripts, and writes `packages/goldsky/pipelines/dao-stellar-events.yaml`.

Pipeline outputs:
- `chain.raw_events`
- `chain.decoded_events`
- `app.activity_feed`
