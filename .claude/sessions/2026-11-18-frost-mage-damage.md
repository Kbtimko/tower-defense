# 2026-11-18 — backlog #72 Frost Mage damage

Branch `balance/72-frost-mage-damage` → PR into `visual/integration`.

## What the user asked
- During 4.2: "each upgrade has more poewr than the level below". The tier check found mage 4B (Frost Mage) below T3 on single target. Picked "Raise it, separate PR (Recommended)": damage 60→85, re-run the balance sim.
- After #124 merged: "there were push changes not in a pr - is a pr needed?" No. Nothing on the 4.2 branch is missing from `visual/integration`. The only unmerged delta is integration → `main` (359 commits, the G3 release, the user's call). Then: "move on to next backlog item".

## Shipped
- `src/data/towers.js`: mage `tier4B.damage` 85. Single-target DPS: T3 48 < 4B 51 < 4A 72.
- `src/data/towers.test.js` "tier damage ladder": for every attacking tower, DPS from `towerSpecAt` strictly rises T1<T2<T3<4A and T3<4B. The tower list is derived from `TOWER_DEFS` with barracks excluded, and a guard stops an empty list passing.

## Process
- Short spec and a one-task plan. One sonnet implementer, then a sonnet task review: spec PASS, quality APPROVED, 2 Minor accepted (the length guard is a deliberate tripwire; the green run covers every other tower).
- The implementer's full run broke on an empty `node_modules` in the fresh worktree. After `npm ci`: 235 files, 3918 tests green.

## Edge cases
- Barracks deals no tower damage (its stats sit on soldiers), so it is excluded via T1 damage 0. The length guard trips if a second non-attacking tower appears.
- Equal DPS between tiers fails, because the comparison is strict.
- An empty tower list cannot pass, because of the `toContain('mage')` and length guards.
- Both T4 branches are checked against T3. 4B is not required to beat 4A, since its value is AoE plus slow.

## Verification
- RED: `mage T3<4B: expected 36 to be greater than 48`. After the fix, the file passes 13/13 and the suite passes 3918/3918.
- `npm run balance` is byte-identical before and after. Mutation checks: mage 4A 120→20 is also identical, while mage T1 30→1 changes 90 lines. So the sim never reaches a tier-4 mage (backlog #74).
- Live, capture build on map 9: 4B reports damage 85, 4A 120, T3 80, all at fireRate 0.6, with 0 page errors. The same probe on an old-value build reports 60. The production build also passes.
