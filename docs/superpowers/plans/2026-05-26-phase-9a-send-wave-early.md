# Phase 9a — Send-Wave-Early Bonus: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-26-phase-9a-send-wave-early-design.md](../specs/2026-05-26-phase-9a-send-wave-early-design.md)

**Goal:** Add a gold bonus for sending the next wave while the previous one's enemies are still on the path. Bonus = `floor(0.5 × Σ enemy.def.reward)` of remaining living enemies. The existing wave button is re-used with a live `(+Xg)` label.

**Architecture:** Two surfaces:
1. `WaveManager` — adds a single `isEarlyEligible` getter and relaxes the `startWave()` guard so it permits re-entry when `_spawnQ` is empty.
2. `GameScene` — extends `_updateWaveButton` (label suffix), `_startWave` (award bonus + toast on early click), and `_updateEnemies` (one new `_updateWaveButton()` call when dead enemies are filtered out, so the bonus label updates live).

No new files. No new event types. No save-format changes.

**Tech Stack:** Phaser 3.88, Vitest, jsdom. Pure-JS classes (`WaveManager`) are unit-testable; `GameScene` methods are tested by calling prototype methods with a custom `this` context (the pattern used by Phaser-bound scene tests in this codebase).

**Branch:** `feature/phase-9a-send-wave-early` (off `feature/phase-3-tower-system`).

---

## Tasks At A Glance

| # | Task | Type | Depends on |
|---|---|---|---|
| 1 | `WaveManager.isEarlyEligible` getter + relax `startWave()` guard | TDD | — |
| 2 | `GameScene._updateWaveButton` label suffix | TDD | 1 |
| 3 | `GameScene._startWave` early-send bonus + toast | TDD | 1, 2 |
| 4 | `GameScene._updateEnemies` triggers live label update | Integration | 2, 3 |
| 5 | Manual browser verification + PR | Manual | 1–4 |

---

## Task 1: WaveManager — `isEarlyEligible` getter + relax `startWave()` guard

**Files:**
- Create: `src/systems/WaveManager.test.js`
- Modify: `src/systems/WaveManager.js`

**Context:** Today `startWave()` bails when `active === true`, which prevents early-send (because `active` stays true until all enemies leave the path). We need a getter that exposes the early-eligible window and a relaxed guard that still rejects spam clicks during the spawn ramp.

- [ ] **Step 1: Write failing tests**

Create `src/systems/WaveManager.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { WaveManager } from './WaveManager.js';

function makeEmitter() {
  return { emit: vi.fn() };
}

function tinyWaves() {
  // 2 waves of 1 drone each, easy to drain
  return [
    [{ type: 'drone', count: 1, interval: 0 }],
    [{ type: 'drone', count: 1, interval: 0 }],
  ];
}

describe('WaveManager — isEarlyEligible', () => {
  it('is false before any wave starts', () => {
    const wm = new WaveManager(tinyWaves(), makeEmitter());
    expect(wm.isEarlyEligible).toBe(false);
  });

  it('is false while the spawn queue still has entries', () => {
    const wm = new WaveManager(
      [[{ type: 'drone', count: 2, interval: 1000 }]],
      makeEmitter(),
    );
    wm.startWave();
    expect(wm._spawnQ.length).toBeGreaterThan(0);
    expect(wm.isEarlyEligible).toBe(false);
  });

  it('is true once the spawn queue empties while active is still true', () => {
    const wm = new WaveManager(
      [[{ type: 'drone', count: 1, interval: 0 }]],
      makeEmitter(),
    );
    wm.startWave();
    // Drain the queue: one update tick is enough since interval is 0
    wm.update(100);
    expect(wm._spawnQ.length).toBe(0);
    expect(wm.active).toBe(true);
    expect(wm.isEarlyEligible).toBe(true);
  });

  it('is false again after active flips back to false (between waves)', () => {
    const wm = new WaveManager(tinyWaves(), makeEmitter());
    wm.startWave();
    wm.update(100);
    wm.active = false; // simulating GameScene._checkWaveComplete
    expect(wm.isEarlyEligible).toBe(false);
  });
});

describe('WaveManager — startWave permits early restart', () => {
  it('allows a second startWave when isEarlyEligible is true', () => {
    const emitter = makeEmitter();
    const wm = new WaveManager(tinyWaves(), emitter);
    wm.startWave();
    wm.update(100); // drain wave 1's spawn queue
    expect(wm.isEarlyEligible).toBe(true);

    wm.startWave(); // early-send wave 2

    expect(wm.currentWave).toBe(2);
    expect(wm._spawnQ.length).toBe(1); // wave 2 was queued
    expect(wm.active).toBe(true);
    // Two wave:start emits — one per startWave call
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it('still rejects startWave while the previous wave is still spawning', () => {
    const emitter = makeEmitter();
    const wm = new WaveManager(
      [
        [{ type: 'drone', count: 3, interval: 1000 }],
        [{ type: 'drone', count: 1, interval: 0 }],
      ],
      emitter,
    );
    wm.startWave();
    expect(wm._spawnQ.length).toBe(3);
    const queueBefore = wm._spawnQ.length;
    const currentBefore = wm.currentWave;

    wm.startWave(); // should be a no-op

    expect(wm.currentWave).toBe(currentBefore);
    expect(wm._spawnQ.length).toBe(queueBefore);
  });

  it('still rejects startWave when done', () => {
    const wm = new WaveManager([[{ type: 'drone', count: 1, interval: 0 }]], makeEmitter());
    wm.startWave();
    wm.update(100);
    wm.active = false;
    expect(wm.done).toBe(true);
    const currentBefore = wm.currentWave;
    wm.startWave();
    expect(wm.currentWave).toBe(currentBefore);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- WaveManager`
Expected: ≥4 failures referencing `isEarlyEligible` (undefined) and the early-restart test (currentWave doesn't advance because of the existing `active` guard).

- [ ] **Step 3: Update WaveManager.js**

Open `src/systems/WaveManager.js`. The current `startWave()` reads:

```js
  startWave() {
    if (this.active || this.done) return;
    this.active = true;
    this._elapsed = 0;
    this._spawnQ = [];
    const scaleFactor = 1 + this.currentWave * 0.13;
    let delay = 0;
    for (const group of this.waves[this.currentWave]) {
      const def = ENEMY_DEFS[group.type];
      for (let i = 0; i < group.count; i++) {
        this._spawnQ.push({ delayMs: delay, def: { ...def }, scaleFactor });
        delay += group.interval;
      }
    }
    this._spawnQ.sort((a, b) => a.delayMs - b.delayMs);
    this.currentWave++;
    this._emitter.emit('wave:start', { waveNum: this.currentWave });
  }
```

Replace the guard line `if (this.active || this.done) return;` with:

```js
    if (this.done) return;
    if (this.active && this._spawnQ.length > 0) return; // still spawning — reject
```

(The rest of the method stays unchanged. `this.active = true` is now a no-op in the early-restart case, which is fine.)

Add the new getter immediately after the existing `get done()` (which is around line 18). Place it for grouping:

```js
  get isEarlyEligible() {
    return this.active && this._spawnQ.length === 0;
  }
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- WaveManager`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/WaveManager.js src/systems/WaveManager.test.js
git commit -m "feat(wave-manager): isEarlyEligible getter + permit early restart"
```

---

## Task 2: GameScene._updateWaveButton — early-bonus label suffix

**Files:**
- Modify: `src/scenes/GameScene.js`
- Create: `src/scenes/GameScene.updateWaveButton.test.js`

**Context:** The current method renders three states (done / active / between). Add a fourth: `active && isEarlyEligible && enemies.length > 0` → render with the `(+Xg)` suffix. The bonus is `floor(0.5 × Σ reward of living enemies)`.

GameScene is a Phaser scene, so we test the method by invoking it on a manually-constructed `this` object via `GameScene.prototype._updateWaveButton.call(stubScene)`. This pattern keeps Phaser out of the test runtime.

- [ ] **Step 1: Write failing test**

Create `src/scenes/GameScene.updateWaveButton.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import GameScene from './GameScene.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
  return btn;
}

function makeScene({ done = false, active = false, isEarlyEligible = false, currentWave = 0, enemies = [] } = {}) {
  return {
    waveMgr: { done, active, isEarlyEligible, currentWave },
    enemies,
  };
}

beforeEach(setupBtn);

describe('GameScene._updateWaveButton', () => {
  it('renders "All Waves Done" (disabled) when waveMgr.done', () => {
    const scene = makeScene({ done: true });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('All Waves Done');
    expect(btn.disabled).toBe(true);
  });

  it('renders "Wave N in progress..." (disabled) while spawning', () => {
    const scene = makeScene({ active: true, isEarlyEligible: false, currentWave: 3 });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('Wave 3 in progress...');
    expect(btn.disabled).toBe(true);
  });

  it('renders "▶ Send Wave N+1" (enabled, no bonus) when between waves', () => {
    const scene = makeScene({ active: false, currentWave: 2 });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('▶ Send Wave 3');
    expect(btn.disabled).toBe(false);
  });

  it('renders "▶ Send Wave N+1 (+Xg)" (enabled) when isEarlyEligible with living enemies', () => {
    const enemies = [
      { def: { reward: 20 }, dead: false },
      { def: { reward: 55 }, dead: false },
    ];
    // floor(0.5 * (20+55)) = floor(37.5) = 37
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('▶ Send Wave 2 (+37g)');
    expect(btn.disabled).toBe(false);
  });

  it('excludes dead enemies from the bonus sum', () => {
    const enemies = [
      { def: { reward: 100 }, dead: true },
      { def: { reward: 20 }, dead: false },
    ];
    // floor(0.5 * 20) = 10
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2 (+10g)');
  });

  it('omits the (+Xg) suffix when computed bonus is 0', () => {
    const enemies = [{ def: { reward: 0 }, dead: false }];
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
  });

  it('renders "▶ Send Wave N+1" when isEarlyEligible but enemies array is empty', () => {
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies: [] });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
    expect(document.getElementById('wave-btn').disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- updateWaveButton`
Expected: 4 failures on the early-eligible cases (the current method ignores `isEarlyEligible` entirely).

- [ ] **Step 3: Update _updateWaveButton in src/scenes/GameScene.js**

The current method (around line 770) reads:

```js
  _updateWaveButton() {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (this.waveMgr.done) {
      btn.disabled = true; btn.textContent = 'All Waves Done';
    } else if (this.waveMgr.active) {
      btn.disabled = true; btn.textContent = `Wave ${this.waveMgr.currentWave} in progress...`;
    } else {
      btn.disabled = false; btn.textContent = `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
    }
  }
```

Replace with:

```js
  _updateWaveButton() {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (this.waveMgr.done) {
      btn.disabled = true; btn.textContent = 'All Waves Done';
      return;
    }
    if (this.waveMgr.active && this.waveMgr.isEarlyEligible) {
      const bonus = this._computeEarlyBonus();
      btn.disabled = false;
      btn.textContent = bonus > 0
        ? `▶ Send Wave ${this.waveMgr.currentWave + 1} (+${bonus}g)`
        : `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
      return;
    }
    if (this.waveMgr.active) {
      btn.disabled = true; btn.textContent = `Wave ${this.waveMgr.currentWave} in progress...`;
      return;
    }
    btn.disabled = false; btn.textContent = `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
  }

  _computeEarlyBonus() {
    let sum = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      sum += (e.def && typeof e.def.reward === 'number') ? e.def.reward : 0;
    }
    return Math.floor(0.5 * sum);
  }
```

(The new `_computeEarlyBonus()` is a small helper kept on the prototype so Task 3 can reuse it from `_startWave`.)

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- updateWaveButton`
Expected: all 7 tests pass.

Also run the full suite to confirm no regressions:

Run: `npm test`
Expected: all tests pass (count = previous baseline + 7 new for this task + 7 from Task 1 = 215 + 14 = 229).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.updateWaveButton.test.js
git commit -m "feat(game-scene): wave button shows live early-send bonus suffix"
```

---

## Task 3: GameScene._startWave — award bonus + toast on early click

**Files:**
- Modify: `src/scenes/GameScene.js`
- Create: `src/scenes/GameScene.startWave.test.js`

**Context:** `_startWave()` already plays the `wave-start` SFX and bails when `active` is true. Phase 9a needs:
1. Drop the `active` bail so early-send can reach `waveMgr.startWave()`. (WaveManager's own guard from Task 1 now handles spam-during-spawning.)
2. Before invoking `waveMgr.startWave()`, if `isEarlyEligible` AND `bonus > 0`, award the gold and show a toast.

The visual feedback is the toast — no new SFX (the existing `wave-start` plays on every click and audibly distinguishes the action).

- [ ] **Step 1: Write failing tests**

Create `src/scenes/GameScene.startWave.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
}

function makeScene({ isEarlyEligible = false, active = false, currentWave = 1, enemies = [] } = {}) {
  const startWaveSpy = vi.fn();
  return {
    waveMgr: {
      done: false,
      active,
      isEarlyEligible,
      currentWave,
      startWave: startWaveSpy,
    },
    enemies,
    economy: { earn: vi.fn() },
    game:    { registry: { get: () => null } },
    _toast:  vi.fn(),
    _updateWaveButton: vi.fn(),
    _computeEarlyBonus: GameScene.prototype._computeEarlyBonus,
  };
}

beforeEach(setupBtn);

describe('GameScene._startWave', () => {
  it('awards the bonus and toasts when isEarlyEligible with living enemies', () => {
    const enemies = [
      { def: { reward: 20 }, dead: false },
      { def: { reward: 55 }, dead: false },
    ];
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).toHaveBeenCalledWith(37);
    expect(scene._toast).toHaveBeenCalledWith('+37g');
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does not award a bonus when not earlyEligible (normal between-wave click)', () => {
    const scene = makeScene({ isEarlyEligible: false, active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn when bonus would be zero (no living enemies)', () => {
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies: [] });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn when only dead enemies remain (sum = 0)', () => {
    const enemies = [
      { def: { reward: 100 }, dead: true },
      { def: { reward: 50 },  dead: true },
    ];
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('passes through to waveMgr.startWave even when between waves (no early)', () => {
    const scene = makeScene({ isEarlyEligible: false, active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.waveMgr.startWave).toHaveBeenCalled();
  });

  it('plays wave-start SFX when audio manager is present', () => {
    const playSfx = vi.fn();
    const scene = makeScene({ isEarlyEligible: false, active: false });
    scene.game.registry.get = () => ({ playSfx });
    GameScene.prototype._startWave.call(scene);
    expect(playSfx).toHaveBeenCalledWith('wave-start');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- startWave`
Expected: the bonus-path tests fail because the current method bails early on `active === true` and never awards a bonus.

- [ ] **Step 3: Update _startWave in src/scenes/GameScene.js**

The current method (around line 194) is:

```js
  _startWave() {
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('wave-start');
    if (this.waveMgr.active) return;
    this.waveMgr.startWave();
    this._updateWaveButton();
  }
```

Replace with:

```js
  _startWave() {
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('wave-start');

    if (this.waveMgr.isEarlyEligible) {
      const bonus = this._computeEarlyBonus();
      if (bonus > 0) {
        this.economy.earn(bonus);
        this._toast(`+${bonus}g`);
      }
    } else if (this.waveMgr.active) {
      return;
    }

    this.waveMgr.startWave();
    this._updateWaveButton();
  }
```

(The flow: SFX always plays on click; if early-eligible, award bonus + toast then fall through to `startWave`; if active but NOT early-eligible (still spawning), bail; otherwise normal between-wave start.)

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- startWave`
Expected: all 6 tests pass.

Run full suite:

Run: `npm test`
Expected: all tests pass (~235 with new ones counted).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.startWave.test.js
git commit -m "feat(game-scene): _startWave awards early-send bonus + toast"
```

---

## Task 4: GameScene._updateEnemies — live label update on enemy death

**Files:**
- Modify: `src/scenes/GameScene.js`

**Context:** `_updateWaveButton()` currently runs only on `create()`, `_startWave()`, and `_checkWaveComplete()`. For the live `(+Xg)` to drop as enemies die, we need one more trigger: after the dead-enemy filter in `_updateEnemies`, when `removed > 0`. The `removed` count is already computed there for the combat-music transition (Phase 8 Task 12).

There is no new test file for this — Tasks 2 and 3 already exhaustively cover the label/bonus logic. This task is a single one-line addition that wires up the existing tested machinery to a new trigger point. The full test suite must still pass (no regressions) and the manual browser walkthrough in Task 5 verifies the live-update behavior.

- [ ] **Step 1: Locate the dead-enemy filter block**

In `src/scenes/GameScene.js`, find the end of `_updateEnemies()` (around line 280). The Phase 8 wiring added this block:

```js
    const beforeCount = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.dead);
    const removed = beforeCount - this.enemies.length;
    if (removed > 0) {
      this._enemiesOnPath = Math.max(0, this._enemiesOnPath - removed);
      if (this._enemiesOnPath === 0) {
        const am = this.game.registry.get('audio');
        if (am) am.setCombatActive(false);
      }
    }
```

- [ ] **Step 2: Add one new call inside the `if (removed > 0)` block**

Replace the block above with:

```js
    const beforeCount = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.dead);
    const removed = beforeCount - this.enemies.length;
    if (removed > 0) {
      this._enemiesOnPath = Math.max(0, this._enemiesOnPath - removed);
      if (this._enemiesOnPath === 0) {
        const am = this.game.registry.get('audio');
        if (am) am.setCombatActive(false);
      }
      this._updateWaveButton();
    }
```

(The new line is `this._updateWaveButton();` at the bottom of the `if (removed > 0)` block. Runs once per game tick where at least one enemy died — negligible cost since the button render is a DOM textContent assignment.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (no behavior change for tests that don't observe button text mid-wave).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): live-update wave button bonus when enemies die"
```

---

## Task 5: Manual browser verification + open PR

**Files:**
- No code changes.

**Context:** Spec §7.4 walkthrough. Without browser verification this feature is unproven — the unit and integration tests cover logic but cannot prove the live label, toast, and audio actually behave correctly in a real Phaser scene.

- [ ] **Step 1: Build and serve**

Run: `npm run build` (sanity)
Expected: clean build, no errors.

Run: `npm run dev`
Open: http://localhost:5173 (or the Vite default).

- [ ] **Step 2: Trigger the early-eligible state**

In the browser:
1. From Map Select, click Map 1.
2. Place at least one tower (any type) and start wave 1.
3. Wait for the last enemy to spawn (you'll see the on-screen count stop increasing).
4. **Expected:** the wave button label changes from `Wave 1 in progress…` to `▶ Send Wave 2 (+Xg)` where X > 0.

- [ ] **Step 3: Verify live label updates**

Kill a few enemies (let your towers do their thing) without sending the wave early.

**Expected:** the `(+Xg)` value drops on each kill, and once the path is empty the suffix disappears entirely (becomes just `▶ Send Wave 2`).

- [ ] **Step 4: Click early; verify gold + toast + audio + wave overlap**

Reset (refresh the page) and repeat steps 2 (start wave, wait for spawn end). With enemies still walking, click the wave button.

**Expected:**
- Gold jumps by the displayed bonus.
- A `+Xg` toast appears anchored to the wave button (or HUD).
- The `wave-start` SFX plays once.
- Wave 2 begins spawning while wave 1's enemies are still on the path (two waves overlapping).

- [ ] **Step 5: Boss-wave smoke check (Map 5)**

If you have stars unlocked for Map 5, repeat steps 2–4 on Map 5 to confirm boss music continues uninterrupted through an early-send.

- [ ] **Step 6: Mute audio; verify visual feedback alone is sufficient**

Open the settings overlay (gear button on Map Select). Mute audio. Return to the game and repeat steps 2 and 4.

**Expected:** toast still appears, gold still updates; no audio plays.

- [ ] **Step 7: Push and open PR**

Run:

```bash
git push -u origin feature/phase-9a-send-wave-early
gh pr create --base feature/phase-3-tower-system --title "Phase 9a — Send-Wave-Early bonus" --body "$(cat <<'EOF'
## Summary

First of three "Strategic Depth" sub-features. Adds a gold bonus for sending the next wave while the previous one's enemies are still on the path.

- `WaveManager.isEarlyEligible` getter + relaxed `startWave()` guard so early-send actually goes through
- Wave button label shows live `(+Xg)` while early-eligible; `(+Xg)` recomputes on every enemy death
- `floor(0.5 × Σ enemy.def.reward)` of living enemies, awarded once on early-click
- Visual toast confirms the bonus landed; existing `wave-start` SFX provides audible feedback

## Spec
[docs/superpowers/specs/2026-05-26-phase-9a-send-wave-early-design.md](docs/superpowers/specs/2026-05-26-phase-9a-send-wave-early-design.md)

## Test plan
- [x] `npm test` — full suite passes (baseline + ~17 new tests)
- [x] `npm run build` — clean
- [x] Manual browser §7.4 walkthrough — label updates live, toast fires, audio plays, waves overlap, mute respected

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check.** Each spec section maps to at least one task:

- §2 Trigger window → Task 1 (`isEarlyEligible` getter)
- §3 Bonus formula → Task 2 (`_computeEarlyBonus`) and Task 3 (`_startWave` consumer)
- §4 UI → Task 2 (label states) and Task 3 (toast)
- §5 Architecture →
  - §5.1 `WaveManager` API → Task 1
  - §5.2 `GameScene` changes → Tasks 2, 3, 4
  - §5.3 Data flow → Tasks 3 and 4
- §6 Edge cases →
  - "0 enemies alive at click" → Task 2 step 1 (empty-enemies test) and Task 3 step 1 (no-toast-on-empty test)
  - "Phantom flying enemies" → handled by the same reward-sum path as ground enemies; no special test needed because `def.reward` is the only field consulted
  - "Boss waves" → Task 5 step 5 (manual smoke)
  - "Final wave" → Task 2 step 1 (the `done` branch is tested)
  - "Bonus = 0" → Task 2 step 1 + Task 3 step 1 (zero-bonus tests)
  - "Player has UI muted" → Task 5 step 6 (manual)
  - "Rapid double-click" → covered by Task 1's "still rejects startWave while spawning" + the fact that after the first click `isEarlyEligible` flips to false (the wave is no longer eligible because the new wave is now spawning)
- §7 Testing strategy → Tasks 1, 2, 3 (TDD) + Task 5 (manual)
- §8 Out of scope → not implemented; left for Phase 9b/9c
- §9 Risks → no plan changes needed; mitigations are observational
- §10 Acceptance criteria →
  - 1, 2, 3: covered by Tasks 1–5
  - 4: regression check in Tasks 2 step 4, 3 step 4, 4 step 3
  - 5: Task 5 step 1
  - 6: optional (recommended)

**Placeholder scan.** No "TBD", "TODO", or "similar to Task N" references. All code blocks contain runnable code. All commands include expected output. ✅

**Type/name consistency.**
- `WaveManager.isEarlyEligible` — used in Tasks 1 (definition), 2 (tests + consumer), 3 (tests + consumer). ✅
- `WaveManager.startWave()` signature unchanged. ✅
- `GameScene._computeEarlyBonus()` — defined in Task 2; called in Tasks 2 and 3. ✅
- `GameScene._toast(msg)` — existing helper at GameScene line ~783; consumed in Task 3 with a string arg. ✅
- `economy.earn(bonus)` — existing API. ✅
- Bonus formula `Math.floor(0.5 × Σ reward of living enemies)` — same in spec §3, Task 2 step 3 code, and Task 3 test assertions (37 = floor(0.5 × 75)). ✅

**Interaction note (not a placeholder — flagged for awareness):** The existing `+38` between-waves bonus in `_checkWaveComplete()` is only awarded when `_spawnQ.length === 0 && enemies.length === 0`. When the player chains early-sends, that condition is never met until the chain ends, so they only receive one `+38` at the very end of the chain instead of one per wave. This is the intended tradeoff (early bonus replaces wave-end bonus); it's documented here so reviewers don't flag it as a bug. No spec or code change needed.

Plan ready for execution.
