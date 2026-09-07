# Goldsky Package

This package owns the Goldsky pipeline source, generator, and tests.

Env vars:
- `NEXT_PUBLIC_DAO_NETWORK`
- `NEXT_PUBLIC_DAO_LABEL`

Commands:
- `pnpm --dir packages/goldsky generate`
- `pnpm --dir packages/goldsky test`

The generator reads `deploys/<label>-<network>.json`, inlines the Goldsky script, and writes `packages/goldsky/pipelines/dao-stellar-events.yaml`.
