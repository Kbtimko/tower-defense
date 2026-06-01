# Spec: Immolate ends cleanly on hero death

**Date:** 2026-05-31
**Backlog item:** #5 — `AreaEffectsManager.followsTarget.dead` not handled
**Scope:** Bug fix (with adjacent buff-revert cleanup)

## Problem

The Pyromancer hero's **Immolate** ability has two failure modes when the hero dies before its 8-second duration ends:

1. **Aura keeps damaging.** `AreaEffectsManager.update` does not check `eff.followsTarget?.dead`, so the 10 dps tick keeps landing for the remainder of `eff._remaining`. The aura graphic also stays on screen.
2. **Aura teleports on respawn.** Because the same `Hero` instance is reused, when the hero respawns before the aura expires, `eff.followsTarget.x/y` snap to the respawn point and the aura continues ticking there.

A related but separate failure mode in the same scenario:

3. **`hero._attackDamageMult` lingers.** `_handleImmolate` sets `this.hero._attackDamageMult = 1.5` and schedules a 8 s revert via `this.time.delayedCall`. If the hero dies mid-Immolate, the aura is gone but the multiplier stays 1.5 until the original timer fires — which may now overlap with a respawn-and-recast and revert a *fresh* Immolate window prematurely.

These all surfaced as part of T15 (Pyromancer Mira). They were not caught at the time because Immolate's damage source already routed through a tagged `sourceTag`, masking the persistent ticks during machine tests.

## Behavior contract

When the hero dies while Immolate is active:

- The aura graphic is destroyed on the next `AreaEffectsManager.update`.
- No further DPS ticks land from that aura.
- `hero._attackDamageMult` returns to `1.0`.
- The pending `_handleImmolate` revert timer is cancelled, so a fresh Immolate cast after respawn is not prematurely reverted.

Out of scope (explicitly):

- **Firefield** and any other stationary (`x`/`y`) effect: unaffected. They are tied to ground, not the hero.
- Other hero ability buffs (Power Surge, Phase Sprint, Sentry Turret, etc.): unchanged. If a future ability hits the same shape, we will pattern-match a generic `applyTimedBuff` abstraction at that point. See [Future work](#future-work).

## Code changes

### 1. `src/systems/AreaEffectsManager.js`

In `update`, treat a `followsTarget` whose `.dead` is truthy as duration-expired:

```js
if (eff._remaining <= 0 || eff.followsTarget?.dead) {
  eff._g.destroy();
  this._effects.splice(i, 1);
  continue;
}
```

This is generic: any current or future `followsTarget` effect benefits. Stationary effects (`x`/`y` set, no `followsTarget`) are untouched because the optional chain short-circuits on `undefined`.

### 2. `src/entities/Hero.js`

`Hero` does not have a standalone `die()` method — death is detected inline inside `takeDamage` when `hp <= 0` (currently lines 102–109). Extend that block so it also resets the multiplier and cancels any pending revert event:

```js
if (this.hp <= 0) {
  this.dead         = true;
  this.respawnTimer = this._respawnTime;
  this._body.setVisible(false);
  this._hpBar.clear();
  // New: end Immolate cleanly on death.
  this._attackDamageMult = 1.0;
  if (this._attackDmgRevertEvt) {
    this._attackDmgRevertEvt.remove(false);
    this._attackDmgRevertEvt = null;
  }
  const am = this.scene.game?.registry?.get('audio');
  if (am) am.playSfx('hero-death');
}
```

The field `_attackDmgRevertEvt` is the Phaser `TimerEvent` handle returned by `time.delayedCall`. It is stored on the hero (not the scene) so that the death branch — which has access to `this` but not the scene's timer system directly — can cancel it. `.remove(false)` cancels without firing the callback.

`respawn()` already resets `_attackDamageMult = 1.0` (line 122), so the death-side reset is hygiene rather than strictly necessary; the value can only matter again after a respawn. But pairing it with the timer cancellation here keeps the two halves of the ability's state in one place.

### 3. `src/scenes/GameScene.js — _handleImmolate`

- Before scheduling a new revert, cancel any prior one. This guards the case where Immolate is somehow recast before the previous revert fires (e.g., death-respawn-recast).
- Store the new `TimerEvent` on the hero so the death branch in `Hero.takeDamage` can cancel it.
- Inside the callback, null the field after reverting.

```js
_handleImmolate(result) {
  this.hero._attackDamageMult = result.attackDamageMult;
  if (this.hero._attackDmgRevertEvt) this.hero._attackDmgRevertEvt.remove(false);
  this._areaEffects.add({ /* unchanged */ });
  this.hero._attackDmgRevertEvt = this.time.delayedCall(result.duration * 1000, () => {
    this.hero._attackDamageMult = 1.0;
    this.hero._attackDmgRevertEvt = null;
  });
}
```

## Tests (TDD order)

### `src/systems/AreaEffectsManager.test.js` — two new cases

- **terminates a `followsTarget` effect when the target becomes dead** — add a follow-target aura, run one `update` with `target.dead = false` (no termination), set `target.dead = true`, run another `update`, assert the graphic was destroyed and the effect was removed from the internal array. Assert no `takeDamage` call was made on a nearby enemy on the terminating tick.
- **stationary effect is unaffected by an unrelated `.dead` property** — add an `x`/`y` effect (no `followsTarget`) and confirm passing an enemy with `dead: false` and an unrelated object with `dead: true` does not terminate it. (Mostly a regression guard for the optional-chain.)

### `src/entities/Hero.test.js` — one new case

- **death (via `takeDamage`) resets `_attackDamageMult` to 1.0 and cancels the pending revert timer** — instantiate a hero, set `_attackDamageMult = 1.5`, assign `_attackDmgRevertEvt` to a stub `{ remove: vi.fn() }`, then call `hero.takeDamage(huge)` to drop hp to 0. Assert `hero.dead === true`, `_attackDamageMult === 1.0`, `_attackDmgRevertEvt === null`, and the stub's `remove` was called once with `false`.

### `src/scenes/GameScene.handleImmolate.test.js` — new file, following `GameScene.dead-cleanup.test.js` pattern

- **`_handleImmolate` cancels any prior revert before scheduling a new one** — call `_handleImmolate` twice with a hero stub. Assert the first revert event's `remove` was called before the second `delayedCall` fired.
- **the revert callback clears `_attackDmgRevertEvt`** — invoke the callback captured from `delayedCall` and assert the hero field is set back to `null` and the multiplier is `1.0`.

## Verification

1. `pnpm test` (or `npm test`) — all 463+ tests pass, plus the new ones.
2. Manual play-through on a Pyromancer hero:
   - Cast Immolate, walk hero into a wave, let it die before the 8 s window ends. Confirm the orange ring disappears immediately and no further enemy ticks land.
   - Cast Immolate, die, respawn, immediately recast Immolate. Confirm the new 1.5× window is not cut short by a stale timer.
3. Browser-verify per `feedback_browser_verify_after_refactor` memory: scene/lifecycle changes require a real browser pass, not just tests.

## Rollout

Single PR off `feature/phase-3-tower-system` (the merged base for all current hero work). Branch: `feature/areaeffects-dead-target-fix`. Use the worktree pattern from `using-git-worktrees`.

## Future work

If a second hero ability lands with the same shape (self-buff timer + needs to clean up on death), abstract `Hero.applyTimedBuff(key, applyFn, revertFn, duration)` and migrate Immolate first. Not now — one occurrence is not a pattern.
