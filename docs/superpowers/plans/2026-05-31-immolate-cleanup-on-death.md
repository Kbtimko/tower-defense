# Immolate Cleanup on Hero Death — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Pyromancer hero dies mid-Immolate, the orange aura, the 10 dps ticks, the 1.5× attack-damage buff, and the pending revert timer all end cleanly — no ghost ticks, no teleport on respawn, no stale timer reverting a fresh recast.

**Architecture:** Three small, targeted edits across three files. No new abstractions. The `followsTarget?.dead` check in `AreaEffectsManager` is generic (helps any future follow-target aura). The Hero-side and GameScene-side edits are Immolate-specific but stored in a way (`_attackDmgRevertEvt` on the hero) that lets the two halves coordinate without coupling the scene to the entity's death code path.

**Tech Stack:** Vanilla JavaScript ES modules, Phaser 3, Vitest, vi.mock for Phaser stubbing.

**Spec:** [`docs/superpowers/specs/2026-05-31-immolate-cleanup-on-death-design.md`](../specs/2026-05-31-immolate-cleanup-on-death-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [`src/systems/AreaEffectsManager.js`](../../../src/systems/AreaEffectsManager.js) | Modify (1 line) | Stop ticking and destroy graphic when `followsTarget.dead` |
| [`src/systems/AreaEffectsManager.test.js`](../../../src/systems/AreaEffectsManager.test.js) | Modify (add 2 tests) | Cover dead-target termination + stationary-effect non-regression |
| [`src/entities/Hero.js`](../../../src/entities/Hero.js) | Modify (4 lines inside `takeDamage`) | Reset `_attackDamageMult` and cancel the revert timer when hp hits 0 |
| [`src/entities/Hero.test.js`](../../../src/entities/Hero.test.js) | Modify (add 1 test) | Cover the Hero-side cleanup |
| [`src/scenes/GameScene.js`](../../../src/scenes/GameScene.js) | Modify (`_handleImmolate`) | Cancel any prior revert, store the new `TimerEvent` on the hero |
| [`src/scenes/GameScene.handleImmolate.test.js`](../../../src/scenes/GameScene.handleImmolate.test.js) | Create | Cover GameScene-side cancellation + callback clears field |

---

## Task 1: AreaEffectsManager terminates `followsTarget` aura when target dies

**Files:**
- Modify: `src/systems/AreaEffectsManager.js` (the `update` method)
- Test: `src/systems/AreaEffectsManager.test.js`

- [ ] **Step 1: Add the failing test — dead followsTarget terminates the effect**

Open `src/systems/AreaEffectsManager.test.js` and add this test inside the existing `describe('AreaEffectsManager', () => { ... })` block, after the existing `'followsTarget moves effect centre each frame'` test:

```js
it('terminates a followsTarget effect when the target becomes dead', () => {
  const scene = makeScene();
  const mgr = new AreaEffectsManager(scene);
  const target = { x: 0, y: 0, dead: false };
  const enemy = makeEnemy(0, 0);
  mgr.add({
    followsTarget: target,
    radius: 50, duration: 8, dps: 10,
    sourceTag: {}, drawFn() {},
  });
  // Live frame: damages enemy, effect still active.
  mgr.update(1.0, [enemy]);
  expect(enemy.hp).toBe(90);
  expect(scene._created[0].destroyed).toBe(false);
  // Target dies.
  target.dead = true;
  mgr.update(0.1, [enemy]);
  // Effect is destroyed and removed; no further damage applied.
  expect(scene._created[0].destroyed).toBe(true);
  expect(enemy.hp).toBe(90);
  // Subsequent update is a no-op (effect already gone).
  mgr.update(2.0, [enemy]);
  expect(enemy.hp).toBe(90);
});
```

- [ ] **Step 2: Add the failing test — stationary effect ignores unrelated `.dead`**

In the same test file, add this test directly after the one above:

```js
it('stationary (x/y) effect is unaffected by an enemy.dead in the enemies list', () => {
  const scene = makeScene();
  const mgr = new AreaEffectsManager(scene);
  const liveEnemy = makeEnemy(0, 0);
  const deadEnemy = { x: 999, y: 999, dead: true, hp: 50, _statuses: [],
                     takeDamage(amt) { this.hp -= amt; }, applyStatus() {} };
  mgr.add({
    x: 0, y: 0, radius: 50, duration: 5, dps: 10,
    sourceTag: {}, drawFn() {},
  });
  mgr.update(1.0, [liveEnemy, deadEnemy]);
  expect(liveEnemy.hp).toBe(90);
  expect(scene._created[0].destroyed).toBe(false);
});
```

- [ ] **Step 3: Run the new tests and confirm they fail for the right reason**

Run:
```bash
cd ~/.config/superpowers/worktrees/tower-defense/feature/areaeffects-dead-target-fix
npx vitest run src/systems/AreaEffectsManager.test.js
```

Expected: the first new test FAILS (`expect(scene._created[0].destroyed).toBe(true)` is `false` because the effect kept ticking and never terminated). The second new test PASSES even before the fix (it just guards the optional-chain).

- [ ] **Step 4: Apply the one-line fix in `AreaEffectsManager.update`**

Open `src/systems/AreaEffectsManager.js` and change the termination condition inside `update`:

Replace:
```js
if (eff._remaining <= 0) {
  eff._g.destroy();
  this._effects.splice(i, 1);
  continue;
}
```

with:
```js
if (eff._remaining <= 0 || eff.followsTarget?.dead) {
  eff._g.destroy();
  this._effects.splice(i, 1);
  continue;
}
```

- [ ] **Step 5: Run the AreaEffectsManager tests and confirm green**

Run:
```bash
npx vitest run src/systems/AreaEffectsManager.test.js
```

Expected: all 8 tests pass (6 original + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/systems/AreaEffectsManager.js src/systems/AreaEffectsManager.test.js
git commit -m "fix(areaeffects): terminate followsTarget aura when target is dead

Treats eff.followsTarget?.dead as duration-expired in
AreaEffectsManager.update, so Pyromancer's Immolate stops ticking
(and the graphic disappears) the moment the hero dies. Generic across
all follow-target effects; stationary x/y effects are untouched.

Backlog item #5."
```

---

## Task 2: Hero death (inside `takeDamage`) resets Immolate buff and cancels pending revert

**Files:**
- Modify: `src/entities/Hero.js` (inside `takeDamage`, the `hp <= 0` branch — currently lines 102–109)
- Test: `src/entities/Hero.test.js`

- [ ] **Step 1: Add the failing test**

Open `src/entities/Hero.test.js` and add this test inside the existing `describe('Hero — takeDamage and respawn', () => { ... })` block, after the existing `'death sets dead flag and starts respawn timer'` test:

```js
it('death resets _attackDamageMult to 1.0 and cancels the pending Immolate revert timer', () => {
  const hero = new Hero(makeScene(), { x: 0, y: 0 });
  const removeSpy = vi.fn();
  hero._attackDamageMult   = 1.5;
  hero._attackDmgRevertEvt = { remove: removeSpy };
  hero.takeDamage(9999);
  expect(hero.dead).toBe(true);
  expect(hero._attackDamageMult).toBe(1.0);
  expect(hero._attackDmgRevertEvt).toBeNull();
  expect(removeSpy).toHaveBeenCalledOnce();
  expect(removeSpy).toHaveBeenCalledWith(false);
});
```

Note: `vi` is already imported at the top of `src/entities/Hero.test.js` (verify with `grep "^import.*vi" src/entities/Hero.test.js`; if missing, add `vi` to the existing `import { describe, it, expect } from 'vitest'` line — make it `import { describe, it, expect, vi } from 'vitest'`).

- [ ] **Step 2: Run the new test and confirm it fails**

Run:
```bash
npx vitest run src/entities/Hero.test.js -t "death resets _attackDamageMult"
```

Expected: FAIL — `hero._attackDamageMult` is still `1.5` after death (the death branch never reset it), and `_attackDmgRevertEvt` is the stub (not `null`).

- [ ] **Step 3: Extend the death branch in `Hero.takeDamage`**

Open `src/entities/Hero.js`. Replace the `hp <= 0` block inside `takeDamage` (lines 102–109):

Replace:
```js
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
```

with:
```js
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      this._attackDamageMult = 1.0;
      if (this._attackDmgRevertEvt) {
        this._attackDmgRevertEvt.remove(false);
        this._attackDmgRevertEvt = null;
      }
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
```

- [ ] **Step 4: Run the Hero tests and confirm green**

Run:
```bash
npx vitest run src/entities/Hero.test.js
```

Expected: all Hero tests pass, including the new one and every pre-existing death/respawn case.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js
git commit -m "fix(hero): clear Immolate buff and cancel revert timer on death

Hero.takeDamage's hp<=0 branch now resets _attackDamageMult to 1.0
and cancels any pending _attackDmgRevertEvt (the Phaser TimerEvent
scheduled by GameScene._handleImmolate). Prevents a stale revert
timer from stomping a fresh post-respawn Immolate cast.

Backlog item #5."
```

---

## Task 3: GameScene._handleImmolate cancels prior revert and stores the new event on the hero

**Files:**
- Modify: `src/scenes/GameScene.js` (the `_handleImmolate` method)
- Create: `src/scenes/GameScene.handleImmolate.test.js`

- [ ] **Step 1: Write the new test file**

Create `src/scenes/GameScene.handleImmolate.test.js` with the following content (mirrors the `vi.mock('phaser', …)` pattern from `GameScene.dead-cleanup.test.js`):

```js
import { describe, it, expect, vi } from 'vitest';

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

import GameScene from './GameScene.js';

function makeCtx({ areaAdd }) {
  const delayed = [];
  return {
    delayed,
    hero: { heroId: 'pyro', _attackDamageMult: 1.0, _attackDmgRevertEvt: null },
    _areaEffects: { add: areaAdd },
    time: {
      delayedCall: vi.fn((ms, cb) => {
        const evt = { ms, cb, remove: vi.fn() };
        delayed.push(evt);
        return evt;
      }),
    },
  };
}

describe('GameScene._handleImmolate', () => {
  it('stores the revert TimerEvent on the hero so death can cancel it', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    expect(ctx.hero._attackDamageMult).toBe(1.5);
    expect(ctx.hero._attackDmgRevertEvt).toBe(ctx.delayed[0]);
    expect(ctx.delayed[0].ms).toBe(8000);
  });

  it('cancels any prior pending revert before scheduling a new one', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    const firstEvt = ctx.delayed[0];
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    expect(firstEvt.remove).toHaveBeenCalledWith(false);
    expect(ctx.hero._attackDmgRevertEvt).toBe(ctx.delayed[1]);
  });

  it('revert callback clears _attackDmgRevertEvt and resets multiplier to 1.0', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    // Simulate the timer firing.
    ctx.delayed[0].cb();
    expect(ctx.hero._attackDamageMult).toBe(1.0);
    expect(ctx.hero._attackDmgRevertEvt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test file and confirm it fails**

Run:
```bash
npx vitest run src/scenes/GameScene.handleImmolate.test.js
```

Expected: the first two tests FAIL — `ctx.hero._attackDmgRevertEvt` is still `null` because the production code never stores it. The third may also fail (callback only sets the multiplier, never nulls the field).

- [ ] **Step 3: Update `_handleImmolate` in `src/scenes/GameScene.js`**

Find the existing `_handleImmolate` method (around line 588). Replace:

```js
  _handleImmolate(result) {
    this.hero._attackDamageMult = result.attackDamageMult;
    this._areaEffects.add({
      followsTarget: this.hero,
      radius: result.radius, duration: result.duration, dps: result.dps,
      sourceTag: heroAbilitySource(this.hero.heroId, 'immolate'),
      drawFn: (g) => {
        g.clear();
        g.lineStyle(2, 0xff6600, 0.6);
        g.strokeCircle(0, 0, result.radius);
      },
    });
    this.time.delayedCall(result.duration * 1000, () => { this.hero._attackDamageMult = 1.0; });
  }
```

with:

```js
  _handleImmolate(result) {
    this.hero._attackDamageMult = result.attackDamageMult;
    if (this.hero._attackDmgRevertEvt) {
      this.hero._attackDmgRevertEvt.remove(false);
    }
    this._areaEffects.add({
      followsTarget: this.hero,
      radius: result.radius, duration: result.duration, dps: result.dps,
      sourceTag: heroAbilitySource(this.hero.heroId, 'immolate'),
      drawFn: (g) => {
        g.clear();
        g.lineStyle(2, 0xff6600, 0.6);
        g.strokeCircle(0, 0, result.radius);
      },
    });
    this.hero._attackDmgRevertEvt = this.time.delayedCall(result.duration * 1000, () => {
      this.hero._attackDamageMult = 1.0;
      this.hero._attackDmgRevertEvt = null;
    });
  }
```

- [ ] **Step 4: Run the GameScene tests and confirm green**

Run:
```bash
npx vitest run src/scenes/GameScene.handleImmolate.test.js
```

Expected: all 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.handleImmolate.test.js
git commit -m "fix(gamescene): store + cancel Immolate revert TimerEvent on hero

_handleImmolate now (1) cancels any pending revert before scheduling
a new one, so a death-respawn-recast sequence does not get stomped
by the original 8s timer, and (2) stores the new TimerEvent as
hero._attackDmgRevertEvt so Hero.takeDamage's death branch can
cancel it. Callback also nulls the field after reverting.

Backlog item #5."
```

---

## Task 4: Full verification + PR

- [ ] **Step 1: Run the full test suite**

Run:
```bash
cd ~/.config/superpowers/worktrees/tower-defense/feature/areaeffects-dead-target-fix
npm test
```

Expected: all 32 test files pass, total test count is **474** (468 baseline + 6 new: 2 in AreaEffectsManager, 1 in Hero, 3 in GameScene.handleImmolate). 0 failures.

- [ ] **Step 2: Browser-verify the bug fix end-to-end**

Per the memory `feedback_browser_verify_after_refactor`, scene/lifecycle changes need a real browser pass. Start the dev server:
```bash
npm run dev
```
Then in the browser:
1. From the title screen, pick the Pyromancer hero. Start any level with enemies.
2. Cast Immolate (W key — orange ring appears around the hero).
3. Walk the hero into a wave so they die before the 8 s window ends.
4. **Confirm:** the orange ring disappears the same frame the hero dies. No enemy continues taking ~10 dps from a ghost ring.
5. Wait for respawn. Immediately cast Immolate again before the original 8 s would have ended.
6. **Confirm:** the new orange ring stays for its full 8 s, and the hero's basic-attack damage stays elevated (1.5×) for the full 8 s — no premature drop-off.

If any of those fail, return to the relevant task and inspect the production code path; do not paper over with extra test mocks.

- [ ] **Step 3: Update the backlog in `.claude/notes.md`**

In the *primary* working tree at `/Users/keithtimko/projects/tower-defense`, but **only after merging** — do not modify notes.md during this branch's work, since another session may have it open. Defer this step to the post-merge cleanup; do not include in this PR. Skip this step now and just note it for the human follow-up.

- [ ] **Step 4: Push the branch and open a PR**

Per ~/projects/CLAUDE.md: "Finishing a branch: default to Option 2 — push and create a PR". Run:
```bash
cd ~/.config/superpowers/worktrees/tower-defense/feature/areaeffects-dead-target-fix
git push -u origin feature/areaeffects-dead-target-fix
gh pr create --base feature/phase-3-tower-system --title "fix: Immolate cleans up on hero death" --body "$(cat <<'EOF'
## Summary
- AreaEffectsManager: a `followsTarget` aura now terminates the frame its target dies (was: ticking ghost dps + graphic stuck on screen, then teleporting to respawn point).
- Hero.takeDamage death branch: resets `_attackDamageMult` to 1.0 and cancels the pending Immolate revert timer.
- GameScene._handleImmolate: cancels any prior revert before scheduling a new one, stores the new TimerEvent on the hero so the death branch can reach it, callback nulls the field after reverting.

Backlog item #5. Spec at `docs/superpowers/specs/2026-05-31-immolate-cleanup-on-death-design.md`.

## Test plan
- [x] `npm test` — 474 tests passing (468 baseline + 6 new).
- [ ] Manual: Pyromancer Immolate → die mid-aura → ring disappears, no ghost dps.
- [ ] Manual: Pyromancer Immolate → die → respawn → recast Immolate → new 8s window not cut short by stale timer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed to stdout. Report the URL back to the user.

---

## Self-Review

After completing the plan tasks, this section is verification for the plan author (not the executor):

**Spec coverage:** Every section of the spec maps to a task —
- Spec §1 (AreaEffectsManager) → Task 1
- Spec §2 (Hero inline death) → Task 2
- Spec §3 (GameScene._handleImmolate) → Task 3
- Spec verification §1 (full test) → Task 4 Step 1
- Spec verification §2 (manual play-through) → Task 4 Step 2
- Spec verification §3 (browser-verify) → Task 4 Step 2

**Placeholders:** none — all steps have exact paths, code, and commands.

**Type consistency:** `_attackDmgRevertEvt` field name is identical in all three tasks. `.remove(false)` is the exact Phaser TimerEvent API. Test counts (468 baseline → 474 after) check out (2+1+3 = 6 new).
