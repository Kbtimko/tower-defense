# Frost Mage damage (backlog #72) — short design

## Intent
The user asked (2026-11-16, during roadmap 4.2): "make sure theres a clear distinction for each level. that each upgrade has more poewr than the level below". The 4.2 tier check found one tier that breaks this. Frost Mage (mage tier 4B) deals less single-target damage per second than the Sorcery tier (T3) it upgrades from. The user's pick: "Raise it, separate PR (Recommended)". That means damage 60 → 85, then a re-run of the balance sim.

## Numbers
Single-target DPS = damage × fireRate. Mage fireRate 0.6 at every tier.

| Tier | Damage | DPS |
|---|---|---|
| T3 Sorcery | 80 | 48 |
| 4A Archmage | 120 | 72 (+ chain to 3) |
| 4B Frost Mage, now | 60 | 36 (+ AoE 60, 30% slow) |
| 4B Frost Mage, new | **85** | **51** (+ AoE 60, 30% slow) |

4B stays below 4A on single target, because its value is the AoE and slow. It now sits above T3.

## Goals
- `src/data/towers.js` mage `tier4B.damage` 85.
- A data test that pins the user's rule for every attacking tower: single-target DPS rises T1 < T2 < T3 < 4A and T3 < 4B. The tower list is derived from `TOWER_DEFS` (barracks deals no tower damage and is excluded, because its stats sit on soldiers). Stats are folded with `towerSpecAt` (`src/sim/matchupValue.js`), the same fold the sim uses.

## Non-goals
- Teaching the sim the 4B branch.
- Any other tower's numbers.
- The Frost Mage slow mechanics.

## Finding that shapes "re-run the sim"
The balance sim always takes branch A at tier 4 (`src/sim/simulate.js:38-40`, `t.branch = 'A'`). A 4B damage change therefore cannot move any sim number. Re-running the sim proves the report and the legacy golden are byte-identical before and after. That is the expected result, not a missed effect. Modelling branch B in the sim is a separate, larger item.

## Approaches
- **A (picked): data change plus a monotonic-DPS test.** The smallest change that does what the user asked. The test guards every tower against the same regression.
- B: also model branch B in the sim, so the re-run shows deltas. Rejected: scope creep, and it would change every map's numbers.
- C: lower 4A instead. Rejected: the user picked raising 4B.

## Verification
- RED: the new test fails on mage 4B (36 < 48) and passes for every other tower.
- Full suite green.
- `npm run balance` output is identical before and after (diffed).
- Live: on the capture build, a placed mage at 4B reports damage 85 from the real tower object.
