# Level 1–3 On-Ramp Recalibration — Design

**Date:** 2026-09-20
**Status:** Approved
**Origin:** Human playtest report — "I'm having a hard time beating level one."
**Follows up:** `2026-06-17-economy-calibration-design.md`, which shipped its
numbers marked *"model-derived starting points — needs human playtest-tuning for
winnability per map."* This is that playtest tuning, for the first three maps.

## Problem

Level 1 (map id 0, Outpost Sigma — the overworld labels nodes `id + 1`) is harder
than Level 2 on every input except starting lives:

| | L1 Outpost Sigma | L2 Lunar Gate |
|---|---|---|
| Total enemy HP | **8,800** | 8,120 |
| `rewardMult` | **0.30** | 0.35 |
| Total kill gold | **582** | 605 |
| Peak wave pressure | **184 hp/s** (w9) | 136 hp/s (w9) |
| Brutes shipped | **25** | 21 |
| Start lives | 25 | 20 |
| `npm run balance` | **UNWINNABLE** (lost w9) | OK (kept 35%) |

Level 1 carries 8% more HP, pays 14% less per kill, and peaks 35% harder. Five
extra lives do not cover that. Level 3 then jumps a further 27% in HP-per-wave
and is lost at wave 5.

The campaign's on-ramp difficulty ordering is inverted, and the first map a new
player meets is the one that fails them.

## Root cause

Two compounding faults. Neither is a bug; both are gaps in what was calibrated.

### 1. The economy spec optimised a fill curve, not a difficulty ordering

`2026-06-17-economy-calibration-design.md` tuned each map's `rewardMult` against
a *board-fill* target — how far through a level the player can first afford a
full cheap board. It never compared difficulty *between* maps, so map 0 landing
below map 1 was invisible to its acceptance criteria. Map 0 got 0.30, map 1 got
0.35, and nothing checked that ordering.

### 2. The archer/brute trap

130 starting gold buys exactly two archers (60g). The archer is also what the
simulator's greedy policy picks, because `towerValue` in `src/sim/buildPolicy.js`
is `damage * fireRate / cost` — which ignores both armor and the weakness matrix.
A new player reading the shop does the same arithmetic and reaches the same
answer.

The archer is the worst tower in the game against the brute. `src/systems/damage.js`
subtracts armor flat, *then* applies the weakness multiplier:

```
archer 15 dmg − brute armor 8 = 7,  × 0.75 (weakness) = 5 DPS  →  24s per brute
```

Effective tier-1 DPS against a brute:

| tower | cost | DPS vs brute | time-to-kill |
|---|---|---|---|
| archer | 60 | **5.0** | 24s |
| ice | 80 | **0.7** | 171s (floors at 1 dmg/shot) |
| mage | 90 | 13.2 | 9s |
| cannon | 110 | 24.8 | 5s |
| sniper | 120 | 27.0 | 4s |

The cheapest tower is 5x worse than the cheapest *answer*, against the enemy the
map leans on hardest.

Gold is **not** the binding constraint here, and it is worth being precise about
that. By the end of wave 3 the shipped table has paid out 282 gold; after a 120g
two-archer opening that leaves 162 — a cannon (110) is already affordable. The
trap is not that the player *cannot* buy the answer. It is that:

- the natural read of the shop (cheapest tower, best damage-per-gold) picks the
  archer, exactly as `towerValue` does; and
- Level 1 then tests that choice on **wave 4 with four brutes at once** — 480 HP
  against two archers at 5 DPS each — with no smaller beat beforehand to reveal
  the mismatch, and no slack afterwards to recover.

A player is punished for a reasonable inference before anything has shown them it
was wrong.

This is not an information gap either. The tower-picker tooltip
(`src/scenes/UIScene.js:90`) already shows matchups before purchase and does say
the archer is weak against brutes. It is a pacing and numbers problem.

## Goal

Make the first three maps ramp monotonically, with Level 1 the gentlest map in
the campaign. Success criteria:

1. All three maps are winnable in `npm run balance` at `damageMult` 1.0.
2. Lives-kept decreases monotonically across L1 → L2 → L3 (easier → harder).
3. HP-per-wave increases monotonically across L1 → L2 → L3.
4. Level 1 introduces the brute on an isolated wave, smaller than the wave that
   follows it, so the archer mismatch is revealed before it is punished.
5. A regression test pins criterion 3 so the inversion cannot silently return.

Criterion 3 is deliberately model-free: it holds whether or not the simulator is
trusted.

## Approach

Waves are the primary lever, economy the secondary. The entire diff lands in
`src/data/` — no logic changes, no new fields, no new systems.

Level 2 is **deliberately untouched**. It is the only map the simulator currently
rates healthy, so it serves as the fixed reference the other two are ordered
against. Changing it would remove the one calibrated point in the range.

### Changes

| | L1 Outpost Sigma | L2 Lunar Gate | L3 The Crater |
|---|---|---|---|
| `startGold` | 130 *(unchanged)* | *untouched* | 130 → **170** |
| `rewardMult` | 0.30 → **0.35** | *untouched* | 0.30 → **0.40** |
| Total HP | 8,800 → **7,220** | 8,120 | 12,330 → **11,000** |
| Brutes | 25 → **15** | 21 | 38 → **31** |
| First brute wave | 4 → **5** | 4 | 4 |
| Sim verdict | LOST w9 → **OK 68%** | OK 35% | LOST w5 → **OK 30%** |

HP-per-wave ramp: `880 → 812 → 1028` becomes **`722 → 812 → 917`** — monotonic
and smooth (+12%, +13%).

### Level 1 wave table (map 0)

```js
0: [
  [{ type: 'drone',   count: 6,  interval: 1200 }],
  [{ type: 'drone',   count: 8,  interval: 1100 }, { type: 'skitter', count: 3, interval: 950  }],
  [{ type: 'skitter', count: 8,  interval: 850  }],
  [{ type: 'drone',   count: 10, interval: 1000 }],
  [{ type: 'brute',   count: 3,  interval: 1400 }],
  [{ type: 'drone',   count: 6,  interval: 1000 }, { type: 'brute',   count: 3, interval: 1400 }],
  [{ type: 'drone',   count: 8,  interval: 950  }, { type: 'skitter', count: 5, interval: 750  }],
  [{ type: 'brute',   count: 5,  interval: 1150 }, { type: 'skitter', count: 5, interval: 700  }],
  [{ type: 'drone',   count: 8,  interval: 900  }, { type: 'brute',   count: 4, interval: 1050 }, { type: 'skitter', count: 6, interval: 750 }],
  [{ type: 'drone',   count: 16, interval: 750  }],
],
```

**The brute gets a solo debut.** Wave 4 changes from 4 brutes to 10 drones, and
wave 5 becomes **3 brutes alone** — a 360 HP wave instead of 480, with nothing
else on screen to split the player's attention or their towers' targeting.

The intent is a teaching beat, not a gold gate. Measured on a consistent basis
(start gold + all kill rewards + wave-clear bonus, no early-send), and assuming a
120g two-archer opening:

| | first brute wave | spare gold entering it |
|---|---|---|
| shipped | w4 — 4 brutes (480 HP) | 162 |
| proposed | w5 — 3 brutes (360 HP) | 237 |

Both afford a cannon. What changes is that the mismatch is now revealed by a
smaller, isolated wave, and the player enters it with 46% more spare gold — so a
player who opened with two archers can watch them struggle against three brutes
and still have room to add a cannon before wave 6 doubles up.

### Level 3 wave table (map 2)

```js
2: [
  [{ type: 'drone',   count: 8,  interval: 1100 }],
  [{ type: 'skitter', count: 6,  interval: 900  }],
  [{ type: 'drone',   count: 10, interval: 1000 }, { type: 'skitter', count: 4, interval: 850 }],
  [{ type: 'brute',   count: 4,  interval: 1300 }],
  [{ type: 'drone',   count: 10, interval: 950  }, { type: 'brute',   count: 3, interval: 1300 }],
  [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'brute',   count: 3, interval: 1200 }],
  [{ type: 'drone',   count: 10, interval: 900  }, { type: 'skitter', count: 6, interval: 780  }],
  [{ type: 'brute',   count: 6,  interval: 1100 }],
  [{ type: 'drone',   count: 10, interval: 850  }, { type: 'brute',   count: 4, interval: 1100 }],
  [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 5, interval: 1000 }],
  [{ type: 'drone',   count: 14, interval: 800  }, { type: 'skitter', count: 8, interval: 700  }],
  [{ type: 'drone',   count: 18, interval: 650  }, { type: 'brute',   count: 6, interval: 900  }],
],
```

## Confidence — deliberately uneven

The two halves of this change are **not** equally well-supported, and the
implementation should carry that distinction into code comments.

### Level 1: high confidence

Sweeping `startGold` in 5g steps at fixed `rewardMult` produces a near-monotonic
lives-kept curve — **1 inversion in 14 steps** — with one clean threshold. The
simulator's verdict agrees with the human playtest report that prompted this
work.

Trimming Level 1's waves alone fixes the map even at the *current* 130g/0.30 —
64% kept, up from a loss at wave 9. `rewardMult` is nudged to 0.35 not because
the map needs the gold but because **130/0.30 sits one 5g step above a cliff**:

| `rewardMult` | 120g | 125g | 130g | 135g | 140g |
|---|---|---|---|---|---|
| 0.30 | 24% | 24% | 64% | 68% | 64% |
| 0.35 | 44% | 68% | 68% | 64% | 76% |

At 0.30 the calibration balances on the edge of a 40-point drop. At 0.35 the
125–140g band is uniformly 64–76%, so the map stays winnable under any small
future change to gold, enemy rewards, or the wave-clear bonus. Matching Level 2's
0.35 also gives the two intro maps a shared economy, which is one fewer arbitrary
per-map number to justify.

### Level 3: provisional — playtest-tunable, not derived

The same sweep on map 2 gives **5 inversions in 11 steps**: `50% → 45% → 20% →
10% → 15% → 30% → 15% → 35% → 40% → 15%`. Giving the modelled player *more* gold
routinely makes the outcome *worse*, and the erratic behaviour persists up to
220g.

The cause is the `towerValue` mis-ranking above. Map 2 has 11 slots and allows
tier 3, so a mis-ranked build order compounds into wildly different outcomes for
small budget changes. Map 0 (10 slots, tier 2, comfortably winnable) does not
compound this way, which is why its curve is clean.

`170 / 0.40` is the most stable cell available — a three-wide 30% plateau at
165/170/175g — but **the model cannot resolve L2-vs-L3 ordering at this
granularity.** These are starting points for a human playtest, not derived
answers. Expect to retune them after playing.

## Testing

- **New invariant test** in `src/data/waves.test.js`: HP-per-wave strictly
  increases across maps 0 → 1 → 2. Derived from `MAP_WAVES` and `ENEMY_DEFS`, not
  hardcoded — per the established rule that an allow-list restated in a test
  makes the suite enforce stale content.
- **New test**: map 0's first brute wave is strictly later than map 0's first
  drone wave, pinning the solo-debut intent.
- Existing `waves.test.js` / `maps.test.js` coverage must stay green.
- `npm run balance` must report all three maps winnable at `damageMult` 1.0.
- **Live verification is required and is the whole point of this change**: play
  Level 1 in the running game and confirm it is beatable. A green suite is not a
  playable map — the shipped calibration passed every test.

## Out of scope

- **Maps 3–9.** The simulator is unreliable there for the same reason it is on
  map 2, and the scope for this change is the on-ramp.
- **Tower and enemy constants** — the archer's 0.75-vs-brute multiplier, brute
  armor 8, the floor-of-1 damage rule. These are campaign-wide and would
  invalidate the calibration of all ten maps at once.
- **Fixing `greedyBuildPlan`'s matchup-blindness.** This is the real reason the
  simulator is noisy, and making it matchup-aware would also re-test the standing
  claim that maps 4–9 are unwinnable. It deserves its own backlog item; it is not
  a prerequisite for unblocking Level 1.

## Backlog follow-ups this raises

1. **Make `greedyBuildPlan` matchup-aware** so the balance simulator becomes a
   usable tuning instrument. Until then, every per-map number past map 1 is a
   guess dressed as a measurement.
2. **Re-examine maps 3–9** once (1) lands, to establish whether "9 of 10 maps
   unwinnable" is a real calibration problem or an artefact of the model playing
   badly.
