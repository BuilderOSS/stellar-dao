# Game Redesign Spec

## Goal
Turn the contract from a basic arena into an opt-in arena game with a coherent point economy.

## Naming
- Rename `ArenaContract` to `ArenaContract`.
- Rename the package/folder from `arena` to `arena` when we implement.
- Treat token balances as game points/power, not money.

## Design Rules
- No fractional points on-chain.
- Points only change through explicit game actions.
- Combat is hybrid: light attacks are unilateral, battles are opt-in.
- Target points can be reduced, but never below zero.
- Offensive actions should never mint points out of thin air; the reward should be capped by the points actually drained.
- Self-growth is separate from combat.
- Keep admin/token mechanics separate from gameplay.

## Core Loop
1. A player uses `charge_up` to build their own points.
2. Players use `punch` and `kick` as small, bounded light attacks.
3. Players use `battle` for opt-in PvP.
4. Groups run cooperative raids with allied signers using `joint_punch` and `heavy_kick`.
5. `transfer_points`, `approve`, and `burn` remain advanced token mechanics.
6. Admin tools stay behind the dev surface.

## Method Plan

### `charge_up(user)`
- New method.
- Requires `user` auth only.
- Mints `+1` point to `user`.
- Increments total supply.
- Increments action arenas.
- This is the main self-growth mechanic.

### `punch(from, to)`
- Only `from` signs.
- `from` gains `+1` point.
- `to` loses `-1` point, clamped at zero.
- If `to` has fewer than 1 point, `from` only gains what is actually drained.
- This is a light duel move.

### `kick(from, to)`
- Only `from` signs.
- `from` gains `+2` points.
- `to` loses `-2` points, clamped at zero.
- If `to` has fewer than 2 points, `from` only gains what is actually drained.
- This is the stronger duel move.

### `battle(attacker, defender)`
- Both players sign.
- Winner gains `+3` points.
- Loser loses `-3` points, clamped at zero.
- If the loser has fewer than 3 points, the winner only gains what is actually drained.
- Battle is the main PvP mode.

### `joint_punch(user1, user2, target)`
- Only allied signers sign.
- `user1` gains `+2` points.
- `user2` gains `+2` points.
- `target` loses `-4` points, clamped at zero.
- If `target` has fewer than 4 points, the team reward is split from the actual drained amount.
- This is a team raid move.

### `heavy_kick(user1, user2, user3, target)`
- Only allied signers sign.
- `user1`, `user2`, and `user3` each gain `+2` points.
- `target` loses `-6` points, clamped at zero.
- If `target` has fewer than 6 points, the team reward is split from the actual drained amount.
- This is the high-power raid move.

### `transfer_points(from, to, amount)`
- Keep as a pure token transfer.
- No bonus points.
- No combat semantics.

### `approve`, `burn`, `burn_from`
- Keep as advanced token mechanics.
- Not part of the main game loop.

### `reset_action_count`, `set_cooldown_duration`, `extend_my_ttl`
- Keep as admin/dev utilities.
- Hide from normal play.

## Storage Plan
- `TotalSupply`: total points minted through `charge_up` and any future admin minting.
- `GlobalCount`: rename to `TotalActions` or `ActionCount`.
- `UserStats`: track gameplay counts, ideally `charge_ups`, `punches`, `kicks`, `battles`, `raids`.
- `BattleRecord`: keep or rename to `CombatRecord`.
- `Cooldown`: keep as the short-term anti-spam mechanism.
- `Allowance`: keep for token mechanics.

## Event Plan
- Emit a clear event for every gameplay action.
- Include actor(s), target, and delta values where relevant.
- Keep token events (`mint`, `transfer`, `burn`, `approve`) separate from gameplay events.

## UI Impact
- Put `Charge Up` first in the actions flow.
- Group `Punch` and `Kick` as light attacks.
- Group `Battle` as opt-in combat.
- Group `Joint Punch` and `Heavy Kick` as raid/team actions.
- Keep `Transfer`, `Approve`, and `Burn` in an advanced economy section.
- Keep admin-only controls in dev tools.

## Migration Notes
- Regenerate bindings after contract rename.
- Update any env vars and deployed contract IDs.
- Existing test fixtures will need to be rewritten for the new point rules.

## Acceptance Criteria
- A user can increase their own points with `charge_up`.
- Combat decreases the target's points and never produces negatives.
- `battle` requires consent from both fighters.
- `punch` and `kick` work as unilateral light attacks.
- `joint_punch` and `heavy_kick` work as allied raids.
- The frontend can present the game in a way that makes the rules obvious.
- The contract name no longer implies a simple arena.

## Recommendation
- Use `ArenaContract` as the new contract name.
- Use `charge_up` as the self-growth method.
- Use hybrid combat everywhere else, with opt-in battles and bounded draining attacks.
