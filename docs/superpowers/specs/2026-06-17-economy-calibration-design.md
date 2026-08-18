# Per-Level Economy Recalibration — Design (backlog #7)

**Date:** 2026-06-17
**Status:** Approved
**Backlog item:** #7 — Calibrate per-level economy

## Problem

`startGold` plus wave rewards let the player fill every tower slot well before a
level ends. Concretely, by the end of **wave 3** the player has enough gold for
**11–13 cheap towers (Archer @ 60g)** on every map — more than the 10–20 slots
that exist. The board fills by wave 3–5, so the difficulty-scaled slot counts
(10→20, commit `e5b4271`) are never a real constraint.

Gold reaches the cheapest-full-board threshold this early because there are four
in-level income sources, all generous:

1. `startGold` (200 on map 0) — buys 3+ towers turn-1.
2. Kill reward: `round(enemy.reward × killGoldMult)`.
3. Wave-clear bonus: a hardcoded flat `earn(38)` per wave, identical on every map.
4. Early-send bonus: `floor(0.5 × Σ reward of living enemies)`.

## Goal

Make filling the board an **aspirational, late-game** goal — reachable only with
disciplined, early-send-heavy play, and never on turn 1. A casual player who also
spends gold on tier upgrades should rarely fully fill the board.

Target fill curve (cheapest possible board, Archer-only):
- **Turn-1:** affords ~2 towers (an opening defense), not 3+.
- **Wave 3:** affords ~4–5 towers, not 11–13.
- **Cheapest full board:** first affordable around **75% of the way through** the
  level (passive play); sooner with aggressive early-send. Because real players
  spend on upgrades, fully filling stays aspirational.

## Approach

Two per-map knobs, no new systems:

- **`startGold`** — retuned to a consistent "opening hand" of ~2 cheap towers
  across all maps (replaces the steep 200→80 decline).
- **`rewardMult`** — a **new per-map scalar field** in `maps.js` that uniformly
  scales all three reward-derived income sources, so each level's economy paces
  together while enemy base `reward` values stay as relative weights.

`rewardMult` defaults to `1` when a map omits it (back-compat / safety).

### What `rewardMult` scales

All scaling happens in `GameScene`, which reads `this.rewardMult = map.rewardMult ?? 1`.

| Source | Today | After |
|---|---|---|
| Kill payout (2 call sites) | `round(reward × killGoldMult)` | `round(reward × killGoldMult × rewardMult)` |
| Wave-clear bonus | hardcoded `earn(38)` | `earn(round(WAVE_CLEAR_BONUS × rewardMult))` (extract `38` → module const `WAVE_CLEAR_BONUS = 38`) |
| Early-send bonus (`_computeEarlyBonus`) | `floor(0.5 × Σreward)` | `floor(0.5 × Σreward × rewardMult)` |

`killGoldMult` (the player's upgrade/hero modifier) stays orthogonal and composes
by multiplication: `payout = reward × killGoldMult × rewardMult`. `killGoldMult`
is player-side scaling; `rewardMult` is map-side economy scaling.

## Starting calibration table

Model-derived starting values. These are **playtest-tunable** — the verify step
adjusts them for winnability vs. tightness before the PR. `startLives` is unchanged.

| map | startGold (was) | rewardMult |
|---|---|---|
| 0 | 130 (was 200) | 0.30 |
| 1 | 130 (was 160) | 0.35 |
| 2 | 130 (was 150) | 0.30 |
| 3 | 120 (was 140) | 0.30 |
| 4 | 120 (was 130) | 0.25 |
| 5 | 120 (was 120) | 0.25 |
| 6 | 110 (was 110) | 0.30 |
| 7 | 110 (was 100) | 0.25 |
| 8 | 100 (was 90)  | 0.20 |
| 9 | 100 (was 80)  | 0.20 |

Derivation: with these values, cumulative passive gold first reaches
`slots × 60` (cheapest full board) at roughly 75% of each level's wave count,
and gold by end of wave 3 affords ~4–5 cheap towers (vs. 11–13 today).

## Files touched

- `src/data/maps.js` — retune `startGold`, add `rewardMult` to all 10 maps.
- `src/scenes/GameScene.js`:
  - Add `this.rewardMult = map.rewardMult ?? 1` alongside the existing
    `this.killGoldMult` assignment.
  - Apply `rewardMult` at the two kill-payout sites and in `_computeEarlyBonus`.
  - Extract the hardcoded `38` to a module-level `WAVE_CLEAR_BONUS` const and
    scale it by `rewardMult` at the wave-clear `earn` call.
- Tests:
  - `src/data/maps.test.js` — assert every map has a numeric `rewardMult` within
    a sane range (e.g. `0 < rewardMult <= 1`).
  - `src/scenes/GameScene.startWave.test.js` — update early-send-bonus expectations
    to account for `rewardMult` (set `scene.rewardMult` in the test setup).
  - Add coverage that kill payout and early-send bonus honor `rewardMult`.

## Out of scope

- Enemy base `reward` values (kept as relative weights).
- Meta-progression star economy (between-level upgrades).
- Wave composition / counts (`MAP_WAVES`).
- Tower costs (`towers.js`).
- `startLives`.

## Testing strategy

- Unit: data-shape validation for `rewardMult`; payout math at the three sites.
- Browser verify: play the early waves of map 0 and a hard map (e.g. map 8/9),
  confirm the board cannot be filled by wave 3 and that levels remain winnable.
  Adjust the calibration table if a map is unwinnable or trivially fillable.
