# 2026-11-19 — backlog #75: tier-4 abilities do what their cards say

Branch `balance/75-t4-abilities` → PR into `visual/integration`.

## What the user asked
- "review backlog - begin working on the next item in the backlog". Picked #75, the newest open item, which follows #72–#74.
- On scope, the choices were "Make it all true", a hybrid, or "Make the text honest". The user picked **"Make it all true"**.
- The user approved the design doc as written ("approved").

## Shipped
- **`src/systems/towerShot.js`** (pure):
  - `T4_EFFECT_KEYS`;
  - `isBossType` (`DEATH_CLASS === 'boss'`);
  - `shotTargets(shots, primary, inRange)`;
  - `clusterPoints`;
  - `resolveHit(proj, enemies, { isSlowed, isBoss })`, which returns hit records.

  GameScene and `simulate.js` both apply the records the same way: they skip an enemy killed by an earlier record, apply damage, and give statuses only to survivors.
- **Data (`src/data/towers.js`):**
  - Volley: `shots: 2`.
  - Marksman: `pierce: true`.
  - Archmage: `chain {3, 70, 0.75}`.
  - Frost Mage: `slow: 0.7`.
  - Artillery: `cluster {3, 40, 35, 0.4}`.
  - Rapid Cannon: `fireRate 1.35, splashRadius 0`.
  - Shatter: `slowedMult: 2`.
  - Assassin: `bossStun: 1`.
  - Shared: `TOWER_SLOW_DURATION = 2`.
  - Card text changed only for Shatter ("Slowed enemies take 2x damage") and Rapid Cannon ("3x fire rate, single target").
- **Entities:** `Tower.upgrade` copies `T4_EFFECT_KEYS`, `Projectile.reset` clears the new fields, and `Enemy.takeDamage` takes `hitMult`, applied after armour as `vulnerableMult` is.
- **Game:** multi-shot fire, which keeps one SFX/flash/cooldown per trigger; a resolver-driven hit; chain bolts (`this.bolts`, `CHAIN_BOLT` in `src/data/fx.js`); an impact per bomblet.
- **Sim:** the same wiring, plus enemy `stun`. A stunned enemy freezes before the blocker lookup, as in `GameScene._updateEnemies`. The `t4SweepReport` caveat now says the abilities are modelled.
- **Final-review fixes:**
  - `src/systems/statusMerge.js`: a stronger slow or a longer stun wins, shared by `Enemy.applyStatus` and the sim.
  - Codex: slow now reads "Slows to N% speed", and "0 splash" is gone.

## Rulings (Claude's calls)
- `chain.targets` counts the primary: 3 targets means 3 hits.
- Volley's second arrow goes at the next-furthest enemy in range, or at the primary if it is alone. Each arrow does 60, so DPS doubles on paper; the plan was to make it true, not retune.
- Shatter's 2x reads the slow from before the hit, counts a slow from any source, and only boosts its own shots. Its own 2 s slow outlasts its 1.43 s cooldown, so in practice every hit after the first is 2x.
- Marksman's range stays 180, which is already +50% of the base archer's 120. Only pierce was added.
- Sim stun is the game's full freeze. An earlier spec draft said the blocker keeps striking; the code showed otherwise and the spec was corrected.
- **Stronger status wins** (final review): without it, the new Frost Mage AoE (0.7) would weaken Permafrost and Shatter slows, and Assassin would cut a 3 s EMP stun to 1 s. It also changes ice-on-ice stacking for T1–T3, where weaker ice no longer overwrites stronger ice; the T1–T3 sim snapshot didn't move.
- Not fixed, logged instead: the sim's greedy pricing of the abilities (#77) and the Rapid Cannon weakening (#76).

## Verification
- 4014 tests (241 files), `npm test` exit 0. `npm run build` exit 0.
- Each new test was seen red first. The prove-it-fails sabotages failed the specific test each time:
  - ice T2 splash fails the splash+slow invariant;
  - `shots` forced to 1 fails the Volley tests;
  - removing the dead-record skip fails the overkill tests (game and sim);
  - deleting the sim's stun `continue` fails the stun test.
- **Balance:**
  - The default report is byte-identical, `legacyGolden.json` is untouched, and the T1–T3 characterization snapshot is unchanged.
  - The `--t4` sweep diff is in notes.md Current Status.
- **Live:** a Playwright probe (capture build, map 8 wave 13, slots 7/13, waves re-sent for 25 s) ran on this branch and on the base build. Every branch shows its ability on this branch and its absence on the base (numbers in notes.md). There were 0 page errors, and a frozen-frame screenshot shows the magenta chain bolt.

## Found
- A pre-existing double kill reward: a splash landing on a same-frame corpse paid it again through `_dealDamage`. The resolver's dead filter fixes it. As a side effect, ice-killed corpses no longer pick up a frost tint and no longer play hit SFX or show damage numbers.
- #76: Rapid Cannon is weaker as single target.
- #77: `matchupValue` doesn't price shots, chain, cluster or the 2x.
