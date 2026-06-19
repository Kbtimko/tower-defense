# Per-Level Economy Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retune per-map `startGold` and add a per-map `rewardMult` scalar so filling every tower slot becomes a late-game, early-send-rewarded goal instead of a turn-3 certainty.

**Architecture:** Add a `rewardMult` field to all 10 maps in `maps.js` and retune `startGold`. In `GameScene`, read `this.rewardMult = map.rewardMult ?? 1` and apply it uniformly to the three reward-derived income sources: kill payouts (via a new DRY `_killReward` helper), the wave-clear bonus (extract hardcoded `38` to a `WAVE_CLEAR_BONUS` const), and the early-send bonus in `_computeEarlyBonus`. The player-side `killGoldMult` upgrade modifier composes orthogonally by multiplication.

**Tech Stack:** JavaScript (ES modules), Phaser 3, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-17-economy-calibration-design.md`

---

### Task 1: Add `rewardMult` + retune `startGold` in map data

**Files:**
- Modify: `src/data/maps.js` (the 10 map objects — `startGold` and a new `rewardMult` per map)
- Test: `src/data/maps.test.js`

- [ ] **Step 1: Add `rewardMult` to the REQUIRED fields and a range test**

In `src/data/maps.test.js`, add `'rewardMult'` to the `REQUIRED` array (currently ends with `...'blockerSeed','towerSlots',`). Then add this new test inside the `for (const map of MAPS)` loop (alongside the other per-map `it(...)` blocks):

```javascript
    it(`map ${map.id} rewardMult is a number in (0, 1]`, () => {
      expect(typeof map.rewardMult).toBe('number');
      expect(map.rewardMult).toBeGreaterThan(0);
      expect(map.rewardMult).toBeLessThanOrEqual(1);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/maps.test.js`
Expected: FAIL — maps do not yet have a `rewardMult` property (`expected undefined to be 'number'` and the required-fields test fails).

- [ ] **Step 3: Edit each map's `startGold` and add `rewardMult`**

In `src/data/maps.js`, for each map object set `startGold` to the new value and add a `rewardMult` line immediately after the `startLives` line. Apply this table exactly:

| map id | startGold | rewardMult |
|---|---|---|
| 0 | 130 | 0.30 |
| 1 | 130 | 0.35 |
| 2 | 130 | 0.30 |
| 3 | 120 | 0.30 |
| 4 | 120 | 0.25 |
| 5 | 120 | 0.25 |
| 6 | 110 | 0.30 |
| 7 | 110 | 0.25 |
| 8 | 100 | 0.20 |
| 9 | 100 | 0.20 |

For example, map 0 currently reads:

```javascript
    startGold: 200,
    startLives: 25,
```

becomes:

```javascript
    startGold: 130,
    startLives: 25,
    rewardMult: 0.30,
```

Do the same for all 10 maps (only `startGold` changes value; `startLives` is unchanged; `rewardMult` is new). Leave `waveCount` and every other field untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/maps.test.js`
Expected: PASS (all per-map field + range tests green).

- [ ] **Step 5: Commit**

```bash
git add src/data/maps.js src/data/maps.test.js
git commit -m "feat(maps): retune startGold + add per-map rewardMult (backlog #7)"
```

---

### Task 2: DRY kill payout into `_killReward` and apply `rewardMult`

**Files:**
- Modify: `src/scenes/GameScene.js` (add `this.rewardMult` in `create()`, add `_killReward` method, replace 2 call sites)
- Test: `src/scenes/GameScene.economy.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.economy.test.js`. The mock preamble mirrors the existing `src/scenes/GameScene.startWave.test.js` so `GameScene` imports without Phaser internals:

```javascript
// Mock Phaser before any imports that touch it
vi.mock('phaser', () => ({
  default: {
    Scene: class {
      constructor(key) { this.key = key; }
    },
  },
}));

// Mock all heavy dependencies so GameScene can be imported without Phaser internals
vi.mock('../data/towers.js', () => ({ TOWER_DEFS: {} }));
vi.mock('../data/maps.js', () => ({ MAPS: {} }));
vi.mock('../data/waves.js', () => ({ MAP_WAVES: {} }));
vi.mock('../data/story.js', () => ({ STORY_PANELS: {} }));
vi.mock('../utils/display.js', () => ({ starsDisplay: () => '' }));
vi.mock('../systems/PathManager.js', () => ({ PathManager: class {} }));
vi.mock('../systems/WaveManager.js', () => ({ WaveManager: class {} }));
vi.mock('../systems/EconomyManager.js', () => ({ EconomyManager: class {} }));
vi.mock('../systems/TowerPlacementManager.js', () => ({ TowerPlacementManager: class {} }));
vi.mock('../systems/SaveManager.js', () => ({ SaveManager: class {} }));
vi.mock('../systems/UpgradeManager.js', () => ({ UpgradeManager: class {} }));
vi.mock('../systems/StoryManager.js', () => ({ StoryManager: class {} }));
vi.mock('../systems/DamageNumberOverlay.js', () => ({ DamageNumberOverlay: class {} }));
vi.mock('../systems/ShakeController.js', () => ({ ShakeController: class {} }));
vi.mock('../systems/ParticleSpawner.js', () => ({ ParticleSpawner: class {} }));
vi.mock('../entities/Tower.js', () => ({ Tower: class {} }));
vi.mock('../entities/Barracks.js', () => ({ Barracks: class {} }));
vi.mock('../entities/Enemy.js', () => ({ Enemy: class {} }));
vi.mock('../entities/Projectile.js', () => ({ Projectile: class {} }));
vi.mock('../entities/Hero.js', () => ({ Hero: class {} }));
vi.mock('../entities/SentryTurret.js', () => ({ SentryTurret: class {} }));
vi.mock('../systems/AreaEffectsManager.js', () => ({ AreaEffectsManager: class { update() {} destroyAll() {} } }));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';

function makeScene({ killGoldMult = 1, rewardMult = 1 } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.killGoldMult = killGoldMult;
  scene.rewardMult = rewardMult;
  return scene;
}

describe('GameScene._killReward', () => {
  it('returns reward unchanged when both multipliers are 1', () => {
    const scene = makeScene();
    expect(GameScene.prototype._killReward.call(scene, 22)).toBe(22);
  });

  it('scales by rewardMult and rounds', () => {
    const scene = makeScene({ rewardMult: 0.3 });
    // 100 * 1 * 0.3 = 30
    expect(GameScene.prototype._killReward.call(scene, 100)).toBe(30);
  });

  it('composes killGoldMult and rewardMult by multiplication, rounded', () => {
    const scene = makeScene({ killGoldMult: 1.5, rewardMult: 0.4 });
    // 22 * 1.5 * 0.4 = 13.2 -> 13
    expect(GameScene.prototype._killReward.call(scene, 22)).toBe(13);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.economy.test.js`
Expected: FAIL — `GameScene.prototype._killReward is not a function`.

- [ ] **Step 3: Add `this.rewardMult` and the `_killReward` helper, replace call sites**

In `src/scenes/GameScene.js`, find this line in `create()` (currently line ~68):

```javascript
    this.killGoldMult = mods.killGoldMult;
```

Add directly below it:

```javascript
    this.rewardMult = map.rewardMult ?? 1;
```

Add this method to the `GameScene` class (place it next to the other private helpers, e.g. just above `_computeEarlyBonus`):

```javascript
  _killReward(reward) {
    return Math.round(reward * this.killGoldMult * this.rewardMult);
  }
```

Replace the kill-payout call site in `_updateHero` (currently line ~458):

```javascript
        this.economy.earn(Math.round(e.reward * this.killGoldMult));
```

with:

```javascript
        this.economy.earn(this._killReward(e.reward));
```

Replace the kill-payout call site in `_dealDamage` (currently line ~801):

```javascript
      this.economy.earn(Math.round(enemy.reward * this.killGoldMult));
```

with:

```javascript
      this.economy.earn(this._killReward(enemy.reward));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.economy.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.economy.test.js
git commit -m "feat(game-scene): DRY kill payout into _killReward + apply rewardMult (backlog #7)"
```

---

### Task 3: Scale wave-clear bonus and early-send bonus by `rewardMult`

**Files:**
- Modify: `src/scenes/GameScene.js` (`WAVE_CLEAR_BONUS` const, `_checkWaveComplete`, `_computeEarlyBonus`)
- Test: `src/scenes/GameScene.startWave.test.js`

- [ ] **Step 1: Update the early-send test for `rewardMult`**

In `src/scenes/GameScene.startWave.test.js`, update the `makeScene` helper to set a default `rewardMult` so existing expectations hold (mult = 1 leaves the math unchanged). Change:

```javascript
  scene.enemies = enemies;
  scene.economy = { earn: vi.fn() };
```

to:

```javascript
  scene.enemies = enemies;
  scene.rewardMult = rewardMult;
  scene.economy = { earn: vi.fn() };
```

and update the `makeScene` signature line:

```javascript
function makeScene({ isEarlyEligible = false, active = false, currentWave = 1, enemies = [] } = {}) {
```

to:

```javascript
function makeScene({ isEarlyEligible = false, active = false, currentWave = 1, enemies = [], rewardMult = 1 } = {}) {
```

Then add this new test inside the `describe('GameScene._startWave', ...)` block:

```javascript
  it('scales the early bonus by rewardMult', () => {
    const enemies = [
      { def: { reward: 20 }, dead: false },
      { def: { reward: 55 }, dead: false },
    ];
    // sum = 75 -> floor(0.5 * 75 * 0.4) = floor(15) = 15
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies, rewardMult: 0.4 });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).toHaveBeenCalledWith(15);
    expect(scene._toast).toHaveBeenCalledWith('+15g');
  });
```

(The existing `+37g` test passes `rewardMult: 1` by default — `floor(0.5 * 75 * 1) = 37` — and stays green.)

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `npx vitest run src/scenes/GameScene.startWave.test.js`
Expected: FAIL on the new "scales the early bonus by rewardMult" case — `_computeEarlyBonus` does not yet apply `rewardMult`, so it earns `37`, not `15`.

- [ ] **Step 3: Add `WAVE_CLEAR_BONUS` and apply `rewardMult` to both bonuses**

In `src/scenes/GameScene.js`, add a module-level constant near the top (after the imports, before the class declaration):

```javascript
const WAVE_CLEAR_BONUS = 38;
```

In `_checkWaveComplete` (currently line ~354), replace:

```javascript
    this.economy.earn(38);
```

with:

```javascript
    this.economy.earn(Math.round(WAVE_CLEAR_BONUS * this.rewardMult));
```

In `_computeEarlyBonus` (currently line ~1152), replace:

```javascript
    return Math.floor(0.5 * sum);
```

with:

```javascript
    return Math.floor(0.5 * sum * this.rewardMult);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.startWave.test.js`
Expected: PASS (all cases, including the new `rewardMult` case and the unchanged `+37g` case).

- [ ] **Step 5: Fix the `updateWaveButton` test (known breakage)**

`src/scenes/GameScene.updateWaveButton.test.js` calls `_computeEarlyBonus` (via `_updateWaveButton`'s label preview) but its `makeScene` does not set `rewardMult`. After Step 3, `_computeEarlyBonus` reads `this.rewardMult`, so an unset value yields `NaN` and the `+37g` label assertion breaks. Update its `makeScene` to default `rewardMult` to `1` (preserving the existing `+37g` expectation). Change:

```javascript
function makeScene({ done = false, active = false, isEarlyEligible = false, currentWave = 0, enemies = [] } = {}) {
  // Use prototype as base so _computeEarlyBonus is available when _updateWaveButton calls this._computeEarlyBonus()
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = { done, active, isEarlyEligible, currentWave };
  scene.enemies = enemies;
  return scene;
}
```

to:

```javascript
function makeScene({ done = false, active = false, isEarlyEligible = false, currentWave = 0, enemies = [], rewardMult = 1 } = {}) {
  // Use prototype as base so _computeEarlyBonus is available when _updateWaveButton calls this._computeEarlyBonus()
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = { done, active, isEarlyEligible, currentWave };
  scene.enemies = enemies;
  scene.rewardMult = rewardMult;
  return scene;
}
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all tests green (existing 701 + the new cases). If any other GameScene test reaches `_computeEarlyBonus`, `_killReward`, or the wave-clear path and now reads `this.rewardMult`, set `scene.rewardMult = 1` in that test's setup so the math is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.startWave.test.js src/scenes/GameScene.updateWaveButton.test.js
git commit -m "feat(game-scene): scale wave-clear + early-send bonus by rewardMult (backlog #7)"
```

---

## Post-implementation (handled outside the task loop)

These are done by the main thread during the verify step, not by task subagents:

- **Build check:** `npm run build` — expect a clean production build.
- **Browser playtest:** run the dev server, play the opening waves of map 0 and a hard map (8 or 9). Confirm (a) the board cannot be filled by wave 3, (b) the cheapest full board is only reachable late, and (c) each level remains winnable. If a map is unwinnable or trivially fillable, nudge its `startGold` / `rewardMult` in `maps.js` (the `maps.test.js` range test guards the bounds) and re-verify.
