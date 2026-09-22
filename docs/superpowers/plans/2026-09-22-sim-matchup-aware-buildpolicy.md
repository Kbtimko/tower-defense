# Matchup-Aware `greedyBuildPlan` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the balance simulator's modelled player choose towers by the damage they actually land — armour, weakness matrix and pierce included — instead of by `damage * fireRate / cost`, which ranks the archer first while the archer does 1.0 DPS to a titan.

**Architecture:** A new pure `src/sim/matchupValue.js` scores any tower spec against the HP-weighted mix of enemies still to come, routing every candidate through the real `computeDamage`. `greedyBuildPlan` uses it for both the purchase pass and the upgrade pass. The wave table reaches the policy through the simulator's existing build-phase context, and the policy falls back to the old ranking when it is absent.

**Tech Stack:** Plain ES modules, Node 20, Vitest 2. No new dependencies. No Phaser in any file this plan touches.

**Spec:** `docs/superpowers/specs/2026-09-22-sim-matchup-aware-buildpolicy-design.md`

## Global Constraints

- **No balance changes.** Nothing under `src/data/` may be modified. This plan changes the MODEL, never the game.
- **The game is untouched.** No file under `src/scenes/`, `src/entities/` or `src/ui/` is modified. `src/systems/WaveManager.js` changes only by extracting an existing expression into an exported function, with no behaviour change.
- **`npm run balance` output MUST change** — that is the deliverable. This is the inverse of the usual check.
- **`npm run test` must stay green throughout**, including every pre-existing test in `src/sim/simulate.test.js`, `deficit.test.js` and `soldiers.test.js`.
- **`towerValue` keeps its current name, signature and behaviour.** `simulate.test.js:3` imports it and `:34` asserts its formula. The spec's §5 said to rename it `naiveTowerValue`; that would break the import, so the name stays and the matchup-aware scorer gets a new one. This is the only deliberate deviation from the spec.
- **Never re-implement combat arithmetic.** Score through `computeDamage` from `src/systems/damage.js`. A second copy is how the simulator drifts from the game it models.
- **Derive test expectations from the tables; never pin balance literals.** Assert orderings and directions of change. A test asserting "sniper scores 0.31" breaks on the next retune without saying what broke.
- Run the suite with `npm run test`. Never gate a commit on grepped output — `vitest | grep … && git commit` commits red states, because grep exits 0 on a match.
- Comments explain *why*, not *what*.

---

### Task 1: Extract `waveScaleFactor` from `WaveManager`

Enemy HP scales per wave. The weighting needs the same number the game uses, and copying `0.13` into the simulator is precisely the drift this codebase guards against.

**Files:**
- Modify: `src/systems/WaveManager.js:31`
- Test: `src/systems/WaveManager.test.js` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `waveScaleFactor(waveIndex) -> number`, exported from `src/systems/WaveManager.js`. Task 2 imports it.

- [ ] **Step 1: Write the failing test**

Append to `src/systems/WaveManager.test.js`, widening the existing import to include `waveScaleFactor`:

```js
describe('waveScaleFactor', () => {
  it('is 1 on the first wave', () => {
    expect(waveScaleFactor(0)).toBe(1);
  });

  it('grows 13% of base per wave', () => {
    expect(waveScaleFactor(1)).toBeCloseTo(1.13);
    expect(waveScaleFactor(10)).toBeCloseTo(2.3);
  });

  it('is what WaveManager actually applies to spawned enemies', () => {
    // The whole point of exporting it: the sim must not keep a second copy.
    const emitted = [];
    const emitter = { emit: (_e, p) => emitted.push(p) };
    const wm = new WaveManager([[{ type: 'drone', count: 1, interval: 0 }]], emitter);
    wm.startWave();
    wm.update(1000);
    expect(emitted[0].scaleFactor).toBe(waveScaleFactor(wm.currentWave));
  });
});
```

Check `WaveManager.test.js`'s existing import line and widen it rather than adding a second import. If the existing tests drive the manager differently (method names, update units), match their pattern for the third test — the first two are the load-bearing ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/WaveManager.test.js`
Expected: FAIL — `waveScaleFactor is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/systems/WaveManager.js`, add above the class:

```js
// Per-wave HP scaling. Exported because the balance simulator weights enemies
// by the HP they will actually arrive with, and a second copy of this constant
// is how the model drifts away from the game it is meant to model.
export function waveScaleFactor(waveIndex) {
  return 1 + waveIndex * 0.13;
}
```

Then replace line 31's expression with a call:

```js
    const scaleFactor = waveScaleFactor(this.currentWave);
```

Change nothing else in the file.

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS — every pre-existing `WaveManager` test unmodified and green. That is the proof the extraction is behaviour-preserving.

- [ ] **Step 5: Commit**

```bash
git add src/systems/WaveManager.js src/systems/WaveManager.test.js
git commit -m "refactor(waves): export waveScaleFactor so the sim can reuse it"
```

---

### Task 2: `remainingEnemyWeights` — what is still coming

**Files:**
- Create: `src/sim/matchupValue.js`
- Test: `src/sim/matchupValue.test.js`

**Interfaces:**
- Consumes: `waveScaleFactor` from Task 1; `ENEMY_DEFS` from `src/data/enemies.js`.
- Produces: `remainingEnemyWeights(waves, fromWaveIndex = 0) -> Map<string, number>` — enemy type to weighted HP share. Tasks 3, 4 and 5 use it.

- [ ] **Step 1: Write the failing test**

Create `src/sim/matchupValue.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { remainingEnemyWeights } from './matchupValue.js';
import { ENEMY_DEFS } from '../data/enemies.js';

const waves = [
  [{ type: 'drone', count: 10, interval: 1000 }],
  [{ type: 'titan', count: 2,  interval: 1000 }],
];

describe('remainingEnemyWeights', () => {
  it('weights a type by its HP times its count', () => {
    const w = remainingEnemyWeights([[{ type: 'drone', count: 10, interval: 0 }]], 0);
    expect(w.get('drone')).toBeCloseTo(ENEMY_DEFS.drone.hp * 10);
  });

  it('counts only waves from fromWaveIndex onward', () => {
    const w = remainingEnemyWeights(waves, 1);
    expect(w.has('drone')).toBe(false);
    expect(w.get('titan')).toBeGreaterThan(0);
  });

  it('weighs a later wave more heavily than the same wave earlier', () => {
    // Enemy HP scales with the wave index, so an identical group arriving
    // later represents more HP and must pull the ranking harder.
    const early = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    const late  = remainingEnemyWeights(
      [[], [], [], [], [], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(late.get('drone')).toBeGreaterThan(early.get('drone'));
  });

  it('returns an empty map past the last wave', () => {
    expect(remainingEnemyWeights(waves, 99).size).toBe(0);
  });

  it('returns an empty map for a missing or empty wave table', () => {
    expect(remainingEnemyWeights(undefined, 0).size).toBe(0);
    expect(remainingEnemyWeights([], 0).size).toBe(0);
  });

  it('ignores an unknown enemy type rather than scoring it as zero HP', () => {
    const w = remainingEnemyWeights([[{ type: 'nosuch', count: 5, interval: 0 }]], 0);
    expect(w.has('nosuch')).toBe(false);
  });

  it('accumulates a type that appears in several waves', () => {
    const w = remainingEnemyWeights(
      [[{ type: 'drone', count: 1, interval: 0 }], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    const one = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(w.get('drone')).toBeGreaterThan(one.get('drone'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/matchupValue.test.js`
Expected: FAIL — cannot resolve `./matchupValue.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/sim/matchupValue.js`:

```js
// What a tower is WORTH to the modelled player, given what is still coming.
//
// The old `towerValue` in buildPolicy.js is `damage * fireRate / cost`, which
// ignores flat armour, the weakness matrix and pierce. It therefore ranks the
// archer first — and the archer lands 1 damage a shot on a titan. This module
// scores candidates through the real `computeDamage` instead, so the model
// picks towers the way a player with the wave preview and codex can.
import { ENEMY_DEFS } from '../data/enemies.js';
import { waveScaleFactor } from '../systems/WaveManager.js';

// Weighted HP each enemy type contributes from `fromWaveIndex` onward. The
// numbers are a relative mix — only their ratios are ever used.
export function remainingEnemyWeights(waves, fromWaveIndex = 0) {
  const weights = new Map();
  if (!Array.isArray(waves)) return weights;
  for (let i = Math.max(0, fromWaveIndex); i < waves.length; i++) {
    const scale = waveScaleFactor(i);
    for (const group of waves[i] ?? []) {
      const def = ENEMY_DEFS[group.type];
      if (!def) continue;
      const hp = def.hp * (group.count ?? 0) * scale;
      weights.set(group.type, (weights.get(group.type) ?? 0) + hp);
    }
  }
  return weights;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/matchupValue.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/matchupValue.js src/sim/matchupValue.test.js
git commit -m "feat(sim): weight the enemies a map has still to send"
```

---

### Task 3: Score a tower against that mix

**Files:**
- Modify: `src/sim/matchupValue.js`
- Test: `src/sim/matchupValue.test.js` (append)

**Interfaces:**
- Consumes: `remainingEnemyWeights` from Task 2; `computeDamage` from `src/systems/damage.js`; `TOWER_DEFS` from `src/data/towers.js`.
- Produces, all from `src/sim/matchupValue.js`:
  - `towerSpecAt(type, tier = 1, branch = null) -> { type, tier, branch, damage, fireRate, pierce, cost }`
  - `towerDpsAgainst(spec, weights) -> number`
  - `towerValueAgainst(spec, weights) -> number`
  Tasks 4 and 5 use all three.

Tier stat blocks are **sparse and cumulative**: `TOWER_DEFS.archer.tier3` sets `damage` and `range` but not `fireRate`, and the tower keeps whatever it had. `towerSpecAt` therefore folds base → tier2 → tier3 → tier4A/B, mirroring how `simulate.js` applies each tier def in turn during an upgrade.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/matchupValue.test.js`:

```js
import { towerSpecAt, towerDpsAgainst, towerValueAgainst } from './matchupValue.js';
import { TOWER_DEFS } from '../data/towers.js';

const mixOf = (type) => new Map([[type, 1]]);

describe('towerSpecAt', () => {
  it('returns the base stat block at tier 1', () => {
    const s = towerSpecAt('archer', 1);
    expect(s.damage).toBe(TOWER_DEFS.archer.damage);
    expect(s.fireRate).toBe(TOWER_DEFS.archer.fireRate);
    expect(s.pierce).toBe(TOWER_DEFS.archer.pierce);
  });

  it('folds each tier over the last, keeping fields a tier does not redefine', () => {
    // archer tier3 sets damage but never fireRate, so fireRate must survive.
    const s = towerSpecAt('archer', 3);
    expect(s.damage).toBe(TOWER_DEFS.archer.tier3.damage);
    expect(s.fireRate).toBe(TOWER_DEFS.archer.fireRate);
  });

  it('applies the requested tier-4 branch, not the other one', () => {
    const a = towerSpecAt('sniper', 4, 'A');
    const b = towerSpecAt('sniper', 4, 'B');
    expect(a.damage).toBe(TOWER_DEFS.sniper.tier4A.damage);
    expect(b.damage).toBe(TOWER_DEFS.sniper.tier4B.damage);
    // sniper tier4B is the one that redefines fireRate.
    expect(b.fireRate).toBe(TOWER_DEFS.sniper.tier4B.fireRate);
  });
});

describe('towerDpsAgainst', () => {
  it('ranks the sniper above the archer against titans — the headline defect', () => {
    // The old towerValue ranks archer FIRST while it lands 1 damage a shot on a
    // titan. Asserted as an ordering, never a pinned number, so a retune moves
    // the values without silently gutting this test.
    const titans = mixOf('titan');
    const archer = towerDpsAgainst(towerSpecAt('archer'), titans);
    const sniper = towerDpsAgainst(towerSpecAt('sniper'), titans);
    expect(sniper).toBeGreaterThan(archer);
  });

  it('ranks the archer above the sniper against skitters', () => {
    // Proves the ranking actually MOVES with the mix rather than being a new
    // fixed order that happens to favour the sniper.
    const skitters = mixOf('skitter');
    expect(towerDpsAgainst(towerSpecAt('archer'), skitters))
      .toBeGreaterThan(towerDpsAgainst(towerSpecAt('sniper'), skitters));
  });

  it('credits pierce against an armoured mix', () => {
    const titans = mixOf('titan');
    const piercing = { ...towerSpecAt('archer'), pierce: true };
    expect(towerDpsAgainst(piercing, titans))
      .toBeGreaterThan(towerDpsAgainst(towerSpecAt('archer'), titans));
  });

  it('is zero against an empty mix rather than NaN', () => {
    const d = towerDpsAgainst(towerSpecAt('archer'), new Map());
    expect(d).toBe(0);
    expect(Number.isNaN(d)).toBe(false);
  });

  it('blends the mix rather than scoring only the heaviest type', () => {
    const pure  = towerDpsAgainst(towerSpecAt('archer'), mixOf('titan'));
    const mixed = towerDpsAgainst(towerSpecAt('archer'), new Map([['titan', 1], ['skitter', 1]]));
    expect(mixed).toBeGreaterThan(pure);
  });
});

describe('towerValueAgainst', () => {
  it('divides expected DPS by cost', () => {
    const mix = mixOf('brute');
    const spec = towerSpecAt('cannon');
    expect(towerValueAgainst(spec, mix))
      .toBeCloseTo(towerDpsAgainst(spec, mix) / TOWER_DEFS.cannon.cost);
  });

  it('never divides by zero for a costless spec', () => {
    const v = towerValueAgainst({ ...towerSpecAt('archer'), cost: 0 }, mixOf('brute'));
    expect(Number.isFinite(v)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/matchupValue.test.js`
Expected: FAIL — `towerSpecAt is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/sim/matchupValue.js`, and add `computeDamage` / `TOWER_DEFS` to the file's TOP import block (never at the bottom):

```js
const TIER_KEY = (tier, branch) => (tier === 4 ? `tier4${branch ?? 'A'}` : `tier${tier}`);

// Effective stats of a tower at a given tier. Tier blocks are SPARSE and
// CUMULATIVE — archer tier3 sets damage and range but not fireRate — so each
// one is folded over the last, mirroring how simulate.js applies them during
// an upgrade.
export function towerSpecAt(type, tier = 1, branch = null) {
  const def = TOWER_DEFS[type];
  if (!def) return null;
  const spec = {
    type, tier, branch,
    damage: def.damage, fireRate: def.fireRate, pierce: def.pierce, cost: def.cost,
  };
  for (let t = 2; t <= tier; t++) {
    const td = def[TIER_KEY(t, branch)];
    if (!td) continue;
    if (td.damage   !== undefined) spec.damage   = td.damage;
    if (td.fireRate !== undefined) spec.fireRate = td.fireRate;
    if (td.pierce   !== undefined) spec.pierce   = td.pierce;
  }
  return spec;
}

// Expected damage per second against the weighted mix. Every candidate goes
// through the real computeDamage, so armour, the weakness matrix and pierce
// are all honoured and no combat arithmetic is duplicated here.
export function towerDpsAgainst(spec, weights) {
  if (!spec || !weights || weights.size === 0) return 0;
  let total = 0, mass = 0;
  for (const [enemyType, weight] of weights) {
    if (!(weight > 0)) continue;
    const dmg = computeDamage({
      amount: spec.damage,
      armor: ENEMY_DEFS[enemyType]?.armor ?? 0,
      pierce: spec.pierce,
      source: { kind: 'tower', type: spec.type, tier: spec.tier, branch: spec.branch },
      enemyType,
    });
    total += dmg * spec.fireRate * weight;
    mass  += weight;
  }
  return mass > 0 ? total / mass : 0;
}

// Expected DPS per gold — the yardstick the purchase pass ranks by.
export function towerValueAgainst(spec, weights) {
  if (!spec) return 0;
  const cost = spec.cost > 0 ? spec.cost : 1;
  return towerDpsAgainst(spec, weights) / cost;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/matchupValue.test.js`
Expected: PASS — 7 from Task 2 plus 10 here.

- [ ] **Step 5: Commit**

```bash
git add src/sim/matchupValue.js src/sim/matchupValue.test.js
git commit -m "feat(sim): score a tower by the damage it actually lands"
```

---

### Task 4: Purchase pass picks by matchup

**Files:**
- Modify: `src/sim/buildPolicy.js` (`greedyBuildPlan`, the purchase loop)
- Test: `src/sim/buildPolicy.test.js` (create — this file has no tests today)

**Interfaces:**
- Consumes: `remainingEnemyWeights`, `towerSpecAt`, `towerValueAgainst` from Tasks 2-3.
- Produces: `greedyBuildPlan` accepts two new optional ctx fields — `waves` (the map's wave table) and `matchupAware` (default `true`). Task 5 extends the same function; Task 6 passes both fields in.

`towerValue` keeps its exact current name, signature and behaviour — `simulate.test.js:3` imports it and `:34` asserts its formula. Do not rename or alter it.

- [ ] **Step 1: Write the failing test**

Create `src/sim/buildPolicy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { greedyBuildPlan } from './buildPolicy.js';
import { TOWER_DEFS } from '../data/towers.js';

const zones = [{ cx: 0, cy: 0 }, { cx: 5, cy: 0 }, { cx: 10, cy: 0 }];
const path  = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];

const titanWaves   = [[{ type: 'titan',   count: 4, interval: 1000 }]];
const skitterWaves = [[{ type: 'skitter', count: 20, interval: 500 }]];

// barracksTarget: 0 isolates the damage ranking from the opening-barracks rule.
const plan = (over = {}) => greedyBuildPlan({
  gold: 1000, slotsUsed: new Set(), buildZones: zones, path, towers: [],
  barracksTarget: 0, waveNumber: 1, ...over,
});

describe('greedyBuildPlan purchase pass', () => {
  it('does not open with an archer when titans are what is coming', () => {
    // The defect this whole plan exists for: towerValue ranks archer FIRST,
    // and archer lands 1 damage a shot on a titan.
    expect(plan({ waves: titanWaves })[0].type).not.toBe('archer');
  });

  it('opens with an archer when the mix is skitters', () => {
    // Proves the choice tracks the mix instead of becoming a new fixed order.
    expect(plan({ waves: skitterWaves })[0].type).toBe('archer');
  });

  it('reproduces the naive ranking when matchupAware is off', () => {
    const naiveFirst = plan({ waves: titanWaves, matchupAware: false })[0].type;
    const noWaves    = plan({})[0].type;
    expect(naiveFirst).toBe(noWaves);
  });

  it('falls back to the naive ranking when ctx carries no waves', () => {
    // simulate.test.js and soldiers.test.js call this function directly with
    // hand-built contexts that have no wave table. They must keep their meaning.
    expect(plan({}).length).toBeGreaterThan(0);
    expect(plan({})[0].type).toBe(plan({ matchupAware: false })[0].type);
  });

  it('falls back when the wave table is exhausted', () => {
    const p = plan({ waves: titanWaves, waveNumber: 99 });
    expect(p.length).toBeGreaterThan(0);
  });

  it('still never spends more gold than it has', () => {
    const p = plan({ waves: titanWaves, gold: 130 });
    const spent = p.reduce((s, x) => s + (x.type ? TOWER_DEFS[x.type].cost : 0), 0);
    expect(spent).toBeLessThanOrEqual(130);
  });

  it('still never reuses an occupied slot', () => {
    const p = plan({ waves: titanWaves, slotsUsed: new Set([0]) });
    expect(p.every(x => x.slotIndex !== 0)).toBe(true);
  });

  it('still opens with a barracks when one is wanted', () => {
    const p = plan({ waves: titanWaves, barracksTarget: 1 });
    expect(p[0].type).toBe('barracks');
  });

  it('is deterministic — the same context yields the same plan', () => {
    // simulateMap has a determinism test that runs through this policy. A
    // comparator without a stable tie-break could reorder equal-scoring towers
    // between runs and make that test flake intermittently.
    const a = plan({ waves: titanWaves });
    const b = plan({ waves: titanWaves });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/buildPolicy.test.js`
Expected: FAIL — the first test fails because the plan still opens with an archer.

- [ ] **Step 3: Write the implementation**

In `src/sim/buildPolicy.js`, add to the top import block:

```js
import { remainingEnemyWeights, towerSpecAt, towerValueAgainst } from './matchupValue.js';
```

Add `waves` and `matchupAware` to the destructured parameters:

```js
export function greedyBuildPlan({
  gold, slotsUsed, buildZones, path, towers = [], map = {},
  barracksTarget = DEFAULT_BARRACKS_TARGET,
  waves = null, waveNumber = 1, matchupAware = true,
}) {
```

Replace the `byValue` line with a matchup-aware ranking that degrades to the old one:

```js
  const ranked = rankSlots(buildZones, path);

  // Rank by the damage a tower will ACTUALLY land against what is still coming.
  // With no wave table — several tests call this function directly with a
  // hand-built context — fall back to the static damage-per-gold ranking so
  // those callers keep the behaviour they were written against.
  const weights = matchupAware ? remainingEnemyWeights(waves, waveNumber - 1) : new Map();
  const byValue = weights.size > 0
    ? [...BUYABLE].sort((a, b) =>
        towerValueAgainst(towerSpecAt(b), weights) - towerValueAgainst(towerSpecAt(a), weights)
        || a.localeCompare(b))
    : [...BUYABLE].sort((a, b) => towerValue(b) - towerValue(a));
```

Two details that matter:

- **The naive branch stays byte-identical to today's line** — no tie-break added. `mage` and `sniper` currently tie at exactly `0.2000`, and every pre-existing test in `simulate.test.js`, `deficit.test.js` and `soldiers.test.js` runs through this fallback. Adding a tie-break there produces the same order today but would silently change the fallback if a retune ever flips the tie. Do not "tidy" the two branches into one comparator.
- **The `localeCompare` tie-break belongs only to the new matchup-aware branch**, where it keeps the buy order deterministic if two towers score identically against a mix.

Leave the barracks rule, the slot loop and the upgrade pass exactly as they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/buildPolicy.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS. `simulate.test.js`, `deficit.test.js` and `soldiers.test.js` all call `greedyBuildPlan` with no `waves`, so the fallback keeps them on their original path.

- [ ] **Step 6: Commit**

```bash
git add src/sim/buildPolicy.js src/sim/buildPolicy.test.js
git commit -m "feat(sim): buy towers by the damage they land, not damage-per-gold"
```

---

### Task 5: Upgrade pass picks by marginal value

On an 11-slot tier-3 map most of the budget goes through this pass, and today it buys whichever upgrade is *cheapest*.

**Files:**
- Modify: `src/sim/buildPolicy.js` (the upgrade loop)
- Test: `src/sim/buildPolicy.test.js` (append)

**Interfaces:**
- Consumes: `towerSpecAt`, `towerDpsAgainst` from Task 3; the `weights` computed in Task 4.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/buildPolicy.test.js`:

```js
describe('greedyBuildPlan upgrade pass', () => {
  const upgradeOnly = (over = {}) => greedyBuildPlan({
    gold: 400, slotsUsed: new Set([0, 1, 2]), buildZones: zones, path,
    barracksTarget: 0, waveNumber: 1, ...over,
  });

  it('prefers the upgrade that buys more damage over the merely cheapest', () => {
    // Ice T2 is the cheapest upgrade on the board (55g) but ice lands 1 damage
    // a shot on a titan at every tier below 4. Against titans the sniper
    // upgrade must win despite costing more.
    const p = upgradeOnly({
      waves: titanWaves,
      towers: [{ type: 'ice', level: 1 }, { type: 'sniper', level: 1 }],
    });
    const first = p.find(x => x.upgrade);
    expect(first).toBeDefined();
    expect(first.towerIndex).toBe(1);
  });

  it('still respects the map tier ceiling', () => {
    const p = upgradeOnly({
      waves: titanWaves, map: { maxTierAllowed: 1 },
      towers: [{ type: 'sniper', level: 1 }],
    });
    expect(p.some(x => x.upgrade)).toBe(false);
  });

  it('never spends more than the budget on upgrades', () => {
    const p = upgradeOnly({
      gold: 60, waves: titanWaves,
      towers: [{ type: 'sniper', level: 1 }, { type: 'ice', level: 1 }],
    });
    expect(p.filter(x => x.upgrade).length).toBeLessThanOrEqual(1);
  });

  it('falls back to cheapest-first with no wave table', () => {
    const p = upgradeOnly({ towers: [{ type: 'ice', level: 1 }, { type: 'sniper', level: 1 }] });
    const first = p.find(x => x.upgrade);
    expect(first.towerIndex).toBe(0);   // ice T2 at 55g is the cheapest
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/buildPolicy.test.js`
Expected: FAIL on the first test — the pass currently picks the cheapest, which is the ice tower at index 0.

- [ ] **Step 3: Write the implementation**

Replace the upgrade loop's body in `src/sim/buildPolicy.js` so it scores candidates instead of taking the cheapest. Keep the surrounding `levels` array and the `purchases.push({ upgrade: true, towerIndex })` shape unchanged:

```js
  // Upgrade pass. Each round buys the upgrade with the best marginal damage
  // gain per gold, so the budget goes where it actually raises throughput —
  // buying the CHEAPEST upgrade is how a tier-3 map spends most of its gold on
  // towers that cannot hurt what is coming. With no wave table, fall back to
  // cheapest-first so direct callers keep their original behaviour.
  const levels = towers.map(t => t.level);
  for (;;) {
    let bestIdx = -1, bestCost = Infinity, bestScore = -Infinity;
    for (let i = 0; i < towers.length; i++) {
      const level = levels[i];
      const cost = upgradeCost({ ...towers[i], level }, maxTier);
      if (cost === null || cost > budget) continue;

      if (weights.size === 0) {
        if (cost < bestCost) { bestCost = cost; bestIdx = i; }
        continue;
      }
      const type   = towers[i].type;
      const branch = towers[i].branch ?? null;
      const before = towerDpsAgainst(towerSpecAt(type, level, branch), weights);
      const after  = towerDpsAgainst(towerSpecAt(type, level + 1, branch), weights);
      const score  = (after - before) / cost;
      if (score > bestScore || (score === bestScore && cost < bestCost)) {
        bestScore = score; bestCost = cost; bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    budget -= bestCost;
    levels[bestIdx]++;
    purchases.push({ upgrade: true, towerIndex: bestIdx });
  }
```

Note `weights` is already in scope from Task 4 — do not recompute it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/buildPolicy.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/buildPolicy.js src/sim/buildPolicy.test.js
git commit -m "feat(sim): upgrade by marginal damage per gold, not by cheapest"
```

---

### Task 6: Hand the policy the wave table, and report blind vs aware

**Files:**
- Modify: `src/sim/simulate.js:186-188` (the build-phase context)
- Modify: `scripts/balance.mjs` (header text; new A/B section after the existing "Blocking sensitivity" block)
- Test: `src/sim/simulate.test.js` (append)

**Interfaces:**
- Consumes: the `waves` / `matchupAware` ctx fields from Tasks 4-5.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/simulate.test.js`:

```js
describe('build-phase context', () => {
  it('hands the build plan the wave table and the current wave number', () => {
    // Without these the policy cannot know what is still coming and silently
    // falls back to the matchup-blind ranking.
    const seen = [];
    simulateMap({
      map: map0, waves: waves0,
      buildPlan: (ctx) => { seen.push(ctx); return []; },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].waves).toBe(waves0);
    expect(seen[0].waveNumber).toBe(1);
    expect(seen[1]?.waveNumber).toBe(2);
  });
});
```

Reuse whatever `map0` / `waves0` bindings the file already defines for its other `simulateMap` tests; do not introduce new fixtures.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/simulate.test.js`
Expected: FAIL — `seen[0].waves` is `undefined`.

- [ ] **Step 3: Thread `waves` into the context**

In `src/sim/simulate.js`, add `waves` to the object already being built at line 186-188:

```js
    const purchases = buildPlan({
      gold, towers, slotsUsed, buildZones: pathMgr.buildZones, path,
      waveNumber: w + 1, map, waves,
    }) ?? [];
```

That is the whole change to this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/simulate.test.js`
Expected: PASS.

- [ ] **Step 5: Correct the report header, which now claims a gap that is closed**

In `scripts/balance.mjs`, the header currently reads:

```js
console.log('\nSimulated combat — towers + tier upgrades + hero auto-attack + barracks soldiers');
console.log('(blocking, melee and respawn). Omits hero abilities, meta upgrades, matchup-aware');
console.log('tower choice, soldier repositioning and the send-wave-early bonus, so this model');
console.log('is PESSIMISTIC.\n');
```

Replace the omissions list, since matchup-aware tower choice is no longer omitted:

```js
console.log('\nSimulated combat — towers + tier upgrades + hero auto-attack + barracks soldiers');
console.log('(blocking, melee and respawn), buying and upgrading by the damage a tower actually');
console.log('lands against the enemies still to come. Omits hero abilities, meta upgrades,');
console.log('soldier repositioning and the send-wave-early bonus, so this model is still');
console.log('PESSIMISTIC — less so than before.\n');
```

- [ ] **Step 6: Add the blind-vs-aware section**

Append to `scripts/balance.mjs`, after the existing "Blocking sensitivity" block, following that block's own shape (`barracksPlan` at line 111 is the template):

```js
// ── Matchup sensitivity ────────────────────────────────────────────────────
// How much of each map's difficulty was the MODEL rather than the MAP. "blind"
// is the old damage-per-gold ranking, which buys an archer against titans;
// "aware" buys and upgrades by damage actually landed. A large delta means the
// map was never as hard as the report used to claim. Kept for one release so
// backlog #16 can tell a smarter model apart from an easier map.
const awarePlan = on => ctx => greedyBuildPlan({ ...ctx, matchupAware: on });

console.log('\nMatchup sensitivity — damage multiplier needed, by how the model picks towers.\n');
console.log(pad('#', 3) + pad('Map', 22) + padL('blind', 9) + padL('aware', 9) + padL('delta', 10));
console.log('-'.repeat(120));

for (const { map } of rows) {
  const waves = MAP_WAVES[map.id];
  const show = v => (v === null ? '>8x' : `${v}x`);
  const blind = findWinMultiplier(map, waves, { buildPlan: awarePlan(false) });
  const aware = findWinMultiplier(map, waves, { buildPlan: awarePlan(true) });
  const delta = (blind === null || aware === null) ? '—'
              : `${(blind - aware >= 0 ? '-' : '+')}${Math.abs(blind - aware).toFixed(2)}x`;
  console.log(pad(map.id, 3) + pad(map.name, 22)
            + padL(show(blind), 9) + padL(show(aware), 9) + padL(delta, 10));
}
```

- [ ] **Step 7: Run the report and the suite**

Run: `npm run balance`
Expected: it runs cleanly and the new "Matchup sensitivity" table prints. **The main table's numbers are expected to change** — that is the deliverable.

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sim/simulate.js scripts/balance.mjs src/sim/simulate.test.js
git commit -m "feat(sim): give the build policy the wave table; report blind vs aware"
```

---

## Verification (after all tasks, before the PR)

- [ ] `npm run test` — full suite green; report the actual file/test counts.
- [ ] **Confirm the game is untouched:** `git diff --name-only origin/main..HEAD` must show no file under `src/data/`, `src/scenes/`, `src/entities/` or `src/ui/`. The only `src/systems/` file is `WaveManager.js`, changed solely by the Task 1 extraction.
- [ ] `npm run balance` — capture the full output. Record the new deficit for every map and the blind-vs-aware delta. **The numbers changing is the deliverable, not a regression.**
- [ ] Re-run the map-2 sweep (`startGold` 150..200 in 5g steps, `greedyBuildPlan` passed directly) and report the new inversion count, and specifically whether the **155g win → 160g loss** flip survives. A reduced count is the hoped-for result, **not a pass condition** — if the flip persists that is a finding about the map, which belongs to backlog #16, and must be reported rather than tuned away here.
- [ ] Sanity-check one ranking by hand against the tables: with a titan-heavy remaining mix, print the ranked buy order and confirm it is defensible (sniper and mage above archer and ice).
