# Hero Path-Restricted Movement — Design

**Date:** 2026-05-30
**Backlog item:** #7 in `.claude/notes.md` — "Hero placement restricted to paths (currently heroes can be moved anywhere on the map; restrict click-to-move to path waypoints)"
**Branch (planned):** `feature/hero-path-restriction` off `feature/phase-3-tower-system`

---

## 1. Problem

The hero (Commander Rael) currently accepts click-to-move at any (x, y) coordinate. In `_onPointerDown` step 6 ([GameScene.js:612-613](../../../src/scenes/GameScene.js#L612-L613)), an unhandled click falls through to `this.hero.moveTo(mx, my)` with raw pointer coordinates. `Hero.moveTo` ([Hero.js:75-79](../../../src/entities/Hero.js#L75-L79)) stores those coordinates as `targetX/targetY` and the hero walks in a straight line via `update(dt, enemies)` ([Hero.js:154-165](../../../src/entities/Hero.js#L154-L165)).

This makes the hero feel disconnected from the level — it can sit anywhere on grass, defeating the visual logic of a defense unit guarding a corridor.

## 2. Goals

- Hero movement is restricted to the path: hero position is always exactly on the path corridor.
- Clicks within 40px of the path snap to the nearest path point and the hero moves there along the path.
- Clicks beyond 40px of the path are rejected with a toast ("Hero can only move along the path"); no movement occurs.
- Hero motion reads as a 1D rail along the path — no diagonal cuts across grass between waypoints.
- Existing hero behavior is preserved: auto-attack, leveling at 25/75 kills, abilities (Overcharge Q / Airstrike W / EMP E), respawn after 20s, HP/damage/death VFX, audio cues.

## 3. Non-Goals

- **Hero does NOT block enemies.** Once the hero is on-path, players may expect Soldier-style blocking; that requires changes to `_checkSoldierBlock` and enemy melee combat. Out of scope — flag as a follow-up backlog item.
- Airstrike (W) targeting is unchanged. Airstrike is a thrown AoE ([GameScene.js:397-412](../../../src/scenes/GameScene.js#L397-L412)) that can land anywhere; only hero *movement* is path-restricted.
- No "select hero first" gesture. Direct clicks remain the gesture; toast handles invalid-click feedback.
- No rail-overlay UI hint (cyan path highlight when player is about to move the hero). The visible path already shows where the hero can go.
- No new visual effects on the hero (no path-march animation, no on-path glow).
- No persistence change. Hero position is in-memory only; no save-format change.
- No changes to Hero spawn position (still `pathMgr.path[0]`, i.e. progress 0).
- No change to Soldier or Barracks.

## 4. Approach

### 4.1 Hero entity — switch to path-progress model

`src/entities/Hero.js` adopts the same 1D-rail model already used by Soldier ([Soldier.js:49-73](../../../src/entities/Soldier.js#L49-L73)).

**New constructor signature:**

```js
// Before:
constructor(scene, { x, y }, modifiers = {}) { ... }

// After:
constructor(scene, { x, y, pathPoints }, modifiers = {}) { ... }
```

`pathPoints` is the array returned by `pathMgr.getPathPoints()` — passed in once at construction and stored as `this._pathPoints`. Paths are static for a level, so re-passing per-update is unnecessary.

**New / replaced state:**

| Field | Replaces | Purpose |
|-------|----------|---------|
| `this.pathProgress` (0..1) | `this.x`, `this.y` (now derived) | Current position on path |
| `this.targetProgress` (0..1) | `this.targetX`, `this.targetY` | Destination progress |
| `this._pathPoints` | — | Cached path geometry |
| `this._totalPathLength` (px) | — | Cached total path length for px → progress conversion |
| `this.moving` | (kept) | Still used as a stop-condition flag |

The `_spawnX` / `_spawnY` fields are removed — respawn position is always progress 0 (path start).

**New method `setPathPosition(progress)`** — adapted from Soldier:

```js
setPathPosition(progress) {
  this.pathProgress = progress;
  let target = progress * this._totalPathLength;
  const pts = this._pathPoints;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
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

Constructor calls `this.setPathPosition(0)` after computing `_totalPathLength`. (Initial x, y from the constructor argument are still used to position the Container before `setPathPosition` overrides — kept for sensible Container init.)

**Replaced method `moveToProgress(progress)`** — replaces `moveTo(x, y)`:

```js
moveToProgress(progress) {
  if (this.dead) return;
  this.targetProgress = progress;
  this.moving = (progress !== this.pathProgress);
}
```

**Modified `update(dt, enemies)` — movement branch only:**

```js
// Before:
if (this.moving) {
  const dx = this.targetX - this.x;
  const dy = this.targetY - this.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= MOVE_STOP_DIST) {
    this.moving = false;
  } else {
    const step = Math.min(MOVE_SPEED * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }
}

// After:
if (this.moving && this._totalPathLength > 0) {
  const deltaProgress = (MOVE_SPEED * dt) / this._totalPathLength;
  const remaining = this.targetProgress - this.pathProgress;
  if (Math.abs(remaining) <= deltaProgress) {
    this.pathProgress = this.targetProgress;
    this.moving = false;
  } else {
    this.pathProgress += Math.sign(remaining) * deltaProgress;
  }
  this.setPathPosition(this.pathProgress);
}
```

`MOVE_SPEED` (130 px/s, [Hero.js:4](../../../src/entities/Hero.js#L4)) and the `MOVE_STOP_DIST` (8 px, [Hero.js:5](../../../src/entities/Hero.js#L5)) constants are no longer used by the movement loop. `MOVE_SPEED` stays as the px/s tuning knob (used in the progress-rate formula). `MOVE_STOP_DIST` can be removed.

**Modified `respawn()`** — reset to path start:

```js
// Before:
respawn() {
  this.dead         = false;
  this.hp           = this.maxHp;
  this.respawnTimer = 0;
  this.x            = this._spawnX;
  this.y            = this._spawnY;
  this.targetX      = this._spawnX;
  this.targetY      = this._spawnY;
  this.moving       = false;
  ...
}

// After:
respawn() {
  this.dead         = false;
  this.hp           = this.maxHp;
  this.respawnTimer = 0;
  this.pathProgress = 0;
  this.targetProgress = 0;
  this.setPathPosition(0);
  this.moving       = false;
  ...
}
```

The audio-cue, HP-bar redraw, and `_attackTimer` reset lines are unchanged.

**Unchanged behavior in Hero:**
- Constructor modifier hooks (`heroMaxHpBonus`, `heroStartLevel`, `heroRespawnDelta`)
- `takeDamage`, `_registerKill`, leveling thresholds (25/75 kills)
- `overcharge`, `airstrike`, `empPulse` and their cooldown timers
- Auto-attack loop (range 40, rate 1.5, damage 18)
- HP-bar drawing, body drawing, depth, audio cues
- Scene event emission (`hero:level-up`)

### 4.2 GameScene — snap-or-reject click handling

`src/scenes/GameScene.js`:

**Hero construction ([line 78](../../../src/scenes/GameScene.js#L78))** — pass pathPoints:

```js
// Before:
this.hero = new Hero(this, this.pathMgr.path[0], mods);

// After:
const heroSpawn = this.pathMgr.path[0];
this.hero = new Hero(
  this,
  { x: heroSpawn.x, y: heroSpawn.y, pathPoints: this.pathMgr.getPathPoints() },
  mods
);
```

**Pointer handler ([lines 612-613](../../../src/scenes/GameScene.js#L612-L613))** — replace the unconditional `moveTo` with snap-or-reject:

```js
// Before:
// 6. Move hero
if (!this.hero.dead) this.hero.moveTo(mx, my);

// After:
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

**Other pointer-handler branches are unchanged** — step 1 (aim mode), step 2 (Barracks reposition), step 3 (tower click), step 4 (inspector click), step 5 (tower placement). Each returns before falling through to step 6, so the path-restriction only fires on a "no other handler matched" click.

### 4.3 Snap margin rationale

| Value | Source | Notes |
|-------|--------|-------|
| 40 | `isOnPath` default ([PathManager.js:28](../../../src/systems/PathManager.js#L28)) | **Chosen** — forgiving for action clicks |
| 30 | Barracks reposition ([GameScene.js:568](../../../src/scenes/GameScene.js#L568)) | Stricter (Barracks placement is deliberate) |
| 14 | Visible path half-width (28px stroke ÷ 2) | Too strict — punishes near-misses |

40px gives ~26px of slop either side of the visible path. Hero clicks are fast and reactive (mid-combat), so the wider margin is appropriate.

## 5. Tests

### 5.1 Hero unit tests (`src/entities/Hero.test.js`)

**Rewrite (3 tests):**

| Existing test | New behavior |
|---|---|
| `moveTo sets target and moving flag` ([Hero.test.js:56](../../../src/entities/Hero.test.js#L56)) | `moveToProgress sets targetProgress and moving flag` |
| `moves toward target each update` ([Hero.test.js:64](../../../src/entities/Hero.test.js#L64)) | `update advances pathProgress toward targetProgress at MOVE_SPEED / totalLength per second` |
| `stops when within 8px of target` ([Hero.test.js:72](../../../src/entities/Hero.test.js#L72)) | `stops when pathProgress reaches targetProgress` |

**Update (1 test):**

| Test | Change |
|---|---|
| `respawn repositions hero to spawn point` ([Hero.test.js:119](../../../src/entities/Hero.test.js#L119)) | Use `moveToProgress(0.5)` instead of `moveTo(300, 300)` to perturb position; assert `pathProgress === 0` after respawn |

**Add (3 tests):**

- `Hero constructor initializes pathProgress=0 and position at path[0]` — given a known pathPoints array, the hero's (x, y) matches pts[0] exactly.
- `setPathPosition(0.5) places hero at midpoint of a straight path` — given a 2-point horizontal path, progress 0.5 → x is halfway, y matches.
- `dead hero ignores moveToProgress` — set `hero.dead = true`, call `moveToProgress(0.7)`, assert `targetProgress !== 0.7` and `moving === false`.

**Unchanged tests:**
All combat / leveling / ability / takeDamage / respawn-timer / auto-attack-source tests pass without modification — the path model only affects the movement state and the `respawn` position reset.

### 5.2 Verification (browser walkthrough)

Manual verification via Playwright after implementation (no new GameScene unit test required — the click handler is thin glue and is exercised end-to-end by the browser walkthrough):

1. Load Map 1, observe hero spawns at path[0].
2. Click on visible path further along → hero walks along path to clicked point.
3. Click on grass far from path → toast appears ("Hero can only move along the path"); hero does not move.
4. Click on grass within ~40px of path → hero snaps to path and moves to that segment.
5. Click on a zig-zag map (Map 2+) to confirm hero traces the bend instead of cutting the corner.
6. Trigger Airstrike (W key), click off-path → airstrike fires at clicked (x, y) (path restriction does not apply to aim mode).
7. Let hero die from an enemy → after 20s respawn, hero appears at path[0] with pathProgress=0.
8. Confirm Q (Overcharge) and E (EMP) still work — they don't involve movement.

## 6. Risk & Reversibility

**Risk:** Low. The change is localized to `Hero.js` movement state and one branch of `GameScene._onPointerDown`. No cross-cutting changes to combat, audio, save format, or scene lifecycle.

**Reversibility:** Trivial. Revert the two modified files (`Hero.js`, `GameScene.js`) and the test rewrites — no migrations, no schema changes.

**One mid-implementation gotcha to watch:** Hero `update(dt, enemies)` runs from `_updateHero` ([GameScene.js:342](../../../src/scenes/GameScene.js#L342)). The kill-credit snapshot loop (`aliveBeforeHero` → `aliveAfterHero` diff) compares enemies in range *before* the hero update. Since the hero now moves along the path, the *range* of enemies it can attack on a given frame may differ — but this is the intended behavior (hero is on path, fights enemies on path, kills count normally). No code change to the kill-credit logic.

## 7. Out-of-Scope Follow-Up

Add to backlog after this ships:

- **Hero blocks enemies (Soldier-style melee block).** Now that hero is on-path, players will reach for the soldier-blocking behavior. Requires updating `_checkSoldierBlock` to include the hero and adding enemy-vs-hero melee combat. Distinct mechanic change — its own design.
