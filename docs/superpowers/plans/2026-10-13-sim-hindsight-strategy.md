# Simulator Hindsight Barracks Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run balance` reports each map under the best of 5 barracks strategies (3 openings × 2 depths) instead of one fixed opening, closing backlog #32 and #28.

**Architecture:** `greedyBuildPlan` gains two parameters, `opening` and `barracksTier`, whose defaults reproduce today's behaviour byte-for-byte. A new `src/sim/strategy.js` holds the candidate list, a pure `pickBest` ranking, and `bestStrategy(map, waves)`, which runs every candidate through the existing `simulateMap` + `findWinMultiplier`. `scripts/balance.mjs` switches its headline table to `bestStrategy` and adds a `strategy` column.

**Tech Stack:** Plain ES modules (no TypeScript), Vitest 2 + jsdom, Node for `scripts/balance.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-13-sim-hindsight-strategy-design.md`

**Worktree:** `/Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy` on branch `feat/sim-build-policy`. Run every command from there. The shell `cwd` can silently reset, so prefix commands with `cd <worktree> &&`.

## Global Constraints

- No changes to anything under `src/data/` (maps, towers, enemies, waves), or to `src/sim/simulate.js`, `src/sim/deficit.js` or `src/sim/matchupValue.js`.
- `greedyBuildPlan` called with neither new parameter must behave exactly as today: `opening` defaults to `'start'` and `barracksTier` defaults to `1`.
- Candidate set, in this order: `start/T1`, `start/T3`, `beforeGround/T1`, `beforeGround/T3`, `none/T1`.
- `pickBest` order: lowest multiplier (`null` = Infinity), then highest `livesKept` (`livesRemaining / map.startLives`, from the 1x run), then highest `wavesSurvived`, then candidate order.
- Barracks depth does **not** hold gold. It upgrades only barracks already on the board at the start of the round, capped at `min(barracksTier, map.maxTierAllowed ?? 4)`.
- Every new test must be **proven to fail**: break the code on purpose, confirm that specific test goes red, then restore it.
- Comments explain *why*, not *what*. Match the surrounding comment density.
- Stage explicit file paths only (never `git add -A` or `git add .`). Use Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never pipe test output through `tail` or `head`. Check the exit code.

## Review Focus

- **A typo in `opening`** (e.g. `'beforeGrond'`) must throw, not silently play `'start'`. Pinned in Task 1.
- **A wave group whose `type` is not in `ENEMY_DEFS`** must not count as "ground" under `'beforeGround'`. Pinned in Task 1.
- **The scored upgrade pass must see the levels the depth rule just bought**, or it re-buys tiers past the cap. Pinned in Task 2.
- **A strategy object must actually reach the policy.** If `bestStrategy` silently ran the default five times, every column would look plausible. Pinned in Task 3.
- **`npm run balance -- --map 9`** (single-map mode) must still print a well-formed row with the new column. Checked by hand in Task 4.

---

### Task 1: `opening` parameter on `greedyBuildPlan`

**Files:**
- Modify: `src/sim/buildPolicy.js` (imports at the top; the `DEFAULT_BARRACKS_TARGET` block around line 41; the `greedyBuildPlan` signature and purchase loop, lines 57-93)
- Test: `src/sim/buildPolicy.test.js` (append a new `describe` block)

**Interfaces:**
- Consumes: `ENEMY_DEFS` from `src/data/enemies.js` (each def has a boolean `flying`).
- Produces:
  - `export const OPENINGS = ['start', 'none', 'beforeGround']`
  - `export const DEFAULT_OPENING = 'start'`
  - `export function openingBarracksTarget(opening, barracksTarget, waves, waveNumber) → number`, which throws `Error('unknown opening: <x>')` on an unknown value
  - `greedyBuildPlan({ ..., opening = DEFAULT_OPENING })`

- [ ] **Step 1: Write the failing tests**

Append to `src/sim/buildPolicy.test.js`. Keep the existing `plan` helper and wave fixtures at the top of the file. Add `phantomWaves` beside the other fixtures, and add the `OPENINGS` import to the existing import line:

```js
import { greedyBuildPlan, OPENINGS } from './buildPolicy.js';
```

```js
const phantomWaves = [[{ type: 'phantom', count: 12, interval: 500 }]];
const isBarracks = x => x.type === 'barracks';

describe('greedyBuildPlan opening', () => {
  // The shared `plan` helper zeroes barracksTarget; these tests are about the
  // barracks, so they put the standard target of 1 back.
  const open = (over = {}) => plan({ barracksTarget: 1, ...over });

  it("defaults to 'start', which buys the barracks first", () => {
    expect(open({ waves: phantomWaves })).toEqual(open({ waves: phantomWaves, opening: 'start' }));
    expect(open({ waves: phantomWaves, opening: 'start' })[0].type).toBe('barracks');
  });

  it("'none' never buys a barracks", () => {
    expect(open({ waves: droneWaves, opening: 'none' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' skips the barracks ahead of an all-flying wave", () => {
    // Tier-1 soldiers cannot block flyers: map 9's wave 1 is 12 phantoms.
    expect(open({ waves: phantomWaves, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' buys the barracks ahead of a wave with any ground enemy", () => {
    const mixed = [[
      { type: 'phantom', count: 12, interval: 500 },
      { type: 'drone',   count: 1,  interval: 500 },
    ]];
    expect(open({ waves: mixed, opening: 'beforeGround' })[0].type).toBe('barracks');
  });

  it("'beforeGround' reads only the upcoming wave", () => {
    const waves = [phantomWaves[0], droneWaves[0]];
    expect(open({ waves, waveNumber: 1, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
    expect(open({ waves, waveNumber: 2, opening: 'beforeGround' })[0].type).toBe('barracks');
  });

  it("'beforeGround' buys nothing past the last wave", () => {
    expect(open({ waves: droneWaves, waveNumber: 99, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' does not count an unknown enemy type as ground", () => {
    const unknown = [[{ type: 'not-an-enemy', count: 5, interval: 500 }]];
    expect(open({ waves: unknown, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' behaves as 'start' with no wave table", () => {
    // simulate.test.js and soldiers.test.js call the policy with hand-built
    // contexts that carry no waves; they must keep their meaning.
    expect(open({ opening: 'beforeGround' })).toEqual(open({ opening: 'start' }));
  });

  it('keeps counting a barracks already on the board toward the target', () => {
    const p = open({
      waves: droneWaves, opening: 'beforeGround',
      towers: [{ type: 'barracks', level: 1 }], slotsUsed: new Set([0]),
    });
    expect(p.some(isBarracks)).toBe(false);
  });

  it('rejects an unknown opening instead of silently playing the default', () => {
    expect(() => open({ waves: droneWaves, opening: 'beforeGrond' })).toThrow(/opening/);
  });

  it('exports every opening it accepts', () => {
    for (const opening of OPENINGS) {
      expect(() => open({ waves: droneWaves, opening })).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/buildPolicy.test.js; echo "exit=$?"`

Expected: FAIL. `OPENINGS` is undefined, so the `exports every opening` test throws. `'none'`, the `'beforeGround'` skip tests, and the `rejects an unknown opening` test fail. `exit=1`.

- [ ] **Step 3: Implement**

In `src/sim/buildPolicy.js`, add this import next to the existing ones:

```js
import { ENEMY_DEFS } from '../data/enemies.js';
```

Directly below the `DEFAULT_BARRACKS_TARGET` constant, add:

```js
// WHEN the opening barracks is bought. 'start' is the standard opening and
// buys it before any firing tower; 'none' never buys one; 'beforeGround' waits
// for a wave soldiers can actually hold — tier-1 soldiers cannot block flyers,
// so a barracks bought ahead of an all-flying wave idles through it. No single
// rule wins on every map, which is why src/sim/strategy.js tries them all.
export const OPENINGS = ['start', 'none', 'beforeGround'];
export const DEFAULT_OPENING = 'start';

// Barracks target for this build round under an opening. Only the upcoming
// wave is read; a barracks already standing still counts toward the target.
export function openingBarracksTarget(opening, barracksTarget, waves, waveNumber) {
  if (!OPENINGS.includes(opening)) throw new Error(`unknown opening: ${opening}`);
  if (opening === 'none') return 0;
  if (opening === 'start' || !Array.isArray(waves)) return barracksTarget;
  const next = waves[waveNumber - 1] ?? [];
  return next.some(g => ENEMY_DEFS[g.type] && !ENEMY_DEFS[g.type].flying) ? barracksTarget : 0;
}
```

In the `greedyBuildPlan` signature, add `opening = DEFAULT_OPENING` after `barracksTarget = DEFAULT_BARRACKS_TARGET,`:

```js
export function greedyBuildPlan({
  gold, slotsUsed, buildZones, path, towers = [], map = {},
  barracksTarget = DEFAULT_BARRACKS_TARGET, opening = DEFAULT_OPENING,
  waves = null, waveNumber = 1, matchupAware = true,
}) {
```

Directly after the line `let barracks = towers.filter(t => t.type === 'barracks').length;`, add:

```js
  const target = openingBarracksTarget(opening, barracksTarget, waves, waveNumber);
```

In the purchase loop, change `const wantBarracks = barracks < barracksTarget;` to:

```js
    const wantBarracks = barracks < target;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/buildPolicy.test.js; echo "exit=$?"`

Expected: all tests pass (existing and new), `exit=0`.

- [ ] **Step 5: Prove the new tests bite**

Make each break below by hand, run the file and confirm that the **named** test fails, then revert the break:
1. In `openingBarracksTarget`, change `!ENEMY_DEFS[g.type].flying` to `true`. The test `skips the barracks ahead of an all-flying wave` must fail.
2. Change `ENEMY_DEFS[g.type] && !ENEMY_DEFS[g.type].flying` to `!ENEMY_DEFS[g.type]?.flying`. The test `does not count an unknown enemy type as ground` must fail.
3. Change `waves[waveNumber - 1]` to `waves[0]`. The test `reads only the upcoming wave` must fail.
4. Delete the `throw` line. The test `rejects an unknown opening` must fail.
5. Change `DEFAULT_OPENING = 'start'` to `'none'`. The test `defaults to 'start'` must fail.

After reverting, re-run Step 4 and confirm `exit=0`.

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npm run test; echo "exit=$?"`

Expected: `exit=0`. Record the test count; it should be 1472 plus the 11 new tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy
git add src/sim/buildPolicy.js src/sim/buildPolicy.test.js
git commit -m "feat(sim): opening strategy for the barracks — start, none, beforeGround

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `barracksTier` depth rule (backlog #28)

**Files:**
- Modify: `src/sim/buildPolicy.js` (`greedyBuildPlan` signature; insert the depth pass after the `target` line from Task 1; the upgrade-pass comment and its `const levels = ...` line)
- Test: `src/sim/buildPolicy.test.js` (append two `describe` blocks)

**Interfaces:**
- Consumes: `upgradeCost(tower, maxTier)` (already exported from `buildPolicy.js`), plus `DEFAULT_OPENING` from Task 1.
- Produces:
  - `export const DEFAULT_BARRACKS_TIER = 1`
  - `greedyBuildPlan({ ..., barracksTier = DEFAULT_BARRACKS_TIER })`. Depth upgrades are emitted as `{ upgrade: true, towerIndex }` **before** any purchase entry.

- [ ] **Step 1: Write the failing tests**

Add these imports at the top of `src/sim/buildPolicy.test.js`, merging with the existing import lines:

```js
import { greedyBuildPlan, OPENINGS, upgradeCost } from './buildPolicy.js';
import { simulateMap } from './simulate.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
```

Append:

```js
describe('greedyBuildPlan barracks depth (barracksTier)', () => {
  // One barracks already standing in slot 0, drones coming, plenty of gold.
  const depth = (over = {}) => greedyBuildPlan({
    gold: 1000, slotsUsed: new Set([0]), buildZones: zones, path,
    towers: [{ type: 'barracks', level: 1 }], barracksTarget: 1,
    waves: droneWaves, waveNumber: 1, map: { maxTierAllowed: 4 }, ...over,
  });
  const leadingUpgrades = p => { let n = 0; while (p[n]?.upgrade) n++; return n; };

  it('upgrades a standing barracks to the target tier before buying anything', () => {
    const p = depth({ barracksTier: 3 });
    expect(leadingUpgrades(p)).toBe(2);                       // T1 -> T2 -> T3
    expect(p.slice(0, 2).every(x => x.towerIndex === 0)).toBe(true);
    expect(p[2].type).toBeDefined();                          // then a purchase
  });

  it('defaults to tier 1: nothing jumps the queue', () => {
    expect(depth()[0].upgrade).toBeUndefined();
  });

  it('caps the depth at the map tier ceiling', () => {
    expect(leadingUpgrades(depth({ barracksTier: 3, map: { maxTierAllowed: 2 } }))).toBe(1);
  });

  it('skips an unaffordable tier and spends the gold elsewhere', () => {
    // Barracks T2 costs 65; 60 buys an archer instead of being held.
    const p = depth({ barracksTier: 3, gold: 60 });
    expect(p.some(x => x.upgrade)).toBe(false);
    expect(p[0].type).toBe('archer');
  });

  it('does not upgrade a barracks bought in the same round', () => {
    const p = depth({ towers: [], slotsUsed: new Set(), barracksTier: 3 });
    expect(p[0].type).toBe('barracks');
    expect(p.some(x => x.upgrade)).toBe(false);
  });

  it('hands the scored upgrade pass the levels it already bought', () => {
    // Capped at T3, so the depth pass stops at the cap. A scored pass reading
    // the STALE level (T1) would buy a third barracks upgrade past the cap.
    const p = depth({ barracksTier: 3, map: { maxTierAllowed: 3 }, slotsUsed: new Set([0, 1, 2]) });
    expect(p.filter(x => x.upgrade && x.towerIndex === 0)).toHaveLength(2);
  });

  it('never spends more than it has across depth upgrades and purchases', () => {
    const gold = 300;
    const p = depth({ barracksTier: 3, gold });
    let level = 1, spent = 0;
    for (const x of p) {
      if (x.upgrade) { spent += upgradeCost({ type: 'barracks', level }, 4); level++; }
      else spent += TOWER_DEFS[x.type].cost;
    }
    expect(spent).toBeLessThanOrEqual(gold);
  });
});

describe('greedyBuildPlan defaults', () => {
  it("reproduces today's policy on a real map: opening 'start', barracksTier 1", () => {
    // Map 6 buys and fights with a barracks, so both defaults are exercised.
    const map = MAPS[6], waves = MAP_WAVES[6];
    const implicit = simulateMap({ map, waves, buildPlan: greedyBuildPlan });
    const explicit = simulateMap({
      map, waves,
      buildPlan: ctx => greedyBuildPlan({ ...ctx, opening: 'start', barracksTier: 1 }),
    });
    expect(explicit).toEqual(implicit);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/buildPolicy.test.js; echo "exit=$?"`

Expected: FAIL on `upgrades a standing barracks…` and `caps the depth…`, because `barracksTier` is ignored and purchases come first. `exit=1`. The other tests may already pass: `hands the scored upgrade pass…` (today's scored pass happens to buy exactly 2 barracks upgrades when the barracks is the only tower on a tier-3 map), `defaults to tier 1`, `skips an unaffordable tier`, `does not upgrade a barracks bought…`, `never spends more…`, and the real-map defaults test. They are regression guards, and Step 5 proves each one bites.

- [ ] **Step 3: Implement**

In `src/sim/buildPolicy.js`, directly below the `DEFAULT_OPENING` line from Task 1, add:

```js
// How deep the barracks goes (#28). The scored upgrade pass prices upgrades by
// damage and a barracks tier adds none, so depth gets an explicit rule in the
// spirit of barracksTarget rather than a damage metric.
export const DEFAULT_BARRACKS_TIER = 1;
```

Add `barracksTier = DEFAULT_BARRACKS_TIER` to the signature:

```js
export function greedyBuildPlan({
  gold, slotsUsed, buildZones, path, towers = [], map = {},
  barracksTarget = DEFAULT_BARRACKS_TARGET, opening = DEFAULT_OPENING,
  barracksTier = DEFAULT_BARRACKS_TIER,
  waves = null, waveNumber = 1, matchupAware = true,
}) {
```

Directly after the `const target = openingBarracksTarget(...)` line, insert:

```js
  // Barracks depth jumps the queue: standing barracks are upgraded to
  // barracksTier before the board widens. Unlike barracksTarget it does not
  // hold gold — an unaffordable tier is skipped and the budget flows on. A
  // barracks bought below is not in `towers` yet, so it waits a round.
  const levels = towers.map(t => t.level);
  const depthCap = Math.min(barracksTier, maxTier);
  for (let i = 0; i < towers.length; i++) {
    if (towers[i].type !== 'barracks') continue;
    while (levels[i] < depthCap) {
      const cost = upgradeCost({ ...towers[i], level: levels[i] }, maxTier);
      if (cost === null || cost > budget) break;
      budget -= cost;
      levels[i]++;
      purchases.push({ upgrade: true, towerIndex: i });
    }
  }
```

In the upgrade pass, **delete** the line `const levels = towers.map(t => t.level);`, so the pass reads the shared `levels`. Then replace this comment paragraph:

```js
  // Barracks tiers carry no damage/fireRate, so towerDpsAgainst scores every
  // barracks upgrade at exactly 0 and it always loses to any positive-scoring
  // upgrade — a zero-DPS tower can never win this pass. Currently unreachable
  // on every shipped map: a cheaper, positive-scoring upgrade (e.g. archer T2)
  // is always available first, so cheapest-first never reached barracks
  // either and it stays L1 in both columns. Pricing blocking DEPTH (beyond
  // the opening purchase, which barracksTarget already handles) needs its own
  // explicit rule, not a damage metric — see the barracksTarget comment above.
```

with:

```js
  // Barracks tiers carry no damage/fireRate, so towerDpsAgainst scores every
  // barracks upgrade at exactly 0 and it loses to any positive-scoring
  // upgrade. Barracks depth is bought by the barracksTier rule above instead;
  // this pass starts from the levels that rule already paid for.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/buildPolicy.test.js; echo "exit=$?"`

Expected: all pass, `exit=0`.

- [ ] **Step 5: Prove the new tests bite**

Make each break, confirm the **named** test fails, then revert:
1. Change `Math.min(barracksTier, maxTier)` to `barracksTier`. The test `caps the depth at the map tier ceiling` must fail.
2. Change `if (cost === null || cost > budget) break;` to `if (cost === null) break;`. The test `skips an unaffordable tier…` must fail.
3. In the upgrade pass, re-add `const levels = towers.map(t => t.level);` as a fresh local, shadowing the shared one. The test `hands the scored upgrade pass the levels…` must fail.
4. Change `DEFAULT_BARRACKS_TIER = 1` to `3`. The tests `defaults to tier 1` and `reproduces today's policy on a real map` must fail.
5. Move the whole depth-pass block to **after** the purchase loop. The test `upgrades a standing barracks to the target tier before buying anything` must fail.

After reverting, re-run Step 4 and confirm `exit=0`.

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npm run test; echo "exit=$?"`

Expected: `exit=0`. Record the count.

- [ ] **Step 7: Commit**

```bash
cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy
git add src/sim/buildPolicy.js src/sim/buildPolicy.test.js
git commit -m "feat(sim): barracksTier depth rule — barracks upgrades jump the queue (#28)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `src/sim/strategy.js` — candidates, `pickBest`, `bestStrategy`

**Files:**
- Create: `src/sim/strategy.js`
- Test: `src/sim/strategy.test.js` (new)

**Interfaces:**
- Consumes: `greedyBuildPlan`, `OPENINGS`, `DEFAULT_OPENING` and `DEFAULT_BARRACKS_TIER` from `./buildPolicy.js`; `simulateMap(opts)` from `./simulate.js`, which returns `{ won, wavesSurvived, totalWaves, livesRemaining, towersBuilt, ... }`; and `findWinMultiplier(map, waves, { buildPlan })` from `./deficit.js`, which returns a `number | null`.
- Produces:
  - `export const CANDIDATE_STRATEGIES`: a frozen array of `{ opening, barracksTier }`.
  - `export function strategyLabel({ opening, barracksTier })`, returning a string: `'start/T1'`, `'ground/T3'` or `'none'`.
  - `export function strategyPlan(strategy)`, which returns `ctx => greedyBuildPlan({ ...ctx, ...strategy })`.
  - `export function pickBest(results)`. It takes an array of `{ strategy, multiplier, livesKept, wavesSurvived, ... }` and returns one element of that array.
  - `export function bestStrategy(map, waves)`, which returns `{ best, results }`. Each result is `{ strategy, run, multiplier, livesKept, wavesSurvived }`, where `run` is the 1x `simulateMap` result, and `best` is one of `results`.

- [ ] **Step 1: Write the failing tests**

Create `src/sim/strategy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  CANDIDATE_STRATEGIES, strategyLabel, pickBest, bestStrategy,
} from './strategy.js';
import { OPENINGS, DEFAULT_OPENING, DEFAULT_BARRACKS_TIER } from './buildPolicy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';

describe('CANDIDATE_STRATEGIES', () => {
  it("puts the policy's own defaults first, so a full tie keeps today's behaviour", () => {
    expect(CANDIDATE_STRATEGIES[0]).toEqual({
      opening: DEFAULT_OPENING, barracksTier: DEFAULT_BARRACKS_TIER,
    });
  });

  it('uses only openings the policy accepts', () => {
    for (const s of CANDIDATE_STRATEGIES) expect(OPENINGS).toContain(s.opening);
  });

  it("never pairs 'none' with depth — there is no barracks to deepen", () => {
    expect(CANDIDATE_STRATEGIES.filter(s => s.opening === 'none' && s.barracksTier > 1)).toEqual([]);
  });

  it('has no duplicates', () => {
    const keys = CANDIDATE_STRATEGIES.map(s => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every candidate a distinct label', () => {
    const labels = CANDIDATE_STRATEGIES.map(strategyLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('strategyLabel', () => {
  it('names the opening and the depth', () => {
    expect(strategyLabel({ opening: 'start', barracksTier: 1 })).toBe('start/T1');
    expect(strategyLabel({ opening: 'beforeGround', barracksTier: 3 })).toBe('ground/T3');
    expect(strategyLabel({ opening: 'none', barracksTier: 1 })).toBe('none');
  });
});

describe('pickBest', () => {
  const r = (name, multiplier, livesKept, wavesSurvived) =>
    ({ strategy: { name }, multiplier, livesKept, wavesSurvived });
  const pick = results => pickBest(results).strategy.name;

  it('prefers the lowest win multiplier', () => {
    expect(pick([r('a', 1.3, 0, 5), r('b', 1.05, 0, 9)])).toBe('b');
  });

  it('ranks an unwinnable (null) candidate below any number', () => {
    expect(pick([r('a', null, 0, 17), r('b', 7.9, 0, 1)])).toBe('b');
  });

  it('breaks a multiplier tie on lives kept', () => {
    expect(pick([r('a', 1, 0.55, 10), r('b', 1, 0.85, 10)])).toBe('b');
  });

  it('breaks a lives tie on waves survived', () => {
    expect(pick([r('a', 1.3, 0, 5), r('b', 1.3, 0, 9)])).toBe('b');
  });

  it('breaks a full tie by candidate order', () => {
    expect(pick([r('a', 1, 0.6, 10), r('b', 1, 0.6, 10)])).toBe('a');
  });

  it('when nothing is winnable, prefers the run that lasted longest', () => {
    expect(pick([r('a', null, 0, 3), r('b', null, 0, 7)])).toBe('b');
  });
});

describe('bestStrategy', () => {
  const map = MAPS[0], waves = MAP_WAVES[0];

  it('evaluates every candidate on a real map and returns one of them', () => {
    const { best, results } = bestStrategy(map, waves);
    expect(results.map(x => x.strategy)).toEqual([...CANDIDATE_STRATEGIES]);
    expect(results).toContain(best);
    for (const x of results) {
      expect(x.run.totalWaves).toBe(waves.length);
      expect(x.livesKept).toBeCloseTo(x.run.livesRemaining / map.startLives);
      expect(x.wavesSurvived).toBe(x.run.wavesSurvived);
    }
  });

  it('really plays each strategy rather than the default five times', () => {
    // On map 0 the baseline policy keeps 64% of lives and barracks-first to
    // the tier cap keeps 32%; if the strategy never reached the policy, every
    // candidate would report the same figure.
    const { results } = bestStrategy(map, waves);
    expect(new Set(results.map(x => x.livesKept)).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/strategy.test.js; echo "exit=$?"`

Expected: FAIL. The suite cannot import `./strategy.js`. `exit=1`.

- [ ] **Step 3: Implement**

Create `src/sim/strategy.js`:

```js
// Which barracks strategy the modelled player plays on a map.
//
// One fixed opening on every map measured the opening as much as the map: no
// single rule wins everywhere (map 9 wants its barracks, map 8 does better
// without one, map 6 only wins with it deepened to T3). A real player retries
// a level and adapts, so the report plays each candidate below in full and
// keeps the best — hindsight, not foresight. The list is small on purpose:
// enough to cover every winner the 2026-10-13 probes found, few enough that the
// search models a competent player rather than an exploit-finder.
import { simulateMap } from './simulate.js';
import { findWinMultiplier } from './deficit.js';
import { greedyBuildPlan } from './buildPolicy.js';

// Default policy first: candidate order is the last tie-break, so a map every
// strategy plays identically keeps today's numbers.
export const CANDIDATE_STRATEGIES = Object.freeze([
  { opening: 'start',        barracksTier: 1 },
  { opening: 'start',        barracksTier: 3 },
  { opening: 'beforeGround', barracksTier: 1 },
  { opening: 'beforeGround', barracksTier: 3 },
  { opening: 'none',         barracksTier: 1 },   // no barracks, nothing to deepen
]);

export function strategyLabel({ opening, barracksTier }) {
  if (opening === 'none') return 'none';
  const head = opening === 'beforeGround' ? 'ground' : opening;
  return `${head}/T${barracksTier}`;
}

export function strategyPlan(strategy) {
  return ctx => greedyBuildPlan({ ...ctx, ...strategy });
}

const multiplierRank = m => (m === null ? Infinity : m);

// Positive when `b` is better than `a`. Lives kept only matters between maps
// won at the same multiplier; waves survived only between runs that kept the
// same lives — i.e. two losses.
function compare(a, b) {
  return (multiplierRank(a.multiplier) - multiplierRank(b.multiplier))
      || (b.livesKept - a.livesKept)
      || (b.wavesSurvived - a.wavesSurvived);
}

// Strictly-better only, so an exact tie keeps the earlier candidate.
export function pickBest(results) {
  return results.reduce((best, r) => (compare(best, r) > 0 ? r : best));
}

export function bestStrategy(map, waves) {
  const results = CANDIDATE_STRATEGIES.map(strategy => {
    const buildPlan = strategyPlan(strategy);
    const run = simulateMap({ map, waves, buildPlan });
    return {
      strategy,
      run,
      multiplier: findWinMultiplier(map, waves, { buildPlan }),
      livesKept: run.livesRemaining / map.startLives,
      wavesSurvived: run.wavesSurvived,
    };
  });
  return { best: pickBest(results), results };
}
```

Note on `compare`: `Infinity - Infinity` is `NaN`, which is falsy, so two `null` multipliers fall through to the lives and waves tie-breaks. That is the intended behaviour, and it's what the `when nothing is winnable` test pins. A `NaN` from the first term is never returned as the final value unless every term is falsy. If lives and waves are also equal, `compare` returns `0` (from `b.wavesSurvived - a.wavesSurvived`), and `0 > 0` is false, so the earlier candidate is kept.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npx vitest run src/sim/strategy.test.js; echo "exit=$?"`

Expected: all pass, `exit=0`.

- [ ] **Step 5: Prove the new tests bite**

Make each break, confirm the **named** test fails, then revert:
1. Change `strategyPlan` to `return ctx => greedyBuildPlan({ ...ctx });`. The test `really plays each strategy…` must fail.
2. Change `multiplierRank` to `m => m ?? 0`. The test `ranks an unwinnable (null) candidate below any number` must fail.
3. Change `(b.livesKept - a.livesKept)` to `(a.livesKept - b.livesKept)`. The test `breaks a multiplier tie on lives kept` must fail.
4. Delete the `|| (b.wavesSurvived - a.wavesSurvived)` term. The tests `breaks a lives tie on waves survived` and `when nothing is winnable…` must fail.
5. Change `compare(best, r) > 0` to `compare(best, r) >= 0`. The test `breaks a full tie by candidate order` must fail.
6. Swap the first two entries of `CANDIDATE_STRATEGIES`. The test `puts the policy's own defaults first…` must fail.

After reverting, re-run Step 4 and confirm `exit=0`.

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npm run test; echo "exit=$?"`

Expected: `exit=0`. Record the count.

- [ ] **Step 7: Commit**

```bash
cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy
git add src/sim/strategy.js src/sim/strategy.test.js
git commit -m "feat(sim): hindsight best-of-5 barracks strategy search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `scripts/balance.mjs` reports the best strategy

**Files:**
- Modify: `scripts/balance.mjs`. The changes are the imports, the row-building loop (lines 50-56), the header prose and headline table (lines 61-87), the Blocking sensitivity comment and heading (lines 105-120), and the Matchup sensitivity comment and heading (lines 136-160).

**Interfaces:**
- Consumes: `bestStrategy(map, waves)` and `strategyLabel(strategy)` from `../src/sim/strategy.js` (Task 3).
- Produces: report output only. Nothing imports this script.

This task has no unit test. `balance.mjs` is a report script, and the logic it calls is tested in Tasks 1–3. The task is verified by running it.

- [ ] **Step 1: Capture the baseline output**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && (time npm run balance) > /private/tmp/claude-501/-Users-keithtimko-projects-tower-defense/dacc81bc-4315-4f07-87c5-76c2911fedc9/scratchpad/balance-task4-before.txt 2>&1; echo "exit=$?"`

Expected: `exit=0`. Note the `real` time printed at the end of the file. At this point the script still uses the default policy, so the headline must match the brainstorm baseline: map 6 is `9/15`, `1.05x`; map 9 is `1/18`, `1.36x`.

- [ ] **Step 2: Switch the headline to `bestStrategy`**

Add the import:

```js
import { bestStrategy, strategyLabel } from '../src/sim/strategy.js';
```

Replace the row-building loop:

```js
for (const map of targets) {
  const waves = MAP_WAVES[map.id];
  if (!waves) { console.error(`map ${map.id} (${map.name}) has no waves — skipped`); continue; }
  const r = simulateMap({ map, waves, buildPlan: greedyBuildPlan });
  const deficit = findWinMultiplier(map, waves, { buildPlan: greedyBuildPlan });
  rows.push({ map, r, v: { ...verdict(r, map.startLives), deficit } });
}
```

with:

```js
// The headline plays every candidate barracks strategy in full and reports the
// best (src/sim/strategy.js): a fixed opening measured the opening as much as
// the map.
for (const map of targets) {
  const waves = MAP_WAVES[map.id];
  if (!waves) { console.error(`map ${map.id} (${map.name}) has no waves — skipped`); continue; }
  const { best } = bestStrategy(map, waves);
  const r = best.run;
  rows.push({ map, r, strategy: best.strategy, v: { ...verdict(r, map.startLives), deficit: best.multiplier } });
}
```

Replace the five header-prose `console.log` lines with:

```js
console.log('\nSimulated combat — towers + tier upgrades + hero auto-attack + barracks soldiers');
console.log('(blocking, melee and respawn), buying and upgrading by the damage a tower actually');
console.log('lands against the enemies still to come. Each map is played under 5 barracks');
console.log('strategies (opening x depth) and the best is reported, as a player who retries a');
console.log('level would. Omits hero abilities, meta upgrades, soldier repositioning and the');
console.log('send-wave-early bonus, so this model is still PESSIMISTIC.\n');
```

In the headline header row, insert a `strategy` column before `verdict`, and widen the rule to 131:

```js
console.log(pad('#', 3) + pad('Map', 22) + padL('waves', 7) + padL('lives', 8)
          + padL('gold', 7) + padL('towers', 8) + padL('leaked', 8) + padL('blocked', 9)
          + padL('heroDmg', 9) + padL('/mapHP', 8) + padL('heroLv', 8)
          + '  ' + pad('strategy', 11) + pad('verdict', 12) + 'needs');
console.log('-'.repeat(131));
```

In the headline row loop, destructure `strategy` and print its label in the same position:

```js
for (const { map, r, strategy, v } of rows) {
  console.log(
    pad(map.id, 3)
    + pad(map.name, 22)
    + padL(`${r.wavesSurvived}/${r.totalWaves}`, 7)
    + padL(`${r.livesRemaining}/${map.startLives}`, 8)
    + padL(r.goldFinal, 7)
    + padL(`${r.towersBuilt}/${map.towerSlots.length}`, 8)
    + padL(r.leaked, 8)
    + padL(`${r.blockedSeconds}s`, 9)
    + padL(r.heroDamageDealt, 9)
    + padL((r.heroDamageDealt / totalEnemyHpForMap(map.id)).toFixed(3), 8)
    + padL(`L${r.heroLevel}`, 8)
    + '  ' + pad(strategyLabel(strategy), 11)
    + pad(v.tag, 12)
    + (v.deficit === null ? '>8x damage' : v.deficit === 1 ? v.note : `${v.deficit}x damage`),
  );
}
```

Add one legend line after the existing `needs` legend lines:

```js
console.log('  strategy = the barracks strategy that won the hindsight search: opening');
console.log('             (start | ground = wait for a ground wave | none) / depth tier.\n');
```

The `--verbose` per-wave block reads `r.waveLog`, and `r` is now `best.run`, so it needs no change.

- [ ] **Step 3: Relabel the two sensitivity tables as the fixed default policy**

In the Blocking sensitivity comment block, replace the paragraph starting `// Caveat: this now runs through greedyBuildPlan's scored upgrade pass` (through `// columns price the opening barracks, not blocking depth.`) with:

```js
// Caveat: this table runs the FIXED default policy (start/T1), not the
// hindsight search the headline uses — it isolates what the opening barracks
// is worth with depth held at T1. barracksTier (blocking depth) is one of the
// headline's candidate dimensions instead.
```

Change its heading line to:

```js
console.log('\nBlocking sensitivity — damage multiplier needed, by how the barracks is paid for');
console.log('(fixed default policy start/T1, not the headline\'s hindsight search).\n');
```

In the Matchup sensitivity comment block, add this line after `// can tell a smarter model apart from an easier map.`:

```js
// Runs the FIXED default policy (start/T1), not the headline's hindsight search.
```

Change its heading lines to:

```js
console.log('\nMatchup sensitivity — damage multiplier needed and lives kept getting there, by');
console.log('how the model picks AND upgrades towers (not separable in this table; fixed');
console.log('default policy start/T1, not the headline\'s hindsight search).\n');
```

If `greedyBuildPlan`, `simulateMap` or `findWinMultiplier` become unused imports after Step 2, check before removing them. The Blocking and Matchup tables still use all three, so they should all stay.

- [ ] **Step 4: Run the report and check it**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && (time npm run balance) > /private/tmp/claude-501/-Users-keithtimko-projects-tower-defense/dacc81bc-4315-4f07-87c5-76c2911fedc9/scratchpad/balance-task4-after.txt 2>&1; echo "exit=$?"`

Expected: `exit=0`. Then read the whole file and check:
- Every headline row has a `strategy` label from `start/T1`, `start/T3`, `ground/T1`, `ground/T3` or `none`.
- On no map is the headline `needs` worse than the before file's figure. The default is a candidate, so the best can only match or beat it. A worse figure means a bug: stop and report it.
- The Blocking and Matchup tables are **identical** to the before file, apart from the heading text.
- Note the `real` time. If it is above 90s, stop and report it; the spec's `--fast` contingency is a controller decision, not this task's.

- [ ] **Step 5: Check single-map mode**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npm run balance -- --map 9; echo "exit=$?"`

Expected: `exit=0`. The headline has one row for map 9, with a strategy label and an aligned verdict column.

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy && npm run test; echo "exit=$?"`

Expected: `exit=0`. Record the count.

- [ ] **Step 7: Commit**

```bash
cd /Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy
git add scripts/balance.mjs
git commit -m "feat(balance): headline reports the best of 5 barracks strategies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 (controller, not a subagent): measured verification, #31 re-run, docs

This task needs judgement and writes outside the repo (auto-memory), so the controller runs it directly after the final whole-branch review.

**Files:**
- Modify: `.claude/notes.md`
- Modify (outside the repo): `/Users/keithtimko/.claude/projects/-Users-keithtimko-projects-tower-defense/memory/project_balance_findings.md`
- Create: `.claude/sessions/2026-10-13-sim-hindsight-strategy.md`

- [ ] **Step 1: Cross-check against the brainstorm probes.** Use a scratch script in the session scratchpad, never committed. Print every candidate's `{ multiplier, wavesSurvived/livesKept }` per map from `bestStrategy(...).results`, and compare with the spec's probe tables:
  - `start/T1` should equal the "current" column;
  - `ground/T1` should equal "nextGround";
  - `start/T3` should equal "T3";
  - `none` should equal "none".

  Any mismatch means the implementation differs from what was measured. Explain it before going on.

  ```js
  // <scratchpad>/crosscheck.mjs — run: node <scratchpad>/crosscheck.mjs
  const R = '/Users/keithtimko/.config/superpowers/worktrees/tower-defense/sim-build-policy/src';
  const { MAPS } = await import(`${R}/data/maps.js`);
  const { MAP_WAVES } = await import(`${R}/data/waves.js`);
  const { bestStrategy, strategyLabel } = await import(`${R}/sim/strategy.js`);
  for (const map of MAPS) {
    const { best, results } = bestStrategy(map, MAP_WAVES[map.id]);
    const cell = x => `${strategyLabel(x.strategy)} ${x.multiplier ?? '>8'}x `
      + (x.run.won ? `W ${Math.round(100 * x.livesKept)}%` : `${x.wavesSurvived}/${x.run.totalWaves}`);
    console.log(map.id, '| best:', strategyLabel(best.strategy), '|', results.map(cell).join(' | '));
  }
  ```
- [ ] **Step 2: Build the per-map delta table** from `balance-baseline.txt` and `balance-task4-after.txt`. Columns: map, before (`needs`, waves or lives), after (`needs`, waves or lives, strategy), and verdict change. Also record runtime before and after.
- [ ] **Step 3: Re-run the #31 measurement.** Use a scratch script: maps 3, 4 and 5 with `startGold + 120`, under `bestStrategy`. Report lives kept against the 90% TOO EASY line. Report only, with no data changes.
- [ ] **Step 4: Write the implications for maps 6 and 9.** Report only.
- [ ] **Step 5: Update `.claude/notes.md`:**
  - close #32 and #28;
  - annotate #27 with the spec's slot-ranking probe table and "the coverage proxy is the problem, not the range", and leave it deferred;
  - defer #29 pending a rethink of the A/B table;
  - update Current Status with the new test count.
- [ ] **Step 6: Update the balance auto-memory.** The headline is now best-of-5 hindsight, the opening barracks is a strategy choice, #28 has a rule, and record the per-map strategy winners.
- [ ] **Step 7: Run the full suite and the `mapsEconomy` guards.**
  - Run `npx vitest run src/data/mapsEconomy.test.js; echo "exit=$?"` and `npm run test; echo "exit=$?"`, and report both exit codes and the count.
  - Commit the notes and session file with explicit paths.
  - Open the PR (base `main`) with the delta table and the implications, and push with `git push -u origin feat/sim-build-policy`. The branch still tracks `origin/main`, so never run a bare `git push`.
