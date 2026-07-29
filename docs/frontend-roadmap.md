# Frontend Roadmap

## Phase 1: Product Shell
- Build a strong dashboard layout with a clear landing area and a control area.
- Persist wallet and network state in the UI.
- Add a top bar for network, wallet, contract id, and refresh status.
- Keep Park UI as the design system, but tighten hierarchy, spacing, and empty states.

## Phase 2: Contract Dashboard
- Show token metadata, total supply, action count, balance, cooldown, allowance, stats, and battle record.
- Make each panel refresh independently.
- Add loading, error, and success states for every read operation.

## Phase 3: Actions
- Add forms for `punch`, `kick`, `transfer`, `approve`, `burn`, `battle`, `joint_punch`, `heavy_kick`, and `transfer_points`.
- Separate single-signer, two-signer, and three-signer flows.
- Validate inputs and show transaction previews before signing.
- Show result summaries after successful submits.

## Phase 4: Account Center
- Add a connected-account panel with address, balance, allowances, recent interactions, cooldown, and battle stats.
- Add a "my activity" summary for punches, kicks, battles, wins, losses, and tokens held.

## Phase 5: Admin and Dev Tools
- Keep admin controls behind a dedicated section.
- Include reset action count, set cooldown duration, extend TTL, and local bootstrap diagnostics.
- Hide admin controls from the normal user flow unless the connected wallet is admin.

## Phase 6: Indexing Later
- Add Mercury-backed discovery after the core frontend is solid.
- Use indexing for leaderboards, event feeds, user history, and cross-user discovery.
- Keep leaderboard surfaces out until there is a real indexed source of addresses.

## Recommended Structure
- `app/page.tsx` for the dashboard entry.
- `components/contract-overview`
- `components/account-center`
- `components/action-forms/*`
- `components/leaderboard` later, after indexing exists.
- `lib/stellar` for wallet and contract wiring.
- `lib/tx` for transaction building, signing, and result parsing.

## UI Priorities
- Make primary actions visually dominant.
- Keep read-only data compact and scannable.
- Separate advanced actions intentionally.
- Keep desktop as the primary optimization target, while staying mobile-safe.

## First Build Targets
- Contract overview
- Connected account panel
- Punch, kick, and transfer forms
- Transaction feedback
- Basic activity summary

## Deferred
- Leaderboards
- Global activity feed
- Cross-user discovery
- Any indexed search
