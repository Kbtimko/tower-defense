# 2026-11-15 — #38 a killed enemy can still cost a life

Branch `fix/38-dead-enemy-leak` → PR into `visual/integration`.

## What the user asked
- "review backlog - identify next task to work on" → recommended #38 (the one player-facing bug, AUTO, small); user: "yes".

## Root cause
- `_updateEnemies` runs before `_updateTowers`/`_updateProjectiles`, so a tower kill lands after that frame's sweep. Next frame the corpse is still in `this.enemies`, gets moved, and the leak branch ran unconditionally on reaching the last waypoint: `loseLife()` + `life-lost` SFX + HUD pulse, on top of the kill reward already paid.
- The simulator sweeps its dead before moving, so it never charged this life — the game and the balance model disagreed. Fixing the game brings it in line; `src/sim/` untouched.

## Shipped
- `GameScene._updateEnemies`: leak branch guarded on `!enemy.dead`. Corpse is still swept and keeps its death FX.
- `GameScene.hitStop.test.js`: flipped the test that pinned the bug ("deliberately unchanged"); added a live+corpse-together case (exactly one life). Both fail on the old code (sabotage run).

## Edge cases
- Live enemy reaches the base → leaked, one life (existing test, live control).
- Corpse reaches the base the same frame → no life, no SFX, no pulse, not `leaked`, swept, death FX kept.
- Live + corpse reach it together → one life.
- Corpse short of the base → unchanged (swept).
- Enemy killed by its own `update(dt)` (DOT) then reaching the base → dead, so no life.
- `_enemiesOnPath` / combat-audio-off path → unchanged (corpse still counted as removed).

## Verification
- `npm test`: 221 files, 3755 tests, exit 0. `npm run build`: exit 0.
- Live probe (capture build, real GameScene, map 0 wave 1): enemy parked 0.1 px from the base and killed via `_dealDamage` before `_updateEnemies`. Old build 25→24 lives (+5 gold); fixed 25→25 (+5 gold). Live control 25→24 on both. 0 console errors.
- First probe at 1 px was vacuous (0.83 px/frame, corpse swept short) — caught by running it against the unfixed build first.

## Hotfix
- User: "hotfix". PR #121 into `main` (branch `fix/38-dead-enemy-leak-main` off `origin/main`). Cherry-pick did not apply (main has no `leaked`/pulse), so the guard was re-done TDD-first with a new `GameScene.leak.test.js` (2 of 3 fail on old main). 109 files / 1530 tests, build exit 0.
- Live on main: DEV server (only DEV exposes `__game`), real PLAY click after skipping the intro story dialog; old 25→24, fixed 25→25, control 25→24, 0 errors. Main lacks `playwright`; the probe imported it from the integration worktree.
