# Dead-Enemy Cleanup — Design

**Date:** 2026-05-29
**Backlog item:** #6 in `.claude/notes.md` — "Dead-enemy cleanup (corpses linger; visual-only)"
**Branch (planned):** `feature/dead-enemy-cleanup` off `feature/phase-3-tower-system`

---

## 1. Problem

When an enemy dies, `_updateEnemies` filters it out of `this.enemies` so game logic ignores it ([GameScene.js:296](../../../src/scenes/GameScene.js#L296)), but the enemy's Phaser `Container` (with its `_body` and `_hpBar` Graphics children, added via `scene.add.existing(this)` in [Enemy.js:23](../../../src/entities/Enemy.js#L23)) is never `.destroy()`'d. The display objects remain on the scene's display list until scene shutdown, visible to the player as static corpses littering the path.

`Projectile` has the same latent bug: in the projectile filter ([GameScene.js:481-484](../../../src/scenes/GameScene.js#L481-L484)), only the trail emitter is destroyed via `p.destroyTrail()` — the projectile Container itself is never destroyed. Projectiles are tiny and short-lived so it isn't visually obvious, but it's the same root cause and worth fixing in the same PR.

## 2. Goals

- Dead enemy bodies disappear from the screen shortly after death.
- The disappearance reads as intentional (a brief dissolve), not a pop-out.
- Existing death VFX (flash + radial burst) continues to play unchanged at the death frame.
- Projectile Containers are also destroyed when a projectile is marked dead.
- No regressions in: game logic (`enemy.dead` handling, kill counters, wave-end detection, combat-music transitions, send-wave-early bonus), inspector behavior (click-pin, hover-peek, auto-dismiss), or soldier blocking.

## 3. Non-Goals

- No new death animation (shrink, ash particles, ragdoll, etc.) — out of scope.
- No changes to the existing death VFX (flash + radial burst at [GameScene.js:509-520](../../../src/scenes/GameScene.js#L509-L520)).
- No changes to soldier death/respawn (already correct: hides body, respawns after timer).
- No changes to hero death/respawn (already correct: same pattern as soldier).
- No SFX changes — death sounds already play in `Enemy.takeDamage` ([Enemy.js:74-78](../../../src/entities/Enemy.js#L74-L78)).

## 4. Approach

### 4.1 Enemy: quick fade + destroy

In `_updateEnemies` ([GameScene.js:259-306](../../../src/scenes/GameScene.js#L259-L306)), after collision/movement updates and before/around the existing filter, partition out the dead enemies and start an alpha tween on each:

```js
// Before:
//   const beforeCount = this.enemies.length;
//   this.enemies = this.enemies.filter(e => !e.dead);
//   const removed = beforeCount - this.enemies.length;

// After:
const dying = this.enemies.filter(e => e.dead);
this.enemies = this.enemies.filter(e => !e.dead);
const removed = dying.length;
for (const enemy of dying) {
  this.tweens.add({
    targets: enemy,
    alpha: 0,
    duration: 300,
    onComplete: () => enemy.destroy(),
  });
}
```

The `removed > 0` branch that follows (wave button + combat-music transitions) is unchanged.

**Why a tween:**
- `Container` alpha cascades to `_body` and `_hpBar`, so the HP bar fades with the corpse — no special handling needed.
- Phaser's tween manager owns the lifecycle and kills outstanding tweens on scene shutdown, so we don't need to track fading enemies in a separate array.
- `onComplete` calls `destroy()` exactly once. If the scene shuts down mid-fade, the tween is killed and `onComplete` does not fire — but the Container is part of the scene's display list and is destroyed when the scene tears down. No leak either way.

**Fade duration choice (300ms):** matches the existing death-particle lifetime (`maxLife: 0.3` at [GameScene.js:527](../../../src/scenes/GameScene.js#L527)), so the corpse and the burst fade out together.

### 4.2 Projectile: instant destroy

In the projectile loop ([GameScene.js:481-484](../../../src/scenes/GameScene.js#L481-L484)), call `p.destroy()` alongside the existing `p.destroyTrail()` before the filter:

```js
// Before:
//   for (const p of this.projectiles) {
//     if (p.dead && p.destroyTrail) p.destroyTrail();
//   }
//   this.projectiles = this.projectiles.filter(p => !p.dead);

// After:
for (const p of this.projectiles) {
  if (p.dead) {
    if (p.destroyTrail) p.destroyTrail();
    p.destroy();
  }
}
this.projectiles = this.projectiles.filter(p => !p.dead);
```

No fade — projectiles are tiny and the impact particle already covers the visual transition.

## 5. Why this is safe

| Concern | Status |
|---|---|
| Game logic reading `enemy.dead` | Unchanged — `dead = true` and array removal happen in the same tick as today. |
| Kill counter, gold rewards | Computed in `_dealDamage` and `_updateHero` at the moment `dead` flips — not at destroy time. Unchanged. |
| Wave-end detection (`_enemiesOnPath`, combat-music off) | Driven by `removed > 0` count from the filter — unchanged. |
| Send-wave-early bonus live update | `_updateWaveButton()` call from the `removed > 0` branch — unchanged. |
| Inspector click-pin | `_hitTestEnemy` already skips `e.dead` ([InspectController.js:78](../../../src/scenes/InspectController.js#L78)); fading corpses are out of `this.enemies` and cannot be hit-tested. |
| Inspector pinned-enemy dying | `_refresh()` already auto-dismisses when `e.dead || !this.scene.enemies.includes(e)` ([InspectController.js:41](../../../src/scenes/InspectController.js#L41)). |
| Soldier blocking | `_checkSoldierBlock` iterates `this.placementManager.getTowers()` for soldiers, not enemies. Soldier respawn unchanged. |
| End-of-path deaths ([GameScene.js:288-289](../../../src/scenes/GameScene.js#L288-L289)) | Also flag `dead = true` and flow through the same filter. They'll fade off-screen at the last waypoint, invisible to the player — consistent code path, no special case. |
| Scene shutdown mid-fade | Phaser kills active tweens on shutdown; scene tears down the display list and destroys all children. Safe. |

## 6. Files touched

- **`src/scenes/GameScene.js`** — modify the dead-enemy filter block in `_updateEnemies`; modify the projectile filter block.

No other production files change. No new entities, modules, or events.

## 7. Tests

Add two unit tests covering the new behavior. The test file may be a new `src/scenes/GameScene.dead-cleanup.test.js` or appended to an existing GameScene test — pick whichever matches existing convention in the repo.

### 7.1 Enemy fade + destroy
- Spawn an enemy via the scene; mark `dead = true`.
- Run one update tick.
- Assert: enemy is no longer in `scene.enemies`.
- Assert: a tween targeting the enemy exists with `alpha` property animating to 0.
- Advance the scene's tween manager past the fade duration (or call `tween.complete()` directly).
- Assert: `enemy.destroy` was called (spy) and the enemy is no longer active.

### 7.2 Projectile destroy
- Spawn a projectile; mark `dead = true`.
- Run one update tick.
- Assert: `destroyTrail` was called (spy) AND `destroy` was called (spy).
- Assert: projectile is no longer in `scene.projectiles`.

### 7.3 Existing regression coverage
The 348-test suite should pass unchanged. Especially relevant:
- Wave-end / combat-music transition tests (driven by `removed > 0`, not by destroy timing).
- Inspector tests (already cover the `dead || !includes` auto-dismiss path).
- Send-wave-early live `(+Xg)` update tests.

## 8. Risk + rollback

- **Risk:** very low — the change is localized to two filter blocks; no public API or event surface changes.
- **Rollback:** revert the single commit. No data migration, no save-format change, no SFX/asset changes.

## 9. Estimate

~10-line code change in `GameScene.js` + 2 new unit tests. Single commit, single PR.

## 10. Out of scope (follow-ups, only if observed)

- Death animation (shrink + ash particles, ragdoll, etc.).
- Hero/soldier visual polish on death.
- Replacing the 0.3s flash + radial burst with a richer effect.
