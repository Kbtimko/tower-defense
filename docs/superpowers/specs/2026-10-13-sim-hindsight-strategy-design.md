# Simulator: hindsight best-of-N barracks strategy (backlog #32, #28)

**Date:** 2026-10-13
**Branch:** `feat/sim-build-policy`
**Backlog:** closes #32 and #28; defers #27 and #29 (findings recorded below)

## Goal

`npm run balance` is the only difficulty instrument this project has — no map has
ever been playtested (backlog #30). Its build policy currently plays one fixed
opening on every map: buy a barracks before any firing tower, never upgrade it.
That single fixed policy is an artefact, not a player, and its per-map numbers
partly measure the artefact.

**Success means the simulator models a competent player** who picks a sensible
barracks strategy for each map, the way a real player retries a level and
adapts. Whatever per-map numbers fall out are accepted and reported, including
maps 0-5 moving. No map data is retuned in this work.

## What the brainstorm measured (throwaway probes, not committed)

### The opening barracks (#32)

Each cell: win multiplier · result at 1x (W = won, % lives kept; else waves
survived) · towers built. "nextGround" = barracks only when the upcoming wave has
a ground enemy; "firingFirst" = barracks only after a firing tower exists.

| map | current | none | nextGround | firingFirst | both |
|---|---|---|---|---|---|
| 0 | 1x W 64% t9 | 1x W 64% t9 | 1x W 64% t9 | 1x W 64% t7 | 1x W 64% t7 |
| 1 | 1x W 55% t8 | 1x W 10% t8 | 1x W 55% t8 | 1x W 30% t7 | 1x W 30% t7 |
| 2 | 1x W 85% t11 | 1x W 55% t11 | 1x W 85% t11 | 1x W 85% t11 | 1x W 85% t11 |
| 3 | 1x W 61% t12 | 1x W 44% t11 | 1x W 61% t12 | 1x W 44% t10 | 1x W 44% t10 |
| 4 | 1x W 56% t13 | 1x W 67% t13 | 1x W 56% t13 | 1x W 67% t13 | 1x W 56% t13 |
| 5 | 1x W 60% t14 | 1x W 80% t14 | 1x W 60% t14 | 1x W 87% t14 | 1x W 100% t14 |
| 6 | 1.05x 9/15 t13 | 1x W 20% t15 | 1.05x 9/15 t13 | 1x W 40% t15 | 1x W 60% t15 |
| 7 | 1.3x 5/15 t7 | 1.25x 9/15 t15 | 1.05x 11/15 t16 | 1.05x 11/15 t16 | 1.05x 11/15 t16 |
| 8 | 1.36x 7/16 t10 | 1.08x 10/16 t17 | 1.36x 7/16 t10 | 1.19x 8/16 t13 | 1.08x 6/16 t7 |
| 9 | 1.36x 1/18 t3 | 1.55x 3/18 t5 | 1.49x 3/18 t3 | 1.49x 3/18 t3 | 1.49x 3/18 t3 |

Findings:

1. **#32's premise is half wrong.** Map 9's opening barracks is dead gold *on
   wave 1* (12 flying phantoms), but it pays for itself over the run: every
   alternative makes map 9 worse (1.36x → 1.49-1.55x).
2. **Map 6's wave 1 is 12 drones — ground.** The rule #32 proposed (make the
   opening conditional on blockable early waves) cannot fix map 6.
3. **No single rule wins everywhere**, and the model is volatile: near-identical
   rules move map 8 between 6, 7 and 10 waves survived.

### Barracks depth (#28)

Barracks upgrades jump the queue until the barracks reaches tier T.

| map | T1 (current) | T2 | T3 | T4 | 2 barracks @T2 |
|---|---|---|---|---|---|
| 0 | 1x W 64% | 1x W 32% | 1x W 32% | 1x W 32% | 1x W 48% |
| 1 | 1x W 55% | 1x W 40% | 1x W 40% | 1x W 40% | 1x W 50% |
| 2 | 1x W 85% | 1x W 85% | 1x W 90% | 1x W 90% | 1x W 70% |
| 3 | 1x W 61% | 1x W 50% | 1x W 61% | 1x W 61% | 1.05x 11/12 |
| 4 | 1x W 56% | 1x W 50% | 1x W 39% | 1x W 28% | 1.11x 7/14 |
| 5 | 1x W 60% | 1x W 67% | 1x W 33% | 1x W 27% | 1.03x 4/14 |
| 6 | 1.05x 9/15 | 1.08x 9/15 | **1x W 27%** | 1x W 13% | 1.49x 5/15 |
| 7 | 1.3x 5/15 | 1.41x 2/15 | 1.52x 2/15 | 1.52x 2/15 | 2.23x 1/15 |
| 8 | 1.36x 7/16 | 1.3x 4/16 | 1.38x 3/16 | 1.52x 3/16 | 1.52x 2/16 |
| 9 | 1.36x 1/18 | 1.36x 1/18 | 1.55x 1/18 | 1.82x 1/18 | 2.23x 1/18 |

Depth to T3 is the only change in either probe that wins map 6 outright. A
second barracks loses everywhere, so barracks count is not a candidate dimension.

### Slot ranking (#27) — deferred

Tower choice ranks by DPS-per-gold against the coming enemies and never reads the
slot, so "pick the tower, then the best free slot at ITS range" is a clean
decoupling. It still does not help:

| map | range 120 (current) | per-tower range | + barracks at 120 | + regret 95% |
|---|---|---|---|---|
| 0 | 1x W 64% | 1x W 64% | 1x W 64% | 1x W 56% |
| 1 | 1x W 55% | 1x W 55% | 1x W 55% | 1x W 25% |
| 2 | 1x W 85% | 1x W 55% | 1x W 55% | 1x W 55% |
| 3 | 1x W 61% | 1x W 28% | 1x W 44% | 1x W 28% |
| 4 | 1x W 56% | 1x W 72% | 1x W 72% | 1x W 72% |
| 5 | 1x W 60% | 1x W 73% | 1x W 73% | 1x W 73% |
| 6 | 1.05x 9/15 | 1.08x 8/15 | 1.08x 8/15 | 1.08x 10/15 |
| 7 | 1.3x 5/15 | 1.36x 3/15 | 1.36x 3/15 | 1.16x 4/15 |
| 8 | 1.36x 7/16 | 1.33x 6/16 | 1.33x 6/16 | 1.25x 6/16 |
| 9 | 1.36x 1/18 | 1.36x 1/18 | 1.36x 1/18 | 1.44x 6/18 |

("regret 95%": among free slots within 95% of this tower's best coverage, take the
one ranked worst at the 120 reference, preserving the short-range slots.)

Every variant reshuffles winners and losers. The defect is the **coverage proxy
itself** — counting sampled path points in range ignores where enemies are held
(blocking) and how long they dwell — not the hardcoded 120. Fixing that is its
own design problem.

## Decisions

| Question | Decision |
|---|---|
| What does success mean? | A competent player who picks a sensible strategy per map; accept the numbers that fall out. |
| How does the player choose? | **Hindsight best-of-N**: simulate the whole map under each candidate, report the best. |
| Candidate set | 3 openings × 2 depths, minus one duplicate = **5 candidates**. |
| #27 | Deferred, with the probe table above recorded in the backlog. |
| #29 | Deferred: under best-of-N the Matchup A/B table needs rethinking, and splitting it would cost 5x. |
| PR shape | One PR. |

## Design

### `src/sim/buildPolicy.js` — two new parameters on `greedyBuildPlan`

Both default to today's behaviour, so every existing caller and test is unchanged.

**`opening: 'start' | 'none' | 'beforeGround'`** (default `'start'`) decides the
effective barracks target for this round:

- `'start'` — `barracksTarget` as passed (default 1): today's behaviour.
- `'none'` — target 0.
- `'beforeGround'` — `barracksTarget` if the **upcoming** wave
  (`waves[waveNumber - 1]`) contains at least one enemy whose
  `ENEMY_DEFS[type].flying` is false, else 0. Only the next wave is inspected, no
  look-ahead window. A barracks already on the board stays and still counts
  toward the target. Past the last wave there is no ground wave, so no purchase.
  With no wave table (direct test callers), it behaves as `'start'`.

**`barracksTier: 1..4`** (default 1) is the explicit #28 rule. At the start of
the build round, before any new tower is bought, each barracks **already on the
board** is upgraded one tier at a time while its level is below
`min(barracksTier, map.maxTierAllowed ?? 4)` and the next tier is affordable.

- It does **not** hold gold: an unaffordable next tier is skipped and the
  remaining budget flows on to purchases. (Matches what the probe measured;
  holding gold would be a different, unmeasured candidate.)
- A barracks bought in this same round is not upgraded until the next round
  (upgrades address `towerIndex` into the existing roster).
- Upgrades are emitted as `{ upgrade: true, towerIndex }` **before** the purchase
  entries. `simulate.js` applies purchases in array order, so gold accounting
  stays consistent.
- The scored upgrade pass that follows is unchanged and still scores barracks at
  0 DPS; the comment there is rewritten to point at `barracksTier` instead of
  calling barracks depth unreachable.

Round order becomes: barracks depth upgrades → new purchases (unchanged:
best affordable tower into the best free slot at the 120 reference) → scored
upgrade pass (unchanged).

### `src/sim/strategy.js` — new

- **`CANDIDATE_STRATEGIES`** — plain data, default first:

  ```js
  [
    { opening: 'start',        barracksTier: 1 },   // today's policy
    { opening: 'start',        barracksTier: 3 },
    { opening: 'beforeGround', barracksTier: 1 },
    { opening: 'beforeGround', barracksTier: 3 },
    { opening: 'none',         barracksTier: 1 },   // depth is meaningless without a barracks
  ]
  ```

  On maps whose `maxTierAllowed` is 2 (maps 0-1), the `barracksTier: 3`
  candidates cap at T2.

- **`strategyLabel(s)`** — short report label, e.g. `start/T1`, `ground/T3`,
  `none`.

- **`pickBest(results)`** — pure. Each result is
  `{ strategy, multiplier, livesKept, wavesSurvived }`, where `multiplier` may be
  `null` (> 8x) and `livesKept` is `livesRemaining / map.startLives` (0..1) from
  the 1x run. Ordered by:
  1. lowest `multiplier` (`null` ranks as Infinity);
  2. highest `livesKept` at 1x;
  3. highest `wavesSurvived` at 1x;
  4. candidate order (so ties keep the default policy).

- **`bestStrategy(map, waves)`** — for each candidate, runs `simulateMap` at 1x
  and `findWinMultiplier`, both with
  `buildPlan: ctx => greedyBuildPlan({ ...ctx, ...strategy })`. It returns
  `{ best, results }`, where `best` carries the winning strategy, its 1x
  `simulateMap` result and its multiplier, and `results` has one entry per
  candidate.

### `scripts/balance.mjs`

- The headline table uses `bestStrategy`: the row's run, verdict and `needs` come
  from the winning candidate. A new **`strategy`** column shows its label.
- If every candidate is unwinnable at 8x, `needs` prints `>8x damage` as today,
  and the strategy shown is the default (the first in candidate order).
- The Blocking sensitivity and Matchup sensitivity tables stay on the **fixed
  default policy**; their headings and comments say so explicitly.
- The header prose mentions best-of-5 hindsight strategy choice.
- **Runtime contingency:** if the full report exceeds ~90s wall-clock, add a
  `--fast` flag that evaluates only the default candidate. Build it only if the
  measured runtime calls for it.

### Unchanged

`src/sim/simulate.js`, `src/sim/deficit.js`, `src/sim/matchupValue.js`, and all of
`src/data/` (maps, towers, enemies, waves).

## Edge cases

| Case | Behaviour |
|---|---|
| No wave table passed to `greedyBuildPlan` | `'beforeGround'` → `'start'`; matchup fallback as today |
| Upcoming wave index past the end | No ground wave → no barracks bought under `'beforeGround'` |
| `maxTierAllowed` below `barracksTier` | Depth capped at `maxTierAllowed` |
| Next barracks tier unaffordable | Skipped this round; gold spent on purchases/upgrades instead |
| Barracks bought this round | Upgraded next round at the earliest |
| Barracks already at target tier | No depth upgrade emitted |
| `opening: 'none'` with an existing barracks (not reachable from candidates) | Target 0 buys none; any existing barracks still gets depth upgrades |
| All candidates `null` (> 8x) | `needs` prints `>8x damage`; default strategy shown |
| Tie on multiplier and lives | Waves survived, then candidate order |
| Map wins at 1x under several candidates | Most lives kept wins; may push a mid map toward TOO EASY (reported, not corrected) |

## Testing

Every new test is **proven to fail** by breaking the code on purpose and
confirming that specific test goes red.

**`src/sim/buildPolicy.test.js`** (existing tests untouched and green):

- On a real map context, calling with no new parameters is equal to calling with
  `{ opening: 'start', barracksTier: 1 }`.
- `'none'` emits no barracks purchase.
- `'beforeGround'`: an all-flying upcoming wave → no barracks; a wave containing a
  ground enemy → barracks; no wave table → same output as `'start'`.
- `barracksTier`: the depth upgrade is emitted before any purchase; capped at
  `maxTierAllowed`; skipped when unaffordable with the gold still spent
  elsewhere; a barracks bought in the same call is not upgraded.

**`src/sim/strategy.test.js`** (new):

- Candidate list, with expectations derived rather than hardcoded:
  - the first entry equals `greedyBuildPlan`'s defaults;
  - every `opening` is one of the policy's accepted values;
  - no `'none'` entry has `barracksTier > 1`;
  - there are no duplicate entries.
- `pickBest` ordering, using hand-built results: `null` loses to any number;
  lives break a multiplier tie; waves break a lives tie; candidate order breaks a
  full tie.
- Integration: `bestStrategy` on map 0 returns one result per candidate, and
  `best` is one of them.

**Guards:** re-run `src/data/mapsEconomy.test.js` and confirm it is green (no data
changes, but verified, not assumed). Report the full suite count (1472 at the
start).

## Verification (measured, not clicked)

- `npm run balance`, before (baseline already captured) and after.
- The PR carries a per-map delta table: multiplier, lives kept or waves survived,
  chosen strategy, and any verdict changes (e.g. map 2 toward TOO EASY).
- Wall-clock runtime of `npm run balance`, before and after.
- **Report-only implications, with no data changes**, for you to decide:
  - **map 6 and map 9:** what the competent-player numbers say about them;
  - **backlog #31:** a re-run of its measurement (maps 3-5 with +120 start gold)
    under the best strategy, using an uncommitted scratch script.

## Docs

- `.claude/notes.md`:
  - close #32 and #28;
  - annotate #27 with the probe table and the "coverage proxy is the problem"
    finding, and leave it deferred;
  - defer #29 pending a rethink of the A/B table.
- Auto-memory "Balance simulator + difficulty cliff": the headline is now best-of-5
  hindsight, the opening barracks is a strategy choice, and #28 has a rule.
- `balance.mjs` header prose.

## Out of scope

- #27 slot ranking, and any replacement for the coverage proxy.
- #29, or removing the Matchup A/B table.
- Any change to `src/data/maps.js` (`startGold`, `rewardMult`) or other data.
- Holding gold for barracks depth and look-ahead windows beyond one wave
  (unmeasured), and the firing-tower-first opening (it helped maps 6 and 8 in the
  probe but was left out of the candidate set to keep N small; T3 depth already
  wins map 6).
