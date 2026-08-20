# Proposal Detail Page Review

## Scope

This review covers the proposal detail page, its state-specific panels, and the data pipelines that feed proposal status, timing, voting, quorum, and execution actions.

Relevant files:

- `apps/web/src/app/proposals/[proposalId]/page.tsx`
- `apps/web/src/app/api/proposals/[proposalId]/route.ts`
- `apps/web/src/lib/mercury.ts`
- `apps/web/src/lib/proposal-state.ts`
- `apps/web/src/components/proposal/proposal-overview.tsx`
- `apps/web/src/components/proposal/proposal-vote-panel.tsx`
- `apps/web/src/components/proposal/proposal-vote-summary.tsx`
- `apps/web/src/components/proposal/proposal-quorum-progress.tsx`
- `apps/web/src/components/proposal/proposal-queue-panel.tsx`
- `apps/web/src/components/proposal/proposal-execute-panel.tsx`
- `apps/web/src/components/proposal/proposal-outcome-callout.tsx`
- `contracts/governor/src/governor.rs`

## Findings

### 1. Quorum Progress Can Disagree With Contract Outcome

Severity: High

The UI currently treats quorum as reached only when `forVotes >= quorumVotes`.

Code reference:

- `apps/web/src/components/proposal/proposal-quorum-progress.tsx`

The contract uses different logic:

- Quorum is reached when `for_votes + abstain_votes >= quorum`.
- Success additionally requires `for_votes > against_votes`.

Code reference:

- `contracts/governor/src/governor.rs`

Impact:

The UI can say quorum is not reached while the contract has already determined the proposal succeeded.

Recommended fix:

- Change the quorum display to track participation quorum as `For + Abstain`.
- Separately show approval condition as `For > Against`.
- Avoid labeling quorum based on `For` votes alone.

### 2. Detail API Can Fall Back To The Wrong State

Severity: High

The proposal detail API falls back to `Pending` if live governor reads fail.

Code reference:

- `apps/web/src/app/api/proposals/[proposalId]/route.ts`

Mercury fallback currently extracts lifecycle `eta`, but it does not preserve lifecycle `state`.

Code reference:

- `apps/web/src/lib/mercury.ts`

Impact:

If RPC or contract reads fail, a queued, executed, expired, or canceled proposal can render as pending or route to the wrong panel.

Recommended fix:

- Parse the latest Mercury lifecycle row state.
- Map Mercury lifecycle symbols to `ProposalState` values.
- Use Mercury state as fallback instead of hardcoding `Pending`.
- Surface a small inline warning if state is fallback/indexer-derived rather than live RPC-derived.

### 3. Countdown Placement Is Inconsistent Across States

Severity: Medium

Pending and active countdowns live in `ProposalOverview`.

Code reference:

- `apps/web/src/components/proposal/proposal-overview.tsx`

Queued countdown lives in `ProposalExecutePanel`.

Code reference:

- `apps/web/src/components/proposal/proposal-execute-panel.tsx`

Impact:

Users must look in different places depending on state. In queued state, the overview can say `Ready to execute` even before ETA, while the actual countdown appears in the execute panel.

Recommended fix:

- Put the primary countdown/status in one consistent timeline area for every time-sensitive state.
- Pending: `Voting starts in ...`
- Active: `Voting ends in ...`
- Queued before ETA: `Executable in ...`
- Queued after ETA: `Ready to execute now`
- Final states: show final status timestamp, not a countdown.

### 4. Vote Panel Is Too Optimistic About Vote Eligibility

Severity: Medium

The detail page always passes `canVote={true}` for active proposals.

Code reference:

- `apps/web/src/app/proposals/[proposalId]/page.tsx`

The submit handler guards missing wallet, and the contract rejects zero voting power.

Code reference:

- `contracts/governor/src/governor.rs`

Impact:

Users can interact with vote controls even when they are not connected or have no voting power at the snapshot.

Recommended fix:

- Compute vote eligibility explicitly.
- Active proposal is not enough to enable controls.
- Require connected wallet, no existing vote, no voting-power fetch error, and `snapshotVotingPower > 0`.
- Keep the panel visible, but show an inline callout explaining why voting is unavailable.

### 5. Successful Transactions Do Not Revalidate Detail Data

Severity: Medium

Vote, queue, and execute transactions show success toasts but do not revalidate proposal detail afterward.

Code reference:

- `apps/web/src/app/proposals/[proposalId]/page.tsx`

Impact:

The panel can remain stale after success until the user manually refreshes or SWR revalidates later.

Recommended fix:

- Call `void mutate()` after successful vote, queue, and execute transactions.
- Keep manual refresh as a fallback.

### 6. Proposal Actions Are Not Visible On Detail Page

Severity: Medium

The detail page receives `targets`, `functions`, and `args`, but only uses them for queue and execute transactions.

Code reference:

- `apps/web/src/components/proposal/types.ts`
- `apps/web/src/app/proposals/[proposalId]/page.tsx`

Impact:

Users are asked to queue or execute actions without seeing exactly what will run.

Recommended fix:

- Add a read-only `Proposal actions` panel.
- Show each action with target, function, and decoded args.
- For known token actions, render friendly labels such as `Mint Governance Token` and `Batch Mint Governance Token`.

### 7. State Panels Feel Like Different Component Families

Severity: Low

The detail page uses separate components for voting, queueing, executing, and final outcomes.

Code reference:

- `apps/web/src/app/proposals/[proposalId]/page.tsx`

Impact:

Button alignment, copy tone, visual density, and status treatment change across states.

Recommended fix:

- Normalize panel anatomy:
- label
- headline
- description
- optional inline callout
- primary action button
- secondary metadata

## Per-State Review

### Pending

Current behavior:

- Overview shows voting start countdown.
- Right-side panel shows generic outcome copy.

Issues:

- Countdown is correctly placed, but the state panel is generic and less useful than it could be.

Recommended behavior:

- Keep countdown in overview.
- Show a non-actionable lifecycle panel with clear copy: `Voting has not opened yet`.

### Active

Current behavior:

- Overview shows voting end countdown.
- Vote panel shows voting power and vote controls.
- Vote summary shows quorum progress.

Issues:

- Vote controls appear even when wallet/voting power is not actionable.
- Quorum progress does not match contract quorum logic.

Recommended behavior:

- Keep countdown in overview.
- Gate vote controls based on real eligibility.
- Show participation quorum and approval condition separately.

### Succeeded

Current behavior:

- Overview says ready to queue.
- Queue panel allows queueing.

Issues:

- Proposal actions are not visible before queueing.

Recommended behavior:

- Show proposal action preview before or alongside the queue button.
- Queue panel should use same lifecycle panel anatomy as other states.

### Queued Before ETA

Current behavior:

- Overview says `Ready to execute` with ETA date.
- Execute panel contains the countdown and hides the execute button.

Issues:

- Copy is misleading.
- Countdown location differs from pending/active.

Recommended behavior:

- Overview should say `Executable in ...`.
- Execute panel should explain that execution is scheduled and disabled until ETA.

### Queued After ETA

Current behavior:

- Overview still focuses on ETA date.
- Execute panel says ready and shows execute button.

Issues:

- Readiness is split between overview and action panel.

Recommended behavior:

- Overview should say `Ready to execute now`.
- Execute panel should provide the execution action and show the already-reached ETA as supporting metadata.

### Defeated

Current behavior:

- Overview says finalized.
- Outcome callout says no further action is available.

Issues:

- Need quorum/approval summary to make the outcome understandable.

Recommended behavior:

- Keep final status copy.
- Ensure vote summary clearly explains whether quorum failed, approval failed, or both.

### Canceled

Current behavior:

- Overview says finalized.
- Outcome callout says canceled.

Issues:

- Current copy is acceptable, but should follow same lifecycle panel layout.

Recommended behavior:

- Use the normalized lifecycle panel anatomy.

### Expired

Current behavior:

- Overview says finalized.
- Outcome callout says expired.

Issues:

- Expiration timing is not very explicit.

Recommended behavior:

- Show when it expired if data is available.
- If expiration is derived from ETA plus expiration period, label it clearly.

### Executed

Current behavior:

- Overview says finalized.
- Outcome callout says already executed.

Issues:

- Execution action details are not visible.

Recommended behavior:

- Show final status plus proposal action preview.
- If indexed execution events are available, link them to the action preview.

## Recommended Implementation Plan

### 1. Centralize Lifecycle View Logic

Create a helper such as `getProposalLifecycleView(detail, now)` that returns:

- `stateLabel`
- `phaseLabel`
- `headline`
- `description`
- `primaryTimestamp`
- `countdown`
- `actionMode`
- `actionDisabledReason`
- `calloutVariant`

This helper should be the single source of truth for overview copy and state-panel copy.

### 2. Unify Countdown Placement

Move all primary countdowns into the overview timeline area.

Rules:

- Pending: voting start countdown.
- Active: voting end countdown.
- Queued before ETA: execution ETA countdown.
- Queued after ETA: ready state, no countdown.
- Final states: final timestamp or known lifecycle timestamp.

### 3. Fix Quorum Semantics

Update vote summary and quorum progress to compute:

- `participationVotes = forVotes + abstainVotes`
- `quorumReached = participationVotes >= quorumVotes`
- `approvalReached = forVotes > againstVotes`

Display both conditions explicitly.

### 4. Fix Vote Eligibility

Compute vote eligibility in the detail page and pass a richer status to `ProposalVotePanel`.

Suggested unavailable reasons:

- Connect a wallet to vote.
- Voting power is still loading.
- Voting power could not be loaded.
- No voting power at the proposal snapshot.
- You already voted.

### 5. Revalidate After Mutations

After successful vote, queue, and execute transactions, call:

```ts
void mutate();
```

This should happen after the success toast.

### 6. Add Read-Only Proposal Actions Panel

Create a detail-safe action renderer from `targets`, `functions`, and normalized `args`.

Minimum display:

- action index
- target contract
- function name
- decoded arguments

Preferred display:

- known action label for token mint and batch mint
- recipient
- amount where applicable
- raw fallback for unknown actions

### 7. Normalize Panel Anatomy

Use one consistent structure for state panels:

- state/action badge
- headline
- explanatory copy
- inline callout when blocked or final
- primary action button when available
- secondary metadata below

This will make the proposal detail page feel like one coherent lifecycle UI instead of multiple unrelated widgets.

## Verification Checklist

After implementation, verify every proposal state:

- Pending: countdown appears in overview only.
- Active: countdown appears in overview only; voting eligibility behaves correctly.
- Succeeded: queue panel appears; action preview is visible.
- Queued before ETA: overview says executable countdown; execute button disabled/hidden with clear reason.
- Queued after ETA: overview says ready now; execute button available.
- Defeated: quorum/approval summary explains why it failed.
- Canceled: final state panel uses consistent layout.
- Expired: expiration copy is clear.
- Executed: final state and action preview are visible.

Recommended commands:

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web build
```
