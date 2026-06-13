# Dead-Enemy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop dead enemies from leaving permanent corpse sprites on the screen by destroying the Phaser `Container` after a 300ms alpha fade. Apply the same Container-destroy fix to projectiles (same latent leak, smaller visual surface).

**Architecture:** Two small private methods are added to `GameScene` — `_fadeOutDeadEnemy(enemy)` and `_destroyDeadProjectile(p)`. Each filter block in `_updateEnemies` and the projectile loop calls the appropriate helper for every dead instance before the array filter removes it. Game state (kills, gold, wave-end detection, combat-music, send-wave-early bonus, inspector hit-tests) is unchanged because `enemy.dead = true` and removal from `this.enemies` still happen at the same tick as today — the fade only affects the orphan visual.

**Tech Stack:** Phaser 3 (`scene.tweens.add` for the fade; `Container.destroy` for cleanup), Vitest + jsdom for unit tests, manual Playwright walkthrough for visual verification.

**Spec:** [docs/superpowers/specs/2026-05-29-dead-enemy-cleanup-design.md](../specs/2026-05-29-dead-enemy-cleanup-design.md)

**Branch:** `feature/dead-enemy-cleanup` off `feature/phase-3-tower-system`

**Baseline test count:** 348 passing (verified via `npm test --silent` after rebasing onto current `origin/feature/phase-3-tower-system`, which includes Phases 4-9c).

---

## Task 1: Enemy fade + destroy helper

**Files:**
- Create: `src/scenes/GameScene.dead-cleanup.test.js`
- Modify: `src/scenes/GameScene.js` — add `_fadeOutDeadEnemy` method; modify the dead-enemy filter block at the bottom of `_updateEnemies` ([GameScene.js:295-297](../../../src/scenes/GameScene.js#L295-L297))

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.dead-cleanup.test.js` with the following content. The test imports `GameScene` and exercises the helper method directly via `.call(fakeCtx, ...)` so we don't have to construct a full Phaser scene.

```js
vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

// Other GameScene imports pull in data + system modules; they are pure JS and
// safe to load. We never instantiate GameScene — we only call prototype methods.
import GameScene from './GameScene.js';

describe('GameScene._fadeOutDeadEnemy', () => {
  it('starts a 300ms alpha-to-0 tween targeting the enemy', () => {
    const enemy = { destroy: vi.fn() };
    const tweenAdd = vi.fn();
    const ctx = { tweens: { add: tweenAdd } };

    GameScene.prototype._fadeOutDeadEnemy.call(ctx, enemy);

    expect(tweenAdd).toHaveBeenCalledOnce();
    const config = tweenAdd.mock.calls[0][0];
    expect(config.targets).toBe(enemy);
    expect(config.alpha).toBe(0);
    expect(config.duration).toBe(300);
    expect(typeof config.onComplete).toBe('function');
  });

  it('destroys the enemy when the tween onComplete fires', () => {
    const enemy = { destroy: vi.fn() };
    const tweenAdd = vi.fn();
    const ctx = { tweens: { add: tweenAdd } };

    GameScene.prototype._fadeOutDeadEnemy.call(ctx, enemy);
    const config = tweenAdd.mock.calls[0][0];
    config.onComplete();

    expect(enemy.destroy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.dead-cleanup.test.js`
Expected: FAIL with `TypeError: GameScene.prototype._fadeOutDeadEnemy is not a function` (or similar) because the method does not yet exist.

- [ ] **Step 3: Add the helper method to GameScene**

Open `src/scenes/GameScene.js`. Find the `_updateEnemies(dt) { ... }` method (starts at [line 259](../../../src/scenes/GameScene.js#L259)). Immediately after the closing brace of `_updateEnemies`, add the new private method:

```js
_fadeOutDeadEnemy(enemy) {
  this.tweens.add({
    targets: enemy,
    alpha: 0,
    duration: 300,
    onComplete: () => enemy.destroy(),
  });
}
```

- [ ] **Step 4: Wire the helper into the dead-enemy filter block**

Still in `src/scenes/GameScene.js`, inside `_updateEnemies`, find the existing filter block at the end of the method ([lines 295-297](../../../src/scenes/GameScene.js#L295-L297)):

```js
    const beforeCount = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.dead);
    const removed = beforeCount - this.enemies.length;
```

Replace it with:

```js
    const dying = this.enemies.filter(e => e.dead);
    this.enemies = this.enemies.filter(e => !e.dead);
    const removed = dying.length;
    for (const enemy of dying) this._fadeOutDeadEnemy(enemy);
```

The surrounding `if (removed > 0) { ... }` block stays exactly as it is — `removed` is computed the same way (count of dead enemies in this tick).

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.dead-cleanup.test.js`
Expected: PASS — both `it` blocks green.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm test --silent`
Expected: 350 passing (348 baseline + 2 new) across 25 test files.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.dead-cleanup.test.js
git commit -m "$(cat <<'EOF'
feat(game-scene): fade out + destroy dead enemies

Dead enemies were filtered out of the game-logic array but their
Phaser Container (with body + HP-bar Graphics children) was never
destroyed, so corpses lingered on the path until scene shutdown.

Add _fadeOutDeadEnemy helper that tweens alpha 1->0 over 300ms then
calls enemy.destroy(). Container alpha cascades to children so the
HP bar fades with the body. The fade duration matches the existing
death-particle maxLife (0.3s) so the burst and corpse vanish together.

No game-logic change — kills, gold, wave-end detection, combat-music,
send-wave-early bonus, and inspector hit-tests all still key off
enemy.dead and array membership, both of which flip in the same tick
as before.
EOF
)"
```

---

## Task 2: Projectile destroy helper

**Files:**
- Modify: `src/scenes/GameScene.dead-cleanup.test.js` — append new `describe` block
- Modify: `src/scenes/GameScene.js` — add `_destroyDeadProjectile` method; modify the projectile filter block at [GameScene.js:481-484](../../../src/scenes/GameScene.js#L481-L484)

- [ ] **Step 1: Write the failing test**

Append the following `describe` block to `src/scenes/GameScene.dead-cleanup.test.js` (after the existing block from Task 1):

```js
describe('GameScene._destroyDeadProjectile', () => {
  it('destroys the trail and the projectile container', () => {
    const projectile = { destroyTrail: vi.fn(), destroy: vi.fn() };

    GameScene.prototype._destroyDeadProjectile(projectile);

    expect(projectile.destroyTrail).toHaveBeenCalledOnce();
    expect(projectile.destroy).toHaveBeenCalledOnce();
  });

  it('still destroys the projectile if destroyTrail is absent', () => {
    const projectile = { destroy: vi.fn() };

    GameScene.prototype._destroyDeadProjectile(projectile);

    expect(projectile.destroy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.dead-cleanup.test.js`
Expected: FAIL on the new tests with `TypeError: GameScene.prototype._destroyDeadProjectile is not a function`. The two existing Task-1 tests still pass.

- [ ] **Step 3: Add the helper method to GameScene**

Open `src/scenes/GameScene.js`. Immediately after the `_fadeOutDeadEnemy` method added in Task 1, add:

```js
_destroyDeadProjectile(p) {
  if (p.destroyTrail) p.destroyTrail();
  p.destroy();
}
```

- [ ] **Step 4: Wire the helper into the projectile filter block**

Find the existing projectile cleanup block at [GameScene.js:481-484](../../../src/scenes/GameScene.js#L481-L484):

```js
    for (const p of this.projectiles) {
      if (p.dead && p.destroyTrail) p.destroyTrail();
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
```

Replace it with:

```js
    for (const p of this.projectiles) {
      if (p.dead) this._destroyDeadProjectile(p);
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.dead-cleanup.test.js`
Expected: PASS — all four `it` blocks across both `describe`s green.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm test --silent`
Expected: 352 passing (348 baseline + 4 new) across 25 test files.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.dead-cleanup.test.js
git commit -m "$(cat <<'EOF'
feat(game-scene): destroy projectile Container on death

Projectiles were filtered out of the game-logic array but only their
trail emitter was destroyed — the projectile Container itself was
never .destroy()'d. Same root cause as the dead-enemy leak; harder
to notice visually because projectiles are tiny and short-lived.

Add _destroyDeadProjectile helper that destroys the trail (when
present) and the Container. No fade — the existing impact-particle
visual already covers the disappearance.
EOF
)"
```

---

## Task 3: Browser verification + final cleanup commit

**Files:** none modified unless a regression surfaces. This task validates the change in a real browser.

- [ ] **Step 1: Start the dev server**

Run (in background): `npm run dev`
Expected: Vite reports `Local: http://localhost:<port>` (usually 5173) within ~2s. Note the port.

- [ ] **Step 2: Open the game in Playwright and start a level**

Use the Playwright MCP tool to:
1. `browser_navigate` to the dev-server URL.
2. `browser_snapshot` the menu — confirm the map-select screen renders.
3. `browser_click` "Start" / first-map button to load `GameScene`.
4. `browser_snapshot` confirms the game board, path, and bottom-bar HUD are present.

- [ ] **Step 3: Trigger enemy deaths and observe corpse cleanup**

1. Build at least one tower (e.g., click the Archer button, then click a build zone on the map).
2. Use the wave button to start wave 1 (or wait for auto-start).
3. As enemies are killed, take `browser_snapshot`s at 0.5s intervals for ~3s.
4. **Verify visually** (compare snapshots):
   - At the moment of kill: existing flash + radial burst plays (unchanged).
   - During the next ~0.3s: the corpse body + HP bar fade smoothly to invisible.
   - After ~0.3s: no visible corpse remains at the kill location.
   - No corpses accumulate over the wave.

- [ ] **Step 4: Sanity-check the in-flight game logic**

1. Confirm the wave-button label updates as enemies die (send-wave-early bonus from Phase 9a — unrelated but worth a glance for regression).
2. Confirm gold counter increments per kill.
3. Confirm the kill counter increments per kill.
4. End the wave normally; confirm combat-music transitions when the last enemy dies.

- [ ] **Step 5: Check the browser console for errors**

Run: `browser_console_messages`
Expected: no new errors. Phaser warnings about destroyed-object access (e.g., "Cannot read property of undefined" pointing at the tween onComplete) would indicate the fade outlived a scene transition — investigate before merging.

- [ ] **Step 6: Stop the dev server**

Stop the background `npm run dev` process.

- [ ] **Step 7: Document verification in the final commit if any fixes were needed**

If steps 3-5 surfaced an issue, fix it inline, re-run `npm test --silent`, and commit with `fix(game-scene): <what>`.

If no fixes are needed, no additional commit is required — Task 1 and Task 2 commits already cover the change.

---

## Out of scope (do not implement)

- Death animations (shrink, ash particles, ragdoll).
- Hero/soldier death visual polish (existing hide-and-respawn pattern is intentional).
- Replacing the 0.3s flash + radial burst with a richer effect.
- Refactoring `_updateEnemies` beyond the dead-enemy filter block.
- Refactoring the projectile loop beyond the cleanup block.
