# Tier-4 sweep in the balance report (backlog #74): design

## Intent
The balance sim cannot see a tier-4 mage, or any 4B:

- It always takes branch A at tier 4 (`src/sim/simulate.js:223,234`; `upgradeCost` in `src/sim/buildPolicy.js:71-76`).
- Its greedy build plan never takes a mage to tier 4. Changing mage 4A damage from 120 to 20 left `npm run balance` byte-identical.

The #72 Frost Mage change (60 → 85) therefore shipped with no balance evidence.

The user picked option 2 on 2026-11-19 ("for 74 build a sweep"). It is a report-only section that runs each tower at 4A and 4B on each map and shows how much each one helps. The headline numbers do not change.

## Goals
- `npm run balance -- --t4` adds a "Tier-4 sweep" section. The default `npm run balance` output stays byte-identical.
- Coverage: maps with `maxTierAllowed === 4` (maps 4–9), and every tower type in `TOWER_DEFS` (derived, barracks included).
- Each tower runs as an anchor at T3, 4A and 4B.
- For each map × tower × tier the report shows:
  - **win multiplier**: the tower-damage multiplier needed to win, from `findWinMultiplier`. 1 means it wins as-is; `—` means it cannot win at 8x.
  - **lives kept %**: from a 1x run.
- The report also prints that map's best-strategy baseline row, for reference.
- Reading: a 4X that does no better than T3 or the other branch at equal spend is a weak tier.

## How a sweep run works (builder's call)
- **Anchored plan:** `anchoredPlan(basePlan, { type, tier, branch })` wraps the map's best strategy plan (`bestStrategy(...).strategy` through `strategyPlan`). Each build phase it does three things:
  1. If no anchor exists yet, buy one `type` at the highest-coverage free slot (the same ranking greedy uses).
  2. Upgrade the anchor one tier at a time toward `tier` while gold allows.
  3. Hand the remaining gold to `basePlan`.
- The anchor is the first tower bought, so its spend is front-loaded and identical across T3, 4A and 4B up to tier 3.
- **The sim honours a branch:**
  - A build purchase may carry `branch: 'A'|'B'`, stored on the tower as a preference.
  - An upgrade purchase may carry `branch` too.
  - At tier 4 the sim uses `p.branch ?? t.branchPref ?? 'A'` for both the tier key and `t.branch`.
  - `upgradeCost(tower, maxTier)` reads the tower's preference the same way.
  - With no branch anywhere, behaviour is exactly today's, so `legacyGolden.json` and every sim test stay green.
- **Stopping greedy:** greedy may upgrade the anchor too. It is capped by the anchor's target tier: an anchor marked `maxTier: 3` is never taken to 4.
- **Pure module:** `src/sim/t4Sweep.js` holds `anchoredPlan` and `runT4Sweep(map, waves, { waveTiming })`, which returns rows. `scripts/balance.mjs` only formats them.

## Non-goals
- Changing default sim behaviour or the headline report.
- Modelling branch choice in the default strategy (option 3, not picked).
- Implementing the text-only tier-4 abilities (#75).

## Caveat the section prints
Most tier-4 abilities are text only (#75): chain lightning, 2 arrows, split shells, frozen 2x, ignores armour and boss stun. Mage 4B and ice 4B apply no slow, because a splash shot skips it. The sweep measures the tiers as the game plays them today.

## Approaches
- **A (picked): sim-based anchored sweep.** It runs the real sim, so splash, slow, pierce, range and soldiers count.
- B: analytic DPS-per-gold from `matchupValue`. Rejected: it cannot price splash, slow, soldiers or coverage, which is exactly where 4B options differ.
- C: flip the branch globally per run. Rejected: no run reaches a tier-4 mage, so the mage would still be invisible.

## Cost
- Each map runs 6 towers × 3 tiers = 18 anchored plans, over 6 maps.
- Each plan is one sim plus a `findWinMultiplier` search of 1–8 sims.
- Expect 1–4 minutes. It is opt-in, so the default report keeps its speed.

## Verification
- Tests:
  - The sim honours a build-purchase branch and an upgrade-purchase branch: 4B stats and `branch: 'B'`.
  - The default stays A.
  - `upgradeCost` follows the preference.
  - `anchoredPlan` buys the anchor first, stops at its tier, uses the branch, delegates leftover gold, and keeps greedy from taking a `T3` anchor to 4.
  - `runT4Sweep` row shape, with maps and towers derived.
- The default `npm run balance` output is diffed byte-identical before and after.
- Live: `npm run balance -- --t4`. The mage rows must move when mage 4B damage moves (85 vs 60), proving the sweep sees what the default report could not.
