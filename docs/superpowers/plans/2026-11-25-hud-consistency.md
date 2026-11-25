# HUD Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The HUD's wave total comes from the spawning wave table, and HUD pulses never replay when a new level shows the HUD (backlog #40 b, c).

**Architecture:** One line in `GameScene._updateHUD`, a new `GameScene._resetHudPulses()` called in `create()` next to the existing `.disabled` reset, and a data pin in `maps.test.js`.

**Tech Stack:** Vanilla JS ES modules, Phaser 3.90, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-hud-consistency-design.md`

## Global Constraints

- `#stat-wave` text is `${this.waveMgr.currentWave}/${this.waveMgr.waves.length}`.
- `_resetHudPulses()` removes `life-lost-pulse`, `gold-gain-pulse` and `cd-tick` from every element under `#hud-layer`, and touches no other class. It is a no-op if `#hud-layer` is missing.
- `create()` calls `_resetHudPulses()` right after it sets `#hud-layer` to `display: block`, beside the `exit-btn` `.disabled` reset.
- The data pin: for every map, `MAPS[i].waveCount === MAP_WAVES[i].length` (import `MAP_WAVES` from `src/data/waves.js`).
- No change to `pulseClass`, CoinFx, the CSS, the wave banner or `#game.life-lost-frame`.

## Review Focus

- `_resetHudPulses` must not strip `hud-stat`, `cd-on`, `cd-warn`, `ui-btn` or any other class. Test 3 pins this.
- A pulse class on `#game` (outside `#hud-layer`) is left alone. Test 3 pins this.
- The `#stat-wave` total must differ from `MAPS[id].waveCount` in the test fixture, so a test reading the map table fails.

---

### Task 1: HUD wave total and pulse reset

**Files:**
- Modify: `src/scenes/GameScene.js`, `src/data/maps.test.js`
- Test: new `src/scenes/GameScene.hudConsistency.test.js` (mock `phaser` as `GameScene.waveBanner.test.js` does)

**Interfaces:**
- Produces: `GameScene.prototype._resetHudPulses()`.

- [ ] **Step 1: Write the failing tests**
  1. `the wave stat's total is the spawning wave table, not the map table`. Build the DOM ids `_updateHUD` writes. Copy them from the method; it may write more than the four stats, and it may read more of `this`. Add whatever fakes it needs, and read the method first. Call `GameScene.prototype._updateHUD.call(ctx)` with `mapId: 0` and `waveMgr: { currentWave: 1, waves: [[], []] }` (2 waves, while `MAPS[0].waveCount` is 10). Expect `#stat-wave` text `1/2`.
  2. `every map's waveCount matches its wave table` (in `maps.test.js`). For each map, expect `map.waveCount` to be `MAP_WAVES[map.id].length`.
  3. `_resetHudPulses strips only the pulse classes, only inside #hud-layer`. Build `#hud-layer` containing:
     - a `.hud-stat.life-lost-pulse`;
     - a `.hud-stat.gold-gain-pulse`;
     - a `#wave-btn.ui-btn.cd-on.cd-warn.cd-tick`.

     Put a sibling `#game.life-lost-frame` outside the layer, plus a `.hud-stat.life-lost-pulse` outside the layer. Call `_resetHudPulses.call({})`. Expect:
     - the three pulse classes are gone inside the layer;
     - `hud-stat`, `ui-btn`, `cd-on` and `cd-warn` remain;
     - both elements outside the layer keep their classes.
  4. `_resetHudPulses is a no-op without #hud-layer`: empty body, no throw.
- [ ] **Step 2: Run** `npx vitest run src/scenes/GameScene.hudConsistency.test.js src/data/maps.test.js`. Expected: tests 1, 3 and 4 fail (2 passes today: it pins the current data). Paste the raw output.
- [ ] **Step 3: Implement** per the Global Constraints. Give the reset a one-line *why* comment: display none → block restarts a CSS animation.
- [ ] **Step 4: Run** the files, then `npx vitest run`. Expected: all pass, exit 0. Never pipe through `tail` or `head`. Report the count.
- [ ] **Step 5: Mutation checks.** Paste the raw failing output for each, then restore:
  - (a) `_updateHUD` back to `MAPS[this.mapId].waveCount`: test 1 fails;
  - (b) `_resetHudPulses` querying `document` instead of `#hud-layer`: test 3 fails;
  - (c) leave `cd-tick` out of the class list: test 3 fails;
  - (d) set one map's `waveCount` in `maps.js` off by one: test 2 fails.
- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.hudConsistency.test.js src/data/maps.test.js
git commit -m "fix(hud): wave total from the wave table; no pulse replay on level start (#40)"
```
