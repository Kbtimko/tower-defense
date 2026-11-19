# Tier-4 Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tier-4 `passiveEffect` card describes real behaviour, in the game and in the balance sim, computed by one shared pure hit resolver.

**Architecture:** A new pure module `src/systems/towerShot.js` decides what each shot targets (`shotTargets`) and what each hit does (`resolveHit` → hit records). `GameScene` and `src/sim/simulate.js` both call it and only *apply* the records. That way the sim cannot drift from the game. The tunables are new optional tier fields in `src/data/towers.js`.

**Tech Stack:** Vanilla JS ES modules, Phaser 3 (game only), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-19-t4-abilities-design.md` (read it; this plan argues from it).

## Global Constraints

- Tunables live in `src/data/` and are never literals inside logic (project CLAUDE.md).
- `towerShot.js` is pure: no Phaser import, it never mutates enemies, and it reads slowed and boss state only through the accessors passed in.
- "Boss" means `DEATH_CLASS[type] === 'boss'` (`src/data/fx.js`). Never use a `'titan'` literal.
- Hit-record field names are exactly `{ enemy, amount, isAoe, hitMult, slow, stun, chainFrom }`. Never name the field `damageMult`, which is the sim's global scalar.
- Callers apply the records in order and skip any record whose `enemy.dead` is already true. Statuses (`slow`, `stun`) are applied only if the enemy survived that record's damage.
- `hitMult` is applied **after armour**: in the game through `Enemy.takeDamage`'s new `hitMult` opt (multiplied into `vulnerableMult`), in the sim as `computeDamage({ vulnerableMult: rec.hitMult })`.
- Below tier 4, every hit stays identical to today's behaviour.
- Stage explicit paths only (never `git add -A`). Use Conventional Commits, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never pipe vitest through `tail`/`head`/`grep` when gating a commit; check the exit code.
- Tests that import `GameScene` must `vi.mock('phaser', …)` (copy the header of `src/scenes/GameScene.towerFacing.test.js`).

## Review Focus

1. **Overkill inside one hit.** If the main splash kills an enemy, its later bomblet or chain records must be skipped, with no second kill reward and no negative-HP re-kill. Tests: Task 3 "skips records for an enemy killed earlier in the same hit" and Task 4 "a bomblet on an already-killed enemy pays no second reward".
2. **The pool leaks tier-4 fields into a lower-tier projectile.** A recycled Artillery projectile reused for a T1 cannon must not carry `cluster`. Test: Task 2 "reset clears chain/cluster/slowedMult/bossStun to defaults".
3. **A Volley with an empty in-range list beyond the primary** still fires 2 arrows at the primary, with one cooldown and one SFX. Test: Task 3 "Volley with one enemy fires two projectiles at it, one cooldown".
4. **A stunned enemy in the sim** neither moves nor deals or takes blocker melee, exactly like `GameScene._updateEnemies:929`, which `continue`s before the blocker lookup. Test: Task 4 "a stunned enemy holds position and trades no melee".
5. **Projectile modifiers stay intact.** `Tower` applies `_damageMult`/`_rangeMult` (meta upgrades) to damage. The resolver must scale from `proj.damage`, which is already modified, never from `TOWER_DEFS`. Test: Task 3 "chain falloff scales from the tower's modified damage".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/systems/towerShot.js` (new) | Pure: `T4_EFFECT_KEYS`, `isBossType`, `shotTargets`, `resolveHit` |
| `src/systems/towerShot.test.js` (new) | Resolver unit tests |
| `src/data/towers.js` | New tier fields, `TOWER_SLOW_DURATION`, text edits |
| `src/data/towers.test.js` | The splash+slow invariant and the tier-4 field shapes |
| `src/entities/Tower.js` | Constructor defaults; `upgrade` copies `T4_EFFECT_KEYS` |
| `src/entities/Projectile.js` | `reset` carries the new fields |
| `src/entities/Enemy.js` | `takeDamage` opt `hitMult` |
| `src/scenes/GameScene.js` | Multi-shot fire; resolver-driven hit; chain bolts |
| `src/scenes/GameScene.t4Abilities.test.js` (new) | Scene wiring tests |
| `src/sim/simulate.js` | Same wiring plus enemy stun |
| `src/sim/t4Abilities.test.js` (new) | Sim wiring tests |
| `src/sim/t4SweepReport.js` (+test) | The caveat text now says the abilities are modelled |

---

### Task 1: Pure hit resolver

**Files:**
- Create: `src/systems/towerShot.js`, `src/systems/towerShot.test.js`

**Interfaces:**
- Consumes: `DEATH_CLASS` from `src/data/fx.js`.
- Produces:
  - `export const T4_EFFECT_KEYS = ['shots', 'chain', 'cluster', 'slowedMult', 'bossStun']`
  - `export function isBossType(type: string): boolean`
  - `export function shotTargets(shots: number, primary: Enemy, inRange: Enemy[]): Enemy[]`, of length `max(1, shots)`. Element 0 is `primary`. Further elements are the distinct non-primary enemies in `inRange`, ordered by `waypointIndex` descending (ties keep array order), padded with `primary` when there are not enough.
  - `export function clusterPoints({ targetX, targetY, cluster }): {x, y}[]`: `cluster.shells` points at `spread` px, angles `2πi/shells` from 0.
  - `export function resolveHit(proj, enemies, { isSlowed, isBoss }): HitRecord[]`. `proj` has `{ target, targetX, targetY, damage, splashRadius, slowFactor, chain, cluster, slowedMult, bossStun, slowDuration }`. `HitRecord` is `{ enemy, amount, isAoe, hitMult, slow: {duration, factor}|null, stun: {duration}|null, chainFrom: Enemy|null }`.

**Algorithm (`resolveHit`)**, all filters skip `e.dead`:
1. Main: if `splashRadius > 0`, every live enemy within `splashRadius` (inclusive, `Math.hypot`) of `(targetX, targetY)` gets `isAoe: true, amount: damage`. Otherwise, if `target` is live, it gets `isAoe: false, amount: damage`. Otherwise return `[]`: a fizzle, with no chain and no cluster.
2. Chain (only when `chain` and the main step was single-target): `prev = target`, `amt = damage`. While the number of links is below `chain.targets`, pick the nearest live, not-yet-hit enemy within `chain.jumpRadius` (inclusive) of `prev`, set `amt *= chain.falloff`, push `{ amount: amt, isAoe: false, chainFrom: prev }`, and set `prev =` that enemy. Stop when there is no candidate.
3. Cluster (only when `cluster`): for each point of `clusterPoints(proj)`, every live enemy within `cluster.radius` of it gets `{ amount: damage * cluster.damageFrac, isAoe: true }`.
4. Every record gets:
   - `hitMult = (slowedMult > 1 && isSlowed(e)) ? slowedMult : 1`;
   - `slow = slowFactor > 0 ? { duration: proj.slowDuration, factor: slowFactor } : null`;
   - `stun = (bossStun > 0 && isBoss(e)) ? { duration: bossStun } : null`;
   - `chainFrom ?? null`.

- [ ] **Step 1: Write the failing tests** in `src/systems/towerShot.test.js`. Use plain `{x, y, waypointIndex, dead:false, def:{type}}` enemies, `isSlowed = e => !!e.slowed` and `isBoss = e => isBossType(e.def.type)`. Name these tests:
  - `isBossType`: `'titan'` gives true; `'drone'` and `'colossus'` give false.
  - `shotTargets`:
    - `(1, p, [p, a])` gives `[p]`;
    - `(2, p, [p])` gives `[p, p]`;
    - `(2, p, [])` gives `[p, p]`;
    - `(2, p, [a(wp 3), p, b(wp 7)])` gives `[p, b]`;
    - `(3, p, [a(wp5), b(wp5)])` gives `[p, a, b]`.
  - Single target: exactly 1 record, `{amount: damage, isAoe:false, hitMult:1, slow:null, stun:null, chainFrom:null}`.
  - A dead target with no splash gives `[]`, even with `chain` set.
  - Splash: enemies at distance `r` (inclusive) and `r-1` are hit, one at `r+1` is not, and a dead one inside is not. All are `isAoe:true`.
  - Splash+slow: every record gets `slow: {duration: 2, factor: 0.7}` (proj.slowDuration 2, slowFactor 0.7).
  - Chain `{targets:3, jumpRadius:70, falloff:0.75}` from damage 120:
    - the amounts are `[120, 90, 67.5]`;
    - each `chainFrom` is the previous link;
    - a neighbour at exactly 70 px is taken and one at 71 is not;
    - a link never repeats an enemy, even when two enemies are mutually nearest;
    - with no neighbours you get 1 record;
    - the nearest wins over an array-earlier farther one.
  - `clusterPoints` gives three points 40 px out at 0°/120°/240° (to 1e-9).
  - Cluster `{shells:3, spread:40, radius:35, damageFrac:0.4}` at (100,100), damage 150:
    - an enemy at (140,100) gets the main splash record (150) plus the bomblet-0 record (60);
    - with zero enemies you get `[]`.
  - Shatter: with `slowedMult: 2`, a slowed enemy gets `hitMult 2` and an unslowed one gets `1`. `slowedMult: 1` always gives `1`.
  - Boss stun: `bossStun: 1` gives a titan `stun {duration:1}`, and a drone gets `null`.
  - Purity: `resolveHit` leaves its inputs unchanged (deep-equal snapshot before and after).
- [ ] **Step 2: Run** `npx vitest run src/systems/towerShot.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/systems/towerShot.js` per the Interfaces and Algorithm above. Add a short header comment saying why it exists: one hit implementation shared by the game and the sim.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(towers): pure tier-4 hit resolver (#75)` with the two files.

---

### Task 2: Data, entity plumbing

**Files:**
- Modify: `src/data/towers.js` (tier4 blocks lines ~19-56; add the `TOWER_SLOW_DURATION` export)
- Modify: `src/data/towers.test.js`
- Modify: `src/entities/Tower.js` (constructor ~17-27, `upgrade` ~105-119)
- Modify: `src/entities/Projectile.js` (`reset` ~25-40)
- Modify: `src/entities/Enemy.js` (`takeDamage` ~136-147)
- Test: `src/entities/Tower.test.js`, `src/entities/Projectile.test.js`, `src/entities/Enemy.test.js`

**Interfaces:**
- Consumes: `T4_EFFECT_KEYS` (Task 1).
- Produces:
  - `TOWER_SLOW_DURATION = 2` (seconds), exported from `src/data/towers.js`.
  - Tower instance fields `shots` (default 1), `chain` (null), `cluster` (null), `slowedMult` (1) and `bossStun` (0).
  - Projectile fields of the same names with the same defaults, plus `slowDuration` (default `TOWER_SLOW_DURATION`).
  - `Enemy.takeDamage(amount, { pierce, source, isAoe, hitMult = 1 })`.

The exact data values come from the spec:

```js
archer.tier4A: add shots: 2
archer.tier4B: add pierce: true
mage.tier4A:   add chain: { targets: 3, jumpRadius: 70, falloff: 0.75 }
mage.tier4B:   add slow: 0.7
cannon.tier4A: add cluster: { shells: 3, spread: 40, radius: 35, damageFrac: 0.4 }
cannon.tier4B: fireRate 1.2 → 1.35, add splashRadius: 0, passiveEffect: '3x fire rate, single target'
ice.tier4B:    add slowedMult: 2, passiveEffect: 'Slowed enemies take 2x damage'
sniper.tier4A: add bossStun: 1
```

- [ ] **Step 1: Write the failing tests.**
  - `towers.test.js` — "splash+slow is tier-4 only": walk each tower's stats accumulating tier1→2→3 (base, then each tier block overriding). For every accumulated T1–T3 state, assert `!(splashRadius > 0 && slow > 0)`. Derive the tower list from `TOWER_DEFS`. Add a vacuity guard: at least 5 towers walked.
  - `towers.test.js` — "tier-4 effect fields": `archer.tier4A.shots === 2`, `mage.tier4A.chain.targets === 3`, `cannon.tier4A.cluster.shells === 3`, `ice.tier4B.slowedMult === 2`, `sniper.tier4A.bossStun === 1`, `cannon.tier4B.fireRate / cannon.fireRate` within 0.01 of 3, `cannon.tier4B.splashRadius === 0`, `archer.tier4B.pierce === true`, `mage.tier4B.slow === 0.7`.
  - `Tower.test.js` — "upgrade copies tier-4 effect fields":
    - a new archer has `shots 1, chain null, cluster null, slowedMult 1, bossStun 0`;
    - after `upgrade(4,'A')`, `shots === 2`;
    - a mage after `upgrade(4,'A')` has a `chain` deep-equal to the data;
    - a mage after `upgrade(4,'B')` has `chain` still `null`.
  - `Projectile.test.js` — "reset clears chain/cluster/slowedMult/bossStun to defaults": `reset` with `cluster:{…}, slowedMult:2, bossStun:1, chain:{…}`, then `reset` without them; all are back to the defaults.
  - `Enemy.test.js` — "hitMult multiplies after armour":
    - enemy armor 5, `takeDamage(25, { hitMult: 2 })` gives hp loss `floor((25-5)*mult*2)`, where `mult` is the weakness multiplier for the source used (pass no source, so mult 1, which gives a loss of 40);
    - stacked with an active `vulnerable` 1.5, the loss is 60.
- [ ] **Step 2: Run** `npx vitest run src/data/towers.test.js src/entities/Tower.test.js src/entities/Projectile.test.js src/entities/Enemy.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Apply the data edits. In the constructor, `Tower` sets the defaults, and `upgrade` loops `for (const k of T4_EFFECT_KEYS) if (tierDef[k] !== undefined) this[k] = tierDef[k];`. `Projectile.reset` destructures `chain = null, cluster = null, slowedMult = 1, bossStun = 0, slowDuration = TOWER_SLOW_DURATION` and assigns them. `Enemy.takeDamage` reads `optsObj.hitMult ?? 1` and passes `vulnerableMult: vulnMult * hitMult`.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run src/data`. Expected: PASS, and the "tier damage ladder" is still green.
- [ ] **Step 5: Commit** `feat(towers): tier-4 effect data and entity plumbing (#75)`.

---

### Task 3: Game wiring

**Files:**
- Modify: `src/scenes/GameScene.js`:
  - `_updateTowers` (~1338-1375)
  - `_onProjectileHit` (~1402-1416)
  - `_updateParticles`/`_drawParticles` (~1448, ~2364)
  - the `particles` init (~297)
- Create: `src/scenes/GameScene.t4Abilities.test.js`

**Interfaces:**
- Consumes:
  - `shotTargets`, `resolveHit`, `clusterPoints` and `isBossType` (Task 1);
  - `TOWER_SLOW_DURATION` (Task 2);
  - the Tower/Projectile fields (Task 2);
  - `Enemy.takeDamage` `hitMult` and `Enemy.applyStatus({type, duration, factor})`.
- Produces: `this.bolts`, an array of `{ x1, y1, x2, y2, color, life, maxLife }`. Each bolt lives 0.15 s of game `dt`, is drawn as a `gfx.lineBetween` with alpha `life/maxLife`, and uses colour `PROJ_COLORS[towerType]`.

Behaviour:
- In `_updateTowers`, after choosing `best`, build `inRange` (every enemy within range, which the loop already scans; collect them) and `for (const t of shotTargets(tower.shots ?? 1, best, inRange))`. Acquire one projectile per target with today's fields plus `chain, cluster, slowedMult, bossStun` (from the tower) and `slowDuration: TOWER_SLOW_DURATION`. The SFX, muzzle flash, cooldown, facing and attack state happen **once** per trigger, as today.
- `_onProjectileHit`:
  - Keep `spawnImpact` at the target.
  - Run `resolveHit(proj, this.enemies, { isSlowed: e => e.statusEffects.slow.active, isBoss: e => isBossType(e.def.type) })`.
  - For each record: skip it if `rec.enemy.dead`. Otherwise call `this._dealDamage(rec.enemy, rec.amount, proj.pierce, { source, isAoe: rec.isAoe, hitMult: rec.hitMult })`. If it is still alive, apply `rec.slow` (`applyStatus({type:'slow', ...rec.slow})`) and `rec.stun` (`applyStatus({type:'stun', ...rec.stun})`). If `rec.chainFrom`, push a bolt from `chainFrom` to `enemy`.
  - When `proj.cluster`, call `spawnImpact(proj.fx.impact, pt.x, pt.y)` for each `clusterPoints(proj)` point.
  - Keep today's particle calls: the orange splash particle when `splashRadius > 0`, otherwise the coloured particle when the target was hit.
- `_dealDamage(enemy, damage, pierce, opts)` already spreads `opts` into `takeDamage`, so `hitMult` passes through untouched. Verify that; don't change the signature.

- [ ] **Step 1: Write the failing tests** in `GameScene.t4Abilities.test.js`. Use the `prototype.call` pattern from `GameScene.towerFacing.test.js`. Enemies are fakes with `x, y, waypointIndex, dead, def:{type, color, radius}, statusEffects:{slow:{active}}`, a `takeDamage` spy that reduces `hp` and sets `dead` at ≤0, and an `applyStatus` spy.
  - "Volley fires two projectiles per trigger at distinct targets": two enemies in range, so `projectiles.length === 2` with targets `[best, other]`. Both carry the tower's damage. The SFX `playSfx` is called once and `cooldown === 1/fireRate`.
  - "Volley with one enemy fires two projectiles at it, one cooldown".
  - "a non-Volley tower still fires exactly one projectile".
  - "Frost splash slows every survivor, not the killed": a splash proj with `slowFactor 0.7` hits enemies A (hp 1000) and B (hp 1). A gets `applyStatus({type:'slow', duration:2, factor:0.7})`; B does not.
  - "Shatter passes hitMult 2 to an already-slowed enemy": `takeDamage` gets called with opts containing `hitMult: 2`.
  - "Archmage chain damages three and pushes two bolts": the amounts passed are `120, 90, 67.5`, and `bolts.length === 2`.
  - "chain falloff scales from the tower's modified damage": `proj.damage 132` gives a second link of `99`.
  - "skips records for an enemy killed earlier in the same hit": a cluster proj on an enemy with hp 1. `takeDamage` is called once on it and `kills` increments once.
  - "Artillery spawns an impact at each cluster point": `spawnImpact` is called 1 + 3 times.
  - "Assassin stuns a titan, not a drone".
  - "bolts fade out": `_updateParticles(0.2)` empties `bolts`.
- [ ] **Step 2: Run** `npx vitest run src/scenes/GameScene.t4Abilities.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the behaviour above.
- [ ] **Step 4: Run** `npx vitest run src/scenes src/systems src/entities`. Expected: PASS. Existing scene tests (towerFacing, towerFx, hitStop, …) are green. If one breaks because its fake tower lacks `shots`, default with `?? 1` in the scene rather than editing the old fakes.
- [ ] **Step 5: Commit** `feat(towers): game applies tier-4 abilities via the shared resolver (#75)`.

---

### Task 4: Sim wiring and stun

**Files:**
- Modify: `src/sim/simulate.js`:
  - the enemy spawn (~171-181): add `stun: { active: false, timer: 0 }`;
  - the enemy loop (~330-336);
  - the upgrade (~221-236);
  - the fire (~385-405);
  - the hit (~408-428).
- Modify: `src/sim/t4SweepReport.js` (caveat lines ~31-33) and `src/sim/t4SweepReport.test.js` (~47-51)
- Create: `src/sim/t4Abilities.test.js`

**Interfaces:**
- Consumes: `T4_EFFECT_KEYS`, `shotTargets`, `resolveHit`, `isBossType` (Task 1); `TOWER_SLOW_DURATION` (Task 2).
- Produces: nothing new. `simulateMap`'s signature and return shape are unchanged.

Behaviour:
- The upgrade copies `T4_EFFECT_KEYS` like `Tower.upgrade`. A bought tower initialises `shots 1, chain null, cluster null, slowedMult 1, bossStun 0` (find where sim towers are created, `~line 87`).
- Enemy loop: tick `e.stun` like `e.slow`. Then, **before** the blocker lookup, `if (e.stun.active) continue;`, mirroring `GameScene._updateEnemies:929`, so a stunned enemy neither moves nor trades melee.
- Fire: same as Task 3, one projectile per `shotTargets` entry, carrying the new fields plus `slowDuration`.
- Hit: replace the `hits` filter with `resolveHit(p, enemies, { isSlowed: e => e.slow.active, isBoss: e => isBossType(e.def.type) })`.
  - For each record, skip it if `rec.enemy.dead`.
  - Otherwise `e.hp -= computeDamage({ amount: rec.amount * damageMult, armor, pierce: p.pierce, source, enemyType, vulnerableMult: rec.hitMult })`.
  - On a kill, use today's kill branch.
  - On a survivor, `if (rec.slow) e.slow = { active: true, timer: rec.slow.duration, factor: rec.slow.factor }` and `if (rec.stun) e.stun = { active: true, timer: rec.stun.duration }`.
  - Projectiles need `targetX/targetY`, which they already carry.
- `t4SweepReport.js` caveat: replace the three `Caveat (#75)` lines with one: `'Tier-4 abilities (#75) are modelled: 2 arrows, chain, split shells, 2x vs slowed, boss stun, splash slow.'`. Update the test to match `/#75/` and `/modelled/`.

- [ ] **Step 1: Write the failing tests** in `src/sim/t4Abilities.test.js`. Use `simulateMap` with a tiny fixture map, or follow the fixture pattern in `src/sim/simulate.test.js` (read it first).
  - "a stunned enemy holds position and trades no melee": do not refactor the loop. Test end to end: a sniper taken to 4A against a titan wave ends with strictly more `livesRemaining`, or strictly fewer `leaked`, than the same run with `TOWER_DEFS.sniper.tier4A.bossStun = 0`. Monkeypatch it inside the test and restore it in `afterEach`. Prove this test fails with the stun `continue` deleted.
  - "frost mage splash slows in the sim": a mage 4B build vs a drone pack leaks fewer enemies or kills more than the same build with `slow` removed from `tier4B` (monkeypatch + restore).
  - "a bomblet on an already-killed enemy pays no second reward": one cannon 4A, a single drone that dies to the main splash, so `kills === 1` and the gold delta equals one reward.
  - "below tier 4 is unchanged" is a characterization test written and run green **before** any Task 4 code change. Run `simulateMap` on maps 0, 4 and 8 with the default plan and `map: { ...map, maxTierAllowed: 3 }` (which caps every upgrade at tier 3), and pin `{ wavesSurvived, livesRemaining, kills, leaked, goldFinal }` with `toMatchInlineSnapshot()`. After the implementation it must pass unchanged.
- [ ] **Step 2: Run** `npx vitest run src/sim/t4Abilities.test.js src/sim/t4SweepReport.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the behaviour above.
- [ ] **Step 4: Run** `npx vitest run src/sim`. Expected: PASS.
  - If `waveTiming.test.js` (`legacyGolden.json`) fails, inspect which keys changed. The legitimate cause is a run reaching tier 4. In that case re-capture with `node scripts/captureSimGolden.mjs`, and in the commit body say which map:strategy keys moved and why.
  - If any key changes for a run that never reaches tier 4, that is a bug, so stop and report it.
- [ ] **Step 5: Run the whole suite** with `npm test`. Expected: exit 0. Record the test count.
- [ ] **Step 6: Commit** `feat(sim): model tier-4 abilities and boss stun (#75)`, plus the golden fixture only if it was re-captured.

---

### Task 5 (controller, not a subagent): balance runs and live verification

- [ ] Run `npm run balance > after.txt` and `npm run balance -- --t4 > t4-after.txt`. Diff them against the scratchpad baselines `balance-before.txt` and `balance-t4-before.txt`. Summarise per tower and branch for the PR, and log as follow-up backlog items any branch where 4A/4B beats T3 by more than 2x the multiplier gap, or where something got weaker.
- [ ] `npm run build && npm run preview`. Then run the frozen-frame probe from the spec's Verification section, on the capture build with every tier-4 branch placed, and check for 0 console errors.
