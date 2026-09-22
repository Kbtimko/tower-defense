# Matchup-aware `greedyBuildPlan` — design

**Backlog #15.** Date: 2026-09-22.
Branch: `feat/sim-matchup-aware-buildpolicy`, stacked on `feat/armour-legibility` (PR #76).

## Problem

`towerValue` in `src/sim/buildPolicy.js` is:

```js
return (def.damage * def.fireRate) / def.cost;
```

Damage per second per gold, ignoring **flat armour**, the **weakness matrix**, and
**`pierce`**. The balance simulator's whole purpose is to answer "is this map
tuned correctly", and it answers it with a modelled player who cannot tell an
archer from a sniper against a titan.

### The defect, stated as a measurement

Ranking by `towerValue` against the DPS each tier-1 tower actually lands
(`computeDamage x fireRate`, current tables):

| rank by `towerValue` | tower | value | drone | skitter | brute | colossus | phantom | titan |
|---|---|---|---|---|---|---|---|---|
| 1 | archer | 0.2500 | 15.0 | 18.0 | 5.0 | **1.0** | 18.0 | **1.0** |
| 2 | mage   | 0.2000 | 22.2 | 18.0 | 18.0 | 22.2 | 27.0 | 22.2 |
| 3 | sniper | 0.2000 | 24.0 | 18.0 | 30.0 | **36.0** | 18.0 | **36.0** |
| 4 | cannon | 0.1841 | 14.8 | 9.9 | 24.8 | 20.3 | 9.9 | 14.0 |
| 5 | ice    | 0.0700 | 5.6 | 5.6 | 0.7 | 0.7 | 5.6 | 0.7 |

The model's **first choice does 1.0 DPS to a colossus and 1.0 to a titan**. Its
third choice does **36 to both**. On maps 4-9, where the heavies dominate the HP
budget, the modelled player reliably buys the worst available tower and the
report then calls the map `UNWINNABLE`.

The balance report's own header already concedes the gap: it says the model
"omits ... matchup-aware tower choice ... so this model is PESSIMISTIC". This
work closes the omission it names.

### Two corrections to the backlog entry

**1. The "five monotonicity inversions in eleven" figure is stale.** It appears
both in backlog #15 and in a `PROVISIONAL` comment at `src/data/maps.js:70-76`.
Re-measured today on map 2 (`startGold` 150..200 in 5g steps, 11 points,
`greedyBuildPlan` passed directly as `buildPlan`, exactly as the comment
describes):

```
150:L/0l/w11  155:W/3l/w12  160:L/0l/w9  165:W/6l/w12  170:W/6l/w12  175:W/6l/w12
180:W/9l/w12  185:W/7l/w12  190:W/7l/w12  195:W/9l/w12  200:W/9l/w12
inversions: 2/10  (155→160, 180→185)
```

Two, not five. PR #71's on-ramp recalibration retuned maps 0-2 after that note
was written. The comment's "three-wide plateau at 165/170/175g" still reproduces
exactly, so its method was sound and only the count has drifted.

**The count is the wrong evidence anyway.** One row of that sweep says it better
than any tally: **155g wins the map with 3 lives; 160g loses it outright.** Five
more gold, total defeat. That is the mis-ranking compounding, and it is why the
cell had to be chosen by eye.

**2. "The sim cannot tune any map past map 1" no longer holds either.** Maps 0,
1 and 2 all currently report `OK`. The live failure is maps 3-9, all
`UNWINNABLE` at 1.22x to 3.65x — and an unknown share of that deficit is this
blind spot rather than real difficulty. Disentangling the two is exactly what
backlog #16 is blocked on.

### What this unblocks

`src/data/maps.js:70-76` marks map 2's `startGold: 170` / `rewardMult: 0.40` as
**PROVISIONAL**, explicitly because "the balance simulator cannot resolve this
map ... greedyBuildPlan's towerValue ignores armour and the weakness matrix". A
balance decision is frozen in the data waiting on this fix. Re-deriving that cell
is #16's job, not this plan's — but this is what makes it possible.

The same blind spot traps players, which is what backlog #17 (PR #76) just made
legible on the tower panel. This is the tuner's side of that coin.

## Decisions taken (2026-09-22)

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | Score against the enemies **still to come**, HP-weighted | Whole-map mix (buys titan-counters on wave 1, never adapts). Next wave only (thrashes — towers are permanent, waves are not). |
| 2 | Fix the **purchase pass AND the upgrade pass** | Purchase only — on 11-slot tier-3 maps most of the gold goes through the upgrade pass, so a smart buyer would feed a blind upgrader and most of the deficit would stay unexplained. |
| 3 | Report **blind and aware side by side** for one release | Silently replacing the numbers discards the measurement of what the blind spot was worth, which is the most useful thing this produces for #16. |
| 4 | `rankSlots` is **out of scope** | Fixing it makes slot choice and tower choice mutually dependent — a materially harder problem. Backlog it. |
| 5 | Weighting includes the **per-wave HP scale factor** | Ignoring it underweights late waves by up to ~2.95x — and late waves are where the heavies are, i.e. exactly the enemies this fix exists to handle. |

## Architecture

### 1. Share the wave HP scale, don't copy it

`WaveManager.js:31` computes `const scaleFactor = 1 + this.currentWave * 0.13;`.
Weighting needs the same number. Export it and have `WaveManager` call it:

```js
// WaveManager.js — no behaviour change
export function waveScaleFactor(waveIndex) {
  return 1 + waveIndex * 0.13;
}
```

Copying `0.13` into the sim is the mistake `applyArmour` was extracted to avoid
in #17: the simulator drifting from the game it models. `WaveManager` imports no
Phaser, so this stays unit-testable.

### 2. New pure module `src/sim/matchupValue.js`

```js
// → Map<enemyType, weightedHp>  for waves from fromWaveIndex (0-based) onward
export function remainingEnemyWeights(waves, fromWaveIndex)

// → expected post-armour DPS against that weighted mix
export function towerDpsAgainst({ type, tier, branch, damage, fireRate, pierce }, weights)

// → that DPS per gold spent
export function towerValueAgainst(spec, weights)
```

`towerDpsAgainst` routes every candidate through the **real `computeDamage`**, so
armour, the weakness matrix and `pierce` are all honoured and there is no second
copy of combat arithmetic anywhere in the sim.

Weight for one group in wave `i`: `ENEMY_DEFS[type].hp * count * waveScaleFactor(i)`.
Weights are a *relative* mix, so they are normalised; only ratios matter.

### 3. `buildPolicy.js` — one scoring function, both passes

- **Purchase pass:** rank `BUYABLE` by `towerValueAgainst(...)` rather than the
  static `towerValue`.
- **Upgrade pass:** today it buys the **cheapest** available upgrade. It becomes
  the best **marginal DPS gain per gold**: the tier stat block already supplies
  the post-upgrade `damage` / `fireRate` / `pierce`, so the delta against the same
  weights is directly computable.
- **The barracks carve-out is untouched.** Blocking is not DPS and no damage
  metric can price it; `barracksTarget` keeps its explicit rule and its comment.

### 4. `waves` must reach the policy

`ctx` today is `{ gold, towers, slotsUsed, buildZones, path, waveNumber, map }`
(`simulate.js:186-188`) — no wave table. And `greedyBuildPlan` is passed
**directly** as `buildPlan` in `scripts/balance.mjs:54-55`, `simulate.test.js`,
`deficit.test.js` and `soldiers.test.js`, so it cannot rely on callers wrapping it.

Add `waves` to the ctx `simulateMap` already has in hand. One line, no signature
change for any caller.

**Graceful degradation is required, not optional.** `simulate.test.js` and
`soldiers.test.js` call `greedyBuildPlan` directly with hand-built ctx objects
that have no `waves`. With no wave table the policy falls back to the naive
ranking, so every existing direct-call test keeps its current meaning instead of
silently exercising a different code path.

### 5. A/B in the report

`greedyBuildPlan` gains `matchupAware` (default `true`). The old ranking is kept
and exported as `naiveTowerValue`. `scripts/balance.mjs` prints both:

```
#  Map                  blind    aware    delta
5  Titan's Reach         1.6x     ?.??x    ?
```

For one release. Without that column #16 cannot tell "the model got smarter" from
"the map got easier".

## Testing

`src/sim/buildPolicy.js` has **no test file today** — its only coverage is
indirect, through `simulate.test.js`, `deficit.test.js` and `soldiers.test.js`.
This adds `src/sim/buildPolicy.test.js` and `src/sim/matchupValue.test.js`.

- `waveScaleFactor` — matches `WaveManager`'s own value for several wave indices;
  `WaveManager`'s existing tests must pass unmodified (the extraction is
  behaviour-preserving, exactly as `applyArmour` was in #17).
- `remainingEnemyWeights` — later waves weigh more than identical earlier ones;
  `fromWaveIndex` past the end yields an empty mix; an empty mix is handled by
  every consumer without dividing by zero.
- `towerDpsAgainst` — against a pure-titan mix, sniper outranks archer (the
  headline defect, asserted as a *relative order*, never a pinned number);
  `pierce` measurably raises a tower's value against armoured mixes; a
  pure-skitter mix ranks archer above sniper, proving the ranking actually moves
  with the mix rather than being a new fixed order.
- `greedyBuildPlan` — with a titan-heavy remaining mix it no longer opens with an
  archer; with `matchupAware: false` it reproduces the naive ranking exactly; with
  no `waves` in ctx it falls back to naive; the barracks rule still fires first
  while below `barracksTarget`; the upgrade pass prefers a higher-value upgrade
  over a merely cheaper one.

**Derive expectations from the tables, never pin balance literals.** Assert
orderings and directions of change. A test that hardcodes "sniper scores 0.31"
breaks on the next retune without saying what broke — and a hardcoded roster is
what once made `waves.test.js` *enforce* the colossus bug.

### Edge cases this must handle

| case | expected |
|---|---|
| `waves` absent from ctx | fall back to naive ranking; existing direct-call tests unaffected |
| `fromWaveIndex` past the last wave | empty mix; no division by zero; naive fallback |
| a tower with `fireRate: 0` (barracks) | excluded from `BUYABLE` as today; priced by the barracks rule, not by DPS |
| every candidate scores 0 against the mix | deterministic tie-break (stable order), never `undefined` |
| `pierce` towers (mage, sniper) | armour ignored in their DPS, which is the point |
| tier-4 branch specs | scored from the branch's own stat block, not tier 1 |
| `maxTierAllowed` reached | no upgrade offered, exactly as today |

## Verification

- `npm run test` green, with the new files added.
- **`npm run balance` output MUST change** — that is the deliverable. This is the
  inverse of #17's check, where byte-identical output was the proof.
- **The game must not change at all.** Nothing under `src/data/`, `src/scenes/`,
  `src/entities/` or `src/ui/` is touched. `WaveManager.js` changes only by
  extracting a constant into an exported function.
- Re-run the map-2 sweep and report the new inversion count and whether the
  155g→160g win/loss flip survives. **A reduced count is the hoped-for result,
  not a pass condition** — if the flip persists, that is a finding about the map,
  which is #16's business, and must be reported rather than tuned away here.

## Out of scope (deliberate)

- **No balance changes.** `src/data/` is untouched. Re-deriving map 2's
  provisional cell, and re-examining maps 3-9, is backlog #16 — and it should be
  done *after* this lands, with the A/B column in hand.
- **`rankSlots`** still scores coverage at a hardcoded reference range of 120
  while sniper reaches 200 and ice 115 — a third blind spot in the same file.
  Backlogged, not fixed here.
- **The real game's tower picker** is untouched. This models a player; it does not
  advise one.
