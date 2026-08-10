# Frontend Roadmap

Mercury Retroshades are the only indexing source. On-chain reads stay for live state, but history/feed/leaderboard data comes from Mercury.

## Phase 1: Shell
- Keep the current dark, game-first dashboard shell.
- Keep network selection env-driven.
- Keep wallet/session state, submit confirmation, and the submitted-state CTA.

## Phase 2: Mercury Emitters
- Add `mercury`-gated retroshade structs to `contracts/arena`.
- Emit only the game data we want to index: actions, battles, raids, admin config changes, and useful snapshots.
- Keep prod/mainnet contract builds free of Mercury code by default.

## Phase 3: Mercury Index Client
- Add a frontend data layer for Mercury Retroshades REST.
- Read Retroshades tables for account history, activity feeds, and leaderboard inputs.
- Do not add classic-event fallback for these views.

## Phase 4: Indexed Views
- Build a Mercury-backed activity feed.
- Build account history from indexed rows.
- Build leaderboards from indexed rows only.

## Phase 5: Deployment
- Add a Mercury build/deploy path for the retroshade program.
- Verify table names, row shapes, and program status on testnet first.
- Document the split between on-chain contract builds and Mercury index builds.

## Done
- Product shell.
- Contract dashboard.
- Action signing and confirmation.
- Admin tools.
- Live cooldown countdown.
