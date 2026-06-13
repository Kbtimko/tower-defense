# Hero Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Project default per `~/projects/CLAUDE.md` is subagent-driven execution; do not offer an inline alternative. Dispatch each task to a fresh subagent with `model: "sonnet"`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Last Light from a single hero (Commander Rael) to a roster of four selectable heroes with distinct ability kits, integrated end-to-end (MapSelectScene picker → run → upgrades → save persistence → weakness matrix → inspect panel).

**Architecture:** Data-driven `HEROES` registry in `src/data/heroes.js`; a single `Hero` class reads its definition from the registry based on a `heroId`. Three new mechanical systems support the new abilities: `Enemy` status effects (`burn`, `vulnerable`), a `cloaked` flag on `Hero`, a `SentryTurret` entity for Engineer's W, and an `AreaEffectsManager` for Pyromancer's auras and ground pools. Upgrade tree restructured into four per-hero branches (4 nodes each); SaveManager bumped to v3 with `selectedHeroId` field and `cmd_*` → `rael_*` ID migration.

**Tech Stack:** Phaser 3, Vitest (`vi.mock('phaser', ...)` pattern for entity tests), JavaScript ESM, `localStorage` for persistence.

**Spec:** [docs/superpowers/specs/2026-05-30-hero-roster-design.md](../specs/2026-05-30-hero-roster-design.md)

**Branch:** `feature/hero-roster` (off `origin/feature/phase-3-tower-system` @ `57d9deb`)

---

## Spec deviations (read before starting)

1. **Hero movement is still `moveTo(x, y)` — NOT `moveToProgress(progress)`.** The hero-path-restriction PR is in flight on a separate branch and not yet merged. Spec §5 and §5.5 reference `moveToProgress`; ignore that — use the existing click-to-anywhere `moveTo` API on `Hero`. When path-restriction eventually merges, all heroes inherit it through the shared `Hero.update` movement code with no roster-side changes required.

2. **`_facingX` derivation.** Spec §5.5 says `_facingX = target >= pathProgress ? 1 : -1`. The actual rule on this branch: in `Hero.moveTo(x, y)`, set `this._facingX = x >= this.x ? 1 : -1`. Default `+1`. Used only by Pyromancer Flame Wave cone direction.

3. **Cloaked is forward-compat only.** Enemies currently do not target the hero (only Soldiers — see `GameScene._checkSoldierBlock`). Scout Phase Sprint sets `hero.cloaked = true` for 4s, but no enemy code path reads it yet. The flag and timer exist so that when (or if) hero blocking is wired, cloak will Just Work. The OBSERVABLE Phase Sprint effect today is the `+100%` move speed boost via `hero._moveSpeedMult`.

4. **Spec §6.3 sentry code shows the corrected `new Projectile(...)` pattern.** Do not search for `_spawnProjectile` — it does not exist. Construct `new Projectile(scene, {...})` and push into `scene.projectiles`, matching `GameScene._updateTowers` lines 469-476.

---

## File map

| File | Action | Owner task |
|---|---|---|
| `src/data/heroes.js` | **new** — `HEROES` registry + `HERO_ORDER` | T7, T13–T15 |
| `src/data/heroes.test.js` | **new** — registry contract | T7 |
| `src/data/heroAbilities.js` | **new** — 12 ability impls + `pyroBurnOnHit` | T8 (Rael), T13–T15 (others) |
| `src/data/heroAbilities.test.js` | **new** — per-ability tests | T8, T13–T15 |
| `src/data/sourceBuilders.js` | **modify** — `heroSource(heroId)`, `heroAbilitySource(heroId, ability)`, `burnSource()` | T2 |
| `src/data/sourceBuilders.test.js` | **modify** — new shapes | T2 |
| `src/data/weaknessMatrix.js` | **modify** — read `HEROES.matchups`, handle status source | T11 |
| `src/data/weaknessMatrix.test.js` | **modify** — per-hero + status cases | T11 |
| `src/data/upgrades.js` | **restructure** — 25 nodes across 6 branches | T17 |
| `src/data/upgrades.test.js` | **modify** — new tree structure assertions | T17 |
| `src/entities/Hero.js` | **refactor** — data-driven; `fireAbility`, `onHit`, `_facingX`, `_attackDamageMult`, `cloaked`, `_moveSpeedMult` | T9 |
| `src/entities/Hero.test.js` | **modify** — parameterise + new behaviors | T9 |
| `src/entities/Enemy.js` | **modify** — `burn` + `vulnerable` statuses | T3, T4 |
| `src/entities/Enemy.test.js` | **modify** — new status tests | T3, T4 |
| `src/entities/SentryTurret.js` | **new** | T6 |
| `src/entities/SentryTurret.test.js` | **new** | T6 |
| `src/entities/Soldier.js` | **modify** — add `heal()` | T1 |
| `src/systems/AreaEffectsManager.js` | **new** | T5 |
| `src/systems/AreaEffectsManager.test.js` | **new** | T5 |
| `src/systems/SaveManager.js` | **modify** — v3 envelope + migration + new API | T16 |
| `src/systems/SaveManager.test.js` | **modify** — migration matrix | T16 |
| `src/systems/UpgradeManager.js` | **modify** — heroId-scoped modifiers + heroUnlock | T17 |
| `src/systems/UpgradeManager.test.js` | **modify** — new behavior | T17 |
| `src/scenes/MapSelectScene.js` | **modify** — `_renderHeroPicker`, pass heroId on play | T18 |
| `src/scenes/MapSelectScene.heroPicker.test.js` | **new** — picker DOM behavior | T18 |
| `src/scenes/GameScene.js` | **modify** — read heroId, `fireAbility` dispatch, sentry + area-effects wiring | T10, T13, T15 |
| `src/scenes/UIScene.js` | **modify** — `_onHeroHudInit`, cache `_heroDef`, dynamic label | T19 |
| `src/scenes/InspectController.js` | **modify** — read `hero.def`, support `hero:<id>` tokens | T12 |
| `src/scenes/InspectController.test.js` | **modify** — dynamic hero panel | T12 |
| `src/ui/UpgradeTreeOverlay.js` | **modify** — 6 branches + locked-hero visual state | T20 |
| `index.html` | **modify** — hero-picker markup + CSS | T18 |

---

## Standard task hygiene (applies to every task)

- Always begin by running the targeted tests to confirm a clean baseline. Run `npm test -- <path>` from the repo root.
- Use TDD where applicable: write failing test, run to verify it fails, implement, run to verify pass, commit.
- For pure refactors that preserve behavior, the "test" is "the existing test file continues to pass after the refactor".
- Use `vi.mock('phaser', ...)` at the top of any test importing entities (existing pattern — see `src/entities/Hero.test.js`).
- Commit with conventional-commits prefix matching the change (`feat:`, `feat(hero):`, `refactor:`, `test:`, `chore:`).
- Each commit ends with the standard Co-Authored-By footer.

---

## Task 1: Add `Soldier.heal()` for Engineer Repair

**Files:**
- Modify: `src/entities/Soldier.js`
- Test: `src/entities/Soldier.test.js` (create if absent — none exists today)

- [ ] **Step 1: Verify Soldier.test.js does not yet exist**

Run: `ls src/entities/Soldier.test.js 2>/dev/null || echo "no test file yet"`
Expected: `no test file yet`

- [ ] **Step 2: Create the failing test**

Create `src/entities/Soldier.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor() { this.x = 0; this.y = 0; this.visible = true; }
        add() {}
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

import { Soldier } from './Soldier.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {}, lineStyle() {}, strokeCircle() {},
});
const makeScene = () => ({
  add: { graphics: () => makeGraphics(), existing: () => {} },
});

function makeSoldier() {
  return new Soldier(makeScene(), {
    barracks:     { level: 1, branch: null },
    pathProgress: 0,
    pathPoints:   [{x:0,y:0},{x:10,y:0}],
    soldierStats: { hp: 50, damage: 5, respawnDuration: 8, canBlockFlyers: false },
  });
}

describe('Soldier.heal', () => {
  it('restores hp to maxHp when alive', () => {
    const s = makeSoldier();
    s.hp = 10;
    s.heal();
    expect(s.hp).toBe(s.maxHp);
  });

  it('does nothing when dead', () => {
    const s = makeSoldier();
    s.takeDamage(999);
    expect(s.dead).toBe(true);
    s.heal();
    expect(s.dead).toBe(true);
    expect(s.hp).toBe(0);
  });

  it('redraws the HP bar after healing', () => {
    const s = makeSoldier();
    s.hp = 10;
    let cleared = false;
    s._hpBar.clear = () => { cleared = true; };
    s.heal();
    expect(cleared).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — verify FAIL**

Run: `npm test -- src/entities/Soldier.test.js`
Expected: FAIL with `TypeError: s.heal is not a function`

- [ ] **Step 4: Add `heal()` to Soldier.js**

In `src/entities/Soldier.js`, add immediately after the `respawn()` method (around line 92):

```js
  heal() {
    if (this.dead) return;
    this.hp = this.maxHp;
    this._redrawHpBar();
  }
```

- [ ] **Step 5: Run test — verify PASS**

Run: `npm test -- src/entities/Soldier.test.js`
Expected: PASS (3/3)

- [ ] **Step 6: Run full Soldier-related suites for regressions**

Run: `npm test -- src/entities`
Expected: all entity tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Soldier.js src/entities/Soldier.test.js
git commit -m "$(cat <<'EOF'
feat(soldier): add heal() method for Engineer Repair ability

heal() restores hp to maxHp when alive, no-op when dead, redraws HP bar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Source builders — heroId-aware + burnSource

**Files:**
- Modify: `src/data/sourceBuilders.js`
- Modify: `src/data/sourceBuilders.test.js`

- [ ] **Step 1: Read current state**

Read `src/data/sourceBuilders.js` (currently exports `soldierSource`, `heroSource()` no-arg, `heroAirstrikeSource()` no-arg).

- [ ] **Step 2: Update tests first (TDD)**

Replace `src/data/sourceBuilders.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import {
  soldierSource,
  heroSource,
  heroAbilitySource,
  burnSource,
} from './sourceBuilders.js';

describe('source builders', () => {
  it('soldierSource carries barracks tier and branch', () => {
    const s = { barracks: { level: 3, branch: 'A' } };
    expect(soldierSource(s)).toEqual({ kind:'tower', type:'barracks', tier:3, branch:'A' });
  });

  it('heroSource accepts a heroId', () => {
    expect(heroSource('rael')).toEqual({ kind:'hero', heroId:'rael' });
    expect(heroSource('engineer')).toEqual({ kind:'hero', heroId:'engineer' });
  });

  it('heroSource defaults to rael when no heroId is passed (back-compat)', () => {
    expect(heroSource()).toEqual({ kind:'hero', heroId:'rael' });
  });

  it('heroAbilitySource carries heroId and ability label', () => {
    expect(heroAbilitySource('pyro', 'firefield'))
      .toEqual({ kind:'hero', heroId:'pyro', ability:'firefield' });
  });

  it('burnSource is a status-kind tag', () => {
    expect(burnSource()).toEqual({ kind:'status', type:'burn' });
  });
});
```

- [ ] **Step 3: Run test — verify FAIL**

Run: `npm test -- src/data/sourceBuilders.test.js`
Expected: FAIL — `heroAbilitySource is not exported`, `burnSource is not exported`.

- [ ] **Step 4: Update `src/data/sourceBuilders.js`**

Replace the entire file with:

```js
export function soldierSource(soldier) {
  return { kind:'tower', type:'barracks', tier: soldier.barracks.level, branch: soldier.barracks.branch };
}

export function heroSource(heroId = 'rael') {
  return { kind:'hero', heroId };
}

export function heroAbilitySource(heroId, ability) {
  return { kind:'hero', heroId, ability };
}

export function burnSource() {
  return { kind:'status', type:'burn' };
}

// Back-compat alias retained until T22 cleanup; one caller in GameScene._triggerAirstrike.
export function heroAirstrikeSource() {
  return heroAbilitySource('rael', 'airstrike');
}
```

The `heroSource(heroId = 'rael')` default keeps the existing `heroSource()` callsite in `Hero.js` working until Task 9 makes the hero registry-aware. `heroAirstrikeSource` is preserved as an alias to avoid breaking the build before T10 migrates its one caller.

Verify there are no other `heroAirstrikeSource` consumers:
```
grep -rn "heroAirstrikeSource" src/
```
Expected: only `src/scenes/GameScene.js` (one line in `_triggerAirstrike`) plus the new alias definition.

- [ ] **Step 5: Run test — verify PASS**

Run: `npm test -- src/data/sourceBuilders.test.js`
Expected: PASS (5/5)

- [ ] **Step 6: Run full data suite for regressions**

Run: `npm test -- src/data`
Expected: all data tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/sourceBuilders.js src/data/sourceBuilders.test.js
git commit -m "$(cat <<'EOF'
refactor(source-builders): heroId-aware + add burnSource

heroSource(heroId) carries hero identity for per-hero weakness matchups.
heroAbilitySource(heroId, ability) replaces heroAirstrikeSource (kept as
alias for transitional back-compat until call sites migrate).
burnSource tags damage-over-time damage so weakness matrix returns 1.0
and avoids double-multiplying burn damage.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Enemy `burn` status (DoT)

**Files:**
- Modify: `src/entities/Enemy.js`
- Modify: `src/entities/Enemy.test.js`

- [ ] **Step 1: Read current Enemy.js**

Read `src/entities/Enemy.js` — note the existing `statusEffects = { slow, stun }` shape and `applyStatus` + `update` patterns.

- [ ] **Step 2: Add failing tests**

Append to `src/entities/Enemy.test.js`:

```js
describe('Enemy burn status', () => {
  it('takes dps damage at 1-second ticks', () => {
    const enemy = makeEnemy();
    const start = enemy.hp;
    enemy.applyStatus({ type:'burn', duration:4, dps:5 });
    enemy.update(0.5);
    expect(enemy.hp).toBe(start);
    enemy.update(0.5);
    expect(enemy.hp).toBe(start - 5);
  });

  it('clears burn when timer expires', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:5 });
    enemy.update(2.0);
    expect(enemy.statusEffects.burn.active).toBe(false);
  });

  it('re-applying with higher dps replaces dps and refreshes duration', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:3 });
    enemy.update(0.5);
    enemy.applyStatus({ type:'burn', duration:4, dps:5 });
    expect(enemy.statusEffects.burn.dps).toBe(5);
    expect(enemy.statusEffects.burn.timer).toBeCloseTo(4);
  });

  it('re-applying with lower dps keeps higher dps and refreshes duration', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:5 });
    enemy.update(0.5);
    enemy.applyStatus({ type:'burn', duration:4, dps:3 });
    expect(enemy.statusEffects.burn.dps).toBe(5);
    expect(enemy.statusEffects.burn.timer).toBeCloseTo(4);
  });
});
```

`makeEnemy` should already exist in `Enemy.test.js`; if not, mirror the existing test helpers in that file.

- [ ] **Step 3: Run tests — verify FAIL**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: FAIL — `statusEffects.burn` does not exist.

- [ ] **Step 4: Implement burn in Enemy.js**

In the `statusEffects` initializer (currently `{ slow, stun }`), add:

```js
burn: { active: false, timer: 0, dps: 0, tickAccum: 0 },
```

In `applyStatus({ type, duration, factor, dps, multiplier })`, add a `burn` case (keep alongside existing `slow` and `stun` handling):

```js
if (type === 'burn') {
  const existing = this.statusEffects.burn;
  const newDps = existing.active ? Math.max(existing.dps, dps) : dps;
  this.statusEffects.burn = { active: true, timer: duration, dps: newDps, tickAccum: existing.active ? existing.tickAccum : 0 };
}
```

In `update(dt)`, after the existing `stun` block, add:

```js
if (this.statusEffects.burn.active) {
  this.statusEffects.burn.timer -= dt;
  this.statusEffects.burn.tickAccum += dt;
  while (this.statusEffects.burn.tickAccum >= 1 && this.statusEffects.burn.active) {
    this.statusEffects.burn.tickAccum -= 1;
    this.takeDamage(this.statusEffects.burn.dps, { source: { kind:'status', type:'burn' } });
  }
  if (this.statusEffects.burn.timer <= 0) {
    this.statusEffects.burn = { active: false, timer: 0, dps: 0, tickAccum: 0 };
  }
}
```

Note: the source is inlined here rather than importing `burnSource()` to avoid a circular import.

- [ ] **Step 5: Run tests — verify PASS**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: PASS — all four burn tests plus all existing tests.

- [ ] **Step 6: Run full suite for regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.test.js
git commit -m "$(cat <<'EOF'
feat(enemy): add burn status (DoT) for Pyromancer abilities

burn ticks dps damage at 1-second intervals over duration seconds.
Re-applying takes the higher dps and refreshes duration. Damage is
tagged with kind:'status' source so weakness matrix returns 1.0 and
avoids double-dipping the matchup multiplier.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Enemy `vulnerable` status (damage multiplier)

**Files:**
- Modify: `src/entities/Enemy.js`
- Modify: `src/entities/Enemy.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/entities/Enemy.test.js`:

```js
describe('Enemy vulnerable status', () => {
  it('multiplies incoming damage after the weakness multiplier', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:2 });
    const start = enemy.hp;
    enemy.takeDamage(10);
    expect(start - enemy.hp).toBe(20);
  });

  it('multiplier replaces (does not stack) on re-apply', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:2 });
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:1.5 });
    expect(enemy.statusEffects.vulnerable.multiplier).toBe(1.5);
  });

  it('clears vulnerable when timer expires', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:2, multiplier:2 });
    enemy.update(2.0);
    expect(enemy.statusEffects.vulnerable.active).toBe(false);
  });

  it('vulnerable does not apply when not active', () => {
    const enemy = makeEnemy();
    const start = enemy.hp;
    enemy.takeDamage(10);
    expect(start - enemy.hp).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: FAIL — `statusEffects.vulnerable` does not exist.

- [ ] **Step 3: Implement vulnerable in Enemy.js**

In the `statusEffects` initializer, add:

```js
vulnerable: { active: false, timer: 0, multiplier: 1 },
```

In `applyStatus`, add a `vulnerable` case:

```js
if (type === 'vulnerable') {
  this.statusEffects.vulnerable = { active: true, timer: duration, multiplier };
}
```

In `update(dt)`, after the burn block, add:

```js
if (this.statusEffects.vulnerable.active) {
  this.statusEffects.vulnerable.timer -= dt;
  if (this.statusEffects.vulnerable.timer <= 0) {
    this.statusEffects.vulnerable = { active: false, timer: 0, multiplier: 1 };
  }
}
```

In `takeDamage(amount, opts)`, after the existing weakness-multiplier computation but before applying `amount` to `hp`, multiply by the vulnerable factor:

```js
// Read the current implementation of takeDamage in Enemy.js and adapt to its exact
// structure. The invariant is: final = base × weakness × vulnerable.
// Example shape:
takeDamage(amount, opts = {}) {
  if (this.dead) return;
  const mult = opts.source ? getWeaknessMultiplier(opts.source, this.def.type) : 1.0;
  let effective = amount * mult;
  if (this.statusEffects.vulnerable.active) effective *= this.statusEffects.vulnerable.multiplier;
  this.hp -= effective;
  // ...rest of existing dead/death-particle logic...
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: PASS — all four vulnerable tests plus burn + existing tests.

- [ ] **Step 5: Run full suite for regressions**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.test.js
git commit -m "$(cat <<'EOF'
feat(enemy): add vulnerable status for Scout Mark Target

vulnerable multiplies incoming damage AFTER the weakness multiplier:
final = base × weakness × vulnerable. Re-applying replaces the
multiplier (no stacking). Used by Scout Q (2× multiplier for 6s).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: AreaEffectsManager (auras + ground pools)

**Files:**
- Create: `src/systems/AreaEffectsManager.js`
- Create: `src/systems/AreaEffectsManager.test.js`

- [ ] **Step 1: Create the failing test**

Create `src/systems/AreaEffectsManager.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { AreaEffectsManager } from './AreaEffectsManager.js';

function makeScene() {
  const created = [];
  return {
    _created: created,
    add: {
      graphics: () => {
        const g = {
          destroyed: false, x: 0, y: 0,
          setDepth() { return g; },
          setPosition(x, y) { g.x = x; g.y = y; return g; },
          destroy() { g.destroyed = true; },
          clear() {}, fillStyle() {}, fillCircle() {}, lineStyle() {}, strokeCircle() {},
        };
        created.push(g);
        return g;
      },
    },
  };
}

function makeEnemy(x, y) {
  const e = {
    x, y, dead: false, hp: 100, _statuses: [],
    takeDamage(amt) { e.hp -= amt; if (e.hp <= 0) e.dead = true; },
    applyStatus(s)   { e._statuses.push(s); },
  };
  return e;
}

describe('AreaEffectsManager', () => {
  it('damages enemies in radius at 1-second ticks', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(50, 50);
    mgr.add({
      x: 50, y: 50, radius: 100, duration: 5, dps: 10,
      sourceTag: { kind:'status', type:'burn' },
      drawFn() {},
    });
    mgr.update(0.5, [e]);
    expect(e.hp).toBe(100);
    mgr.update(0.5, [e]);
    expect(e.hp).toBe(90);
  });

  it('skips enemies outside radius', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(200, 200);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 5, dps: 10, sourceTag: {}, drawFn() {} });
    mgr.update(1.5, [e]);
    expect(e.hp).toBe(100);
  });

  it('destroys graphic and removes effect at duration end', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 2, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.update(2.5, []);
    expect(scene._created[0].destroyed).toBe(true);
  });

  it('followsTarget moves effect centre each frame', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const target = { x: 0, y: 0 };
    mgr.add({ followsTarget: target, radius: 50, duration: 5, dps: 0, sourceTag: {}, drawFn() {} });
    target.x = 100; target.y = 200;
    mgr.update(0.1, []);
    expect(scene._created[0].x).toBe(100);
    expect(scene._created[0].y).toBe(200);
  });

  it('applies slow status to enemies inside when slowFactor is set', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(0, 0);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 5, dps: 1, slowFactor: 0.5, sourceTag: {}, drawFn() {} });
    mgr.update(1.0, [e]);
    expect(e._statuses[0]).toMatchObject({ type:'slow', factor: 0.5 });
  });

  it('destroyAll removes every effect and its graphic', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    mgr.add({ x: 0, y: 0, radius: 10, duration: 10, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.add({ x: 0, y: 0, radius: 10, duration: 10, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.destroyAll();
    expect(scene._created.every(g => g.destroyed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

Run: `npm test -- src/systems/AreaEffectsManager.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create AreaEffectsManager.js**

Create `src/systems/AreaEffectsManager.js`:

```js
export class AreaEffectsManager {
  constructor(scene) {
    this.scene = scene;
    this._effects = [];
  }

  add(spec) {
    const g = this.scene.add.graphics().setDepth(2);
    const eff = { ...spec, _remaining: spec.duration, _tickAccum: 0, _g: g };
    const cx = eff.followsTarget ? eff.followsTarget.x : eff.x;
    const cy = eff.followsTarget ? eff.followsTarget.y : eff.y;
    g.setPosition(cx, cy);
    eff.drawFn(g, eff);
    this._effects.push(eff);
    return eff;
  }

  update(dt, enemies) {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const eff = this._effects[i];
      eff._remaining -= dt;
      if (eff._remaining <= 0) {
        eff._g.destroy();
        this._effects.splice(i, 1);
        continue;
      }
      if (eff.followsTarget) {
        eff._g.setPosition(eff.followsTarget.x, eff.followsTarget.y);
      }
      eff._tickAccum += dt;
      while (eff._tickAccum >= 1) {
        eff._tickAccum -= 1;
        const cx = eff.followsTarget ? eff.followsTarget.x : eff.x;
        const cy = eff.followsTarget ? eff.followsTarget.y : eff.y;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - cx, e.y - cy) <= eff.radius) {
            e.takeDamage(eff.dps, { source: eff.sourceTag });
            if (eff.slowFactor != null) {
              e.applyStatus({ type:'slow', duration: 1.2, factor: eff.slowFactor });
            }
          }
        }
      }
    }
  }

  destroyAll() {
    for (const e of this._effects) e._g.destroy();
    this._effects = [];
  }
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `npm test -- src/systems/AreaEffectsManager.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/systems/AreaEffectsManager.js src/systems/AreaEffectsManager.test.js
git commit -m "$(cat <<'EOF'
feat(systems): add AreaEffectsManager for auras + ground pools

Generic active-effect system that supports static (x,y) and
followsTarget effects. Ticks damage at 1-second intervals to enemies
within radius. Optional slowFactor applies slow status each tick.
Cleans up graphics on duration end. Used by Pyromancer Immolate and
Firefield abilities (see T15).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: SentryTurret entity (Engineer Deploy Turret)

**Files:**
- Create: `src/entities/SentryTurret.js`
- Create: `src/entities/SentryTurret.test.js`

- [ ] **Step 1: Create the failing test**

Create `src/entities/SentryTurret.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; this.destroyed = false; }
        add() {}
        setDepth() { return this; }
        destroy() { this.destroyed = true; }
      }
    }
  }
}));

vi.mock('./Projectile.js', () => ({
  Projectile: class {
    constructor(scene, opts) { Object.assign(this, opts); this.scene = scene; }
  },
}));

import { SentryTurret } from './SentryTurret.js';

const makeGraphics = () => ({ clear(){}, fillStyle(){}, fillCircle(){}, fillRect(){}, lineStyle(){}, strokeCircle(){}, strokeRect(){} });
const makeScene = () => ({
  add: { graphics: () => makeGraphics(), existing() {} },
  projectiles: [],
});
const makeEnemy = (x, y) => ({ x, y, dead: false });

describe('SentryTurret', () => {
  it('despawns after lifespan and returns false from update', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const result = s.update(13, []);
    expect(result).toBe(false);
    expect(s.destroyed).toBe(true);
  });

  it('fires at the nearest enemy in range and pushes a Projectile into scene.projectiles', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const inRangeNear = makeEnemy(30, 0);
    const inRangeFar  = makeEnemy(80, 0);
    const outOfRange  = makeEnemy(200, 0);
    s.update(1.5, [inRangeNear, inRangeFar, outOfRange]);
    expect(scene.projectiles.length).toBe(1);
    expect(scene.projectiles[0].target).toBe(inRangeNear);
    expect(scene.projectiles[0].damage).toBe(15);
    expect(scene.projectiles[0].towerType).toBe('archer');
    expect(scene.projectiles[0].tier).toBe(1);
  });

  it('does not fire when no enemy is in range', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    s.update(1.5, [makeEnemy(500, 500)]);
    expect(scene.projectiles.length).toBe(0);
  });

  it('respects fire rate cooldown between shots', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const e = makeEnemy(30, 0);
    s.update(0.5, [e]);
    s.update(0.5, [e]);
    s.update(0.2, [e]);
    expect(scene.projectiles.length).toBe(2);
  });

  it('skips dead enemies when picking target', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const dead  = { x: 30, y: 0, dead: true };
    const alive = makeEnemy(60, 0);
    s.update(1.5, [dead, alive]);
    expect(scene.projectiles.length).toBe(1);
    expect(scene.projectiles[0].target).toBe(alive);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

Run: `npm test -- src/entities/SentryTurret.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create SentryTurret.js**

Create `src/entities/SentryTurret.js`:

```js
import Phaser from 'phaser';
import { Projectile } from './Projectile.js';

const RANGE     = 100;
const DAMAGE    = 15;
const RATE      = 1.0;
const LIFESPAN  = 12;
const COLOR     = 0xff9933;

export class SentryTurret extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, ownerHeroId }) {
    super(scene, x, y);
    this.ownerHeroId = ownerHeroId;
    this.range       = RANGE;
    this.damage      = DAMAGE;
    this.rate        = RATE;
    this.lifespan    = LIFESPAN;
    this._cooldown   = 0;
    this._body       = scene.add.graphics();
    this.add(this._body);
    this._drawBody();
    scene.add.existing(this);
    this.setDepth(3);
  }

  _drawBody() {
    const g = this._body;
    g.clear();
    g.fillStyle(0x666666, 1);
    g.fillCircle(0, 0, 7);
    g.fillStyle(0x444444, 1);
    g.fillRect(0, -1, 8, 3);
    g.lineStyle(2, COLOR, 1);
    g.strokeCircle(0, 0, 7);
  }

  _nearestEnemyInRange(enemies) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  update(dt, enemies) {
    this.lifespan -= dt;
    if (this.lifespan <= 0) { this.destroy(); return false; }
    this._cooldown -= dt;
    if (this._cooldown <= 0) {
      const target = this._nearestEnemyInRange(enemies);
      if (target) {
        this.scene.projectiles.push(new Projectile(this.scene, {
          x: this.x, y: this.y, target,
          damage: this.damage, splashRadius: 0, pierce: false, slowFactor: 0,
          color: COLOR, towerType: 'archer', tier: 1, branch: null,
        }));
        this._cooldown = 1 / this.rate;
      }
    }
    return true;
  }
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `npm test -- src/entities/SentryTurret.test.js`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/entities/SentryTurret.js src/entities/SentryTurret.test.js
git commit -m "$(cat <<'EOF'
feat(entity): add SentryTurret for Engineer Deploy Turret ability

Lightweight temporary turret entity — not registered with
TowerPlacementManager. Has 80 HP, 100px range, 15 damage, 1.0
attacks/s, 12s lifespan. Fires via existing Projectile system tagged
as archer-tier-1 so weakness matrix entries apply uniformly.

GameScene wires the sentries list in T13 (Engineer ability hookup).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: HEROES registry — Rael only (behavior-preserving)

**Files:**
- Create: `src/data/heroes.js`
- Create: `src/data/heroes.test.js`
- Create: `src/data/heroAbilities.js`

- [ ] **Step 1: Create the failing test (registry contract for Rael)**

Create `src/data/heroes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HEROES, HERO_ORDER } from './heroes.js';

const REQUIRED_KEYS = [
  'id', 'displayName', 'shortName', 'portraitChar',
  'bodyColor', 'strokeColor', 'unlockMapAfter', 'upgradeBranchId',
  'stats', 'abilities', 'draw', 'onHit', 'matchups',
];

const REQUIRED_STATS = [
  'maxHp', 'moveSpeed', 'attackRange', 'attackRate',
  'attackDamage', 'respawnTime', 'maxLevel', 'abilityUnlockLevels',
];

const REQUIRED_ABILITY_KEYS = ['id', 'label', 'icon', 'cooldown', 'aim', 'run', 'tooltip'];

describe('HEROES registry contract', () => {
  it('HERO_ORDER lists every hero in HEROES', () => {
    for (const id of HERO_ORDER) expect(HEROES[id]).toBeDefined();
    expect(Object.keys(HEROES).sort()).toEqual([...HERO_ORDER].sort());
  });

  for (const id of HERO_ORDER) {
    describe(`hero "${id}"`, () => {
      const def = HEROES[id];
      it('has all required keys', () => {
        for (const k of REQUIRED_KEYS) expect(def).toHaveProperty(k);
      });
      it('stats block has all required keys', () => {
        for (const k of REQUIRED_STATS) expect(def.stats).toHaveProperty(k);
        for (const slot of ['q','w','e']) {
          expect(def.stats.abilityUnlockLevels).toHaveProperty(slot);
        }
      });
      it('every ability slot (q/w/e) has all required keys', () => {
        for (const slot of ['q','w','e']) {
          const a = def.abilities[slot];
          for (const k of REQUIRED_ABILITY_KEYS) expect(a).toHaveProperty(k);
          expect(typeof a.run).toBe('function');
        }
      });
      it('unlockMapAfter is null or an integer in [0, 9]', () => {
        if (def.unlockMapAfter !== null) {
          expect(Number.isInteger(def.unlockMapAfter)).toBe(true);
          expect(def.unlockMapAfter).toBeGreaterThanOrEqual(0);
          expect(def.unlockMapAfter).toBeLessThanOrEqual(9);
        }
      });
      it('draw is a function', () => { expect(typeof def.draw).toBe('function'); });
      it('onHit is null or a function', () => {
        expect(def.onHit === null || typeof def.onHit === 'function').toBe(true);
      });
    });
  }
});
```

- [ ] **Step 2: Run tests — verify FAIL**

Run: `npm test -- src/data/heroes.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create heroes.js with Rael entry**

Create `src/data/heroes.js`:

```js
import { raelOvercharge, raelAirstrike, raelEmp } from './heroAbilities.js';

export const HERO_ORDER = ['rael'];   // T13–T15 will extend

export const HEROES = {
  rael: {
    id:              'rael',
    displayName:     'Commander Rael',
    shortName:       'Rael',
    portraitChar:    'R',
    bodyColor:       0x1a2a4a,
    strokeColor:     0x4fc3f7,
    unlockMapAfter:  null,
    upgradeBranchId: 'rael',
    stats: {
      maxHp: 150, moveSpeed: 130, attackRange: 40,
      attackRate: 1.5, attackDamage: 18, respawnTime: 20,
      maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'overcharge', label:'Overcharge', icon:'⚡', cooldown:30, aim:false, run: raelOvercharge,
           tooltip:'+50% tower fire rate for 6s' },
      w: { id:'airstrike',  label:'Airstrike',  icon:'🎯', cooldown:25, aim:true,  run: raelAirstrike,
           tooltip:'Click ground — 70px AoE, 80 damage' },
      e: { id:'emp_pulse',  label:'EMP Pulse',  icon:'💥', cooldown:45, aim:false, run: raelEmp,
           tooltip:'Stun all enemies for 3s' },
    },
    onHit:    null,
    matchups: { phantom: 1.5 },
    draw(g) {
      g.clear();
      g.fillStyle(0x1a2a4a, 1); g.fillCircle(0, -10, 6); g.fillRect(-4, -4, 8, 10);
      g.lineStyle(2, 0x4fc3f7, 1); g.strokeCircle(0, -10, 6); g.strokeRect(-4, -4, 8, 10);
    },
  },
};
```

- [ ] **Step 4: Create stub heroAbilities.js**

Create `src/data/heroAbilities.js`:

```js
// Pure ability impl functions. Each takes (hero, scene, aimTarget?) and returns
// the ability-result shape (or null on cooldown/dead). Hero.fireAbility is the
// dispatcher; impls do NOT touch hero._timers — Hero does that.

export function raelOvercharge(hero, _scene) {
  if (hero.dead) return null;
  hero.overchargeActive    = true;
  hero.overchargeRemaining = 6;
  return { kind: 'overcharge' };
}

export function raelAirstrike(hero, _scene, { x, y }) {
  if (hero.dead) return null;
  return { kind: 'airstrike', x, y, radius: 70, damage: 80 };
}

export function raelEmp(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'emp' };
}
```

- [ ] **Step 5: Run tests — verify PASS**

Run: `npm test -- src/data/heroes.test.js`
Expected: PASS — all registry-contract assertions for Rael.

- [ ] **Step 6: Commit**

```bash
git add src/data/heroes.js src/data/heroAbilities.js src/data/heroes.test.js
git commit -m "$(cat <<'EOF'
feat(data): add HEROES registry with Rael entry + pure ability impls

heroes.js exports HEROES keyed by id and HERO_ORDER for iteration.
Each entry has stats, abilities (q/w/e with run fn + tooltip), draw fn,
matchups, and unlock metadata.

heroAbilities.js holds pure ability impl functions (raelOvercharge /
raelAirstrike / raelEmp). Hero.fireAbility dispatches in T9. Other
heroes' abilities added in T13–T15.

Registry contract enforced by heroes.test.js — catches a missing field
before runtime.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Rael's ability impl tests

**Files:**
- Create: `src/data/heroAbilities.test.js`

- [ ] **Step 1: Create the test file**

Create `src/data/heroAbilities.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { raelOvercharge, raelAirstrike, raelEmp } from './heroAbilities.js';

const makeHero = (overrides = {}) => ({
  dead: false,
  overchargeActive: false,
  overchargeRemaining: 0,
  ...overrides,
});

describe('raelOvercharge', () => {
  it('sets active + remaining = 6 and returns kind:overcharge', () => {
    const h = makeHero();
    const r = raelOvercharge(h, {});
    expect(r).toEqual({ kind: 'overcharge' });
    expect(h.overchargeActive).toBe(true);
    expect(h.overchargeRemaining).toBe(6);
  });

  it('returns null when hero is dead', () => {
    const h = makeHero({ dead: true });
    expect(raelOvercharge(h, {})).toBeNull();
  });
});

describe('raelAirstrike', () => {
  it('returns hit zone with radius:70, damage:80, at clicked point', () => {
    const r = raelAirstrike(makeHero(), {}, { x: 100, y: 200 });
    expect(r).toEqual({ kind:'airstrike', x:100, y:200, radius:70, damage:80 });
  });

  it('returns null when hero is dead', () => {
    expect(raelAirstrike(makeHero({ dead: true }), {}, { x:0, y:0 })).toBeNull();
  });
});

describe('raelEmp', () => {
  it('returns kind:emp', () => {
    expect(raelEmp(makeHero(), {})).toEqual({ kind: 'emp' });
  });

  it('returns null when hero is dead', () => {
    expect(raelEmp(makeHero({ dead: true }), {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify PASS**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: PASS (6/6).

- [ ] **Step 3: Commit**

```bash
git add src/data/heroAbilities.test.js
git commit -m "$(cat <<'EOF'
test(hero-abilities): cover Rael's overcharge/airstrike/emp impls

Each pure ability fn: returns expected result shape, returns null when
hero is dead. Cooldown timer management is Hero.fireAbility's job (T9)
and is tested there.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Refactor `Hero.js` to be data-driven

**Files:**
- Modify: `src/entities/Hero.js`
- Modify: `src/entities/Hero.test.js`

This task preserves all existing Rael behavior. New flags (`cloaked`, `_cloakTimer`, `_facingX`, `_attackDamageMult`, `_moveSpeedMult`) are added with defaults that match current behavior so existing tests continue to pass.

- [ ] **Step 1: Read current Hero.test.js**

Read `src/entities/Hero.test.js` end-to-end. Note any tests asserting `HERO_STATS` shape — those must continue to pass (HERO_STATS export stays for back-compat until T22 cleanup).

- [ ] **Step 2: Rewrite `src/entities/Hero.js`**

Replace the entire file with:

```js
import Phaser from 'phaser';
import { heroSource } from '../data/sourceBuilders.js';
import { HEROES } from '../data/heroes.js';

// Kept exported for back-compat with InspectController until T12 migrates it.
// T22 (cleanup) removes this once no consumers remain.
export const HERO_STATS = HEROES.rael.stats;

const MOVE_STOP_DIST = 8;

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, heroId = 'rael' }, modifiers = {}) {
    super(scene, x, y);
    this.heroId = heroId;
    this.def    = HEROES[heroId];
    if (!this.def) throw new Error(`Hero: unknown heroId "${heroId}"`);
    const s = this.def.stats;

    this.maxHp        = s.maxHp + (modifiers.heroMaxHpBonus ?? 0);
    this.hp           = this.maxHp;
    this.level        = modifiers.heroStartLevel ?? 1;
    this._respawnTime = s.respawnTime + (modifiers.heroRespawnDelta ?? 0);
    this.killCount    = 0;
    this.dead         = false;
    this.respawnTimer = 0;
    this._spawnX      = x;
    this._spawnY      = y;

    this.targetX = x; this.targetY = y; this.moving = false;
    this._facingX          = 1;
    this._moveSpeedMult    = 1.0;
    this._attackDamageMult = 1.0;
    this.cloaked           = false;
    this._cloakTimer       = 0;

    this._timers = { q: 0, w: 0, e: 0 };
    this.overchargeActive    = false;
    this.overchargeRemaining = 0;

    this._attackTimer = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(4);
    this.def.draw(this._body);
  }

  // Back-compat getters mirror legacy fields used by GameScene/InspectController.
  get overchargeTimer() { return this._timers.q; }
  set overchargeTimer(v) { this._timers.q = v; }
  get airstrikeTimer()  { return this._timers.w; }
  set airstrikeTimer(v)  { this._timers.w = v; }
  get empTimer()        { return this._timers.e; }
  set empTimer(v)        { this._timers.e = v; }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 16, h = 2, ox = -8, oy = -22;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(this.def.strokeColor, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  moveTo(x, y) {
    if (this.dead) return;
    this.targetX = x;
    this.targetY = y;
    this.moving  = true;
    this._facingX = x >= this.x ? 1 : -1;
  }

  takeDamage(amount, _opts = {}) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
  }

  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    this.x            = this._spawnX;
    this.y            = this._spawnY;
    this.targetX      = this._spawnX;
    this.targetY      = this._spawnY;
    this.moving       = false;
    this.cloaked      = false;
    this._cloakTimer  = 0;
    this._moveSpeedMult    = 1.0;
    this._attackDamageMult = 1.0;
    this._attackTimer = 1 / this.def.stats.attackRate;
    this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }

  _registerKill() {
    this.killCount++;
    const prev = this.level;
    if (this.level < 2 && this.killCount >= 25) this.level = 2;
    if (this.level < 3 && this.killCount >= 75) this.level = 3;
    if (this.level !== prev) this.scene.events.emit('hero:level-up', { level: this.level });
  }

  /**
   * Dispatch an ability by slot ('q' | 'w' | 'e').
   * - aimTarget is { x, y } for aim:true abilities (e.g., airstrike, firefield, mark target).
   * - Returns the ability impl's result (or null on cooldown/dead/locked).
   * - On non-null return, starts the slot's cooldown timer.
   */
  fireAbility(slot, aimTarget) {
    const a = this.def.abilities[slot];
    if (!a) return null;
    if (this.dead) return null;
    if (this._timers[slot] > 0) return null;
    const unlockLvl = this.def.stats.abilityUnlockLevels[slot];
    if (this.level < unlockLvl) return null;
    const result = a.run(this, this.scene, aimTarget);
    if (result) this._timers[slot] = a.cooldown;
    return result;
  }

  // Back-compat wrappers — GameScene still calls these in some paths until T10 migrates.
  overcharge() { return this.fireAbility('q') !== null; }
  airstrike(x, y) {
    const r = this.fireAbility('w', { x, y });
    return r ? { x: r.x, y: r.y, radius: r.radius, damage: r.damage } : null;
  }
  empPulse()   { return this.fireAbility('e') !== null; }

  update(dt, enemies) {
    for (const slot of ['q','w','e']) {
      if (this._timers[slot] > 0) this._timers[slot] = Math.max(0, this._timers[slot] - dt);
    }
    if (this.overchargeRemaining > 0) {
      this.overchargeRemaining = Math.max(0, this.overchargeRemaining - dt);
      if (this.overchargeRemaining === 0) this.overchargeActive = false;
    }
    if (this._cloakTimer > 0) {
      this._cloakTimer -= dt;
      if (this._cloakTimer <= 0) {
        this.cloaked        = false;
        this._moveSpeedMult = 1.0;
      }
    }

    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    if (this.moving) {
      const dx = this.targetX - this.x, dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= MOVE_STOP_DIST) {
        this.moving = false;
      } else {
        const step = Math.min(this.def.stats.moveSpeed * this._moveSpeedMult * dt, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      let nearest = null, nearestDist = Infinity;
      const range = this.def.stats.attackRange;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= range && d < nearestDist) { nearest = e; nearestDist = d; }
      }
      if (nearest) {
        const dmg = this.def.stats.attackDamage * this._attackDamageMult;
        nearest.takeDamage(dmg, { source: heroSource(this.heroId) });
        if (this.def.onHit) this.def.onHit(this, nearest);
        if (nearest.dead) this._registerKill();
        const am = this.scene.game?.registry?.get('audio');
        if (am) am.playSfx('hero-attack');
        this._attackTimer = 1 / this.def.stats.attackRate;
      }
    }
  }
}
```

- [ ] **Step 3: Verify existing Hero tests still pass**

Run: `npm test -- src/entities/Hero.test.js`
Expected: PASS — the refactor is behavior-preserving for Rael; constructor's `heroId` defaults to `'rael'` so existing `new Hero(scene, { x, y })` calls keep working.

If anything fails, fix the test (most likely a constructor-args mismatch in test setup).

- [ ] **Step 4: Add new tests for the refactor's added surface**

Append to `src/entities/Hero.test.js` (use existing `makeHero` / `makeScene` helpers):

```js
describe('Hero data-driven refactor — new surface', () => {
  it('throws on unknown heroId', () => {
    const scene = makeScene();
    expect(() => new Hero(scene, { x:0, y:0, heroId:'nope' })).toThrow();
  });

  it('fireAbility("q") returns null when hero is dead', () => {
    const hero = makeHero();
    hero.dead = true;
    expect(hero.fireAbility('q')).toBeNull();
  });

  it('fireAbility("q") returns null when on cooldown', () => {
    const hero = makeHero();
    hero.fireAbility('q');
    expect(hero.fireAbility('q')).toBeNull();
  });

  it('fireAbility("q") starts the slot cooldown to the ability cooldown value', () => {
    const hero = makeHero();
    hero.fireAbility('q');
    expect(hero._timers.q).toBe(30);
  });

  it('fireAbility("w") respects the ability unlock level', () => {
    const hero = makeHero();
    hero.level = 1;
    expect(hero.fireAbility('w', { x:0, y:0 })).toBeNull();
    hero.level = 2;
    expect(hero.fireAbility('w', { x:0, y:0 })).not.toBeNull();
  });

  it('moveTo sets _facingX based on direction', () => {
    const hero = makeHero();
    hero.x = 100;
    hero.moveTo(200, 0);
    expect(hero._facingX).toBe(1);
    hero.moveTo(50, 0);
    expect(hero._facingX).toBe(-1);
  });

  it('cloaked clears on _cloakTimer expiry, resets moveSpeedMult to 1.0', () => {
    const hero = makeHero();
    hero.cloaked = true;
    hero._cloakTimer = 4;
    hero._moveSpeedMult = 2.0;
    hero.update(4.1, []);
    expect(hero.cloaked).toBe(false);
    expect(hero._moveSpeedMult).toBe(1.0);
  });

  it('attack damage is scaled by _attackDamageMult', () => {
    const hero = makeHero();
    hero._attackDamageMult = 1.5;
    let received = 0;
    const enemy = { x: hero.x, y: hero.y, dead: false, takeDamage(dmg) { received = dmg; } };
    hero._attackTimer = 0;
    hero.update(0.01, [enemy]);
    expect(received).toBe(18 * 1.5);
  });

  it('onHit callback fires after a successful auto-attack landing', () => {
    const hero = makeHero();
    let onHitCalled = 0;
    hero.def.onHit = () => { onHitCalled++; };
    const enemy = { x: hero.x, y: hero.y, dead: false, takeDamage() {} };
    hero._attackTimer = 0;
    hero.update(0.01, [enemy]);
    expect(onHitCalled).toBe(1);
  });
});
```

- [ ] **Step 5: Run tests — verify PASS**

Run: `npm test -- src/entities/Hero.test.js`
Expected: PASS — existing tests + 9 new ones.

- [ ] **Step 6: Run full suite for regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js
git commit -m "$(cat <<'EOF'
refactor(hero): make Hero data-driven via HEROES registry

Hero constructor now takes { x, y, heroId? = 'rael' } and reads its
definition from HEROES. Adds fireAbility(slot, aimTarget?) dispatcher
that respects level gate + cooldowns + dead flag. Adds onHit callback
support, _facingX (Pyro cone direction), _attackDamageMult (Pyro
Immolate +50%), cloaked + _moveSpeedMult (Scout Phase Sprint). Legacy
overcharge/airstrike/empPulse methods become thin wrappers around
fireAbility for back-compat. HERO_STATS export preserved for
InspectController until T12 migrates it.

All existing Rael behavior preserved — current Hero.test.js passes
unchanged. Adds 9 new tests for the new surface.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire `GameScene` to pass `heroId` + use `fireAbility`

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Read GameScene.create() + _onAbility + _triggerAirstrike**

Re-read `src/scenes/GameScene.js` sections at line 26 (init), line 51 (Hero construction), and the ability-handler region (search for `_onAbility` and `_triggerAirstrike`).

- [ ] **Step 2: Modify `init(data)` to read heroId**

Replace:
```js
init(data) {
  this.mapId = data?.mapId ?? 0;
}
```
With:
```js
init(data) {
  this.mapId  = data?.mapId  ?? 0;
  this.heroId = data?.heroId ?? 'rael';
}
```

- [ ] **Step 3: Pass heroId into Hero constructor**

Find the `this.hero = new Hero(...)` line in `create()` (around line 51). Change:
```js
this.hero = new Hero(this, this.pathMgr.path[0]);
```
to:
```js
const spawn = this.pathMgr.path[0];
this.hero = new Hero(this, { x: spawn.x, y: spawn.y, heroId: this.heroId },
                            this._upgradeMgr ? this._upgradeMgr.getModifiers(this.heroId) : {});
```

If `GameScene` does not currently instantiate `_upgradeMgr` (grep `_upgradeMgr` in GameScene.js), keep the `{}` modifiers fallback — T17 wires the manager call site if needed.

- [ ] **Step 4: Migrate `_onAbility(slot)` to use `fireAbility`**

Replace the existing `switch(slot)` body in `_onAbility({slot})` with:

```js
_onAbility({ slot }) {
  const a = this.hero.def.abilities[slot];
  if (!a) return;

  if (a.aim) {
    if (this.hero.dead) return;
    if (this.hero._timers[slot] > 0) return;
    if (this.hero.level < this.hero.def.stats.abilityUnlockLevels[slot]) return;
    this.aimMode  = true;
    this._aimSlot = slot;
    this.game.events.emit('hero:aim-mode');
    return;
  }

  const result = this.hero.fireAbility(slot);
  if (!result) return;
  this._applyAbilityResult(slot, result);
},
```

Add new helpers below `_onAbility`:

```js
_applyAbilityResult(slot, result) {
  switch (result.kind) {
    case 'overcharge': {
      const am = this.game?.registry?.get('audio');
      if (am) am.playSfx('hero-overcharge');
      break;
    }
    case 'emp': {
      const am = this.game?.registry?.get('audio');
      if (am) am.playSfx('hero-emp');
      for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
      break;
    }
    case 'airstrike':       { this._handleAirstrike(result);   break; }
    case 'deploy_turret':   { this._handleDeployTurret(result); break; }   // wired in T13
    case 'flame_wave':      { this._handleFlameWave(result);    break; }   // wired in T15
    case 'immolate':        { this._handleImmolate(result);     break; }   // wired in T15
    case 'firefield':       { this._handleFirefield(result);    break; }   // wired in T15
    case 'mark':            { this._handleMark(result);         break; }   // wired in T14
    case 'volley':          { this._handleVolley(result);       break; }   // wired in T14
    case 'phase_sprint':    { this._handlePhaseSprint(result);  break; }   // wired in T14
    case 'repair':          { this._handleRepair(result);       break; }   // wired in T13
    case 'power_surge':     { this._handlePowerSurge(result);   break; }   // wired in T13
    default:                /* unknown kind — no-op */              break;
  }
},

_triggerAimAbility(x, y) {
  if (!this._aimSlot) { this.aimMode = false; return; }
  const slot   = this._aimSlot;
  const result = this.hero.fireAbility(slot, { x, y });
  this._aimSlot = null;
  this.aimMode  = false;
  this.game.events.emit('hero:aim-cancel');
  if (!result) return;
  this._applyAbilityResult(slot, result);
},

_handleAirstrike(result) {
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-airstrike');
  if (this.particleSpawner) this.particleSpawner.spawnHeroAbilityVFX?.('airstrike', result.x, result.y, result.radius);
  for (const e of this.enemies) {
    if (Math.hypot(e.x - result.x, e.y - result.y) <= result.radius) {
      this._dealDamage(e, result.damage, true);
    }
  }
},

// Stubs — wired in T13–T15:
_handleDeployTurret(_result) { /* wired in T13 */ },
_handleRepair(_result)       { /* wired in T13 */ },
_handlePowerSurge(_result)   { /* wired in T13 */ },
_handleMark(_result)         { /* wired in T14 */ },
_handleVolley(_result)       { /* wired in T14 */ },
_handlePhaseSprint(_result)  { /* wired in T14 */ },
_handleFlameWave(_result)    { /* wired in T15 */ },
_handleImmolate(_result)     { /* wired in T15 */ },
_handleFirefield(_result)    { /* wired in T15 */ },
```

Find the `_onPointerDown` aim-mode branch (around line 444) — it currently calls `this._triggerAirstrike(mx, my)`. Replace with `this._triggerAimAbility(mx, my)`.

Delete the old `_triggerAirstrike` method body if no other caller; or alias it to the new method:
```js
_triggerAirstrike(x, y) { this._triggerAimAbility(x, y); }
```

- [ ] **Step 5: Update GameScene.startWave.test.js if it depends on init**

Read `src/scenes/GameScene.startWave.test.js`. If it constructs the scene with `init({mapId})`, add `heroId: 'rael'` to keep the test under the new code path.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Manual sanity check — Rael end-to-end**

Run: `npm run dev`. Open the dev URL. Pick any map. Verify:
- Hero spawns, walks where you click, auto-attacks enemies
- Q (Overcharge) fires
- W (Airstrike) enters aim mode, click → AoE damage
- E (EMP) stuns all enemies
- Cooldowns tick down

Stop the dev server (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.startWave.test.js
git commit -m "$(cat <<'EOF'
refactor(game-scene): wire heroId data path + fireAbility dispatcher

init() reads heroId from scene data (defaults to 'rael' for now).
Hero is constructed with heroId. _onAbility dispatches via
Hero.fireAbility(slot, aimTarget?) and applies the typed result via
_applyAbilityResult. Aim abilities (W, E firefield, Q mark) flow
through _triggerAimAbility. New-hero ability handlers stubbed for
T13–T15.

Rael behavior preserved end-to-end — manual verification with all
three abilities passes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Refactor `weaknessMatrix` to read HEROES.matchups

**Files:**
- Modify: `src/data/weaknessMatrix.js`
- Modify: `src/data/weaknessMatrix.test.js`

- [ ] **Step 1: Update failing tests first**

Append to `src/data/weaknessMatrix.test.js`:

```js
import { HEROES } from './heroes.js';

describe('hero matchups read from HEROES registry', () => {
  it('rael matchup phantom = 1.5', () => {
    expect(getWeaknessMultiplier({ kind:'hero', heroId:'rael' }, 'phantom')).toBe(1.5);
  });

  it('unknown heroId returns 1.0', () => {
    expect(getWeaknessMultiplier({ kind:'hero', heroId:'unknown' }, 'phantom')).toBe(1.0);
  });

  it('status source returns 1.0 (no double-dipping)', () => {
    expect(getWeaknessMultiplier({ kind:'status', type:'burn' }, 'titan')).toBe(1.0);
  });

  it('legacy hero source with no heroId returns 1.0', () => {
    expect(getWeaknessMultiplier({ kind:'hero' }, 'phantom')).toBe(1.0);
  });
});

describe('describeEnemyMatchups walks all heroes in HERO_ORDER', () => {
  it('phantom shows rael as vulnerable-to via hero:rael', () => {
    const { vulnerableTo } = describeEnemyMatchups('phantom');
    expect(vulnerableTo).toContain('hero:rael');
  });
});
```

Ensure `getWeaknessMultiplier` and `describeEnemyMatchups` are in the existing import block at the top of the test file.

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: FAIL — hero-lookup branch still uses `HERO_MULTIPLIERS`, status source not handled.

- [ ] **Step 3: Refactor `src/data/weaknessMatrix.js`**

Replace the file body with:

```js
import { HEROES, HERO_ORDER } from './heroes.js';

export const WEAKNESS_MATRIX = {
  archer:   {                       skitter: 1.25, brute: 0.75, colossus: 0.75, phantom: 1.25, titan: 0.5  },
  mage:     { drone:  1.25,                                     colossus: 1.25, phantom: 1.5,  titan: 1.25 },
  cannon:   { drone:  0.75, skitter: 0.5,  brute: 1.5, colossus: 1.5,  phantom: 0.5,  titan: 1.25 },
  ice:      {                                                                                  titan: 0.75 },
  sniper:   {               skitter: 0.75, brute: 1.25, colossus: 1.5, phantom: 0.75, titan: 1.5  },
  barracks: {               skitter: 1.25, brute: 1.25,                phantom: 0.5,  titan: 0.75 },
};

export const TIER4_OVERRIDES = {
  archer: { B: {                       brute: 1.25, colossus: 1.25                          } },
  mage:   { B: {                       brute: 1.5,  colossus: 1.5                           } },
  cannon: { A: { skitter: 2.0                                                               } },
  ice:    { B: {                       brute: 1.5,  colossus: 1.5                           } },
  sniper: { A: {                                    colossus: 2.0,                titan: 2.5 } },
};

export function getWeaknessMultiplier(source, enemyType) {
  if (!source) return 1.0;
  if (source.kind === 'status') return 1.0;
  if (source.kind === 'hero') {
    return HEROES[source.heroId]?.matchups?.[enemyType] ?? 1.0;
  }
  if (source.kind === 'tower') {
    if (source.tier === 4 && source.branch) {
      const override = TIER4_OVERRIDES[source.type]?.[source.branch]?.[enemyType];
      if (override !== undefined) return override;
    }
    return WEAKNESS_MATRIX[source.type]?.[enemyType] ?? 1.0;
  }
  return 1.0;
}

const ENEMY_TYPES         = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];
const EFFECTIVE_THRESHOLD = 1.25;
const WEAK_THRESHOLD      = 0.75;

export function describeMatchups(source) {
  const effective = [], weak = [];
  if (!source) return { effective, weak };
  for (const enemy of ENEMY_TYPES) {
    const m = getWeaknessMultiplier(source, enemy);
    if (m >= EFFECTIVE_THRESHOLD) effective.push(enemy);
    else if (m <= WEAK_THRESHOLD)  weak.push(enemy);
  }
  return { effective, weak };
}

const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks'];

export function describeEnemyMatchups(enemyType) {
  const vulnerableTo = [], resists = [];
  for (const towerType of TOWER_TYPES) {
    const m = getWeaknessMultiplier({ kind:'tower', type:towerType, tier:1, branch:null }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(towerType);
    else if (m <= WEAK_THRESHOLD)  resists.push(towerType);
  }
  for (const heroId of HERO_ORDER) {
    const m = getWeaknessMultiplier({ kind:'hero', heroId }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(`hero:${heroId}`);
    else if (m <= WEAK_THRESHOLD)  resists.push(`hero:${heroId}`);
  }
  return { vulnerableTo, resists };
}

// Back-compat shim until T12 migrates InspectController; removed in T22.
export const HERO_MULTIPLIERS = HEROES.rael.matchups;
```

If any other consumer of `HERO_MULTIPLIERS` surfaces, fix in that consumer's file but stay focused.

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/weaknessMatrix.js src/data/weaknessMatrix.test.js
git commit -m "$(cat <<'EOF'
refactor(weakness-matrix): read hero matchups from HEROES registry

getWeaknessMultiplier:
- status source returns 1.0 (avoids double-dipping burn DoT damage)
- hero source reads HEROES[heroId].matchups (unknown heroId → 1.0)
- tower/Tier-4 paths unchanged

describeEnemyMatchups walks HERO_ORDER for the hero column. New tokens
like 'hero:rael' surface in inspect panels (formatted in T12).

HERO_MULTIPLIERS retained as a thin back-compat re-export of
HEROES.rael.matchups until T12 migrates InspectController; removed in T22.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: InspectController reads `hero.def`

**Files:**
- Modify: `src/scenes/InspectController.js`
- Modify: `src/scenes/InspectController.test.js`

- [ ] **Step 1: Read current InspectController**

Read `src/scenes/InspectController.js`. Note all references to `HERO_STATS` and `HERO_MULTIPLIERS`. Note the `displayName` helper used for matchup chips.

- [ ] **Step 2: Add failing tests**

Append to `src/scenes/InspectController.test.js` (use existing helper patterns in that file):

```js
describe('hero panel reads hero.def', () => {
  it('renders displayName from hero.def', () => {
    const hero = makeFakeHero({ def: {
      displayName: 'Engineer Dax', shortName: 'Dax',
      stats: { maxLevel: 3, attackDamage: 12, attackRange: 60, abilityUnlockLevels:{q:1,w:2,e:3} },
      abilities: { q:{label:'Repair'}, w:{label:'Deploy Turret'}, e:{label:'Power Surge'} },
      matchups: { brute: 1.25 },
    }, level: 2, killCount: 7, hp: 80, maxHp: 95, dead: false });
    controller.pin({ kind:'hero', target: hero });
    expect(document.getElementById('hi-header').textContent).toContain('Engineer Dax');
    expect(document.getElementById('hi-attack').textContent).toContain('12');
    expect(document.getElementById('hi-attack').textContent).toContain('60');
  });

  it('matchups render from def.matchups, not HERO_MULTIPLIERS', () => {
    const hero = makeFakeHero({ def: {
      displayName: 'Pyromancer Mira', shortName: 'Mira',
      stats: { maxLevel: 3, attackDamage: 14, attackRange: 45, abilityUnlockLevels:{q:1,w:2,e:3} },
      abilities: { q:{label:'Flame Wave'}, w:{label:'Immolate'}, e:{label:'Firefield'} },
      matchups: { drone: 1.5, skitter: 2.0, titan: 0.5 },
    }, level: 1, killCount: 0, hp: 130, maxHp: 130, dead: false });
    controller.pin({ kind:'hero', target: hero });
    const matchupsBlock = document.getElementById('hi-matchups')?.textContent ?? '';
    expect(matchupsBlock.toLowerCase()).toContain('skitter');
  });
});
```

If `makeFakeHero` doesn't exist, add a simple helper that mirrors the existing patterns in the test file.

- [ ] **Step 3: Run — verify FAIL**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: FAIL — InspectController still reads `HERO_STATS.attackDamage` / `HERO_MULTIPLIERS`.

- [ ] **Step 4: Refactor InspectController.js**

Open `src/scenes/InspectController.js`. Replace:

```js
import { HERO_STATS } from '../entities/Hero.js';
import { describeEnemyMatchups, HERO_MULTIPLIERS } from '../data/weaknessMatrix.js';
```

With:

```js
import { describeEnemyMatchups } from '../data/weaknessMatrix.js';
import { HEROES } from '../data/heroes.js';
```

Then update `_renderHeroPanel(hero)`:
- `header.textContent = '🛡️ Commander Rael';` → `` header.textContent = `🛡️ ${hero.def.displayName}`; ``
- `HERO_STATS.maxLevel` → `hero.def.stats.maxLevel`
- `HERO_STATS.attackDamage` → `hero.def.stats.attackDamage`
- `HERO_STATS.attackRange` → `hero.def.stats.attackRange`
- `HERO_STATS.abilityUnlockLevels.q` (etc.) → `hero.def.stats.abilityUnlockLevels.q`

Update `_renderHeroAbilities(hero)` to iterate `Object.entries(hero.def.abilities)` for slot/label/cooldown/icon. Read current cooldown from `hero._timers[slot]`.

Update `_renderHeroMatchups(hero)` to use `Object.entries(hero.def.matchups)` instead of `Object.entries(HERO_MULTIPLIERS)`.

Update the `displayName` helper used for matchup tokens:

```js
const displayName = (t) => {
  if (typeof t === 'string' && t.startsWith('hero:')) {
    const id = t.slice(5);
    return HEROES[id]?.shortName ?? id;
  }
  return TOWER_DEFS[t]?.name ?? t;
};
```

- [ ] **Step 5: Run — verify PASS**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/InspectController.js src/scenes/InspectController.test.js
git commit -m "$(cat <<'EOF'
refactor(inspect): hero panel reads hero.def instead of singletons

Drops HERO_STATS + HERO_MULTIPLIERS imports in favor of hero.def.stats
and hero.def.matchups. displayName helper formats 'hero:<id>' tokens
via HEROES[id].shortName. Header reads def.displayName so each hero
gets its own name in the inspect panel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Engineer Dax — registry entry + 3 abilities + GameScene wiring

**Files:**
- Modify: `src/data/heroes.js`
- Modify: `src/data/heroAbilities.js`
- Modify: `src/data/heroAbilities.test.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Add Engineer ability impl tests (TDD)**

Append to `src/data/heroAbilities.test.js`:

```js
import { engRepair, engDeployTurret, engPowerSurge } from './heroAbilities.js';

describe('engineer abilities', () => {
  it('engRepair returns kind:repair when alive', () => {
    const h = { dead: false, hp: 40, maxHp: 95 };
    expect(engRepair(h, {})).toEqual({ kind:'repair', healHero: 60, soldierRadius: 100 });
  });
  it('engRepair returns null when dead', () => {
    expect(engRepair({ dead: true }, {})).toBeNull();
  });

  it('engDeployTurret returns kind:deploy_turret with position', () => {
    const h = { dead: false, x: 100, y: 200 };
    expect(engDeployTurret(h, {})).toEqual({ kind:'deploy_turret', x: 100, y: 200 });
  });
  it('engDeployTurret returns null when dead', () => {
    expect(engDeployTurret({ dead: true, x:0, y:0 }, {})).toBeNull();
  });

  it('engPowerSurge returns kind:power_surge with position + radius + multiplier + duration', () => {
    const h = { dead: false, x: 50, y: 50 };
    expect(engPowerSurge(h, {})).toEqual({ kind:'power_surge', x:50, y:50, radius:200, fireRateMult:2.0, duration:8 });
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Implement Engineer abilities in `src/data/heroAbilities.js`**

Append:

```js
export function engRepair(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'repair', healHero: 60, soldierRadius: 100 };
}

export function engDeployTurret(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'deploy_turret', x: hero.x, y: hero.y };
}

export function engPowerSurge(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'power_surge', x: hero.x, y: hero.y, radius: 200, fireRateMult: 2.0, duration: 8 };
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: PASS — engineer tests + Rael tests.

- [ ] **Step 5: Add Engineer entry to HEROES**

Edit `src/data/heroes.js`:
- Add to imports: `engRepair, engDeployTurret, engPowerSurge`
- Add `'engineer'` to `HERO_ORDER`
- Add entry:

```js
engineer: {
  id:              'engineer',
  displayName:     'Engineer Dax',
  shortName:       'Dax',
  portraitChar:    'E',
  bodyColor:       0x4a2e1a,
  strokeColor:     0xff9933,
  unlockMapAfter:  2,
  upgradeBranchId: 'engineer',
  stats: {
    maxHp: 95, moveSpeed: 110, attackRange: 60,
    attackRate: 1.2, attackDamage: 12, respawnTime: 20,
    maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
  },
  abilities: {
    q: { id:'repair',        label:'Repair',        icon:'🔧', cooldown:20, aim:false, run: engRepair,
         tooltip:'Heal self +60 HP and all soldiers within 100px to full' },
    w: { id:'deploy_turret', label:'Deploy Turret', icon:'🛡️', cooldown:35, aim:false, run: engDeployTurret,
         tooltip:'Place a sentry turret (12s, 100px range, 15 dmg)' },
    e: { id:'power_surge',   label:'Power Surge',   icon:'⚡', cooldown:50, aim:false, run: engPowerSurge,
         tooltip:'All towers within 200px get +100% fire rate for 8s' },
  },
  onHit:    null,
  matchups: { brute: 1.25, colossus: 1.5, titan: 1.5 },
  draw(g) {
    g.clear();
    // Hexagonal hardhat head
    g.fillStyle(0x4a2e1a, 1);
    g.beginPath();
    const r = 7;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = Math.cos(a) * r;
      const py = -10 + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    // Torso with backpack rect
    g.fillRect(-4, -4, 8, 10);
    g.fillStyle(0x6a3e2a, 1);
    g.fillRect(-3, -1, 6, 4);
    // Copper outline
    g.lineStyle(2, 0xff9933, 1);
    g.strokePath();
    g.strokeRect(-4, -4, 8, 10);
  },
},
```

- [ ] **Step 6: Wire GameScene handlers**

In `src/scenes/GameScene.js`:

Add `this._sentries = []` in `create()` (alongside `this.enemies = []`).
Import:
```js
import { SentryTurret } from '../entities/SentryTurret.js';
```

In `update()`, after `this._updateHero(dt);`, add:
```js
this._updateSentries(dt);
```

Add method:
```js
_updateSentries(dt) {
  this._sentries = this._sentries.filter(s => s.update(dt, this.enemies));
},
```

In `shutdown()`, add:
```js
for (const s of this._sentries) s.destroy();
this._sentries = [];
```

Replace the `_handleDeployTurret` stub:
```js
_handleDeployTurret(result) {
  for (const s of this._sentries) s.destroy();
  this._sentries = [new SentryTurret(this, { x: result.x, y: result.y, ownerHeroId: this.hero.heroId })];
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-overcharge');
},
```

Replace the `_handleRepair` stub:
```js
_handleRepair(result) {
  this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + result.healHero);
  this.hero._redrawHpBar();
  for (const tower of this.placementManager.getTowers()) {
    if (tower.type !== 'barracks') continue;
    for (const soldier of tower.soldiers) {
      if (soldier.dead) continue;
      if (Math.hypot(soldier.x - this.hero.x, soldier.y - this.hero.y) <= result.soldierRadius) {
        soldier.heal();
      }
    }
  }
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-respawn');
},
```

Replace the `_handlePowerSurge` stub:
```js
_handlePowerSurge(result) {
  const affected = [];
  for (const tower of this.placementManager.getTowers()) {
    if (Math.hypot(tower.x - result.x, tower.y - result.y) <= result.radius) {
      tower._baseFireRate ??= tower.fireRate;
      tower.fireRate = tower._baseFireRate * result.fireRateMult;
      affected.push(tower);
    }
  }
  this.time.delayedCall(result.duration * 1000, () => {
    for (const t of affected) {
      if (t._baseFireRate != null) t.fireRate = t._baseFireRate;
    }
  });
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-overcharge');
},
```

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass — registry contract test now covers Engineer via the HERO_ORDER loop.

- [ ] **Step 8: Commit**

```bash
git add src/data/heroes.js src/data/heroAbilities.js src/data/heroAbilities.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(hero): add Engineer Dax — support/builder, anti-armor

Engineer kit:
- Q Repair (20s): heal self +60 HP, heal soldiers in 100px to full
- W Deploy Turret (35s): spawn one SentryTurret at hero position, 12s lifespan
- E Power Surge (50s): towers in 200px get +100% fire rate for 8s

Stats HP 95 / range 60 / move 110 / dmg 12 / rate 1.2 / respawn 20s.
Matchups: brute 1.25, colossus 1.5, titan 1.5.

GameScene wires _sentries list + _updateSentries + ability handlers
for repair / deploy_turret / power_surge.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Scout Vex — registry entry + 3 abilities + handlers

**Files:**
- Modify: `src/data/heroes.js`
- Modify: `src/data/heroAbilities.js`
- Modify: `src/data/heroAbilities.test.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Add Scout ability impl tests**

Append to `src/data/heroAbilities.test.js`:

```js
import { scoutMark, scoutVolley, scoutPhase } from './heroAbilities.js';

describe('scout abilities', () => {
  it('scoutMark returns kind:mark with multiplier 2.0 and duration 6 for the aimed enemy', () => {
    const target = { id: 'e1' };
    const r = scoutMark({ dead: false }, {}, target);
    expect(r).toEqual({ kind:'mark', target, multiplier:2.0, duration:6 });
  });
  it('scoutMark returns null when target is missing', () => {
    expect(scoutMark({ dead: false }, {}, null)).toBeNull();
  });
  it('scoutMark returns null when dead', () => {
    expect(scoutMark({ dead: true }, {}, { id:'e' })).toBeNull();
  });

  it('scoutVolley returns kind:volley with damage 25, range 180, maxTargets 8', () => {
    const h = { dead: false, x: 100, y: 100 };
    expect(scoutVolley(h, {})).toEqual({ kind:'volley', x:100, y:100, range:180, damage:25, maxTargets:8 });
  });

  it('scoutPhase returns kind:phase_sprint with cloakDuration 4 and speedMult 2.0', () => {
    const h = { dead: false };
    expect(scoutPhase(h, {})).toEqual({ kind:'phase_sprint', cloakDuration:4, speedMult:2.0 });
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement Scout abilities in heroAbilities.js**

Append:

```js
export function scoutMark(hero, _scene, target) {
  if (hero.dead) return null;
  if (!target) return null;
  return { kind: 'mark', target, multiplier: 2.0, duration: 6 };
}

export function scoutVolley(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'volley', x: hero.x, y: hero.y, range: 180, damage: 25, maxTargets: 8 };
}

export function scoutPhase(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'phase_sprint', cloakDuration: 4, speedMult: 2.0 };
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: PASS — scout tests + previous.

- [ ] **Step 5: Add Scout entry to HEROES**

Edit `src/data/heroes.js`:
- Add to imports: `scoutMark, scoutVolley, scoutPhase`
- Add `'scout'` to `HERO_ORDER` (between `'engineer'` and `'pyro'`)
- Add entry:

```js
scout: {
  id:              'scout',
  displayName:     'Scout Vex',
  shortName:       'Vex',
  portraitChar:    'S',
  bodyColor:       0x1e3a1e,
  strokeColor:     0x3fb950,
  unlockMapAfter:  4,
  upgradeBranchId: 'scout',
  stats: {
    maxHp: 80, moveSpeed: 150, attackRange: 140,
    attackRate: 2.0, attackDamage: 14, respawnTime: 18,
    maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
  },
  abilities: {
    q: { id:'mark',         label:'Mark Target',  icon:'🎯', cooldown:20, aim:true,  run: scoutMark,
         tooltip:'Click an enemy → takes 2× damage for 6s' },
    w: { id:'volley',       label:'Volley',       icon:'🏹', cooldown:30, aim:false, run: scoutVolley,
         tooltip:'Strike up to 8 enemies in 180px, 25 damage each' },
    e: { id:'phase_sprint', label:'Phase Sprint', icon:'💨', cooldown:45, aim:false, run: scoutPhase,
         tooltip:'Untargetable + 2× move speed for 4s (self-only)' },
  },
  onHit:    null,
  matchups: { drone: 1.5, phantom: 1.75, titan: 0.75 },
  draw(g) {
    g.clear();
    g.fillStyle(0x1e3a1e, 1);
    g.fillCircle(0, -10, 5);
    g.beginPath();
    g.moveTo(0, -4); g.lineTo(-3, 6); g.lineTo(3, 6); g.closePath();
    g.fillPath();
    g.lineStyle(2, 0x3fb950, 1);
    g.strokeCircle(0, -10, 5);
    g.strokePath();
  },
},
```

- [ ] **Step 6: Replace ability handler stubs in GameScene**

```js
_handleMark(result) {
  if (result.target && !result.target.dead) {
    result.target.applyStatus({ type:'vulnerable', duration: result.duration, multiplier: result.multiplier });
  }
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-attack');
},

_handleVolley(result) {
  let hits = 0;
  const g = this.add.graphics().setDepth(5);
  g.lineStyle(2, 0x3fb950, 1);
  for (const e of this.enemies) {
    if (e.dead) continue;
    if (hits >= result.maxTargets) break;
    if (Math.hypot(e.x - result.x, e.y - result.y) <= result.range) {
      if (typeof g.lineBetween === 'function') {
        g.lineBetween(result.x, result.y, e.x, e.y);
      }
      this._dealDamage(e, result.damage, false);
      hits++;
    }
  }
  this.time.delayedCall(250, () => g.destroy());
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-attack');
},

_handlePhaseSprint(result) {
  this.hero.cloaked         = true;
  this.hero._cloakTimer     = result.cloakDuration;
  this.hero._moveSpeedMult  = result.speedMult;
  const am = this.game?.registry?.get('audio');
  if (am) am.playSfx('hero-overcharge');
},
```

`lineBetween` is a Phaser graphics method — the typeof guard makes the test mock comfortable when the helper isn't present.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/data/heroes.js src/data/heroAbilities.js src/data/heroAbilities.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(hero): add Scout Vex — ranged DPS, anti-air

Scout kit:
- Q Mark Target (20s, aim): clicked enemy gains vulnerable for 6s (2× dmg)
- W Volley (30s): up to 8 enemies in 180px, 25 damage each
- E Phase Sprint (45s): cloaked + 2× move speed for 4s, self-only

Stats HP 80 / range 140 / move 150 / dmg 14 / rate 2.0 / respawn 18s.
Matchups: drone 1.5, phantom 1.75, titan 0.75.

cloaked flag is forward-compat — enemies currently don't target hero
so the observable effect today is the move speed boost. When hero
blocking lands later, cloak will gate enemy targeting too.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Pyromancer Mira — registry entry + abilities + onHit + AreaEffectsManager wiring

**Files:**
- Modify: `src/data/heroes.js`
- Modify: `src/data/heroAbilities.js`
- Modify: `src/data/heroAbilities.test.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Add Pyromancer ability impl tests**

Append to `src/data/heroAbilities.test.js`:

```js
import { pyroFlameWave, pyroImmolate, pyroFirefield, pyroBurnOnHit } from './heroAbilities.js';
import { vi } from 'vitest';

describe('pyromancer abilities', () => {
  it('pyroFlameWave returns kind:flame_wave with cone params + burn', () => {
    const h = { dead: false, x: 0, y: 0, _facingX: 1 };
    expect(pyroFlameWave(h, {})).toEqual({
      kind:'flame_wave', x:0, y:0, facingX:1, length:100, halfAngle: Math.PI/4,
      damage:30, burn:{ duration:4, dps:5 },
    });
  });

  it('pyroImmolate returns kind:immolate with attached aura + atkDmgMult window', () => {
    const h = { dead: false };
    expect(pyroImmolate(h, {})).toEqual({
      kind:'immolate', radius:60, duration:8, dps:10, attackDamageMult:1.5,
    });
  });

  it('pyroFirefield returns kind:firefield at aim point with pool params', () => {
    const r = pyroFirefield({ dead: false }, {}, { x: 100, y: 200 });
    expect(r).toEqual({
      kind:'firefield', x:100, y:200, radius:100, duration:6, dps:15, slowFactor:0.7,
    });
  });

  it('pyroBurnOnHit applies 3dps/2s burn to the enemy', () => {
    const enemy = { applyStatus: vi.fn() };
    pyroBurnOnHit({}, enemy);
    expect(enemy.applyStatus).toHaveBeenCalledWith({ type:'burn', duration:2, dps:3 });
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Implement Pyromancer abilities in heroAbilities.js**

Append:

```js
export function pyroFlameWave(hero, _scene) {
  if (hero.dead) return null;
  return {
    kind: 'flame_wave',
    x: hero.x, y: hero.y, facingX: hero._facingX,
    length: 100, halfAngle: Math.PI / 4,
    damage: 30, burn: { duration: 4, dps: 5 },
  };
}

export function pyroImmolate(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'immolate', radius: 60, duration: 8, dps: 10, attackDamageMult: 1.5 };
}

export function pyroFirefield(hero, _scene, { x, y }) {
  if (hero.dead) return null;
  return { kind: 'firefield', x, y, radius: 100, duration: 6, dps: 15, slowFactor: 0.7 };
}

export function pyroBurnOnHit(_hero, enemy) {
  enemy.applyStatus({ type: 'burn', duration: 2, dps: 3 });
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- src/data/heroAbilities.test.js`
Expected: PASS — pyro tests + previous.

- [ ] **Step 5: Add Pyromancer entry to HEROES**

Edit `src/data/heroes.js`:
- Add to imports: `pyroFlameWave, pyroImmolate, pyroFirefield, pyroBurnOnHit`
- Add `'pyro'` to `HERO_ORDER`
- Add entry:

```js
pyro: {
  id:              'pyro',
  displayName:     'Pyromancer Mira',
  shortName:       'Mira',
  portraitChar:    'P',
  bodyColor:       0x4a1e1a,
  strokeColor:     0xe74c3c,
  unlockMapAfter:  6,
  upgradeBranchId: 'pyro',
  stats: {
    maxHp: 130, moveSpeed: 115, attackRange: 45,
    attackRate: 1.0, attackDamage: 14, respawnTime: 22,
    maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
  },
  abilities: {
    q: { id:'flame_wave', label:'Flame Wave', icon:'🔥', cooldown:20, aim:false, run: pyroFlameWave,
         tooltip:'90° cone, 100px reach: 30 damage + burn' },
    w: { id:'immolate',   label:'Immolate',   icon:'♨️', cooldown:30, aim:false, run: pyroImmolate,
         tooltip:'8s aura: 10 dmg/s in 60px + 1.5× auto-attack damage' },
    e: { id:'firefield',  label:'Firefield',  icon:'🌋', cooldown:50, aim:true,  run: pyroFirefield,
         tooltip:'Click ground — 100px fire pool for 6s, 15 dmg/s + slow' },
  },
  onHit:    pyroBurnOnHit,
  matchups: { drone: 1.5, skitter: 2.0, brute: 1.25, titan: 0.5 },
  draw(g) {
    g.clear();
    g.fillStyle(0x4a1e1a, 1);
    g.fillCircle(0, -10, 6);
    g.fillStyle(0xff6600, 1);
    g.beginPath();
    g.moveTo(0, -18); g.lineTo(-2, -15); g.lineTo(2, -15); g.closePath();
    g.fillPath();
    g.fillStyle(0x4a1e1a, 1);
    g.fillRect(-5, -4, 10, 10);
    g.lineStyle(2, 0xe74c3c, 1);
    g.strokeCircle(0, -10, 6);
    g.strokeRect(-5, -4, 10, 10);
  },
},
```

- [ ] **Step 6: Wire AreaEffectsManager in GameScene**

In `src/scenes/GameScene.js`:

Imports:
```js
import { AreaEffectsManager } from '../systems/AreaEffectsManager.js';
import { heroAbilitySource } from '../data/sourceBuilders.js';   // if not already imported
```

In `create()`, after `this._sentries = []`:
```js
this._areaEffects = new AreaEffectsManager(this);
```

In `update()`, after `this._updateSentries(dt)`:
```js
this._areaEffects.update(dt, this.enemies);
```

In `shutdown()`:
```js
if (this._areaEffects) this._areaEffects.destroyAll();
```

Replace `_handleFlameWave`:
```js
_handleFlameWave(result) {
  const facingAngle = result.facingX >= 0 ? 0 : Math.PI;
  for (const e of this.enemies) {
    if (e.dead) continue;
    const dx = e.x - result.x, dy = e.y - result.y;
    const dist = Math.hypot(dx, dy);
    if (dist > result.length) continue;
    const angleToEnemy = Math.atan2(dy, dx);
    let diff = Math.abs(angleToEnemy - facingAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff <= result.halfAngle) {
      this._dealDamage(e, result.damage, false);
      e.applyStatus({ type:'burn', duration: result.burn.duration, dps: result.burn.dps });
    }
  }
  const g = this.add.graphics().setDepth(5);
  g.fillStyle(0xff6600, 0.4);
  g.beginPath();
  g.moveTo(result.x, result.y);
  const dir = result.facingX >= 0 ? 1 : -1;
  g.lineTo(result.x + result.length * dir * Math.cos(result.halfAngle), result.y - result.length * Math.sin(result.halfAngle));
  g.lineTo(result.x + result.length * dir * Math.cos(result.halfAngle), result.y + result.length * Math.sin(result.halfAngle));
  g.closePath();
  g.fillPath();
  this.time.delayedCall(250, () => g.destroy());
},

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
},

_handleFirefield(result) {
  this._areaEffects.add({
    x: result.x, y: result.y,
    radius: result.radius, duration: result.duration, dps: result.dps,
    slowFactor: result.slowFactor,
    sourceTag: heroAbilitySource(this.hero.heroId, 'firefield'),
    drawFn: (g) => {
      g.clear();
      g.fillStyle(0xff4400, 0.25);
      g.fillCircle(0, 0, result.radius);
      g.lineStyle(2, 0xff6600, 0.5);
      g.strokeCircle(0, 0, result.radius);
    },
  });
},
```

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass — HEROES registry contract test now covers all 4 heroes via the HERO_ORDER loop.

- [ ] **Step 8: Commit**

```bash
git add src/data/heroes.js src/data/heroAbilities.js src/data/heroAbilities.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(hero): add Pyromancer Mira — AoE/burn, anti-swarm

Pyromancer kit:
- Q Flame Wave (20s): 90° cone, 100px, 30 dmg + 5dps/4s burn
- W Immolate (30s): 8s aura, 10dps/60px around hero, +50% auto-attack dmg
- E Firefield (50s, aim): 100px pool, 6s, 15dps + 30% slow
- onHit: 3dps/2s burn on every auto-attack landing

Stats HP 130 / range 45 / move 115 / dmg 14 / rate 1.0 / respawn 22s.
Matchups: drone 1.5, skitter 2.0, brute 1.25, titan 0.5.

GameScene wires AreaEffectsManager for Immolate (followsTarget hero)
and Firefield (static pool). Flame Wave uses inline cone math + brief
orange triangle visual.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: SaveManager v3 — selectedHeroId + migration

**Files:**
- Modify: `src/systems/SaveManager.js`
- Modify: `src/systems/SaveManager.test.js`

- [ ] **Step 1: Write failing tests**

Append to `src/systems/SaveManager.test.js`:

```js
describe('SaveManager v3 — selectedHeroId + cmd_* rename', () => {
  it('fresh save defaults selectedHeroId to "rael"', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('v2 → v3 migrates cmd_* upgrade ids to rael_*', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2, maps: new Array(10).fill(0),
      upgrades: ['cmd_battle_hardened', 'cmd_veteran', 'log_supply_cache'],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
    }));
    const mgr = new SaveManager();
    const ups = mgr.getPurchasedUpgrades();
    expect(ups).toContain('rael_hp');
    expect(ups).toContain('rael_veteran');
    expect(ups).toContain('log_supply_cache');
    expect(ups).not.toContain('cmd_battle_hardened');
  });

  it('v2 → v3 sets selectedHeroId to "rael" when missing', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('v3 passes through', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 3, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
      selectedHeroId: 'pyro',
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('pyro');
  });

  it('setSelectedHero rejects unknown ids', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    mgr.setSelectedHero('not_a_hero');
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('getSelectedHero falls back to rael when stored id is unknown', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 3, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
      selectedHeroId: 'corrupt',
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('isHeroUnlocked: rael always true', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.isHeroUnlocked('rael')).toBe(true);
  });

  it('isHeroUnlocked: engineer true after map index 2 has ≥1 star', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.isHeroUnlocked('engineer')).toBe(false);
    mgr.setStars(2, 1);
    expect(mgr.isHeroUnlocked('engineer')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- src/systems/SaveManager.test.js`
Expected: FAIL — getSelectedHero/setSelectedHero/isHeroUnlocked do not exist, version 3 not handled.

- [ ] **Step 3: Update `src/systems/SaveManager.js`**

Read the current file. Key changes:
- Add `import { HEROES } from '../data/heroes.js';` at top.
- Change `const VERSION = 2;` to `const VERSION = 3;`.
- Update `freshEnvelope()`:
  ```js
  function freshEnvelope() {
    return {
      version:        VERSION,
      maps:           new Array(MAP_COUNT).fill(0),
      upgrades:       [],
      stats:          { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
      settings:       { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false },
      selectedHeroId: 'rael',
    };
  }
  ```
- Add migration helper at module scope:
  ```js
  const CMD_TO_RAEL = {
    'cmd_battle_hardened': 'rael_hp',
    'cmd_veteran':         'rael_veteran',
    'cmd_rapid_redeploy':  'rael_rapid_redeploy',
    'cmd_elite':           'rael_elite',
  };
  function migrateV2toV3(env) {
    return {
      ...env,
      version: 3,
      upgrades: (env.upgrades || []).map(id => CMD_TO_RAEL[id] ?? id),
      selectedHeroId: env.selectedHeroId ?? 'rael',
    };
  }
  ```
- Update `_load()`'s version-check branch (currently accepts `version === 1 || version === VERSION`). Update to accept v1, v2, v3 and route through migrations:
  ```js
  if (parsed && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT
      && (parsed.version === 1 || parsed.version === 2 || parsed.version === 3)) {
    let normalized = this._normalize(parsed);
    if (parsed.version === 1) {
      // v1 has already been promoted to v2 envelope shape by _normalize; bump v2→v3 too
      normalized = migrateV2toV3({ ...normalized, version: 2 });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } else if (parsed.version === 2) {
      normalized = migrateV2toV3(normalized);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }
  ```
- Update `_normalize(parsed)` to preserve `selectedHeroId` when present:
  ```js
  if (typeof parsed.selectedHeroId === 'string') env.selectedHeroId = parsed.selectedHeroId;
  ```
- Add the new API methods to the class:
  ```js
  getSelectedHero() {
    const id = this._data.selectedHeroId;
    return (id && HEROES[id]) ? id : 'rael';
  }
  setSelectedHero(id) {
    if (!HEROES[id]) return;
    this._data.selectedHeroId = id;
    this._save();
  }
  isHeroUnlocked(heroId) {
    const def = HEROES[heroId];
    if (!def) return false;
    if (def.unlockMapAfter == null) return true;
    return this.getStars(def.unlockMapAfter) > 0;
  }
  ```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- src/systems/SaveManager.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "$(cat <<'EOF'
feat(save): v3 envelope adds selectedHeroId + cmd_* → rael_* migration

SaveManager bumps version to 3 with new selectedHeroId field (defaults
to 'rael'). v1 saves migrate through v2→v3. v2 saves rename cmd_*
upgrade ids to rael_*. v3 passes through.

New API:
- getSelectedHero() — defensive fallback to 'rael' on unknown id
- setSelectedHero(id) — rejects unknown ids
- isHeroUnlocked(heroId) — true if unlockMapAfter is null OR target map has ≥1 star

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Upgrades restructure (16 hero nodes + heroUnlock gate)

**Files:**
- Modify: `src/data/upgrades.js`
- Modify: `src/data/upgrades.test.js`
- Modify: `src/systems/UpgradeManager.js`
- Modify: `src/systems/UpgradeManager.test.js`

- [ ] **Step 1: Update upgrade-tree shape**

Replace `src/data/upgrades.js` with:

```js
export const UPGRADES = [
  // ─── Rael ───
  { id: 'rael_hp',             branch: 'rael',     name: 'Battle-Hardened',
    effect: 'Rael +50 max HP',           cost: 2, requires: null },
  { id: 'rael_rapid_redeploy', branch: 'rael',     name: 'Rapid Redeployment',
    effect: 'Rael respawn −6s',          cost: 3, requires: 'rael_hp' },
  { id: 'rael_veteran',        branch: 'rael',     name: 'Veteran Commander',
    effect: 'Rael starts at L2',         cost: 4, requires: 'rael_hp' },
  { id: 'rael_elite',          branch: 'rael',     name: 'Elite Commander',
    effect: 'Rael starts at L3',         cost: 6, requires: 'rael_veteran', starThreshold: 15 },

  // ─── Engineer (hero-gated) ───
  { id: 'engineer_hp',             branch: 'engineer', name: 'Reinforced Plating',
    effect: 'Engineer +40 max HP',       cost: 2, requires: null,                  heroUnlock: 'engineer' },
  { id: 'engineer_rapid_redeploy', branch: 'engineer', name: 'Field Recovery',
    effect: 'Engineer respawn −6s',      cost: 3, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_veteran',        branch: 'engineer', name: 'Field-Tested',
    effect: 'Engineer starts at L2',     cost: 4, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_elite',          branch: 'engineer', name: 'Master Engineer',
    effect: 'Engineer starts at L3',     cost: 6, requires: 'engineer_veteran',    heroUnlock: 'engineer', starThreshold: 15 },

  // ─── Scout (hero-gated) ───
  { id: 'scout_hp',             branch: 'scout',    name: 'Lightweight Armor',
    effect: 'Scout +30 max HP',          cost: 2, requires: null,                  heroUnlock: 'scout' },
  { id: 'scout_rapid_redeploy', branch: 'scout',    name: 'Quick Recovery',
    effect: 'Scout respawn −6s',         cost: 3, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_veteran',        branch: 'scout',    name: 'Pathfinder',
    effect: 'Scout starts at L2',        cost: 4, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_elite',          branch: 'scout',    name: 'Master Scout',
    effect: 'Scout starts at L3',        cost: 6, requires: 'scout_veteran',       heroUnlock: 'scout', starThreshold: 15 },

  // ─── Pyromancer (hero-gated) ───
  { id: 'pyro_hp',             branch: 'pyro',     name: 'Heat Resistance',
    effect: 'Pyromancer +35 max HP',     cost: 2, requires: null,                  heroUnlock: 'pyro' },
  { id: 'pyro_rapid_redeploy', branch: 'pyro',     name: 'Reignition',
    effect: 'Pyromancer respawn −6s',    cost: 3, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_veteran',        branch: 'pyro',     name: 'Pyrokinetic',
    effect: 'Pyromancer starts at L2',   cost: 4, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_elite',          branch: 'pyro',     name: 'Master Pyromancer',
    effect: 'Pyromancer starts at L3',   cost: 6, requires: 'pyro_veteran',        heroUnlock: 'pyro', starThreshold: 15 },

  // ─── Logistics ───
  { id: 'log_supply_cache',  branch: 'logistics', name: 'Supply Cache',
    effect: '+40 starting gold',         cost: 2, requires: null },
  { id: 'log_deep_reserves', branch: 'logistics', name: 'Deep Reserves',
    effect: '+80 starting gold',         cost: 3, requires: 'log_supply_cache' },
  { id: 'log_bounty',        branch: 'logistics', name: 'Bounty Protocol',
    effect: '+20% gold from kills',      cost: 4, requires: 'log_supply_cache' },
  { id: 'log_garrison',      branch: 'logistics', name: 'Garrison Command',
    effect: '+2 starting lives',         cost: 4, requires: 'log_bounty', starThreshold: 15 },

  // ─── Arsenal ───
  { id: 'ars_munitions',  branch: 'arsenal', name: 'Munitions Discount',
    effect: 'Towers cost 10% less',      cost: 3, requires: null },
  { id: 'ars_optics',     branch: 'arsenal', name: 'Targeting Optics',
    effect: 'All towers +8% range',      cost: 3, requires: 'ars_munitions' },
  { id: 'ars_recruits',   branch: 'arsenal', name: 'Hardened Recruits',
    effect: 'Soldiers +30 max HP',       cost: 3, requires: 'ars_munitions' },
  { id: 'ars_overcharge', branch: 'arsenal', name: 'Overcharged Rounds',
    effect: 'All towers +6% damage',     cost: 5, requires: 'ars_optics', starThreshold: 15 },
  { id: 'ars_drills',     branch: 'arsenal', name: 'Combat Drills',
    effect: 'Soldiers respawn 25% faster', cost: 3, requires: 'ars_recruits' },
];
```

- [ ] **Step 2: Update `src/data/upgrades.test.js`**

Replace with structure-aware assertions:

```js
import { describe, it, expect } from 'vitest';
import { UPGRADES } from './upgrades.js';
import { HERO_ORDER } from './heroes.js';

describe('UPGRADES — per-hero branches', () => {
  it('has exactly 25 nodes', () => {
    expect(UPGRADES.length).toBe(25);
  });

  it('every hero has a 4-node branch (hp, rapid_redeploy, veteran, elite)', () => {
    for (const heroId of HERO_ORDER) {
      const branch = UPGRADES.filter(n => n.branch === heroId);
      expect(branch.length).toBe(4);
      expect(branch.map(n => n.id).sort()).toEqual([
        `${heroId}_elite`, `${heroId}_hp`, `${heroId}_rapid_redeploy`, `${heroId}_veteran`,
      ]);
    }
  });

  it('every non-rael hero node has heroUnlock matching its branch', () => {
    for (const heroId of ['engineer','scout','pyro']) {
      for (const n of UPGRADES.filter(u => u.branch === heroId)) {
        expect(n.heroUnlock).toBe(heroId);
      }
    }
  });

  it('rael nodes have no heroUnlock (available from start)', () => {
    for (const n of UPGRADES.filter(u => u.branch === 'rael')) {
      expect(n.heroUnlock).toBeUndefined();
    }
  });

  it('every prereq points at a real node', () => {
    const ids = new Set(UPGRADES.map(u => u.id));
    for (const n of UPGRADES) {
      if (n.requires) expect(ids.has(n.requires)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run upgrades test — verify FAIL**

Run: `npm test -- src/data/upgrades.test.js`
Expected: FAIL — old `cmd_*` assertions vs new structure.

- [ ] **Step 4: Update UpgradeManager**

Edit `src/systems/UpgradeManager.js`:

Replace `getModifiers()` (no args) with:

```js
getModifiers(heroId) {
  const owned = this._owned();
  const has = id => owned.has(id);
  const mods = {
    heroMaxHpBonus: 0, heroStartLevel: 1, heroRespawnDelta: 0,
    startGoldBonus: 0, killGoldMult: 1.0, startLivesBonus: 0,
    towerCostMult: 1.0, towerRangeMult: 1.0, towerDamageMult: 1.0,
    soldierMaxHpBonus: 0, soldierRespawnMult: 1.0,
  };
  if (has('log_supply_cache'))    mods.startGoldBonus    += 40;
  if (has('log_deep_reserves'))   mods.startGoldBonus    += 80;
  if (has('log_bounty'))          mods.killGoldMult       = 1.2;
  if (has('log_garrison'))        mods.startLivesBonus    = 2;
  if (has('ars_munitions'))       mods.towerCostMult      = 0.9;
  if (has('ars_optics'))          mods.towerRangeMult     = 1.08;
  if (has('ars_overcharge'))      mods.towerDamageMult    = 1.06;
  if (has('ars_recruits'))        mods.soldierMaxHpBonus  = 30;
  if (has('ars_drills'))          mods.soldierRespawnMult = 0.75;
  const HERO_HP_BONUS = { rael: 50, engineer: 40, scout: 30, pyro: 35 };
  if (has(`${heroId}_hp`))             mods.heroMaxHpBonus   = HERO_HP_BONUS[heroId];
  if (has(`${heroId}_rapid_redeploy`)) mods.heroRespawnDelta = -6;
  if (has(`${heroId}_veteran`))        mods.heroStartLevel   = 2;
  if (has(`${heroId}_elite`))          mods.heroStartLevel   = 3;
  return mods;
}
```

Update `canPurchase(id)` — add `heroUnlock` gate. Locate the existing body and add before the final return:
```js
if (node.heroUnlock && !this._save.isHeroUnlocked(node.heroUnlock)) return false;
```

Update `getNodeState(id)` to return `'locked-hero'` (place this check before prereq/threshold checks):
```js
if (node.heroUnlock && !this._save.isHeroUnlocked(node.heroUnlock)) return 'locked-hero';
```

- [ ] **Step 5: Update UpgradeManager.test.js**

Append:

```js
describe('UpgradeManager — heroUnlock + heroId scoping', () => {
  it('canPurchase returns false for engineer node when Engineer is locked', () => {
    localStorage.clear();
    const save = new SaveManager();
    const mgr  = new UpgradeManager(save);
    expect(mgr.canPurchase('engineer_hp')).toBe(false);
  });

  it('canPurchase returns true for engineer_hp after Engineer unlocks and enough stars', () => {
    localStorage.clear();
    const save = new SaveManager();
    const mgr  = new UpgradeManager(save);
    save.setStars(0, 3); save.setStars(1, 3); save.setStars(2, 3);
    expect(mgr.canPurchase('engineer_hp')).toBe(true);
  });

  it('getNodeState returns "locked-hero" for engineer_hp when hero is locked', () => {
    localStorage.clear();
    const save = new SaveManager();
    const mgr  = new UpgradeManager(save);
    expect(mgr.getNodeState('engineer_hp')).toBe('locked-hero');
  });

  it('getModifiers(heroId) only applies the active hero\'s branch', () => {
    localStorage.clear();
    const save = new SaveManager();
    const mgr  = new UpgradeManager(save);
    save.setStars(0, 3); save.setStars(1, 3); save.setStars(2, 3);
    save.setPurchasedUpgrades(['rael_hp', 'engineer_hp']);
    expect(mgr.getModifiers('rael').heroMaxHpBonus).toBe(50);
    expect(mgr.getModifiers('engineer').heroMaxHpBonus).toBe(40);
    expect(mgr.getModifiers('scout').heroMaxHpBonus).toBe(0);
  });
});
```

- [ ] **Step 6: Run — verify PASS**

Run: `npm test -- src/data/upgrades.test.js src/systems/UpgradeManager.test.js`
Expected: PASS.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/data/upgrades.js src/data/upgrades.test.js src/systems/UpgradeManager.js src/systems/UpgradeManager.test.js
git commit -m "$(cat <<'EOF'
feat(upgrades): restructure into per-hero branches (16 hero nodes)

UPGRADES now has 25 nodes — 4 per hero × 4 heroes + 4 logistics +
5 arsenal. Each hero gets a symmetric branch: hp / rapid_redeploy /
veteran / elite. Non-Rael nodes carry heroUnlock matching their
upgradeBranchId so they can only be bought after the hero is unlocked.

UpgradeManager:
- getModifiers(heroId) only applies the active hero's branch nodes
- canPurchase gates on heroUnlock
- getNodeState returns 'locked-hero' for hero-gated nodes
- HERO_HP_BONUS table maps each hero to its node's HP delta

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: MapSelectScene hero picker

**Files:**
- Modify: `src/scenes/MapSelectScene.js`
- Modify: `index.html`
- Create: `src/scenes/MapSelectScene.heroPicker.test.js`

- [ ] **Step 1: Add markup + CSS to index.html**

Open `index.html`. Find the featured panel (search for `featured-tier` or `featured-play`). Insert this block immediately above the Play button (`<button id="featured-play">`):

```html
<div id="hero-picker">
  <div class="hero-picker-label">Commander:</div>
  <div class="hero-picker-cards" id="hero-picker-cards"></div>
</div>
```

Find the `<style>` block. Append:

```css
#hero-picker { margin: 14px 0; }
.hero-picker-label { font-size:11px; color:#aaa; margin-bottom:6px; letter-spacing:1px; }
.hero-picker-cards { display:flex; gap:10px; }
.hero-card { display:flex; flex-direction:column; align-items:center; padding:8px;
             border:2px solid #333; border-radius:6px; cursor:pointer; width:62px; }
.hero-card.locked { opacity:0.5; cursor:not-allowed; }
.hero-card.active { background:#1a2a3a; }
.hero-card-portrait { width:36px; height:36px; border-radius:50%; display:flex;
                      align-items:center; justify-content:center; font-weight:bold;
                      font-size:16px; margin-bottom:4px; }
.hero-card-name { font-size:10px; color:#ddd; }
.hero-card.locked .hero-card-portrait { background:#222; border:2px solid #444; color:#666; }
```

- [ ] **Step 2: Write failing picker test (no innerHTML — pure DOM API)**

Create `src/scenes/MapSelectScene.heroPicker.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { SaveManager } from '../systems/SaveManager.js';

function setupDom() {
  document.body.replaceChildren();
  const picker = document.createElement('div');
  picker.id = 'hero-picker';
  const label = document.createElement('div');
  label.className = 'hero-picker-label';
  label.textContent = 'Commander:';
  const cards = document.createElement('div');
  cards.id = 'hero-picker-cards';
  cards.className = 'hero-picker-cards';
  picker.append(label, cards);
  document.body.appendChild(picker);
}

describe('MapSelectScene._renderHeroPicker', () => {
  let scene, save;

  beforeEach(() => {
    setupDom();
    localStorage.clear();
    save  = new SaveManager();
    scene = new MapSelectScene();
    scene._saveMgr = save;
  });

  it('renders one card per hero in HERO_ORDER', () => {
    scene._renderHeroPicker();
    expect(document.querySelectorAll('.hero-card').length).toBe(4);
  });

  it('Rael is unlocked + active by default', () => {
    scene._renderHeroPicker();
    const rael = document.querySelectorAll('.hero-card')[0];
    expect(rael.classList.contains('locked')).toBe(false);
    expect(rael.classList.contains('active')).toBe(true);
  });

  it('Engineer card is locked when Map 3 (index 2) has 0 stars', () => {
    scene._renderHeroPicker();
    const eng = document.querySelectorAll('.hero-card')[1];
    expect(eng.classList.contains('locked')).toBe(true);
  });

  it('Engineer card unlocks after Map index 2 ≥1 star', () => {
    save.setStars(2, 1);
    scene._renderHeroPicker();
    const eng = document.querySelectorAll('.hero-card')[1];
    expect(eng.classList.contains('locked')).toBe(false);
  });

  it('clicking an unlocked card sets active and calls setSelectedHero', () => {
    save.setStars(2, 1);
    scene._renderHeroPicker();
    const cards = document.querySelectorAll('.hero-card');
    cards[1].click();
    expect(save.getSelectedHero()).toBe('engineer');
    scene._renderHeroPicker();
    expect(document.querySelectorAll('.hero-card')[1].classList.contains('active')).toBe(true);
  });

  it('clicking a locked card is a no-op', () => {
    scene._renderHeroPicker();
    document.querySelectorAll('.hero-card')[1].click();
    expect(save.getSelectedHero()).toBe('rael');
  });
});
```

- [ ] **Step 3: Run — verify FAIL**

Run: `npm test -- src/scenes/MapSelectScene.heroPicker.test.js`
Expected: FAIL — `_renderHeroPicker` not yet implemented.

- [ ] **Step 4: Update MapSelectScene.js**

Open `src/scenes/MapSelectScene.js`. Add imports:

```js
import { HEROES, HERO_ORDER } from '../data/heroes.js';
```

Add helper above the class:

```js
function toCssColor(hex) {
  return '#' + ('000000' + hex.toString(16)).slice(-6);
}
```

In `create()`, call the new picker render after `_renderStats()`:
```js
this._renderHeroPicker();
```

Add method:

```js
_renderHeroPicker() {
  const host = document.getElementById('hero-picker-cards');
  if (!host) return;
  host.replaceChildren();
  let selected = this._saveMgr.getSelectedHero();
  if (!this._saveMgr.isHeroUnlocked(selected)) {
    this._saveMgr.setSelectedHero('rael');
    selected = 'rael';
  }
  for (const heroId of HERO_ORDER) {
    const def      = HEROES[heroId];
    const unlocked = this._saveMgr.isHeroUnlocked(heroId);
    const card     = document.createElement('div');
    card.className = 'hero-card' + (unlocked ? '' : ' locked') + (heroId === selected ? ' active' : '');

    const portrait = document.createElement('div');
    portrait.className   = 'hero-card-portrait';
    portrait.style.background = toCssColor(def.bodyColor);
    portrait.style.border     = `2px solid ${toCssColor(def.strokeColor)}`;
    portrait.textContent = unlocked ? def.portraitChar : '🔒';
    if (unlocked) portrait.style.color = toCssColor(def.strokeColor);

    const name = document.createElement('div');
    name.className   = 'hero-card-name';
    name.textContent = def.shortName;

    card.append(portrait, name);
    if (unlocked) {
      card.addEventListener('click', () => {
        this._saveMgr.setSelectedHero(heroId);
        this._renderHeroPicker();
      });
    } else if (def.unlockMapAfter != null) {
      card.title = `Clear Map ${def.unlockMapAfter + 1} to unlock ${def.displayName}`;
    }
    host.appendChild(card);
  }
}
```

Update `_bindPlay()`:
```js
btn.addEventListener('click', () => {
  this.scene.start('GameScene', {
    mapId:  this._selectedId,
    heroId: this._saveMgr.getSelectedHero(),
  });
});
```

- [ ] **Step 5: Run — verify PASS**

Run: `npm test -- src/scenes/MapSelectScene.heroPicker.test.js`
Expected: PASS (6/6).

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Manual smoke**

Run: `npm run dev`. Open MapSelect. Verify all four hero cards render — Rael active, others locked with 🔒 icon. Hover locked card for tooltip. Click PLAY → game starts with Rael.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/MapSelectScene.js src/scenes/MapSelectScene.heroPicker.test.js index.html
git commit -m "$(cat <<'EOF'
feat(map-select): hero picker — 4 cards with unlock state

Renders a card per HERO_ORDER hero inside the featured panel. Each
card shows portrait (per-hero color) + short name, or a 🔒 icon when
locked with a tooltip "Clear Map N to unlock <Hero displayName>".
Clicking an unlocked card stores selectedHeroId via SaveManager and
flips the .active class. Clicking a locked card is a no-op.

_bindPlay passes heroId in scene.start so GameScene picks the right
hero for the run.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: UIScene dynamic hero HUD

**Files:**
- Modify: `src/scenes/UIScene.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Add the hud-init emission in GameScene**

At the end of `GameScene.create()`, before the existing `hero:level-up` delayedCall, add:

```js
this.game.events.emit('hero:hud-init', { heroId: this.heroId, def: this.hero.def });
```

Change the level-up delay to 200ms (was 150ms) so the HUD has time to process hud-init first:

```js
this.time.delayedCall(200, () => {
  this.game.events.emit('hero:level-up', { level: this.hero.level });
});
```

- [ ] **Step 2: Add UIScene handler + subscription**

In `src/scenes/UIScene.js`:

In the event-subscription block (search for the existing `hero:update` / `hero:level-up` subscriptions), add:
```js
this.game.events.on('hero:hud-init', this._onHeroHudInit, this);
```

In the cleanup block (the `.off()` calls in `shutdown()` and the early-exit list), add:
```js
this.game.events.off('hero:hud-init', this._onHeroHudInit, this);
```

Add helper method (anywhere on the class):
```js
toCssColor(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }
```

Add handler:
```js
_onHeroHudInit({ heroId, def }) {
  this._heroDef = def;

  const portrait = document.getElementById('hero-portrait');
  if (portrait) {
    portrait.textContent       = def.portraitChar;
    portrait.style.background  = this.toCssColor(def.bodyColor);
    portrait.style.borderColor = this.toCssColor(def.strokeColor);
    portrait.style.color       = this.toCssColor(def.strokeColor);
  }

  const levelEl = document.getElementById('hero-level');
  if (levelEl) levelEl.textContent = `${def.shortName} L1`;

  const fill = document.getElementById('hero-hp-fill');
  if (fill) fill.style.background = this.toCssColor(def.strokeColor);

  for (const slot of ['q','w','e']) {
    const a   = def.abilities[slot];
    const btn = document.getElementById(`ability-${slot}`);
    if (!btn) continue;
    const keyEl  = btn.querySelector('.ability-key');
    const nameEl = btn.querySelector('.ability-name');
    if (keyEl)  keyEl.textContent  = slot.toUpperCase();
    if (nameEl) nameEl.textContent = a.icon;
    btn.title = `${a.label} — ${a.tooltip}`;
    btn.classList.add('locked');
    btn.disabled = true;
  }
}
```

Update `_onHeroLevelUp({ level })` to read from cached def:

```js
_onHeroLevelUp({ level }) {
  const name = this._heroDef?.shortName ?? 'Rael';
  document.getElementById('hero-level').textContent = `${name} L${level}`;
  // existing per-slot unlock logic stays unchanged
}
```

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Verify HUD shows `Rael L1`, blue portrait, Q/W/E icons. Force a different hero start via devtools (`window.__game?.scene?.start('GameScene', { mapId: 0, heroId: 'engineer' })` if `__game` is exposed) and verify the HUD swaps icons + portrait letter + name prefix.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(ui): dynamic hero HUD swaps portrait/icons/tooltips per hero

GameScene emits hero:hud-init { heroId, def } after Hero construction.
UIScene caches _heroDef and rewrites:
- #hero-portrait textContent + per-hero background/border colors
- #hero-level prefix ('Dax L1' for engineer, etc.)
- #hero-hp-fill background color (per-hero stroke color)
- ability button icons + tooltips ('Q ⚡ Overcharge — +50% tower fire rate for 6s')

_onHeroLevelUp reads the cached def's shortName so subsequent level
labels match the active hero. Falls back to 'Rael' if no def cached
(defensive — should not occur in production).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: UpgradeTreeOverlay restructure (6 branches + locked-hero state)

**Files:**
- Modify: `src/ui/UpgradeTreeOverlay.js`

- [ ] **Step 1: Read the current overlay file**

Read `src/ui/UpgradeTreeOverlay.js` fully. Note how it currently renders the 3 branches (command, logistics, arsenal). Determine layout strategy — vertical sections vs columns vs tabs.

For v1: render all 6 branches vertically stacked (rael, engineer, scout, pyro, logistics, arsenal). If the overlay's outer container lacks scroll, add `style="overflow-y:auto; max-height:80vh"` to it.

- [ ] **Step 2: Update the branch list**

Replace the hardcoded branch list (likely something like `for (const branch of ['command','logistics','arsenal'])`) with:

```js
const BRANCHES = [
  { id: 'rael',      title: 'Commander Rael',  subtitle: 'Generalist bruiser' },
  { id: 'engineer',  title: 'Engineer Dax',    subtitle: 'Support / builder' },
  { id: 'scout',     title: 'Scout Vex',       subtitle: 'Ranged DPS / anti-air' },
  { id: 'pyro',      title: 'Pyromancer Mira', subtitle: 'AoE / burn' },
  { id: 'logistics', title: 'Logistics',       subtitle: 'Economy' },
  { id: 'arsenal',   title: 'Arsenal',         subtitle: 'Towers & soldiers' },
];

for (const b of BRANCHES) {
  // existing per-branch rendering, using b.id as the filter and b.title / b.subtitle for the heading
}
```

For locked-hero nodes (`mgr.getNodeState(id) === 'locked-hero'`), render the node grayed and set its tooltip:

```js
import { HEROES } from '../data/heroes.js';

// inside the per-node render loop:
const state = this._mgr.getNodeState(node.id);
if (state === 'locked-hero') {
  nodeEl.classList.add('locked-hero');
  const heroDef = HEROES[node.heroUnlock];
  nodeEl.title  = `🔒 Locked — clear Map ${heroDef.unlockMapAfter + 1} to unlock ${heroDef.displayName}`;
}
```

Add a `.upgrade-node.locked-hero` rule in the overlay's CSS (likely a `<style>` block in `index.html`, mirror existing `.locked-prereq` styling):

```css
.upgrade-node.locked-hero { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Open MapSelect → click Upgrades. Verify:
- 6 branch sections render in order
- Rael nodes are purchasable when stars are available
- Engineer/Scout/Pyro nodes show grayed with 🔒 + tooltip
- Clearing Map 3 unlocks Engineer's branch (test by setting `localStorage.lastlight_save` to give stars on Map 3 then reload)

- [ ] **Step 5: Commit**

```bash
git add src/ui/UpgradeTreeOverlay.js index.html
git commit -m "$(cat <<'EOF'
feat(ui): UpgradeTreeOverlay renders 6 branches (4 hero + logistics + arsenal)

Each hero branch shows under their displayName + role subtitle. Nodes
gated by heroUnlock render with locked-hero visual state — grayed +
🔒 icon + tooltip "Clear Map N to unlock <Hero>". Layout stays vertical
stack with scroll container.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: End-to-end verification + manual play-through

**Files:**
- None (verification only — no commit unless gaps surface)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run lint on changed files**

Run:
```
npx eslint src/data/heroes.js src/data/heroAbilities.js src/entities/Hero.js \
  src/entities/SentryTurret.js src/entities/Soldier.js src/entities/Enemy.js \
  src/systems/AreaEffectsManager.js src/systems/SaveManager.js src/systems/UpgradeManager.js \
  src/scenes/GameScene.js src/scenes/MapSelectScene.js src/scenes/UIScene.js \
  src/scenes/InspectController.js src/ui/UpgradeTreeOverlay.js src/data/upgrades.js \
  src/data/weaknessMatrix.js src/data/sourceBuilders.js
```
Expected: clean.

If lint fires, fix in the offending file and commit:
```bash
git commit -am "chore: lint fixups for hero roster"
```

- [ ] **Step 3: Start dev server**

Run: `npm run dev`
Open the displayed URL.

- [ ] **Step 4: Play one run as each hero**

For each of `rael`, `engineer`, `scout`, `pyro`:
- On MapSelect, select the hero (if locked, force-unlock by editing `localStorage.lastlight_save` to give yourself stars on the unlock map).
- Click PLAY → Map 1 (Beacon) is fine for short runs.
- Verify hero spawns with correct visual (color, silhouette, portrait letter).
- Verify ability button icons + tooltips match the hero.
- Fire each of Q / W / E:
  - **Rael**: Q overcharge (tower fire rate visibly jumps), W airstrike (click → AoE), E EMP (all enemies stun).
  - **Engineer**: Q repair (HP bar refills), W deploy turret (gray sentry appears, shoots, despawns), E power surge (nearby towers fire rapidly for 8s).
  - **Scout**: Q mark (aim → click enemy, marked takes 2× damage next hit), W volley (multiple arrows fire), E phase sprint (hero moves visibly faster for 4s).
  - **Pyromancer**: Q flame wave (orange cone, enemies catch fire), W immolate (orange ring around hero, ticks damage to nearby enemies), E firefield (click ground → fire pool).
- Verify level-up to L2 unlocks W, L3 unlocks E.
- Verify hero death → respawn after `respawnTime` seconds.
- Click an enemy → InspectController panel shows correct hero in `Vulnerable to` if matchup applies.

- [ ] **Step 5: Reload mid-session preserves selected hero**

Pick Engineer on MapSelect. Refresh the browser. Open MapSelect. Verify Engineer card is still `.active`.

- [ ] **Step 6: Locked hero cards behave correctly**

In a clean save (`localStorage.clear()` then reload), verify:
- Engineer/Scout/Pyro cards are grayed + 🔒.
- Hovering shows correct tooltip.
- Clicking does nothing.

- [ ] **Step 7: Stop dev server**

Ctrl-C the dev server.

- [ ] **Step 8: If everything passes, mark complete. If gaps surface, fix and commit.**

No commit if verification is clean.

---

## Task 22: Cleanup pass — remove transitional back-compat

**Files:**
- Modify: `src/data/sourceBuilders.js`
- Modify: `src/data/weaknessMatrix.js`
- Modify: `src/entities/Hero.js`

- [ ] **Step 1: Grep for any remaining consumers of the back-compat shims**

Run:
```
grep -rn "HERO_MULTIPLIERS\|HERO_STATS\|heroAirstrikeSource" src/
```

Expected: only the back-compat declarations themselves. If any consumer still references these, fix that consumer first.

- [ ] **Step 2: Remove HERO_STATS export from Hero.js**

Delete:
```js
export const HERO_STATS = HEROES.rael.stats;
```

- [ ] **Step 3: Remove heroAirstrikeSource alias from sourceBuilders.js**

Delete the `heroAirstrikeSource` export.

- [ ] **Step 4: Remove HERO_MULTIPLIERS back-compat re-export from weaknessMatrix.js**

Delete:
```js
export const HERO_MULTIPLIERS = HEROES.rael.matchups;
```

- [ ] **Step 5: Optional — remove legacy slot timer getters/setters from Hero.js**

Grep:
```
grep -rn "overchargeTimer\|airstrikeTimer\|empTimer" src/ --include="*.js"
```

Expected consumers: only `Hero.js` itself. If any other file accesses these by name, migrate that consumer to use `hero._timers[slot]`. Once clean, delete the getter/setter pairs.

If any consumer still depends on the legacy fields and refactoring is non-trivial, keep the getters and skip this step. Document in commit message.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Run lint**

Run: `npx eslint src/`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/data/sourceBuilders.js src/data/weaknessMatrix.js src/entities/Hero.js
git commit -m "$(cat <<'EOF'
chore(hero): remove transitional back-compat shims

After every consumer migrated to the data-driven hero registry, drop:
- HERO_STATS export from Hero.js (consumers now read hero.def.stats)
- HERO_MULTIPLIERS re-export from weaknessMatrix.js (consumers use HEROES[id].matchups)
- heroAirstrikeSource alias from sourceBuilders.js (callers use heroAbilitySource)
- legacy overchargeTimer/airstrikeTimer/empTimer getters on Hero (if no consumers remain)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

This plan was self-reviewed against the spec along these axes:

1. **Spec coverage:**
   - §3 file map → T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20.
   - §4 registry schema → T7 (Rael), T13–T15 (others); contract test in T7.
   - §5 the four heroes → T7 (Rael), T13 (Engineer), T14 (Scout), T15 (Pyromancer).
   - §6 new mechanical systems → T3, T4 (statuses), T5 (AreaEffectsManager), T6 (SentryTurret), T9 (cloaked/facingX/attackDamageMult/onHit), T13 (sentries wiring), T15 (area effects wiring).
   - §7 save format & migration → T16.
   - §8 upgrade tree restructure → T17.
   - §9 HUD/UI → T18 (picker), T19 (UIScene), T20 (overlay), T12 (Inspect).
   - §10 testing strategy → all tasks include TDD tests; T21 covers manual gate.
   - §11 out-of-scope → respected (no sprite assets, no per-hero SFX, no cinematics).
   - §12 file checklist → covered by file map above.

2. **Type/method consistency:**
   - `fireAbility(slot, aimTarget?)` defined in T9, called in T10 (`_onAbility`), T13–T15 (handler stubs).
   - `_timers[slot]` defined in T9, read in T12 (InspectController).
   - `_facingX`, `_moveSpeedMult`, `_attackDamageMult`, `cloaked`, `_cloakTimer` all defined in T9, set by T14 (Scout Phase Sprint), T15 (Pyro Immolate).
   - `HEROES`, `HERO_ORDER` defined in T7, consumed by T11, T12, T16, T17, T18, T19, T20.
   - `getModifiers(heroId)` signature consistent across T10 call site, T17 definition.
   - `isHeroUnlocked(heroId)` defined in T16, consumed by T17 (UpgradeManager), T18 (MapSelectScene).

3. **No placeholders / TBDs:** every step includes either a code block (for code changes), a shell command + expected outcome (for verifications), or an exact commit message (for commits).

4. **Spec deviation explicitly documented** in the top-of-plan deviation block (path-restriction not yet merged; `_facingX` derives from `x >= this.x` not from `pathProgress`; cloaked is forward-compat only).
