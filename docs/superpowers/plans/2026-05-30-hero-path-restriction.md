# Hero Path-Restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict hero click-to-move to the path corridor, using a 1D path-progress rail model adapted from Soldier.

**Architecture:** Adopt the path-progress model already used by `Soldier` ([Soldier.js:49-73](../../../src/entities/Soldier.js#L49-L73)) on `Hero`. Hero state becomes `pathProgress` (0..1) and `targetProgress` (0..1); position (x, y) is always derived by projecting progress onto the cached `pathPoints` array. In `_onPointerDown`, the hero-move branch becomes a snap-or-reject: clicks within 40px of the path are projected to a path progress via `pathMgr.getNearestPathProgress`; clicks outside that margin show a toast and the hero stays put.

**Tech Stack:** JavaScript (ES modules), Phaser 3, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-30-hero-path-restriction-design.md](../specs/2026-05-30-hero-path-restriction-design.md)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/entities/Hero.js` | Modify | Add `pathProgress` / `targetProgress` state, `setPathPosition`, `moveToProgress`; switch movement loop to progress-based; reset to progress 0 on respawn; drop `moveTo` / `targetX` / `targetY` / `_spawnX` / `_spawnY` / `MOVE_STOP_DIST`. |
| `src/entities/Hero.test.js` | Modify | Rewrite 3 movement tests + 1 respawn test; add 3 new tests for the new model. |
| `src/scenes/GameScene.js` | Modify | Two surgical changes: pass `pathPoints` into `Hero` constructor at [line 78](../../../src/scenes/GameScene.js#L78); swap step-6 hero-move branch ([lines 612-613](../../../src/scenes/GameScene.js#L612-L613)) for snap-or-reject. |

No new files. No data, scene, or save-format changes.

---

## Task 1: Add path-progress infrastructure to Hero (additive, no behavior change)

This task adds the new state and the position-projection method to `Hero`, and wires `GameScene` to pass `pathPoints` into the constructor. The existing `moveTo` / `targetX` / `targetY` movement model remains intact, so the game runs identically after this commit. Task 2 swaps the movement model itself.

**Files:**
- Modify: `src/entities/Hero.js` (constructor + new method, no removals)
- Modify: `src/entities/Hero.test.js` (add 2 new tests; existing tests unchanged)
- Modify: `src/scenes/GameScene.js` (line 78 constructor call)

- [ ] **Step 1: Write the failing tests**

Add the two new tests to `src/entities/Hero.test.js`. Insert them at the bottom of the existing `describe('Hero — movement', ...)` block (after the existing `'stops when within 8px of target'` test at line 77).

```js
  it('initializes pathProgress=0 and projects to path[0] when pathPoints provided', () => {
    const pathPoints = [{ x: 100, y: 100 }, { x: 500, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    expect(hero.pathProgress).toBe(0);
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(100);
  });

  it('setPathPosition(0.5) places hero at midpoint of a straight horizontal path', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.setPathPosition(0.5);
    expect(hero.pathProgress).toBe(0.5);
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(100);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/entities/Hero.test.js -t "pathProgress"`

Expected: FAIL — `hero.pathProgress` is `undefined`; `hero.setPathPosition is not a function`.

- [ ] **Step 3: Add the path-progress infrastructure to `Hero.js`**

Modify `src/entities/Hero.js`.

**3a.** Update the constructor signature and body. Replace the existing constructor (lines 21-53) with:

```js
  constructor(scene, { x, y, pathPoints }, modifiers = {}) {
    super(scene, x, y);

    const maxHp = MAX_HP + (modifiers.heroMaxHpBonus ?? 0);
    this.hp           = maxHp;
    this.maxHp        = maxHp;
    this.level        = modifiers.heroStartLevel ?? 1;
    this._respawnTime = RESPAWN_TIME + (modifiers.heroRespawnDelta ?? 0);
    this.killCount    = 0;
    this.dead         = false;
    this.respawnTimer = 0;
    this._spawnX      = x;
    this._spawnY      = y;

    this.targetX = x;
    this.targetY = y;
    this.moving  = false;

    this._pathPoints      = pathPoints || [];
    this._totalPathLength = 0;
    for (let i = 0; i < this._pathPoints.length - 1; i++) {
      this._totalPathLength += Math.hypot(
        this._pathPoints[i + 1].x - this._pathPoints[i].x,
        this._pathPoints[i + 1].y - this._pathPoints[i].y
      );
    }
    this.pathProgress   = 0;
    this.targetProgress = 0;

    this.overchargeTimer     = 0;
    this.airstrikeTimer      = 0;
    this.empTimer            = 0;
    this.overchargeActive    = false;
    this.overchargeRemaining = 0;

    this._attackTimer = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(4);
    this._drawBody();

    if (this._totalPathLength > 0) this.setPathPosition(0);
  }
```

Note: `_spawnX`, `_spawnY`, `targetX`, `targetY`, `moving`, the old `moveTo`, and `MOVE_STOP_DIST` are intentionally left in place — Task 2 removes them.

**3b.** Add the `setPathPosition` method. Insert it immediately after the `_redrawHpBar` method and before the `moveTo` method:

```js
  setPathPosition(progress) {
    this.pathProgress = progress;
    if (this._totalPathLength <= 0) return;
    let target = progress * this._totalPathLength;
    const pts = this._pathPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx  = pts[i + 1].x - pts[i].x;
      const dy  = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy);
      if (target <= len || i === pts.length - 2) {
        const t = len > 0 ? Math.min(1, target / len) : 0;
        this.x = pts[i].x + t * dx;
        this.y = pts[i].y + t * dy;
        return;
      }
      target -= len;
    }
  }
```

- [ ] **Step 4: Update GameScene to pass `pathPoints` into Hero constructor**

Modify `src/scenes/GameScene.js`, line 78.

Replace:

```js
    this.hero                     = new Hero(this, this.pathMgr.path[0], mods);
```

with:

```js
    const heroSpawn               = this.pathMgr.path[0];
    this.hero                     = new Hero(
      this,
      { x: heroSpawn.x, y: heroSpawn.y, pathPoints: this.pathMgr.getPathPoints() },
      mods
    );
```

- [ ] **Step 5: Run the full Hero test file to verify all tests pass**

Run: `npx vitest run src/entities/Hero.test.js`

Expected: PASS (all existing tests + 2 new tests). Existing tests still pass because their `Hero` instances omit `pathPoints` → `_totalPathLength` stays 0 → `setPathPosition` is never called from the constructor → `x` and `y` remain at the values passed in.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`

Expected: PASS. All other tests are unaffected because the change is additive.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(hero): add path-progress infrastructure (pathProgress, setPathPosition)

Adds pathProgress / targetProgress state and a setPathPosition projection
method to Hero, modeled on Soldier.setPathProgress. Constructor accepts
pathPoints in its options object and caches _totalPathLength once.
GameScene passes pathMgr.getPathPoints() into the constructor.

No behavior change yet — old moveTo / targetX / targetY movement model
remains intact. Task 2 swaps the movement loop and adds the
snap-or-reject click handler.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Switch Hero movement to path-progress + add snap-or-reject click handler

This task replaces the movement model in `Hero` with the path-progress version and updates `GameScene._onPointerDown` so the hero-move branch snaps to the path within a 40px margin or rejects with a toast. After this commit, the game is path-restricted.

**Files:**
- Modify: `src/entities/Hero.js` (replace movement; remove old fields)
- Modify: `src/entities/Hero.test.js` (rewrite 3 movement tests + 1 respawn test; add 1 new test)
- Modify: `src/scenes/GameScene.js` (step-6 click handler)

- [ ] **Step 1: Rewrite the 3 movement tests + 1 respawn test, and add the new `dead hero ignores moveToProgress` test**

In `src/entities/Hero.test.js`, replace the four named tests below by `it(...)` description string. (Line numbers from the original file are not used because Task 1 inserted two new tests into the movement `describe` block, shifting the respawn block downward.)

**1a.** Replace the test whose `it(...)` description is `'moveTo sets target and moving flag'`:

```js
  it('moveToProgress sets targetProgress and moving flag', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(0.5);
    expect(hero.targetProgress).toBe(0.5);
    expect(hero.moving).toBe(true);
  });
```

**1b.** Replace the test whose `it(...)` description is `'moves toward target each update'`:

```js
  it('update advances pathProgress toward targetProgress at MOVE_SPEED / totalLength per second', () => {
    // 200px horizontal path → totalPathLength = 200; MOVE_SPEED = 130
    // → expected deltaProgress per second = 130 / 200 = 0.65
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(1);
    hero.update(0.1, []);
    // 0.1 seconds → 0.065 progress
    expect(hero.pathProgress).toBeCloseTo(0.065, 5);
    expect(hero.x).toBeCloseTo(13, 1);
    expect(hero.y).toBe(100);
  });
```

**1c.** Replace the test whose `it(...)` description is `'stops when within 8px of target'`:

```js
  it('stops when pathProgress reaches targetProgress', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(0.5);
    // 200px path, 130 px/s → 0.5 progress = 100px → 100/130 ≈ 0.77s
    hero.update(1.0, []);
    expect(hero.pathProgress).toBe(0.5);
    expect(hero.moving).toBe(false);
  });
```

**1d.** Replace the test whose `it(...)` description is `'respawn repositions hero to spawn point'` (in the `describe('Hero — takeDamage and respawn', ...)` block):

```js
  it('respawn resets pathProgress to 0 and position to path[0]', () => {
    const pathPoints = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(1);
    hero.update(2, []);                    // walk the full path
    expect(hero.pathProgress).toBe(1);
    hero.takeDamage(200);                  // hero dies
    hero.update(20, []);                   // respawns
    expect(hero.pathProgress).toBe(0);
    expect(hero.x).toBe(50);
    expect(hero.y).toBe(50);
  });
```

**1e.** Add a new test inside the `describe('Hero — movement', ...)` block (after the existing tests in that block):

```js
  it('dead hero ignores moveToProgress', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.takeDamage(200);                  // hero dies
    hero.moveToProgress(0.7);
    expect(hero.targetProgress).toBe(0);   // unchanged
    expect(hero.moving).toBe(false);
  });
```

- [ ] **Step 2: Run the updated test file to verify the new tests fail and existing tests still pass**

Run: `npx vitest run src/entities/Hero.test.js`

Expected: the four rewrites + one new test FAIL with `hero.moveToProgress is not a function`. All other tests (combat, level, abilities, takeDamage timer, takeDamage hp) PASS.

- [ ] **Step 3: Replace the Hero movement model**

Modify `src/entities/Hero.js`.

**3a.** Delete the `MOVE_STOP_DIST` module-level constant near the top of the file (it sits in the block with `MOVE_SPEED`, `ATTACK_RANGE`, etc.). Leave `MOVE_SPEED`, `ATTACK_RANGE`, `ATTACK_RATE`, `ATTACK_DAMAGE`, `MAX_HP`, `RESPAWN_TIME` in place.

**3b.** In the constructor, delete the following lines (no longer needed):

```js
    this._spawnX      = x;
    this._spawnY      = y;

    this.targetX = x;
    this.targetY = y;
    this.moving  = false;
```

Then add this single line where the deleted block was:

```js
    this.moving = false;
```

(`pathProgress` / `targetProgress` / `_pathPoints` / `_totalPathLength` were already added in Task 1 and stay in place.)

**3c.** Delete the old `moveTo` method (find by name; it sits between `setPathPosition` and `takeDamage`):

```js
  moveTo(x, y) {
    this.targetX = x;
    this.targetY = y;
    this.moving  = true;
  }
```

Insert `moveToProgress` in its place:

```js
  moveToProgress(progress) {
    if (this.dead) return;
    this.targetProgress = progress;
    this.moving = (progress !== this.pathProgress);
  }
```

**3d.** Replace the `respawn` method (find by name). Replace:

```js
  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    this.x            = this._spawnX;
    this.y            = this._spawnY;
    this.targetX      = this._spawnX;
    this.targetY      = this._spawnY;
    this.moving       = false;
    this._attackTimer = 1 / ATTACK_RATE;
    this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }
```

with:

```js
  respawn() {
    this.dead           = false;
    this.hp             = this.maxHp;
    this.respawnTimer   = 0;
    this.pathProgress   = 0;
    this.targetProgress = 0;
    this.moving         = false;
    this.setPathPosition(0);
    this._attackTimer = 1 / ATTACK_RATE;
    this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }
```

**3e.** Replace the movement branch in `update`. Inside `update(dt, enemies)`, find the existing movement block — the `if (this.moving) { ... }` block that uses `this.targetX` / `this.targetY` / `MOVE_STOP_DIST` (sits before the `_attackTimer` block):

```js
    if (this.moving) {
      const dx   = this.targetX - this.x;
      const dy   = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= MOVE_STOP_DIST) {
        this.moving = false;
      } else {
        const step = Math.min(MOVE_SPEED * dt, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }
```

Replace it with:

```js
    if (this.moving && this._totalPathLength > 0) {
      const deltaProgress = (MOVE_SPEED * dt) / this._totalPathLength;
      const remaining     = this.targetProgress - this.pathProgress;
      if (Math.abs(remaining) <= deltaProgress) {
        this.pathProgress = this.targetProgress;
        this.moving       = false;
      } else {
        this.pathProgress += Math.sign(remaining) * deltaProgress;
      }
      this.setPathPosition(this.pathProgress);
    }
```

- [ ] **Step 4: Run the Hero test file to verify all tests now pass**

Run: `npx vitest run src/entities/Hero.test.js`

Expected: PASS (all tests, including the rewrites and the new dead-hero test).

- [ ] **Step 5: Swap the GameScene hero-move click branch to snap-or-reject**

Modify `src/scenes/GameScene.js`. Find the comment `// 6. Move hero` near the end of `_onPointerDown` (it is the last branch in the method, after the tower-placement branch).

Replace:

```js
    // 6. Move hero
    if (!this.hero.dead) this.hero.moveTo(mx, my);
```

with:

```js
    // 6. Move hero (path-constrained)
    if (!this.hero.dead) {
      if (this.pathMgr.isOnPath(mx, my, 40)) {
        const progress = this.pathMgr.getNearestPathProgress(mx, my);
        this.hero.moveToProgress(progress);
      } else {
        this._toast('Hero can only move along the path');
      }
    }
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`

Expected: PASS. Hero, GameScene, and all other test files green.

- [ ] **Step 7: Browser walkthrough**

Start the dev server in the background and verify the spec's eight manual checks (`docs/superpowers/specs/2026-05-30-hero-path-restriction-design.md` §5.2). Use Playwright MCP or a manual browser session:

1. Load Map 1 (Outpost Sigma). Confirm the hero spawns at the start of the path (matches `pathMgr.path[0]`).
2. Click on the visible path further along the corridor. Hero walks along the path toward the click.
3. Click on grass far from the path (more than ~40px away). Toast appears: `"Hero can only move along the path"`. Hero does not move.
4. Click on grass within ~40px of the path. Hero snaps onto the path and walks to that segment.
5. Load a zig-zag map (e.g. Map 2 or later) and click past a path bend. Confirm the hero traces the bend instead of cutting across grass.
6. Press `W` to enter airstrike aim mode. Click on grass anywhere. Airstrike fires at the click (path restriction does not apply in aim mode).
7. Let an enemy kill the hero (move hero into the spawn point and let enemies hit it). After the 20s respawn timer, the hero re-appears at `pathMgr.path[0]` with `pathProgress = 0`.
8. Press `Q` (Overcharge) and `E` (EMP) — both still work; they don't involve movement.

Document the walkthrough result in the commit message (item 8 is a sanity check; if `Q`/`E` regress, that's unexpected).

- [ ] **Step 8: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(hero): restrict movement to path corridor (snap-or-reject at 40px)

Hero is now a 1D rail along the path: pathProgress / targetProgress
drive position via setPathPosition. moveToProgress replaces moveTo.
respawn() resets to pathProgress=0. Removes the moveTo / targetX /
targetY / _spawnX / _spawnY / MOVE_STOP_DIST surface.

GameScene click handler snaps in-range clicks (40px) to the nearest
path point via pathMgr.getNearestPathProgress, and shows a toast
"Hero can only move along the path" for clicks beyond the margin.
Airstrike (W) aim mode is unaffected — it still targets any (x, y).

Browser-verified: hero traces zig-zag bends (Map 2+), respawns at
path[0], abilities (Q/W/E) unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage check:**
- §2 goal "always exactly on the path" → Task 1 step 3a + Task 2 step 3e (update uses setPathPosition every frame).
- §2 goal "40px snap-or-reject + toast" → Task 2 step 5.
- §2 goal "preserve auto-attack/leveling/abilities/respawn/HP/death VFX/audio" → existing tests in `Hero.test.js` (combat, leveling, abilities, takeDamage) remain unchanged after Task 2.
- §3 non-goal "hero does NOT block enemies" → no `_checkSoldierBlock` change; flagged in commit message.
- §3 non-goal "airstrike unchanged" → `_triggerAirstrike` and step-1 aim-mode branch are untouched; spec walkthrough step 6 confirms.
- §4.1 constructor / state / setPathPosition / moveToProgress / update / respawn — all in Task 1 step 3 + Task 2 step 3.
- §4.2 GameScene constructor + click handler — Task 1 step 4 + Task 2 step 5.
- §4.3 snap margin 40px — Task 2 step 5.
- §5.1 test rewrites — Task 2 step 1.
- §5.2 browser walkthrough — Task 2 step 7.

**Placeholder scan:** No "TBD", "TODO", "similar to Task N", or steps without code.

**Type/name consistency:**
- `pathPoints` (constructor option), `_pathPoints` (stored), `_totalPathLength`, `pathProgress`, `targetProgress`, `setPathPosition(progress)`, `moveToProgress(progress)` — used consistently.
- `pathMgr.getPathPoints()`, `pathMgr.getNearestPathProgress(x, y)`, `pathMgr.isOnPath(x, y, margin)` — verified present in [PathManager.js:28, 40, 44](../../../src/systems/PathManager.js).
- `this._toast(msg)` — verified at [GameScene.js:919](../../../src/scenes/GameScene.js#L919).
- `pathMgr.path[0]` — verified at [PathManager.js:3](../../../src/systems/PathManager.js#L3).
