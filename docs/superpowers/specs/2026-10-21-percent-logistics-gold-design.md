# Percent-based logistics starting gold (backlog #31)

## Intent

Two Logistics meta-upgrades, **Supply Cache** (2 stars) and **Deep Reserves**
(3 stars, requires Supply Cache), grant a flat **+40 / +80 = +120** starting
gold (`src/systems/UpgradeManager.js:96-97`). A flat amount is worth more on a
small map than a large one: **+67% on map 3 (180g) but +40% on map 9 (300g)**.
The five stars are affordable right when a player reaches map 3, so the
upgrade flattens the difficulty curve that backlog #16 / PR #78 made monotonic.
Under the best-of-5 balance headline, maps 3/4/5 keep 89% / 100% / 100% of
their lives with the bonus, so two of three never lose one.

**Fix the shape, not the maps:** make the bonus a percentage of each map's own
`startGold`, so it is the same relative size on every map.

## Decisions (made by the user, 2026-10-21)

- **Shape:** percentage of the map's `startGold` (not a later star gate, not
  re-tuning maps 3-5).
- **Size:** Supply Cache **+15%**, Deep Reserves **+25%**: 40% combined. At
  40%, map 9 (300g) gets exactly the +120 it gets today, and every earlier map
  gets less. So this change removes the early-map tilt **without** touching map
  9's funding, which stays its own decision.
- **Scope:** #31 only. Map 9 under-funding and map 2 TOO EASY stay separate
  backlog items.
- Star costs (2 / 3), prerequisites and node IDs are unchanged.

## Measured (best-of-5 headline, `src/sim/strategy.js`, startGold scaled before the run)

| map | startGold | no bonus | flat +120 (today) | +40% (this change) |
|---|---|---|---|---|
| 0 | 130 | 64% | 100% | 88% |
| 1 | 130 | 55% | 100% | 75% |
| 2 | 170 | 90% | 100% | 100% |
| 3 | 180 | 61% | 89% | 78% |
| 4 | 200 | 67% | 100% | 89% |
| 5 | 210 | 80% | 100% | 100% |
| 6 | 230 | 27% | 73% | 73% |
| 7 | 240 | lose 1.05x | 67% | 67% |
| 8 | 270 | lose 1.08x | 8% | lose 1.05x |
| 9 | 300 | lose 1.36x | lose 1.16x | lose 1.16x |

Percent = share of lives kept on a win; "lose Nx" = damage multiplier needed
to win. Maps 6, 7 and 9 keep their lives-kept / multiplier. Map 8 gets +108
instead of +120 and tips from a narrow win (8% of lives) to a narrow loss
(1.05x), so it is a coin-flip map either way. The sim is noisy at this
resolution (map 4 at +20% kept 94%, at +30% kept 78%), so read these as bands.

**Not fixed, and not in scope: map 5.** It keeps 80% with no bonus, close to the
90% TOO EASY line on its own, and reached 93-100% at every bonus size swept
(+15% to +40%). That is a map-5 tuning question. Log it as a new backlog item;
do not tune it here.

## Goals

1. Each of the two nodes grants a percentage of the current map's
   `startGold`: 15% and 25%, additive (40% with both).
2. The percentages live in `src/data/upgrades.js` on the nodes themselves
   (project convention: tunables in `src/data/`, never in logic). Today the +40
   and +80 are hardcoded in `UpgradeManager`, which is the convention violation
   this replaces.
3. The node's player-facing `effect` text matches the number the game applies
   (`'+15% starting gold'`, `'+25% starting gold'`), with a test so they cannot
   drift.
4. The starting-gold arithmetic is a pure function that is unit-testable
   without Phaser.

## Non-goals

- Re-tuning any map (`src/data/maps.js` is untouched).
- Changing star costs, prerequisites, star thresholds or node IDs.
- Adding meta upgrades to the balance simulator or report.
- Any other modifier (kill gold, lives, tower cost…).

## Anti-goals

- A modifier key that silently changes meaning. `startGoldBonus` was gold; a
  fraction under the same name would let a stale caller add 0.4 gold. Rename it.
- Effect text that disagrees with the applied number.

## Design

- **Data:** the two nodes in `src/data/upgrades.js` gain `startGoldPct: 0.15`
  and `startGoldPct: 0.25`; their `effect` strings become `'+15% starting gold'`
  and `'+25% starting gold'`.
- **Modifier:** `UpgradeManager.getModifiers` replaces `startGoldBonus: 0`
  with `startGoldPct: 0`, summed over owned nodes that carry a `startGoldPct`.
  The two hardcoded `if (has('log_…'))` lines go away.
- **Pure helper:** `startingGold(baseGold, pct)` returns
  `baseGold + Math.round(baseGold * pct)`, an integer. Rounding the bonus, not
  the total, keeps the base exact. Builder's call where it lives; a named
  export beside `UpgradeManager` or a one-function module in `src/systems/`
  are both fine.
- **Call site:** `GameScene.create` (`src/scenes/GameScene.js:87`) passes
  `startingGold(map.startGold, mods.startGoldPct)` to `EconomyManager`.
- **Saves:** purchased IDs are unchanged, so existing saves keep their
  purchases and simply get the new effect. No migration.

## Edge cases the change must handle

- No logistics nodes owned → pct 0 → exactly `map.startGold`.
- Only Supply Cache → 15%; both → 40%. (Deep Reserves cannot be owned alone
  via `purchase`. A save holding it alone gets 25%.)
- Non-integer products round (130 × 0.15 = 19.5 → 20). Starting gold is
  always an integer.
- A node with no `startGoldPct` contributes nothing (all other nodes).

## Verification

- Unit tests for the helper, for `getModifiers` (defaults object with
  `startGoldPct: 0`, and 0.15 / 0.40 for one and both nodes), and for the data
  (each node's `effect` text matches its `startGoldPct`).
- Live check in the browser on the **production build**
  (`npm run build && npm run preview`): with both nodes purchased, start map 3
  and see **252** gold in the HUD (180 × 1.4); with none, **180**. With both, map
  9 shows **420**, unchanged from today's 300 + 120. The Upgrades screen shows
  the new effect text.
