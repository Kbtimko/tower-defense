# Hero levelling: damage-driven XP + stats that actually grow

Maintainer: "do heroes have level up capabilities? they should get stronger as they inflict
more damage on enemies."

## What exists today

Levelling exists and does almost nothing.

- `Hero._registerKill()` (`src/entities/Hero.js:136`) bumps `killCount`; **level 2 at 25
  kills, level 3 at 75 kills — both hardcoded in entity logic**, which violates
  `CLAUDE.md` ("keep game balance and tunable numbers in `src/data/` — never hardcode
  stats inside entity logic"). Moving them is part of this work.
- `maxLevel: 3`, `abilityUnlockLevels: { q: 1, w: 2, e: 3 }` in `src/data/heroes.js`.
  Levelling **only** gates ability slots.
- **No stat changes at all.** Damage is `this.def.stats.attackDamage * this._attackDamageMult`
  — no level term. Same for `maxHp`, `attackRate`, `attackRange`. A level-3 Rael hits
  exactly as hard as a level-1 Rael.
- Progress is per-map: `level` resets to `modifiers.heroStartLevel` (1, or 2/3 from the
  `veteran`/`elite` meta upgrades) and `killCount` resets to 0 on every map. **Keep that.**

Kill-count is the wrong metric now that the hero blocks: it has a 40px range and holds
enemies while towers land the killing blows, so it can take a titan from full to 10% and
earn nothing.

## Maintainer decisions

- **XP source: damage dealt**, not kills.
- **Each level grants +20% attack damage and +20% max HP**, applied as `base * (1 + 0.20 *
  (level - 1))` — linear on the base, not compounding, so level 5 is a predictable 1.8x.
- **Thresholds scale with each map's total enemy HP**, so pacing feels the same on map 0
  (8,800 total HP) and map 9 (59,780).
- **Level cap raised 3 → 5.** Abilities stay at 1/2/3; levels 4 and 5 are stat-only.

## Task 1 — measure first, then pick the curve

**Do this before choosing any threshold and report the numbers.**

The sim tracks `heroBlockedSeconds` and `heroDeaths` but not damage dealt. Add
`heroDamageDealt` to the simulator's result alongside them (it belongs there regardless —
it is the quantity this feature is built on). Accumulate the *post-armour* damage the hero
actually lands, at the existing hero attack site in `src/sim/simulate.js` (~line 369).

Then run `npm run balance` and report, per map, the hero's damage dealt as an absolute
number **and** as a fraction of that map's total enemy HP. Total enemy HP per map, computed
from `MAP_WAVES` x `ENEMY_DEFS[type].hp`, is:

```
map 0  8,800   map 1  8,120   map 2 12,330   map 3 10,770   map 4 18,500
map 5 18,080   map 6 24,440   map 7 31,430   map 8 40,970   map 9 59,780
```

**Why this matters:** armour is flat subtraction (`max(1, dmg - armor)`), so Rael's 18
damage lands 1 per hit on a titan (armour 20) and 18 on a phantom (armour 0). The hero's
share of total damage is therefore not derivable on paper. A threshold set by guesswork
will be unreachable on titan-heavy maps.

**Then choose four thresholds** (levels 2-5) as fractions of the map's total enemy HP, such
that on a typical map level 5 is reached **late but genuinely reachable** — roughly the
last fifth of a successful run, not in the final second and not by wave three. Put the
chosen fractions in `src/data/heroes.js` with a comment stating the measured numbers they
came from. State your reasoning in your report.

## Task 2 — implement

### XP and levelling

- Replace kill-count levelling with damage-dealt levelling. Accumulate the **post-armour**
  damage the hero actually lands (the value passed to `enemy.takeDamage`, after
  `computeDamage` has applied armour — check which it is before you wire it).
- Keep `killCount` if anything still reads it (grep first — the inspect panel may show it);
  it is no longer what drives levels.
- The thresholds are per-map, so the hero needs the map's total enemy HP. Add a small pure
  helper (e.g. `totalEnemyHpForMap(mapId)`) next to the wave data, unit-tested, rather than
  computing it inside `Hero`.
- Emit the existing `hero:level-up` event unchanged — `UIScene` already listens for it.
- Levels only ever go up within a map, and still reset on a new map.

### Stat scaling

- Attack damage and max HP scale `base * (1 + 0.20 * (level - 1))`.
- **On level-up, raise current hp by the same amount max hp gained**, so a level-up never
  leaves the hero proportionally more wounded than before. Do not full-heal.
- `maxHp` interacts with the `heroMaxHpBonus` meta upgrade — decide and document whether
  the bonus is added before or after the level multiplier, and be consistent between the
  game and the simulator.
- Respect `heroStartLevel` (veteran/elite meta upgrades): a hero starting at level 3 must
  start with level-3 stats.
- `maxLevel` 3 -> 5 in all four hero stat blocks.

### Keep the simulator in step

`src/systems/soldierCombat.js` states the game and the model must agree or "the balance
model silently drifts from the game it exists to predict". The simulated hero must level
from damage and gain the same stats on the same thresholds. Share the pure level/stat maths
between game and sim — one function, imported by both, as `heroBlocksEnemy` already is.

## Definition of done

- `npm run test` fully green; report the real count.
- `npm run build` clean.
- `npm run balance` before and after, full table, all ten maps, three columns, with deltas.
  Report accurately, including if maps get much easier. Also report per-map hero damage and
  the level the hero actually reaches.
- Browser verification is the maintainer's step, not yours.

## Notes

- Branch `feat/hero-damage-leveling` is already checked out and is **stacked on
  `feat/hero-melee-and-regen` (PR #63, unmerged)**. Do not rebase, merge or touch that
  branch. Do not commit.
- Expect this to make maps easier — a hero reaching level 5 has 1.8x damage. That is the
  point; report the size of it rather than smoothing it over.
