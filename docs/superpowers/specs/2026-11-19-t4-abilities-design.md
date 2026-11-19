# Tier-4 abilities do what their cards say (backlog #75)

## Intent

Each tier-4 branch shows the player a promise (`passiveEffect`) on the branch card, the
codex and the inspect panel. Most of those promises are not implemented: towers fire with
damage, range, fireRate, splashRadius, pierce and slow only. The user's call (2026-11-19):
**"Make it all true"**. Every branch does what its card says, in the game and in the
balance sim. This follows the user's 4.2 goal: "each upgrade has more power than the level
below".

## Today vs target

| Branch | Card | Today | Target |
|---|---|---|---|
| Archer 4A Volley | 2 arrows per shot | 1 arrow | 2 projectiles per shot |
| Archer 4B Marksman | +50% range, armour piercing | range 180 (= base 120 +50% ✅), no pierce | add `pierce: true` |
| Mage 4A Archmage | chain lightning to 3 targets | single target | primary hit + 2 chain jumps |
| Mage 4B Frost Mage | AoE frost, 30% slow | splash, **no slow** | `slow: 0.7`; splash applies slow |
| Cannon 4A Artillery | splits into 3 shells on impact | one splash | main splash + 3 bomblets |
| Cannon 4B Rapid Cannon | 3x fire rate, direct damage | 2.67x (1.2 vs 0.45), still splash 65 | `fireRate: 1.35`, `splashRadius: 0` |
| Ice 4A Permafrost | slows to 15% | ✅ | unchanged |
| Ice 4B Shatter | frozen enemies take 2x | splash, **slow lost entirely** (bug) | splash applies slow; 2x vs slowed |
| Sniper 4A Assassin | ignores armour, stuns boss 1s | pierce ✅ (inherited); no stun | stun bosses 1s on hit |
| Sniper 4B Rapid Fire | 3x fire rate | ✅ (0.9 vs 0.3) | unchanged |
| Barracks 4A/4B | soldier text | ✅ (soldierStats) | unchanged |

**Root-cause bug:** `GameScene._onProjectileHit` (and `simulate.js:424`, which copies it)
applies `slowFactor` only on the single-target path. Any tower with both splash and slow
loses its slow. After this change, slow applies to every enemy a hit damages and does not kill.

## Goals

- Every `passiveEffect` describes real behaviour.
- The game and `src/sim/` compute the same hits from **one pure resolver**, so the balance
  sim cannot drift from the game (the project's standing rule; see `src/systems/damage.js`).
- The tunables live in `src/data/towers.js` tier blocks, never as literals in the logic.
- Run `npm run balance -- --t4` before and after, and put both in the PR.

## Non-goals

- **Balance retuning.** Damage numbers stay as they are, except Rapid Cannon's fireRate,
  which goes to an exact 3x. If the sweep shows a branch is now absurd, it gets logged as a
  follow-up item, not tuned here.
- New art or SFX. Reuse existing impact and particle FX. The one new visual is a
  chain-lightning line.
- Hero abilities and tower `ability` (active Q-style) entries: they are a separate system.

## Anti-goals

- A second copy of hit arithmetic in the sim. That is exactly how the sim drifted before.
- A change to non-tier-4 behaviour, other than the splash-slow fix. Today no tower below
  tier 4 has both splash and slow, so the fix only reaches Frost Mage and Shatter. A test
  pins that fact.

## Approaches

1. **One pure hit resolver (chosen).** A new `src/systems/towerShot.js` with
   - `shotTargets(spec, primary, enemiesInRange)`, which picks the targets of each projectile
     a tower fires on a trigger (Volley gives 2);
   - `resolveHit(proj, enemies, { isSlowed, isBoss })`, which returns a list of hit records
     `{ enemy, amount, isAoe, hitMult, slow?, stun?, chainFrom? }`.

   GameScene applies each record through `_dealDamage` + `applyStatus`. The sim applies the
   same records through `computeDamage`.
   - Pro: the sim and the game share one implementation. The resolver is unit-testable
     without Phaser.
   - Con: both call sites need refactoring.
2. **Implement in GameScene, mirror in the sim.** Fastest, but it duplicates the logic that
   the existing comments warn against.
3. **Effects as per-branch strategy objects on Tower.** Over-engineered for eight abilities,
   and the sim has no Tower class.

## Design

### Data (`src/data/towers.js`)

The new optional tier fields, which `Tower.upgrade` and the sim's upgrade both copy onto the tower:

```js
archer.tier4A: { ..., shots: 2 }
archer.tier4B: { ..., pierce: true }
mage.tier4A:   { ..., chain: { targets: 3, jumpRadius: 70, falloff: 0.75 } }
mage.tier4B:   { ..., slow: 0.7 }
cannon.tier4A: { ..., cluster: { shells: 3, spread: 40, radius: 35, damageFrac: 0.4 } }
cannon.tier4B: { ..., fireRate: 1.35, splashRadius: 0 }
ice.tier4B:    { ..., slowedMult: 2 }          // slow inherited from T3 (0.2)
sniper.tier4A: { ..., bossStun: 1 }            // seconds
```

`passiveEffect` text changes only where the wording is ambiguous:
- Shatter: "Slowed enemies take 2x damage". "Frozen" read as a separate status.
- Rapid Cannon: "3x fire rate, single target".

Everything else stays word for word.

### Behaviour, per ability (calls made by Claude; the user handed over these details)

- **Shots (Volley):** on a trigger, the tower fires `shots` projectiles. The first goes at
  today's target (the furthest-along enemy in range). Each further shot goes at the
  next-furthest distinct enemy in range. With fewer enemies than shots, the extra shots go
  at the primary target. All shots share the one cooldown.
- **Chain (Archmage):** the projectile's hit damages the primary (if alive), then jumps
  instantly to the nearest not-yet-hit living enemy within `jumpRadius` **of the previous
  link**, up to `targets` total. Each jump's amount = previous × `falloff` (120 → 90 → 67.5;
  `computeDamage` floors after armour). It stops early when no candidate is left. A chain
  never starts from a dead primary: that projectile fizzles, as single-target shots do today.
- **Slow on splash (Frost Mage, Shatter, and generally):** every enemy a hit damages and
  that survives gets `slow { duration: 2, factor: slowFactor }`, which is today's
  single-target rule, extended.
- **Cluster (Artillery):** after the main splash, `shells` bomblets land at
  `spread` px from the impact point, at angles `i × 360°/shells`, starting at 0°. Each deals
  `damage × damageFrac` to enemies within `radius`. Each bomblet hit is `isAoe`. One enemy
  can be hit by the main splash and by several bomblets, which is intended.
- **Shatter's 2x:** a hit from a tower with `slowedMult` deals `× slowedMult` to an enemy
  that is **already slowed when the hit lands**. The check happens before this hit applies
  its own slow, so a fresh enemy takes 1x on the first hit and 2x on the next. A slow from
  any source counts. The multiplier is `hitMult` (see the builder-check resolutions below),
  applied after armour and multiplied with any active `vulnerable` status.
- **Boss stun (Assassin):** a hit on a boss applies `stun { duration: bossStun }`.
  "Boss" = `DEATH_CLASS[type] === 'boss'` (`src/data/juice.js`), the same rule
  `BOSS_WARNING` uses, never a `'titan'` literal. An existing stun is refreshed, not stacked.

### Resolver contract (`src/systems/towerShot.js`, pure, no Phaser)

- `shotTargets(spec, primary, inRange)` returns the ordered targets, length `spec.shots ?? 1`.
- `resolveHit(proj, enemies, { isSlowed, isBoss })` returns hit records. `proj` carries
  `target, targetX, targetY, damage, splashRadius, pierce, slowFactor, chain, cluster,
  slowedMult, bossStun`. `isSlowed(e)` and `isBoss(e)` are accessors, because the game's
  Enemy (`statusEffects.slow.active`) and the sim's enemy (`e.slow.active`) store state
  differently. The resolver never mutates enemies. The callers apply damage first, then the
  status effects, and skip statuses on a hit that killed.
- Ordering inside one hit: the primary or main splash, then the chain links or bomblets.
  Slowed state is read from the moment before the hit.

### Game (`GameScene`)

- `_updateTowers` fires one pooled projectile per `shotTargets` entry. Extra arrows reuse
  the muzzle point, SFX and flash.
- The new tier fields go onto the projectile at acquire (pool reset must clear them).
- `_onProjectileHit` calls `resolveHit` and then applies each record. A chain link draws a
  short lightning line (Graphics, fades in ~150 ms, game time). Bomblets reuse `spawnImpact`.
- `Tower.upgrade` copies `shots`, `chain`, `cluster`, `slowedMult` and `bossStun` when present.

### Sim (`src/sim/simulate.js`)

- The upgrade copies the same fields. The fire loop uses `shotTargets`, and the hit loop uses
  `resolveHit`.
- New: enemy `stun { active, timer }`, which ticks like slow. A stunned enemy skips movement,
  which mirrors `GameScene` line ~929.
- Balance output changes by design. `legacyGolden.json` is re-captured with
  `scripts/captureSimGolden.mjs` **only if** its test fails, with the reason in the
  commit message.

### Builder-check resolutions (Claude's calls)

- **Sim stun = the game's full freeze.** `GameScene._updateEnemies` `continue`s for a
  stunned enemy **before** the blocker lookup. It doesn't move, doesn't hit its blocker, and
  the blocker's strike (which lives in that same block) doesn't land either. The sim does
  exactly the same: `if (e.stun.active) continue;` before `findBlockingSoldier`.
  _(Corrected while planning: an earlier draft said the blocker keeps striking.)_
- **The Shatter multiplier is applied after armour,** like `vulnerable`. `Enemy.takeDamage`
  gains one opt, `hitMult` (default 1). It is multiplied into `vulnerableMult` before
  `computeDamage`, so the in-world number shows the real amount. The sim passes
  `vulnerableMult: rec.hitMult`. The record field is named `hitMult`, never `damageMult`,
  which is already the sim's global scalar.
- **Record shape:** `{ enemy, amount, isAoe, hitMult, slow, stun, chainFrom }`. `amount`
  is the raw pre-armour damage (chain falloff and bomblet `damageFrac` are already
  applied). Callers pass it as `amount` and pass `hitMult` as the extra multiplier. Both
  callers keep the sim's `* damageMult` on `amount` exactly as today.
- **Chain links carry the projectile's `pierce`.** The mage is `pierce: true` from tier 1,
  so every link ignores armour. That is intended: it is how every mage shot already works.
- **Volley is 60 per arrow,** which doubles DPS on paper. This is deliberate under the
  "make it true, don't retune" non-goal. The `--t4` sweep reports it, and any retune is a
  follow-up item.
- **Shatter's 2x is near-permanent against an enemy it keeps hitting.** Its own 2 s slow
  outlasts its 1.43 s cooldown, so every hit after the first is 2x. That is the card's
  promise. The sweep reports it, and a retune is a follow-up.

## Edge cases the tests must cover

- Volley: 0 / 1 / 2+ enemies in range; a duplicate primary when only one enemy is in range.
- Chain: a primary that is dead at impact (fizzle); no neighbour in range (1 link); a
  neighbour exactly at `jumpRadius` (inclusive, like splash); a link never repeats an enemy;
  falloff floors through `computeDamage` (amounts stay ≥1).
- Splash + slow: a killed enemy gets no slow; a survivor does; towers without slow apply none.
- Shatter: a fresh enemy at 1x, a slowed enemy at 2x, and the order on a single hit.
- Cluster: bomblet positions; an enemy hit by both the main splash and a bomblet; zero
  enemies.
- Boss stun: a boss is stunned and a non-boss is not; a re-hit refreshes and does not stack.
- Non-tier-4 towers produce byte-identical hits (a regression table over T1–T3 of every
  tower).
- Data invariant: no tier below 4 has both splash and slow, so the slow fix reaches only tier 4.
- The existing `towers.test.js` "tier damage ladder" stays green (cannon 4B 80×1.35 > T3 45).

## Verification

- Unit tests come first, for the resolver, the data invariants and the sim stun.
- `npm run balance -- --t4` and `npm run balance` before and after, with the diffs
  summarised in the PR.
- Live: build + preview. A frozen-frame probe on a map with each tier-4 branch placed
  (capture build `tower@slot:4a` syntax) confirms:
  - 2 Volley projectiles per trigger;
  - 3 chain records and lightning lines;
  - Frost Mage and Shatter splash victims slowed;
  - Shatter's second hit at 2x;
  - 4 impacts from Artillery;
  - no splash on Rapid Cannon;
  - a titan stunned by Assassin;
  - 0 console errors.

## Left to the builder

- The exact lightning-line colour and width (match `PROJ_COLORS.mage`).
- Whether hit records are plain objects or a reused array. Avoid per-frame allocation only if
  profiling says it matters.
