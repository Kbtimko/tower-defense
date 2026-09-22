# Campaign Economy Ramp (maps 3-9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the campaign's economy squeezing the player from every direction at once — give maps 3-9 an opening hand that scales with their board, so the late maps can actually be built on.

**Architecture:** Fourteen numbers in `src/data/maps.js`, derived from two constants rather than hand-picked, each with its derivation recorded in a comment. A new guard test pins the campaign's economy SHAPE — not its literals — so a future retune cannot silently re-introduce the collapse.

**Tech Stack:** Plain ES modules, Vitest 2. No new dependencies. No production code changes — this is a data change plus a test.

**Spec:** `docs/superpowers/specs/2026-09-22-campaign-economy-ramp-design.md`

## Global Constraints

- **Only two files may change:** `src/data/maps.js` and the new `src/data/mapsEconomy.test.js`. Nothing under `src/systems/`, `src/scenes/`, `src/entities/`, `src/ui/` or `src/sim/`.
- **Maps 0, 1 and 2 must NOT be touched.** Their `startGold`/`rewardMult` stay at `130/0.35`, `130/0.35`, `170/0.40`. PR #71's on-ramp calibration STANDS by the standing decision recorded in backlog #18. Changing them is a Critical error.
- **Only `startGold` and `rewardMult` may change.** Waves, HP, `startLives`, `towerSlots` and `maxTierAllowed` are untouched, so the deliberately-preserved map-7 cliff and the argued colossus placement both survive.
- **Guard tests assert SHAPE, never literals.** A test that hardcodes "map 5 startGold is 210" re-breaks on every future retune without saying what broke — and a hardcoded roster is what once made `waves.test.js` *enforce* the colossus bug.
- Run the full suite with `npm run test`. Never gate a commit on grepped output — `vitest | grep ... && git commit` commits red states, because grep exits 0 on a match.
- Comments explain *why*, not *what*.

### The derivation (for the comments you will write)

```
OPENING_FRACTION = 0.25      TARGET_DEPTH = 0.55

cheapBoard = 60 x slots                                  (cheapest firing tower per slot)
depthBoard = archerCostToTier(maxTierAllowed) x slots    (110 at tier 2, 190 at tier 3, 310 at tier 4)
rawIncome  = SUM(enemy reward x count) + waves x 38

startGold  = round(cheapBoard x OPENING_FRACTION / 10) x 10
rewardMult = (TARGET_DEPTH x depthBoard - startGold) / rawIncome
```

---

### Task 1: Guard the campaign's economy shape

Write the guard FIRST. Three of its assertions fail on today's data — that failure is the bug this plan fixes, and seeing it fail is the proof the guard works.

**Files:**
- Create: `src/data/mapsEconomy.test.js`

**Interfaces:**
- Consumes: `MAPS` from `src/data/maps.js`, `MAP_WAVES` from `src/data/waves.js`, `TOWER_DEFS` from `src/data/towers.js`, `goldCeiling` from `src/sim/economy.js`.
- Produces: nothing. Task 2 makes these assertions pass.

- [ ] **Step 1: Write the failing test**

Create `src/data/mapsEconomy.test.js`:

```js
// The campaign's economy SHAPE, not its numbers.
//
// Every dial used to move against the player at once: startGold fell 130 -> 100
// across the campaign while the board doubled and enemy HP rose 8.3x, so map 9
// opened with one tower on twenty slots. These assertions describe the shape a
// sane ramp has, so a future retune cannot quietly restore the collapse.
// Deliberately no literal values — see the spec for why.
import { describe, it, expect } from 'vitest';
import { MAPS } from './maps.js';
import { MAP_WAVES } from './waves.js';
import { TOWER_DEFS } from './towers.js';
import { goldCeiling } from '../sim/economy.js';

const CHEAPEST = Math.min(
  ...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost),
);

// What it costs to fill AND fully upgrade a board to the map's own tier cap.
// The existing cheapestFullBoardCost cannot see tier 4 — an archer costs 110
// taken to tier 2 but 310 taken to tier 4 — which is exactly why the collapse
// went unnoticed.
function depthBoardCost(map) {
  const def = TOWER_DEFS.archer;
  let per = def.cost;
  for (let t = 2; t <= (map.maxTierAllowed ?? 4); t++) {
    const tier = def[t === 4 ? 'tier4A' : `tier${t}`];
    if (tier) per += tier.cost;
  }
  return per * map.towerSlots.length;
}

const depthRatio = (map) =>
  goldCeiling(map, MAP_WAVES[map.id]).total / depthBoardCost(map);

const byId = (id) => MAPS.find(m => m.id === id);
const late = () => MAPS.filter(m => m.id >= 3).sort((a, b) => a.id - b.id);

describe('campaign economy ramp', () => {
  it('never shrinks the opening hand as the campaign goes on', () => {
    const gold = late().map(m => m.startGold);
    for (let i = 1; i < gold.length; i++) {
      expect(gold[i]).toBeGreaterThanOrEqual(gold[i - 1]);
    }
  });

  it('gives every map at least a two-tower opening hand', () => {
    // PR #34's own stated rule. Maps 6-9 violated it at 110/100 gold.
    for (const m of MAPS) {
      expect(m.startGold).toBeGreaterThanOrEqual(2 * CHEAPEST);
    }
  });

  it('does not let purchasing power collapse across the late campaign', () => {
    // Spread, not a monotonic test: rounding rewardMult to 2dp puts +/-0.017 of
    // jitter around the target, and a strict non-increasing assertion would fail
    // on a correct ramp.
    const ratios = late().map(depthRatio);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThanOrEqual(0.05);
  });

  it('never makes a late map relatively richer than the early campaign', () => {
    const early = depthRatio(byId(2));
    for (const m of late()) {
      expect(depthRatio(m)).toBeLessThanOrEqual(early);
    }
  });

  it('leaves the on-ramp maps exactly as PR #71 calibrated them', () => {
    // Backlog #18 records the standing decision that this calibration STANDS.
    expect(byId(0).startGold).toBe(130);
    expect(byId(0).rewardMult).toBe(0.35);
    expect(byId(1).startGold).toBe(130);
    expect(byId(1).rewardMult).toBe(0.35);
    expect(byId(2).startGold).toBe(170);
    expect(byId(2).rewardMult).toBe(0.40);
  });
});
```

The last test DOES pin literals, deliberately and uniquely: it exists to stop a
future sweep eroding a decision that was argued and recorded, so the literals
are the point.

- [ ] **Step 2: Run the test and SEE IT FAIL**

Run: `npx vitest run src/data/mapsEconomy.test.js`
Expected: **3 failures out of 5.**
- `never shrinks the opening hand` — fails; startGold runs `120,120,120,110,110,100,100`.
- `at least a two-tower opening hand` — fails; maps 6-9 are at 110/110/100/100 against a 60g cheapest tower.
- `does not let purchasing power collapse` — fails; today's spread is about **0.16** (0.42 down to 0.26) against a 0.05 limit.

The other two already pass. If you see a different count, stop and report it — the guard is describing something other than what the spec measured.

- [ ] **Step 3: Commit the failing guard**

Commit it red, on its own, so the diff shows the bug existed before the fix.

```bash
git add src/data/mapsEconomy.test.js
git commit -m "test(data): guard the campaign economy ramp (currently failing)"
```

---

### Task 2: Apply the derived economy values to maps 3-9

**Files:**
- Modify: `src/data/maps.js` — `startGold` and `rewardMult` inside the `id: 3` through `id: 9` blocks (the blocks begin at lines 101, 128, 156, 184, 212, 240 and 269)

**Interfaces:**
- Consumes: the guard from Task 1.
- Produces: nothing.

- [ ] **Step 1: Apply the fourteen values**

Change ONLY these two fields in each of the seven map blocks. Every other field in every block, and all of maps 0-2, stay exactly as they are.

| map | `startGold` | `rewardMult` |
|---|---|---|
| 3 | `120` → `180` | `0.30` → `0.40` |
| 4 | `120` → `200` | `0.25` → `0.47` |
| 5 | `120` → `210` | `0.25` → `0.57` |
| 6 | `110` → `230` | `0.30` → `0.49` |
| 7 | `110` → `240` | `0.25` → `0.44` |
| 8 | `100` → `270` | `0.20` → `0.39` |
| 9 | `100` → `300` | `0.20` → `0.31` |

- [ ] **Step 2: Record the derivation above each map's `startGold`**

Maps 0 and 2 already carry tuning rationale; match that style. The point is that
the next person can re-derive rather than guess — the absence of exactly this is
why seven maps drifted out of alignment. Put a short block above `startGold` in
each of the seven maps, naming the numbers that produced the values, e.g. for
map 9:

```js
    // Economy derived, not hand-picked -- see
    // docs/superpowers/specs/2026-09-22-campaign-economy-ramp-design.md
    // 20 slots: cheap board 1200, fully-upgraded board 6200 (tier-4 cap).
    // startGold  = 25% of the cheap board, so the opening hand scales with the
    //              board instead of shrinking (this map used to open with ONE
    //              tower on twenty slots).
    // rewardMult = solves gold ceiling = 55% of the fully-upgraded board. Lower
    //              than the mid maps because this one carries far more raw kill
    //              income; the declining multiplier was never the defect.
    startGold: 300,
```

Write the equivalent for maps 3-8 using their own slot counts and board costs:

| map | slots | cheap board | depth board | tier cap |
|---|---|---|---|---|
| 3 | 12 | 720 | 2280 | 3 |
| 4 | 13 | 780 | 4030 | 4 |
| 5 | 14 | 840 | 4340 | 4 |
| 6 | 15 | 900 | 4650 | 4 |
| 7 | 16 | 960 | 4960 | 4 |
| 8 | 18 | 1080 | 5580 | 4 |
| 9 | 20 | 1200 | 6200 | 4 |

- [ ] **Step 3: Run the guard and verify it goes green**

Run: `npx vitest run src/data/mapsEconomy.test.js`
Expected: PASS, 5 of 5 — including the maps 0-2 pin, which proves you did not touch them.

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS. Watch for fallout in `src/data/maps.test.js` and anything asserting economy behaviour; if something fails, report it rather than adjusting the value to suit the test — a test that disagrees with a deliberate balance change is information.

- [ ] **Step 5: Record the balance report, before and after**

Run: `npm run balance`

Capture the full output. The per-map verdicts should move from this:

```
3  Orbital Station      UNWINNABLE  1.19x
4  Asteroid Belt        UNWINNABLE  1.57x
5  Titan's Reach        UNWINNABLE  1.52x
6  Deep Space Corridor  UNWINNABLE  1.88x
7  The Void Frontier    UNWINNABLE  2.23x
8  Enemy Homeworld      UNWINNABLE  2.80x
9  Last Light           UNWINNABLE  2.89x
```

to approximately: maps 3, 4 and 5 **OK** (keeping roughly 61%, 56% and 73% of
lives), map 6 about **1.05x**, and maps 7-9 converging on about **1.30x, 1.36x,
1.36x**.

Exact figures may drift a little; the acceptance conditions are that **maps 3-5
read OK** and **every one of maps 6-9 is strictly better than the value above**.
If any map moves the wrong way, stop and report it — do not adjust a value to
chase the number.

- [ ] **Step 6: Commit**

```bash
git add src/data/maps.js
git commit -m "balance(maps): give maps 3-9 an opening hand that scales with the board"
```

---

## Verification (after both tasks, before the PR)

- [ ] `npm run test` — full suite green; report the actual file/test counts.
- [ ] **Scope guard:** `git diff --name-only origin/main..HEAD` must list only `src/data/maps.js`, `src/data/mapsEconomy.test.js` and the two docs files. Anything else is a scope violation.
- [ ] **Maps 0-2 untouched:** `git diff origin/main..HEAD -- src/data/maps.js` must show no change inside the `id: 0`, `id: 1` or `id: 2` blocks.
- [ ] `npm run balance` — record the full before/after table.
- [ ] **The A/B column still favours the aware policy.** In the `Matchup sensitivity` section every map's `aware` figure must be at least as good as its `blind` figure. If a map now does BETTER under the blind policy, the tuning is exploiting a quirk of the model rather than fixing the economy — stop and report it.
- [ ] Re-run the map-2 startGold sweep and confirm map 2 is unchanged from `origin/main` — it is the map most likely to be disturbed by accident, and it is explicitly out of scope.
