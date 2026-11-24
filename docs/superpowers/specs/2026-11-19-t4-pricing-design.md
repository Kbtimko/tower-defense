# Tier-4 pricing and Rapid Cannon retune (backlog #76, #77)

Follows #75, where every tier-4 card was made true in the game and the sim.

## #77: the sim's tower-value estimate counts per-target multipliers

**Why:** `src/sim/matchupValue.js` `towerDpsAgainst` prices `damage × fireRate` through
`computeDamage`. Since #75, two tier-4 effects multiply damage *against every target*:
- Volley (`shots: 2`): the extra arrow pads onto the primary when it is alone.
- Shatter (`slowedMult: 2`, with its own inherited `slow`): every hit after its first lands
  on an enemy it has already slowed.

The greedy planner under-rates both. The greedy upgrader always takes branch A, so in
practice Volley is the one that matters.

**User's call (2026-11-19):** "Approve": price the per-target multipliers only.

**Design**
- `towerSpecAt` folds `shots`, `slow` and `slowedMult` tier over tier, like damage, fireRate and pierce
  already are. Defaults: `shots: def.shots ?? 1`, `slow: def.slow ?? 0`,
  `slowedMult: def.slowedMult ?? 1`.
- `towerDpsAgainst`: per enemy type,
  `dmg × fireRate × shots × (slow > 0 && slowedMult > 1 ? slowedMult : 1) × weight`.
- **Non-goals:**
  - Splash, chain and cluster stay unpriced. They are crowd effects whose value depends on
    enemy density, as splash already is. Update the existing caveat comments
    (`matchupValue.js`, `buildPolicy.js:30`) to name chain and cluster too.
  - No branch choice in the greedy planner. The user chose a report-only sweep in #74.
- **Expected effects:**
  - The default `npm run balance` output changes. _(Measured after implementing: it did
    NOT change. No default strategy run upgrades any tower to tier 4 on maps 4–9, because
    the greedy planner widens the board first and runs out of gold. The pricing is correct
    but has nothing to act on today; it applies once the economy reaches tier 4.)_
  - `legacyGolden.json` may change. If it does, re-capture it via
    `scripts/captureSimGolden.mjs` and give the reason in the commit.
  - The #75 tiers 1–3 characterization snapshot must NOT change (at tier ≤3, shots = 1 and
    slowedMult = 1).

## #76: Rapid Cannon damage 80 → 140

**Why:** #75 made Rapid Cannon single-target (`splashRadius: 0`, `fireRate: 1.35`), and the
`--t4` sweep showed it fell behind its pre-#75 self (map 6 x1.14→x1.27, map 8 lives
58%→0%).

**User's call (2026-11-19):** "Damage 140", picked from a measured sweep of 80/110/140/splash 35.
- **Measured at 140:** map 6 x1.14, map 8 x1.00 with 50% lives, map 9 x1.27 with 10%. That
  is at or above its pre-#75 strength on every map.
- **Trade-off accepted:** 189 single-target DPS, above Rapid Fire sniper (162). It doesn't
  pierce, so armour still limits it.

**Design:** `TOWER_DEFS.cannon.tier4B.damage = 140`. The card text stays "3x fire rate,
single target". Nothing else changes.

## Verification
- Unit: Volley and Shatter DPS are priced at 2× the same spec without the multiplier. Archmage's
  chain and Artillery's cluster are not priced. The tier damage ladder stays green.
- Balance: `npm run balance` and `--t4` before and after, with diffs summarised in the PR.
- Live: a capture build with Rapid Cannon reports damage 140 on its hits, and 0 page errors.
