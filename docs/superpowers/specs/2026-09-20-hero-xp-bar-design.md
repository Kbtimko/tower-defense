# Hero XP progress bar — design

**Date:** 2026-09-20
**Status:** approved

## The ask

> "there needs to be a progress bar for heros to get to the next level so i can see how they get closer as they attack more enemies"

A progress bar showing how close a hero is to its next level, filling as the hero deals damage.

## Why it's needed

Hero levelling already works and is invisible. `Hero.damageDealt` accumulates
post-armour damage; `heroLevelForDamage` converts that into a level at fixed
thresholds. The only surfaced signal is the level *number* flipping in the HUD
(`Rael L1` → `Rael L2`) and the abilities that unlock with it. Between those
flips the player has nothing: no way to tell whether a level is one kill away or
a whole wave away, and no feedback tying "I am attacking enemies" to "I am
making progress".

## Scope

Display only. **No change** to XP rates, thresholds, when levels are earned, or
what levels are worth. Enemy-side and tower-side behaviour is untouched.

Hero-side only — heroes are what the request names.

## Decisions taken

| Question | Decision |
|---|---|
| Placement | A second thin bar in the bottom-bar hero strip, directly under the existing HP bar |
| Readout | Bar only; exact figures on hover via a `title` tooltip |
| Colour | Gold (`#ffd700`) — reads as progression, distinct from the hero-coloured HP bar |
| Max level | Bar sits full; label reads `Rael L5 · MAX` |

Rejected: a ring around the portrait (a partial arc is harder to read than a
bar); a floating bar over the hero on the map (competes with enemy bars, easy to
miss); permanent percentage or raw-damage text (the HUD already carries four
counters, and the HP bar directly above sets the no-numbers precedent).

## Existing machinery this builds on

- `src/systems/heroLeveling.js` — `heroXpThresholds(mapTotalHp)` returns the
  absolute damage needed for levels 2..5, from
  `HERO_LEVEL_DAMAGE_FRACTIONS = [0.07, 0.13, 0.21, 0.30]`.
- `Hero.damageDealt`, `Hero.level`, `Hero._startLevel`, `Hero._mapTotalHp`.
- `GameScene._updateHero` already emits `hero:update` **every frame** with
  `{ hp, maxHp, level }`; `UIScene._onHeroUpdate` consumes it to set the HP fill
  width. `hero:level-up` separately updates the level label and unlocks abilities.
- `index.html` hero strip: `#hero-portrait`, `#hero-level`, `#hero-hp-bg` /
  `#hero-hp-fill` (52×5px).

## Architecture

Three units, each independently testable.

### 1. `heroXpProgress()` — pure, in `src/systems/heroLeveling.js`

```
heroXpProgress(damageDealt, mapTotalHp, { startLevel = 1, maxLevel = 5 })
  -> { level, progress, current, needed, atMax }
```

- `level` — delegates to the existing `heroLevelForDamage`. Not re-derived.
- `progress` — 0..1 **within the current level**:
  `(damageDealt − prevThreshold) / (nextThreshold − prevThreshold)`, clamped to [0, 1].
- `current` / `needed` — damage into the current level, and the size of the
  current level's window. For the tooltip.
- `atMax` — true at `maxLevel`.

Per-level windows, with `T = mapTotalHp`:

| Level | window |
|---|---|
| 1 | `[0, 0.07T)` |
| 2 | `[0.07T, 0.13T)` |
| 3 | `[0.13T, 0.21T)` |
| 4 | `[0.21T, 0.30T)` |
| 5 | max — no next threshold |

It lives beside the other levelling maths deliberately: that module exists so the
live game and the headless balance simulator cannot drift apart, and it already
holds the thresholds this needs. A second copy of the arithmetic in the view is
exactly what it was written to prevent.

### 2. Event — extend the existing `hero:update`

`GameScene._updateHero` adds one field to the payload it already emits:

```js
this.game.events.emit('hero:update', {
  hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
  xp: heroXpProgress(...),
});
```

No new event and no polling. `hero:update` already fires at exactly the cadence
hero state changes, and is already the HP bar's vehicle. A separate `hero:xp`
event would be a second thing to keep in sync for no gain.

### 3. View — `UIScene`

- `index.html`: `#hero-xp-bg` / `#hero-xp-fill` under `#hero-hp-bg`, styled like
  the HP bar, gold fill.
- `UIScene._onHeroUpdate` sets `#hero-xp-fill` width from `xp.progress`.
- Tooltip: a `title` on the hero strip —
  `Level 2 — 38% to Level 3 · damage dealt 456 / 1,200`, or
  `Level 5 — MAX` when maxed. Rewritten **only when the whole-number percent
  changes**, not every frame.
- `_onHeroLevelUp` appends `· MAX` to the level label at `maxLevel`.

UIScene stays ignorant of thresholds and fractions; it receives a 0..1 number and
some strings.

## Data flow

```
Hero.update  --attack-->  _registerDamage(dealt)   damageDealt += dealt
                                  |
GameScene._updateHero  --every frame-->  heroXpProgress(damageDealt, mapTotalHp, …)
                                  |
                          game.events 'hero:update' { hp, maxHp, level, xp }
                                  |
UIScene._onHeroUpdate  -->  #hero-xp-fill.style.width  +  title tooltip
```

## Edge cases

Each must be covered by a test.

1. **Max level** — no next threshold. `progress` 1, `atMax` true, bar full, label
   `· MAX`. Must not divide by a missing threshold.
2. **`heroStartLevel` 2 or 3** — the `<hero>_veteran` / `<hero>_elite` meta
   upgrades set this, so it ships today. The hero starts mid-ladder with
   `damageDealt = 0`, which makes the naive formula **negative**
   (`(0 − 0.13T) / 0.08T = −1.6`). Clamped to 0.
3. **`mapTotalHp === 0`** — a map with no wave table has no HP budget;
   `heroLevelForDamage` already yields the start level. `progress` must be 0, not
   `NaN`, and the bar must render empty rather than blank.
4. **Level-up** — bar empties and refills from the new floor. Progress resets to
   ~0 exactly when `level` increments.
5. **Hero death / respawn** — `damageDealt` persists, so progress is unaffected.
6. **Monotonic within a level** — progress never decreases except at a level-up.
7. **`damageDealt` exactly on a threshold** — counts as the higher level, with
   progress 0 in the new window (consistent with `heroLevelForDamage`'s `>=`).
8. **`maxLevel` below 5** — the per-hero stat is read, not the constant 5.

## Testing

- **`heroLeveling.test.js`** — `heroXpProgress` against every edge case above,
  including the real `HERO_LEVEL_DAMAGE_FRACTIONS` values.
- **UIScene test** — following the jsdom pattern in `UIScene.spaceKey.test.js`:
  a `hero:update` payload sets the fill width; `atMax` renders a full bar; the
  tooltip text matches the payload.
- **Live browser verification** — place towers, run waves, and confirm the bar
  visibly advances as the hero lands hits, empties on level-up, and reads `MAX`
  at level 5. A green suite is not evidence the bar moves on screen.

## Out of scope

- Tower or enemy XP.
- Changing levelling rates or thresholds.
- An on-map level-up flourish (offered and not chosen).
- Hero/Soldier HP-bar geometry, which derives from `def.radius` and has the same
  latent defect fixed for enemies in PR #68.
