# Campaign economy ramp (maps 3-9) — design

**Backlog #16.** Date: 2026-09-22. Branch: `balance/maps-3-9-recalibration` off `origin/main` @ `ef67486`.
Unblocked by #15 (PR #77), which made the balance simulator's tower choice matchup-aware.

## Diagnosis

The item asks whether maps 3-9 are too hard. They are not, in the way the
question implies. **The campaign's economy squeezes the player from every
direction at once, and the binding constraint is WHEN gold arrives, not how
much of it there is.**

Every dial moves against the player across the campaign, and none was
coordinated with the others:

| map | startGold | rewardMult | slots | total HP | lives | opening towers |
|---|---|---|---|---|---|---|
| 0 | 130 | 0.35 | 10 | 7,220 | 25 | 2 |
| 2 | 170 | 0.40 | 11 | 11,000 | 20 | 2 |
| 9 | **100** | **0.20** | **20** | **59,780** | **10** | **1** |

Map 9 carries 8.3x the enemy HP and twice the board on 77% of the start gold
and 57% of the kill reward. The simulator dies on wave 1 there having built
**one tower on a twenty-slot board** — it is not out-fought, it is unable to
build.

**Only maps 0 and 2 carry any recorded tuning rationale.** Maps 3-9's values
have no derivation anywhere in the repo. Maps 6-9 also violate PR #34's own
stated rule, "startGold retuned to a ~2-tower opening hand": at 110/100 gold
against a 60g cheapest tower, they afford one.

### The measurement that actually exposes it

`cheapestFullBoardCost` — the existing yardstick — counts only the cheapest
tower per slot and therefore hides the problem, because it ignores that late
maps unlock tier 4. An archer costs 110 taken to tier 2 but **310** taken to
tier 4. Measuring the gold ceiling against a *fully upgraded* board:

| maps 0-1 | map 2 | maps 3 | maps 4-9 |
|---|---|---|---|
| 0.75-0.79 | 0.65 | 0.42 | **0.26-0.34** |

A **2.4x collapse** in purchasing power relative to what each map asks the
player to build. This figure is model-free — it comes from the wave tables,
the reward multipliers and the tower costs, with no simulation in it.

### Timing, not total — proven

Holding total gold roughly constant and moving it earlier improves the maps,
and in two cases *less* total gold delivered earlier is strictly better:

| map | total gold | deficit |
|---|---|---|
| 6 | 1581 → **1457** (down) | 1.88x → **1.52x** |
| 9 | 2048 → **1946** (down) | 2.89x → **2.50x** |
| 8 | 1485 → 1827 | 2.80x → **1.85x** |

## Decisions taken (2026-09-22)

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | Maps 3-6 into the report's OK band; maps 7-9 keep a deliberate residual deficit | Every map into the OK band — the model omits hero abilities and meta upgrades, so tuning the finale to 1.0x in-sim makes it far easier in reality. |
| 2 | Economy dials only — `startGold` and `rewardMult` | Also touching waves/HP/lives. Wave tables encode argued decisions (the map-7 cliff, colossus placement); lives are the most player-visible difficulty signal. Both deserve their own item. |
| 3 | Values DERIVED from board size and upgrade depth, not hand-picked | Seven independent hand-tuned cells is how the dials drifted out of alignment with nothing written down. |
| 4 | Denominator is a **fully-upgraded** board, not a cheapest board | The cheapest-board metric hides the entire defect, because it cannot see tier 4. |
| 5 | **Maps 0-2 are not touched** | #71's on-ramp calibration STANDS by the standing decision recorded in backlog #18. |

## The derivation

```
startGold  = round(cheapBoard × OPENING_FRACTION / 10) × 10
rewardMult = (TARGET_DEPTH × depthBoard − startGold) / rawIncome

cheapBoard = 60 × slots                        (cheapest firing tower per slot)
depthBoard = archerCostToTier(maxTierAllowed) × slots
rawIncome  = Σ(enemy reward × count) + waves × WAVE_CLEAR_BONUS
```

Two constants, calibrated once by a 2-D sweep against the simulator:

- **`OPENING_FRACTION = 0.25`** — the opening hand is a quarter of a cheap
  board on every map, so it scales with the board instead of shrinking.
- **`TARGET_DEPTH = 0.55`** — the gold ceiling covers 55% of a fully upgraded
  board.

`TARGET_DEPTH = 0.55` sits deliberately **below** maps 0-2's measured 0.65-0.79.
The late campaign stays tighter than the early campaign, so the difficulty
curve rises rather than inverting — which is the failure #71 had to fix for
maps 0-2 and which a naive "make the hard maps richer" tuning would recreate.

### Resulting values

| map | startGold | rewardMult |
|---|---|---|
| 3 | 120 → 180 | 0.30 → 0.40 |
| 4 | 120 → 200 | 0.25 → 0.47 |
| 5 | 120 → 210 | 0.25 → 0.57 |
| 6 | 110 → 230 | 0.30 → 0.49 |
| 7 | 110 → 240 | 0.25 → 0.44 |
| 8 | 100 → 270 | 0.20 → 0.39 |
| 9 | 100 → 300 | 0.20 → 0.31 |

`startGold` now rises monotonically with the board. `rewardMult` rises for the
mid maps and then tapers, because later maps carry far more raw kill income —
a declining multiplier there is structurally correct and was never the defect.

### Expected outcome

| map | now | after |
|---|---|---|
| 3 | UNWINNABLE 1.19x | won, **61%** of lives kept |
| 4 | UNWINNABLE 1.57x | won, **56%** |
| 5 | UNWINNABLE 1.52x | won, **73%** |
| 6 | UNWINNABLE 1.88x | **1.05x** — on the edge |
| 7 | UNWINNABLE 2.23x | **1.30x** |
| 8 | UNWINNABLE 2.80x | **1.36x** |
| 9 | UNWINNABLE 2.89x | **1.36x** |

Maps 3-5 land in the OK band. Map 6 misses by 0.05x; since the model is
explicitly pessimistic, a 1.05x in-sim map is comfortably winnable in real
play, and forcing it below 1.0 would require pushing that map alone off the
derived rule. Maps 7-9 converge on a **uniform ~1.3x residue** — the finale
asks for hero abilities and meta upgrades, consistently rather than by accident.

## Implementation

`src/data/maps.js` only: fourteen numbers across maps 3-9, each with the
derivation recorded in a comment the way maps 0 and 2 already do, naming the
two constants and this spec so the next person can re-derive rather than guess.

A per-map override remains legitimate where the derived value misses the
intended band, but must record its reason. No map is expected to need one.

### Guard test

`src/data/mapsEconomy.test.js` (new) asserts the campaign's economy SHAPE, not
the literals — pinning literals would make the suite re-break on every future
retune without saying what broke:

- `startGold` is non-decreasing from map 3 to map 9.
- Every map affords at least a 2-tower opening hand (PR #34's rule, currently
  violated by maps 6-9).
- The gold ceiling as a fraction of a fully-upgraded board is non-increasing
  from map 2 onward — the late campaign never becomes *relatively* richer than
  the early campaign.
- Maps 0-2 are untouched: their `startGold`/`rewardMult` equal the values on
  `origin/main` at `ef67486`, pinned so the #18 decision cannot be eroded by a
  later sweep.

## Verification

- `npm run test` green, with the new guard test.
- `npm run balance` — every map's verdict recorded before and after. Maps 3-5
  must read OK; maps 6-9 must be strictly better than today.
- The A/B `Matchup sensitivity` column (from #15) must still show the aware
  policy at least as good as blind on every map — a balance change that only
  helps the blind model would indicate the tuning is exploiting a model artefact.
- Confirm `git diff --name-only` touches `src/data/maps.js` and the new test only.

## Out of scope (deliberate)

- **Waves, HP, lives, slot counts.** Untouched, so the map-7 cliff and the
  colossus placement survive intact.
- **Map 7's insensitivity to economy.** Under the old dials map 7 was the one
  map that did not respond to an economy change at all (2.23x → 2.23x). Under
  the new dials it moves to 1.30x, so the anomaly appears resolved — but if it
  reappears, it is a finding about map 7's wave shape and belongs in its own item.
- **The greedy policy's residual non-monotonicity** (more gold, slightly worse
  outcome at some cells) persists and is a property of the policy, not the map.
  Tracked under #27.
- **A human playtest still has not happened.** Every number here is simulated,
  against a model that is pessimistic by construction. These values should be
  treated as a calibrated starting point for a playtest, not a final answer.
