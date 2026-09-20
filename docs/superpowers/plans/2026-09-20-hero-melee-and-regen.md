# Hero melee blocking + out-of-combat regeneration

Maintainer: "heroes should engage and fight enemies. as they fight, their health should
deplete. they should auto heal over time."

## Why this is missing today

Not a bug — a deliberate deferral. `docs/superpowers/specs/2026-05-30-hero-path-restriction-design.md`
line 25 says: *"Hero does NOT block enemies. Once the hero is on-path, players may expect
Soldier-style blocking; that requires changes to `_checkSoldierBlock` and enemy melee
combat. Out of scope — flag as a follow-up backlog item."* It was never scheduled.

Two halves were deferred together, which is why the current state is self-consistent:

1. **The hero never blocks.** `GameScene._checkSoldierBlock` only iterates barracks towers
   and their `soldiers`; the hero is not a candidate.
2. **The hero is invulnerable.** `Hero.takeDamage` (`src/entities/Hero.js:91`) is fully
   implemented and **never called**. Every `.takeDamage(` call site in `src/` targets a
   soldier or an enemy. The hero's `maxHp`, `respawnTime` and death/respawn path are
   therefore dead code in practice.

The hero does shoot: `Hero.update` auto-attacks the nearest enemy within
`def.stats.attackRange` (rael 40, engineer 60, scout 140, pyro 45).

## Maintainer decisions

- **Blocking: soldier-style, one enemy at a time.** The hero hard-stops one enemy, which
  stops advancing and melees the hero. Other enemies walk past.
- **Regen: out-of-combat only.** Regeneration begins a few seconds after the hero last
  took damage, so pulling the hero back to recover is a real decision.

## Existing mechanics to match

`src/systems/soldierCombat.js` is the shared melee source of truth:
- `MELEE_RANGE = 30` — an enemy this close stops walking.
- `ENEMY_MELEE_DAMAGE` (from `src/data/enemies.js`) — damage the blocked enemy deals back.
- `findBlockingSoldier(enemy, soldiers)` skips `enemy.def.flying` unless the blocker has
  `canBlockFlyers`. **Flyers must pass over the hero too**, for consistency.

The blocked-enemy exchange lives in `GameScene._updateEnemies` (~line 386): get a blocker,
damage it by `ENEMY_MELEE_DAMAGE * dt`, let it strike back on its own `attackTimer`, then
`continue` so the enemy does not advance.

## Task 1 — hero blocks, and takes damage

### 1a. Hero becomes a blocker

Add hero blocking to `GameScene._updateEnemies`, checked **after** soldier blocking (a
soldier already holding the enemy wins; do not double-block).

An enemy is held by the hero when all of:
- the hero exists and is not `dead`,
- the enemy is not `def.flying` (flyers pass over, matching ground soldiers),
- `Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < MELEE_RANGE`.

When held: the enemy does **not** advance, and the hero takes `ENEMY_MELEE_DAMAGE * dt`
via the existing `hero.takeDamage(...)`.

**Do NOT make the hero strike back from this loop.** `Hero.update` already auto-attacks
the nearest enemy in range on its own `_attackTimer`, and `MELEE_RANGE` (30) is inside
every hero's `attackRange` (min 40), so a blocked enemy is always already a valid
auto-attack target. Adding a second attack here would double the hero's DPS. Verify this
by reading `Hero.update` before you write anything.

The hero does **not** use the soldier-shaped record — it has `_attackTimer`,
`def.stats.attackDamage` and `def.stats.attackRate`, not `attackTimer`/`damage`/
`attackRate`. Do not try to pass the hero to `findBlockingSoldier`; write a separate,
clearly named check. Put the pure geometry/eligibility part in `soldierCombat.js` (or a
sibling pure module) so the simulator can import the identical rule — see Task 2.

Several enemies reaching the hero at once may all be held; that matches the soldier
comment ("the first match wins and is not claimed exclusively, so several enemies can gang
up on one blocker — that concentration is why blocking eventually breaks"). Do not add an
exclusivity rule.

### 1b. Death already works — verify, don't rebuild

`Hero.takeDamage` already handles reaching 0 hp: sets `dead`, starts `respawnTimer`, hides
the sprite, plays `hero-death`. `Hero.update` already counts the timer down and calls
`respawn()`, which restores full hp at path progress 0. Confirm this path works now that
something actually deals damage; do not rewrite it.

### 1c. Out-of-combat regeneration

In `Hero.update`:
- Track time since the hero last took damage. Reset it inside `takeDamage`.
- Once that exceeds `HERO_REGEN_DELAY`, heal `HERO_REGEN_RATE * dt` per second, clamped to
  `maxHp`.
- Do not regenerate while `dead`.
- Redraw the hp bar when hp changes (`_redrawHpBar`), or the bar will lie.

**Tunables go in `src/data/heroes.js`** — `CLAUDE.md` requires balance numbers live in
`src/data/`, never inside entity logic. Start at:

```
HERO_REGEN_DELAY = 5   // seconds without taking damage before regen starts
HERO_REGEN_RATE  = 4   // hp per second once regenerating
```

Shared across all four heroes; no per-hero override unless a test forces one.

## Task 2 — keep the balance simulator honest

`src/systems/soldierCombat.js` opens by stating that the live game and the headless
simulator must agree on melee "otherwise the balance model silently drifts from the game it
exists to predict." The simulator already models the hero's *ranged* attack
(`src/sim/simulate.js:337`) but knows nothing about blocking.

Model hero blocking in the simulator using the **same pure rule** Task 1 extracts:
- a non-flying enemy within `MELEE_RANGE` of the modelled hero stops advancing,
- the hero takes `ENEMY_MELEE_DAMAGE * dt`,
- at 0 hp the hero is out for its `respawnTime`, then returns at path progress 0 with full
  hp,
- out-of-combat regen applies with the same delay and rate.

Read how the simulator currently positions the hero (it shares `pathGeometry.js` with the
game) and how it models soldier blocking, and follow that structure. Do not duplicate the
melee constants — import them.

## Definition of done

- `npm run test` fully green; report the real count.
- `npm run build` clean.
- **Run `npm run balance` before and after** and report the full before/after table. This
  change is expected to move every map; the maintainer needs the numbers, not a claim.
  Capture full output, check exit codes, do not pipe through `head`/`tail` in the gating
  step.
- Browser verification is the maintainer's step and is NOT part of this task.

## Notes

- Branch `feat/hero-melee-and-regen` is already checked out. Do not create or switch
  branches. Do not commit.
- PR #62 is open and unmerged and also touches `GameScene.js`, but in different methods
  (`_onPointerDown`, `_sellSelectedTower`). Expect no conflict; do not try to merge it.
