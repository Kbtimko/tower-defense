# Armour-floor legibility — design

**Backlog #17** (recorded twice: also numbered #15 at the foot of the list).
Date: 2026-09-21. Branch: `feat/armour-legibility`, off `origin/main` @ `5cb728b`.

## Problem

`computeDamage` is `max(1, amount - armor)` — flat subtraction, then the
multiplicative weakness matrix. Any tower whose raw damage sits at or below an
enemy's armour lands **exactly 1 damage a shot**, forever. That is not a bug and
the decision on file (2026-09-20) is to **fix the legibility, not the formula**:
changing the floor to a percentage, or armour to proportional reduction, shifts
every map's difficulty including the deliberately-preserved map-7 cliff.

Today a player cannot tell "my damage is being absorbed" from "this tower is
broken", because all three channels that could say so are silent or wrong:

1. **The tower panel's matchup line is wrong, not merely absent.** `Effective vs
   / Weak vs` is derived only from `WEAKNESS_MATRIX`. Ice has exactly one entry
   in that table (`titan: 0.75`), so an Ice tower's panel shows **no warning at
   all** against brute or colossus — while Ice T1 deals literally 1 damage to a
   brute.
2. **The in-world damage number never prints.** `DamageNumberOverlay` suppresses
   any hit under 30 (`THRESHOLD`), so a floored hit shows no number by
   construction.
3. **The hit flash is magnitude-independent** (PR #66, by design), so an absorbed
   plink flashes *identically* to a full-damage hit.

The enemy inspector does show `Armor N`, but nothing connects that number to the
tower the player is watching underperform.

## Measurements

All figures computed from the live tables in this worktree, not from the backlog
text. Absorption is **armour-only** and **honours `pierce`** (see "Metric").
Tiers 1-3, plus barracks soldiers.

**`pierce` is load-bearing, and the backlog entry misses it.** `TOWER_DEFS.mage`
and `TOWER_DEFS.sniper` both set `pierce: true`, so `computeDamage` zeroes armour
for them and they can never be floored. No tier override touches `pierce`, so it
is a tower-level property. A first pass that ignored `pierce` produced **eight
false warnings** (e.g. "mage T1 vs titan, 67% absorbed" — the mage in fact loses
nothing). The flagged set is therefore exactly **archer, ice, and barracks
soldiers**.

Of 54 (damage-source x armoured-enemy) combinations, 17 are flagged:

| band | rule | count |
|---|---|---|
| `floored` | `after === 1` and `absorbed > 0` | 9 |
| `heavy` | `absorbed >= 0.5`, not floored | 8 |
| `none` | rest (incl. all mage/sniper) | 37 |

```
FLOORED  95% | soldier T1  raw  20 vs titan    armor 20 -> 1
FLOORED  94% | ice T3      raw  18 vs titan    armor 20 -> 1
FLOORED  93% | archer T1   raw  15 vs colossus armor 15 -> 1
FLOORED  93% | archer T1   raw  15 vs titan    armor 20 -> 1
FLOORED  92% | ice T2      raw  12 vs colossus armor 15 -> 1
FLOORED  92% | ice T2      raw  12 vs titan    armor 20 -> 1
FLOORED  88% | ice T1      raw   8 vs brute    armor  8 -> 1
FLOORED  88% | ice T1      raw   8 vs colossus armor 15 -> 1
FLOORED  88% | ice T1      raw   8 vs titan    armor 20 -> 1
heavy    83% | ice T3      raw  18 vs colossus armor 15 -> 3
heavy    80% | archer T2   raw  25 vs titan    armor 20 -> 5
heavy    75% | soldier T1  raw  20 vs colossus armor 15 -> 5
heavy    67% | ice T2      raw  12 vs brute    armor  8 -> 4
heavy    60% | archer T2   raw  25 vs colossus armor 15 -> 10
heavy    57% | soldier T2  raw  35 vs titan    armor 20 -> 15
heavy    53% | archer T1   raw  15 vs brute    armor  8 -> 7
heavy    50% | archer T3   raw  40 vs titan    armor 20 -> 20
```

The `heavy` band is what a `dmg === 1` test would miss, and it plays just as
badly: `ice T3 vs colossus` lands 3, `archer T2 vs titan` lands 5.

**The backlog's "eight combinations" undercounts in a second way.** It reads only
`TOWER_DEFS[t].damage` and misses `soldierStats`. A tier-1 barracks soldier deals
20 against a titan's armour 20, so it floors to 1 — a **ninth** floored
combination, on the tower most often bought as an opener, and the worst in the
set at 95%. Barracks soldiers route through `computeDamage` via `soldierSource()`
in `src/data/sourceBuilders.js`, so this is the same mechanic, not a separate one.

## Decisions taken (2026-09-21)

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | Signal on **two** surfaces: tower panel (says *why*, and what to build instead) and in-world (says *when*, unprompted) | Panel only — opt-in, the player must think to click. In-world only — diagnoses without prescribing. |
| 2 | Band by **fraction absorbed**, not `dmg === 1` | A binary floor test misses `archer T2 vs titan` (5 dmg) and `ice T3 vs colossus` (3 dmg), which are indistinguishable in play. |
| 3 | Armour gets its **own panel line**; `Effective vs / Weak vs` is left untouched | Folding armour into that verdict collapses two distinct mechanics into one number and loses the explanation, which is the entire point of the item. |
| 4 | The damage formula does not change | Explicitly out of bounds per the 2026-09-20 decision. |

## Metric

Absorption is measured on the **armour step alone**, never on `final / raw`.

```
absorbed = (amount - applyArmour(amount, armor, pierce)) / amount
```

`final / raw` conflates armour with the weakness multiplier and is wrong in both
directions: a Cannon hitting a Phantom (armour 0, matchup 0.5x) would report
"armour absorbed 50%" against an enemy that has no armour at all; a Sniper
hitting a Titan (armour 20, matchup 1.5x) nets *above* raw and would report no
absorption despite losing 25% to armour. Isolating the subtraction step is what
makes the readout mean what it says.

`pierce` is honoured inside `applyArmour`: a piercing source has
`effectiveArmor = 0`, so `absorbed` is 0 and the band is always `none`. Flagging
a tower that ignores armour would be a false warning, and the mage and sniper are
exactly the two towers a player is most likely to have bought *for* heavies.

`vulnerableMult` (the Mage's Vulnerable debuff) is likewise excluded — it is a
transient status, not a property of the matchup, and a panel line that changed
while a debuff ticked would be unreadable.

## Architecture

### 1. `src/systems/damage.js` — extract the armour step in place

```js
export function applyArmour(amount, armor = 0, pierce = false) {
  return Math.max(1, amount - (pierce ? 0 : armor));
}
```

`computeDamage` is rewritten to call it. **No behaviour change** — the existing
`damage.test.js` must pass untouched, and that is the acceptance test for this
step.

This matters because `computeDamage` is deliberately the one formula the live
game and the headless balance simulator share; a second copy of `max(1, x)` in a
UI module is precisely how the simulator drifted from the game before.

### 2. `src/systems/armourLegibility.js` — new, pure

No Phaser import, no DOM. Exports:

```js
export const HEAVY_ABSORPTION = 0.5;

// → { after, absorbed, band }   band: 'none' | 'heavy' | 'floored'
export function armourAbsorption({ amount, armor = 0, pierce = false })

// → [{ enemyType, name, armor, after, absorbed, band }, ...]
//   armoured enemies only, band !== 'none', in ENEMY_DEFS order
export function describeTowerArmour({ type, tier, branch, damage })
```

`describeTowerArmour` takes the tower's *current* damage rather than re-deriving
it from `TOWER_DEFS`, so the panel shows what the placed tower actually hits for
(tier upgrades and tier-4 branch overrides included) instead of a table lookup
that could disagree with the live entity.

`pierce` is honoured: a piercing source has `effectiveArmor = 0`, so it can never
be flagged. This is load-bearing — flagging a tower that ignores armour would be
a false warning.

### 3. Tower panel — `src/scenes/GameScene.js` + `index.html`

New `<div class="panel-armour" id="panel-armour"></div>` immediately after
`#panel-matchups` (index.html:503). Populated in `_openTowerPanel` with safe DOM
construction (`replaceChildren` + `createElement`), matching the existing
matchup-line code — no `innerHTML`.

```
🗡 Effective vs: Skitter, Phantom
🛡 Armour absorbs: Brute 15→7 · Colossus 15→1 ⚠ · Titan 15→1 ⚠
```

- `floored` rows red (`.ar-floor`), `heavy` rows amber (`.ar-heavy`), reusing the
  existing panel type scale (10px, matching `.panel-matchups`).
- The line is **hidden entirely** when every row is `none` — a Sniper should not
  carry a warning it does not deserve.
- Enemy names are stripped of the `Veth ` prefix, exactly as the existing matchup
  line does.
- **Barracks**: the panel's barracks branch renders the same line, computed from
  `tower.soldierStats.damage`, since soldiers are the barracks' damage.

### 4. In-world — `src/entities/Enemy.js` + `src/systems/DamageNumberOverlay.js`

`Enemy.takeDamage` already holds raw `amount` and final `dmg` at the
`damage-dealt` emit (Enemy.js:136), and already knows `this.armor` and
`optsObj.pierce`. The band is computed there and added to the existing payload —
**no new event, no new plumbing**.

`DamageNumberOverlay._handle` gains one exemption to its `THRESHOLD = 30`
suppression: a hit whose band is `heavy` or `floored` always prints, in a new
muted `absorbed` style with a shield glyph — `🛡1` — so it reads as *absorbed*
rather than as *damage*. Distinct colour from `big`/`crit`/`aoe`; it must not
look like a good hit.

**Per-enemy throttle.** This is the one real risk in the feature: a floored Ice
T1 fires continuously and would carpet the screen with `🛡1`. At most one
absorbed number per enemy per `ABSORBED_COOLDOWN_MS = 700`, tracked on the
overlay keyed by enemy (not on the enemy entity, so the overlay owns its own
state and teardown stays symmetric). Non-absorbed numbers are unthrottled, as
today.

The throttle store is a `WeakMap` keyed by the enemy instance, so a dead enemy
is collected without a sweep and a long level cannot leak. `destroy()` replaces
it with a fresh `WeakMap`, which is the whole of its teardown.

## Testing

Unit (Vitest + jsdom; entities importing Phaser need the existing `vi.mock`
pattern):

- `damage.test.js` — **passes unchanged**; this is the proof the extraction is
  behaviour-preserving.
- `armourLegibility.test.js` — band boundaries exactly at `after === 1` and
  `absorbed === 0.5`; `pierce: true` never flags; `armor: 0` never flags;
  `amount` at/below armour floors; `describeTowerArmour` omits `none` rows,
  preserves `ENEMY_DEFS` order, and handles a tower with no armoured matchups.
- **Derived membership test** — the `floored` and `heavy` rosters are computed
  from `TOWER_DEFS` x `ENEMY_DEFS` at test time and asserted on their *defining
  properties*, never on a hardcoded list of names or a pinned count: every
  `floored` row has `after === 1`; every `heavy` row has `absorbed >= 0.5` and
  `after > 1`; the three bands partition the combinations with no overlap and no
  gap; and no row with `armor === 0` appears in either band. One named regression
  case is pinned deliberately — Ice T1 vs brute must be `floored` — because it is
  the combination the reported symptom came from.

  A hardcoded roster is what made the suite *enforce* the colossus bug
  (`VALID_TYPES` in `waves.test.js`). A pinned count is the same mistake one step
  removed: it would fail on any future retune without telling anyone what broke.
- `DamageNumberOverlay.test.js` — an absorbed sub-30 hit prints where a plain
  sub-30 hit does not; the throttle suppresses the second hit inside the window
  and admits it after; `destroy()` empties the throttle map.
- `GameScene` panel test — the line renders for Ice T1, is hidden for Sniper T1,
  and renders from `soldierStats` for a barracks.

### Edge cases this must handle

| case | expected |
|---|---|
| `armor: 0` (drone, skitter, phantom) | never flagged, never listed |
| `pierce: true` | never flagged — armour is bypassed |
| raw damage exactly equal to armour | floored (`after === 1`) |
| raw damage one above armour | `after === 1` — also floored; the clamp is not what makes it unreadable |
| `absorbed` exactly `0.5` | `heavy` (inclusive boundary) |
| barracks (`damage: 0`, `fireRate: 0`) | panel uses `soldierStats.damage`; the tower's own 0 damage is never shown as floored |
| tower with no flagged enemies (Sniper) | line hidden entirely, no empty container |
| tier-4 branch damage overrides | read from the live tower, not the tier-1 table |
| Vulnerable debuff active | excluded from the metric; panel does not flicker |
| enemy dies on the absorbed hit | no number printed (the death anim sells it), consistent with the existing hit-flash rule |
| many floored hits per second | throttled to one number per enemy per 700ms |
| level replayed / scene shutdown | throttle map cleared; no retained enemy references |

### Live verification (required before PR)

A green suite is not the definition of done here — the whole feature is a visual
claim. Against `npm run build && npm run preview`:

1. Place an Ice T1 within range of a brute. Confirm `🛡1` prints in-world where
   today nothing prints, and that it is visibly distinct from a normal number.
2. Open that tower's panel. Confirm the armour line names Brute/Colossus/Titan
   and that the existing Effective/Weak line is unchanged.
3. Place a Sniper T1. Confirm no armour line appears at all.
4. Place a barracks near a titan. Confirm the soldier line flags the titan.
5. Watch a sustained floored stream and confirm the throttle holds the screen
   readable.

## Out of scope (deliberate)

- **The damage formula.** Unchanged, per the standing decision.
- **Balance.** No value in `src/data/` changes. `src/sim/` is untouched, so the
  headless simulator's numbers must be byte-identical before and after.
- **Hero and soldier inspector panels**, and the codex, have the same legibility
  gap. Scoped out the same way PR #68 scoped out `Hero.js`/`Soldier.js` HP bars —
  the item is about the tower panel and the in-world hit. Worth a follow-up
  backlog entry.
