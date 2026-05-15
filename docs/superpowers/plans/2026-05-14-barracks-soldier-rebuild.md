# Barracks / Soldier System Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Barracks tower so it deploys soldiers onto the path that block enemies in melee, take damage, die, and respawn — plus restore the branch picker UI and fix the tier-4 upgrade bug.

**Architecture:** No TowerPlacementManager — Barracks integrates directly into the existing `this.towers[]` array. GameScene orchestrates all soldier blocking (enemies don't touch the towers array). `Barracks` extends `Tower` and owns a `soldiers[]` array. Soldier positioning is stored as a 0–1 path-progress float and translated to world coordinates via `PathManager.getNearestPathProgress`.

**Tech Stack:** Phaser.js 3 (Containers, Graphics), Vite/ES modules, Vitest+jsdom for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-13-barracks-soldier-rebuild.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/towers.js` | Modify | Restore `soldierStats` object on barracks def |
| `src/systems/PathManager.js` | Modify | Add `getPathPoints` + `getNearestPathProgress` |
| `src/systems/PathManager.test.js` | Modify | 4 new tests for above (TDD) |
| `src/entities/Tower.js` | Modify | Fix `upgrade()` to resolve `tier4A`/`tier4B` keys |
| `src/entities/Soldier.js` | Create | Path-positioned melee unit with HP bar + respawn timer |
| `src/entities/Barracks.js` | Create | Extends Tower; owns soldiers[], handles spawn/reposition/rebuild |
| `src/scenes/GameScene.js` | Modify | Barracks placement dispatch, targeting skip, blocking loop, reposition mode |
| `src/scenes/UIScene.js` | Modify | Branch picker, Barracks stats panel, reposition button |
| `index.html` | Modify | Move `panel-lvl` outside `panel-std-stats` so it shows for Barracks |

---

## Task 1: Restore `soldierStats` on barracks def

**Files:**
- Modify: `src/data/towers.js`

The existing `barracks` entry has flat combat stats (`damage: 20, fireRate: 1.2`) which make it behave as a regular tower. Replace the entire `barracks` entry with the correct structure: `soldierStats` as a nested object, flat combat fields zeroed out to satisfy the tower test suite.

- [ ] **Replace the `barracks` entry in `src/data/towers.js`**

Find and replace the entire `barracks: { ... }` block (lines 47–55) with:

```js
  barracks: {
    name: 'Barracks', icon: '⚔️', cost: 100, color: 0x4caf50,
    range: 130,
    damage: 0, fireRate: 0, splashRadius: 0, pierce: false, slow: 0,
    soldierStats: {
      tier1:  { count: 3, hp: 15, damage: 20, respawnDuration: 3,   canBlockFlyers: false },
      tier2:  { count: 3, hp: 25, damage: 35, respawnDuration: 3,   canBlockFlyers: false },
      tier3:  { count: 3, hp: 40, damage: 55, respawnDuration: 3,   canBlockFlyers: false },
      tier4A: { count: 3, hp: 80, damage: 80, respawnDuration: 3,   canBlockFlyers: true  },
      tier4B: { count: 4, hp: 40, damage: 55, respawnDuration: 1.5, canBlockFlyers: false },
    },
    tier2: { cost: 65,  label: 'Drill Sergeant' },
    tier3: { cost: 95,  label: 'Elite Guard' },
    tier4A: { cost: 140, label: 'Vanguard',       passiveEffect: 'Soldiers block flying enemies too' },
    tier4B: { cost: 140, label: 'Rapid Response', passiveEffect: '4 soldiers; respawn time halved' },
    ability: { label: 'Reinforce', cooldown: 15, description: '+2 soldiers for 15s' },
  },
```

- [ ] **Run the existing test suite — confirm all tests pass**

```bash
npm test
```

Expected: all tests pass. The existing `towers.test.js` validates `damage`, `fireRate`, etc. exist — they do (zeroed). If any test fails, fix before continuing.

- [ ] **Commit**

```bash
git add src/data/towers.js
git commit -m "feat: restore soldierStats on barracks def, zero out flat combat fields"
```

---

## Task 2: PathManager additions (TDD)

**Files:**
- Modify: `src/systems/PathManager.test.js`
- Modify: `src/systems/PathManager.js`

The existing test fixture uses a 100×100 canvas with waypoints `[[0,0],[1,0],[1,1]]`, producing path points `(0,0)→(100,0)→(100,100)` — an L-shape with total length 200. The elbow at `(100,0)` is at progress 0.5.

- [ ] **Append 4 failing tests to `src/systems/PathManager.test.js`**

Add these inside the existing `describe('PathManager', ...)` block, after the last `it(...)`:

```js
  it('getPathPoints returns the path array', () => {
    expect(pm.getPathPoints()).toBe(pm.path);
  });

  it('getNearestPathProgress returns 0 at path start', () => {
    expect(pm.getNearestPathProgress(0, 0)).toBeCloseTo(0, 5);
  });

  it('getNearestPathProgress returns 1 at path end', () => {
    expect(pm.getNearestPathProgress(100, 100)).toBeCloseTo(1, 5);
  });

  it('getNearestPathProgress returns 0.5 at elbow of L-path', () => {
    // L-path (0,0)→(100,0)→(100,100), total len=200, elbow at (100,0) = 100/200
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 5);
  });
```

- [ ] **Run tests — confirm exactly 4 failures**

```bash
npm test
```

Expected: 4 failures with "pm.getPathPoints is not a function" or similar.

- [ ] **Add both methods to `src/systems/PathManager.js`** — append inside the class after `renderPath`:

```js
  getPathPoints() {
    return this.path;
  }

  getNearestPathProgress(x, y) {
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const len = Math.hypot(
        this.path[i + 1].x - this.path[i].x,
        this.path[i + 1].y - this.path[i].y
      );
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return 0;
    let bestDist = Infinity, bestProgress = 0, accumulated = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
        ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestProgress = (accumulated + t * segLens[i]) / totalLen;
      }
      accumulated += segLens[i];
    }
    return bestProgress;
  }
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

Expected: all tests pass (was N tests, now N+4).

- [ ] **Commit**

```bash
git add src/systems/PathManager.js src/systems/PathManager.test.js
git commit -m "feat: add PathManager.getPathPoints and getNearestPathProgress"
```

---

## Task 3: Fix `Tower.upgrade()` for tier-4 branches

**Files:**
- Modify: `src/entities/Tower.js`

Currently `upgrade(tier, branch)` resolves the tier key as `'tier' + tier`, which gives `'tier4'` — a key that doesn't exist (the real keys are `'tier4A'` and `'tier4B'`). This silently does nothing when a T4 upgrade is attempted.

- [ ] **Replace the `upgrade` method in `src/entities/Tower.js`** (lines 46–58):

```js
  upgrade(tier, branch = null) {
    const key     = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    const tierDef = TOWER_DEFS[this.type][key];
    if (!tierDef) return;
    this.level = tier;
    if (branch)                             this.branch       = branch;
    if (tierDef.damage       !== undefined) this.damage       = tierDef.damage;
    if (tierDef.range        !== undefined) this.range        = tierDef.range;
    if (tierDef.splashRadius !== undefined) this.splashRadius = tierDef.splashRadius;
    if (tierDef.slow         !== undefined) this.slow         = tierDef.slow;
    if (tierDef.fireRate     !== undefined) this.fireRate     = tierDef.fireRate;
    if (tierDef.pierce       !== undefined) this.pierce       = tierDef.pierce;
    this._redraw();
  }
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

- [ ] **Commit**

```bash
git add src/entities/Tower.js
git commit -m "fix: resolve tier4A/tier4B keys correctly in Tower.upgrade"
```

---

## Task 4: Create `Soldier.js`

**Files:**
- Create: `src/entities/Soldier.js`

No unit tests — browser verified after Task 6 when Barracks placement is wired.

- [ ] **Create `src/entities/Soldier.js`**

```js
import Phaser from 'phaser';

export class Soldier extends Phaser.GameObjects.Container {
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats }) {
    super(scene, 0, 0);

    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = soldierStats.hp;
    this.maxHp           = soldierStats.hp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierStats.respawnDuration;
    this.canBlockFlyers  = soldierStats.canBlockFlyers;
    this.attackRate      = 1;
    this.attackTimer     = 0;
    this.dead            = false;
    this.respawnTimer    = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(3);

    this._drawBody();
    this.setPathProgress(pathProgress, pathPoints);
  }

  _drawBody() {
    this._body.clear();
    this._body.fillStyle(0x4caf50, 1);
    this._body.fillCircle(0, -8, 4);
    this._body.fillRect(-3, -4, 6, 8);
    this._body.lineStyle(1, 0x81c784, 1);
    this._body.strokeCircle(0, -8, 4);
  }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 14, h = 2, ox = -7, oy = -17;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(0x4caf50, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  setPathProgress(progress, pathPoints) {
    this.pathProgress = progress;
    let totalLen = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      totalLen += Math.hypot(
        pathPoints[i + 1].x - pathPoints[i].x,
        pathPoints[i + 1].y - pathPoints[i].y
      );
    }
    let target = progress * totalLen;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dx  = pathPoints[i + 1].x - pathPoints[i].x;
      const dy  = pathPoints[i + 1].y - pathPoints[i].y;
      const len = Math.hypot(dx, dy);
      if (target <= len || i === pathPoints.length - 2) {
        const t = len > 0 ? Math.min(1, target / len) : 0;
        this.x = pathPoints[i].x + t * dx;
        this.y = pathPoints[i].y + t * dy;
        return;
      }
      target -= len;
    }
    this.x = pathPoints[pathPoints.length - 1].x;
    this.y = pathPoints[pathPoints.length - 1].y;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this.respawnDuration;
      this._body.setVisible(false);
      this._hpBar.clear();
    }
  }

  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    this._body.setVisible(true);
    this._redrawHpBar();
  }

  update(dt) {
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (!this.dead) return;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) this.respawn();
  }
}
```

- [ ] **Run tests — confirm all still pass**

```bash
npm test
```

- [ ] **Commit**

```bash
git add src/entities/Soldier.js
git commit -m "feat: add Soldier entity with HP bar and respawn timer"
```

---

## Task 5: Create `Barracks.js`

**Files:**
- Create: `src/entities/Barracks.js`

- [ ] **Create `src/entities/Barracks.js`**

```js
import { Tower } from './Tower.js';
import { Soldier } from './Soldier.js';
import { TOWER_DEFS } from '../data/towers.js';

export class Barracks extends Tower {
  constructor(scene, { type, x, y, def, zoneIndex }) {
    super(scene, { type, x, y, def, zoneIndex });
    this.soldiers            = [];
    this.soldierPathProgress = 0.5;
    this.soldierStats        = def.soldierStats.tier1;
  }

  spawnSoldiers(scene, pathPoints) {
    for (let i = 0; i < this.soldierStats.count; i++) {
      this.soldiers.push(new Soldier(scene, {
        barracks:     this,
        pathProgress: this.soldierPathProgress,
        pathPoints,
        soldierStats: this.soldierStats,
      }));
    }
  }

  repositionSoldiers(newProgress, pathPoints) {
    this.soldierPathProgress = newProgress;
    for (const soldier of this.soldiers) {
      soldier.setPathProgress(newProgress, pathPoints);
    }
  }

  upgrade(tier, branch = null) {
    super.upgrade(tier, branch);
    const key         = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    this.soldierStats = TOWER_DEFS.barracks.soldierStats[key] ?? this.soldierStats;
  }

  _rebuildSoldiers(scene, pathPoints) {
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    this.spawnSoldiers(scene, pathPoints);
  }

  destroy() {
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    super.destroy();
  }
}
```

- [ ] **Run tests — confirm all still pass**

```bash
npm test
```

- [ ] **Commit**

```bash
git add src/entities/Barracks.js
git commit -m "feat: add Barracks entity extending Tower with soldier management"
```

---

## Task 6: GameScene — Barracks placement dispatch and upgrade wiring

**Files:**
- Modify: `src/scenes/GameScene.js`

This wires Barracks into the existing placement, upgrade, and targeting flows. No soldier combat yet — that's Task 7.

- [ ] **Add `Barracks` import at the top of `src/scenes/GameScene.js`** (after the `Tower` import):

```js
import { Barracks } from '../entities/Barracks.js';
```

- [ ] **Replace the tower placement block in `_onPointerDown`**

Find this block (around line 265):
```js
        if (!this.economy.spend(def.cost)) { this._toast('Not enough gold!'); return; }
        this.towers.push(new Tower(this, {
          type: this.selectedType, x: zone.cx, y: zone.cy, def,
          zoneIndex: this.pathMgr.buildZones.indexOf(zone),
        }));
        zone.occupied = true;
        this._redrawZones();
        return;
```

Replace with:
```js
        if (!this.economy.spend(def.cost)) { this._toast('Not enough gold!'); return; }
        const zoneIndex = this.pathMgr.buildZones.indexOf(zone);
        let tower;
        if (this.selectedType === 'barracks') {
          tower = new Barracks(this, { type: this.selectedType, x: zone.cx, y: zone.cy, def, zoneIndex });
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(zone.cx, zone.cy);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        } else {
          tower = new Tower(this, { type: this.selectedType, x: zone.cx, y: zone.cy, def, zoneIndex });
        }
        this.towers.push(tower);
        zone.occupied = true;
        this._redrawZones();
        return;
```

- [ ] **Add fireRate guard at top of the `for` loop in `_updateTowers`**

Find the loop body (around line 163):
```js
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
```

Replace with:
```js
    for (const tower of this.towers) {
      if (!tower.fireRate) continue;
      tower.cooldown = Math.max(0, tower.cooldown - dt);
```

- [ ] **Replace `_upgradeSelectedTower` in `src/scenes/GameScene.js`**

```js
  _upgradeSelectedTower(branch = null) {
    if (!this.selectedTower) return;
    const tower     = this.selectedTower;
    const def       = TOWER_DEFS[tower.type];
    const map       = MAPS[this.mapId];
    const nextLevel = tower.level + 1;
    if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
    const key     = nextLevel === 4 && branch ? `tier4${branch}` : `tier${nextLevel}`;
    const tierDef = def[key];
    if (!tierDef || !this.economy.spend(tierDef.cost)) { this._toast('Not enough gold!'); return; }
    tower.totalCost += tierDef.cost;
    tower.upgrade(nextLevel, branch);
    if (tower.type === 'barracks') {
      tower._rebuildSoldiers(this, this.pathMgr.getPathPoints());
    }
    this.game.events.emit('tower:panel-open', {
      tower, def, x: this._panelX, y: this._panelY, mapId: this.mapId,
    });
  }
```

- [ ] **Update the `ui:tower-upgrade` listener in `create()` to pass branch**

Find:
```js
    this.game.events.on('ui:tower-upgrade',     () => this._upgradeSelectedTower(),                this);
```

Replace with:
```js
    this.game.events.on('ui:tower-upgrade', ({ branch } = {}) => this._upgradeSelectedTower(branch ?? null), this);
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

- [ ] **Start dev server and verify in browser**

```bash
npm run dev
```

Open http://localhost:5173 → start Map 1 → select Barracks (⚔️) → click a build zone. Three small green humanoid shapes should appear on the path near the placement point. Barracks tower icon should appear on the zone. No projectiles should fire from the Barracks.

- [ ] **Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: wire Barracks placement dispatch, targeting skip, and upgrade branch support"
```

---

## Task 7: GameScene — soldier blocking loop

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Add module-level constants at the top of `src/scenes/GameScene.js`** (after imports, before the class):

```js
const ENEMY_MELEE_DAMAGE = 20;
const MELEE_RANGE        = 30;
```

- [ ] **Add `_checkSoldierBlock` method to `GameScene`** (after `_updateTowers`):

```js
  _checkSoldierBlock(enemy) {
    for (const tower of this.towers) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) {
        if (soldier.dead) continue;
        if (enemy.def.flying && !soldier.canBlockFlyers) continue;
        if (Math.hypot(enemy.x - soldier.x, enemy.y - soldier.y) < MELEE_RANGE) return soldier;
      }
    }
    return null;
  }
```

- [ ] **Add `_updateSoldiers` method to `GameScene`** (after `_checkSoldierBlock`):

```js
  _updateSoldiers(dt) {
    for (const tower of this.towers) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) soldier.update(dt);
    }
  }
```

- [ ] **Update `_updateEnemies` to call the blocking check**

Find the `for (const enemy of this.enemies)` loop. After `enemy.update(dt);` and before the `let rem = ...` movement block, insert:

```js
      const blocker = this._checkSoldierBlock(enemy);
      if (blocker) {
        blocker.takeDamage(ENEMY_MELEE_DAMAGE * dt);
        if (blocker.attackTimer <= 0) {
          this._dealDamage(enemy, blocker.damage, false);
          blocker.attackTimer = 1 / blocker.attackRate;
        }
        if (enemy.dead) continue;
        continue;
      }
```

- [ ] **Call `_updateSoldiers` from `update()`** — add after `this._updateProjectiles(dt)`:

```js
    this._updateSoldiers(dt);
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

- [ ] **Verify in browser**

Place a Barracks, send a wave. Enemies should stop when they reach a soldier and enter melee combat:
- Soldiers' HP bars shrink as enemies attack
- When a soldier's HP reaches 0 it disappears
- After 3 seconds it reappears with full HP
- Enemies continue moving while a soldier is dead
- Kill counter and gold update correctly when soldiers kill enemies

- [ ] **Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: implement soldier blocking — enemies halt and fight soldiers in melee"
```

---

## Task 8: GameScene — reposition mode

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Add reposition state fields in `create()`** — after `this.selectedTower = null`:

```js
    this.repositionMode        = false;
    this.repositioningBarracks = null;
```

- [ ] **Add `ui:barracks-reposition` listener in `create()`** — after the `ui:tower-sell` listener:

```js
    this.game.events.on('ui:barracks-reposition', () => {
      if (!this.selectedTower || this.selectedTower.type !== 'barracks') return;
      this.repositionMode        = true;
      this.repositioningBarracks = this.selectedTower;
      this._redrawZones();
      this._toast('Click on the path within Barracks range to reposition soldiers');
    }, this);
```

- [ ] **Add cleanup in `shutdown()`** — after the `ui:tower-sell` off-call:

```js
    this.game.events.off('ui:barracks-reposition', null, this);
```

- [ ] **Update `_redrawZones()` to add the reposition overlay**

Append at the end of `_redrawZones()`, after the zone-drawing loop:

```js
    if (this.repositionMode && this.repositioningBarracks) {
      const b = this.repositioningBarracks;
      this.zoneGfx.lineStyle(2, 0x4fc3f7, 0.7);
      this.zoneGfx.strokeCircle(b.x, b.y, b.range);
      for (const pt of this.pathMgr.getPathPoints()) {
        if (Math.hypot(pt.x - b.x, pt.y - b.y) <= b.range) {
          this.zoneGfx.fillStyle(0x4fc3f7, 0.45);
          this.zoneGfx.fillCircle(pt.x, pt.y, 6);
        }
      }
    }
```

- [ ] **Update `_onPointerDown` to handle reposition clicks**

Add this block at the very top of `_onPointerDown`, before the existing tower-click loop:

```js
    if (this.repositionMode && this.repositioningBarracks) {
      const barracks = this.repositioningBarracks;
      this.repositionMode        = false;
      this.repositioningBarracks = null;
      if (this.pathMgr.isOnPath(mx, my, 30) &&
          Math.hypot(mx - barracks.x, my - barracks.y) <= barracks.range) {
        const progress = this.pathMgr.getNearestPathProgress(mx, my);
        barracks.repositionSoldiers(progress, this.pathMgr.getPathPoints());
      } else {
        this._toast('Click on the path within Barracks range!');
      }
      this._redrawZones();
      if (this.selectedTower) {
        this.game.events.emit('tower:panel-open', {
          tower: this.selectedTower, def: TOWER_DEFS[this.selectedTower.type],
          x: this._panelX, y: this._panelY, mapId: this.mapId,
        });
      }
      return;
    }
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

- [ ] **Verify reposition flow in browser**

1. Place a Barracks — 3 soldiers appear
2. Click the Barracks — panel opens
3. Click "⟳ Reposition Soldiers" button (wired in Task 9, skip for now — test by triggering `ui:barracks-reposition` from browser console: `game.events.emit('ui:barracks-reposition')`)
4. A cyan ring appears around the Barracks, blue dots appear on path points within range
5. Click a path point within range — soldiers move; panel reopens
6. Click outside range — toast appears, reposition mode exits

- [ ] **Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: implement Barracks reposition mode with path overlay"
```

---

## Task 9: UIScene — branch picker, Barracks panel, reposition button

**Files:**
- Modify: `index.html`
- Modify: `src/scenes/UIScene.js`

### 9a: Move `panel-lvl` out of `panel-std-stats` in `index.html`

Currently `panel-lvl` is inside `panel-std-stats`, so it's hidden when showing Barracks stats. Move it to be a sibling between the two stat blocks.

- [ ] **Edit `index.html` — move `panel-lvl` out of `panel-std-stats`**

Find:
```html
      <!-- Standard attack tower stats (Archer, Mage, Cannon, Ice, Sniper) -->
      <div id="panel-std-stats">
        <div class="panel-stat" id="panel-dmg">Damage: -</div>
        <div class="panel-stat" id="panel-rng">Range: -</div>
        <div class="panel-stat" id="panel-spd">Fire rate: -</div>
        <div class="panel-stat" id="panel-lvl">Level: -</div>
      </div>
```

Replace with:
```html
      <!-- Standard attack tower stats (Archer, Mage, Cannon, Ice, Sniper) -->
      <div id="panel-std-stats">
        <div class="panel-stat" id="panel-dmg">Damage: -</div>
        <div class="panel-stat" id="panel-rng">Range: -</div>
        <div class="panel-stat" id="panel-spd">Fire rate: -</div>
      </div>
      <div class="panel-stat" id="panel-lvl">Level: -</div>
```

### 9b: Refactor `UIScene._onPanelOpen`

- [ ] **Add `this._openTower = null` in `UIScene.create()`** — after `this._speedFast = false`:

```js
    this._openTower = null;
```

- [ ] **Replace `_onPanelOpen` in `src/scenes/UIScene.js`**

```js
  _onPanelOpen({ tower, def, x, y, mapId }) {
    this._openTower = tower;
    const map = MAPS[mapId];

    const branchLabel = tower.branch ? ` · ${def['tier4' + tower.branch]?.label ?? ''}` : '';
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name + branchLabel;
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    if (tower.type === 'barracks') {
      document.getElementById('panel-std-stats').style.display      = 'none';
      document.getElementById('panel-barracks-stats').style.display = 'block';
      const ss = tower.soldierStats;
      document.getElementById('panel-soldier-count').textContent   = ss.count;
      document.getElementById('panel-soldier-hp').textContent      = ss.hp;
      document.getElementById('panel-soldier-dmg').textContent     = ss.damage;
      document.getElementById('panel-soldier-respawn').textContent = ss.respawnDuration;
      document.getElementById('panel-soldier-blocks').textContent  = ss.canBlockFlyers ? 'Ground + Air' : 'Ground';
      document.getElementById('panel-reposition-btn').style.display = 'block';
    } else {
      document.getElementById('panel-std-stats').style.display      = 'block';
      document.getElementById('panel-barracks-stats').style.display = 'none';
      document.getElementById('panel-reposition-btn').style.display = 'none';
      document.getElementById('panel-dmg').textContent = 'Damage: '    + tower.damage;
      document.getElementById('panel-rng').textContent = 'Range: '     + tower.range;
      document.getElementById('panel-spd').textContent = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    }

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const picker     = document.getElementById('panel-branch-picker');
    picker.style.display = 'none';
    picker.querySelector('.branch-cards').replaceChildren();
    upgradeBtn.style.display = '';

    if (tower.level === 3 && !tower.branch) {
      upgradeBtn.style.display = 'none';
      picker.style.display     = 'block';
      this._renderBranchPicker(picker.querySelector('.branch-cards'), def, map);
    } else {
      this._setUpgradeButton(upgradeBtn, tower, def, map);
    }

    document.getElementById('panel-sell-btn').textContent =
      '💰 Sell (' + Math.floor(tower.totalCost * 0.6) + 'g)';

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(x + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(y - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';

    this._selectedType = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }
```

### 9c: Add helper methods

- [ ] **Add `_setUpgradeButton` to `UIScene`** (after `_onPanelOpen`):

```js
  _setUpgradeButton(btn, tower, def, map) {
    const nextLevel = tower.level + 1;
    if (tower.level >= 4) {
      btn.textContent = 'MAX LEVEL';
      btn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = map.maxTierAllowed < 2 ? 3 : 5;
      btn.textContent = '🔒 Unlocked on Map ' + unlockMap;
      btn.className   = 'upgrade-btn maxed';
    } else {
      const tierDef   = def['tier' + nextLevel];
      btn.textContent = 'Upgrade 💰' + tierDef.cost + ': ' + tierDef.label;
      btn.className   = 'upgrade-btn';
    }
  }
```

- [ ] **Add `_renderBranchPicker` to `UIScene`** (after `_setUpgradeButton`):

```js
  _renderBranchPicker(container, def, map) {
    const tierLocked = map.maxTierAllowed < 4;
    for (const [branch, tierDef] of [['A', def.tier4A], ['B', def.tier4B]]) {
      const card = document.createElement('div');
      card.className = tierLocked ? 'branch-card locked' : 'branch-card';

      const label = document.createElement('div');
      label.className   = 'branch-label';
      label.textContent = tierDef.label;

      const effect = document.createElement('div');
      effect.className   = 'branch-effect';
      effect.textContent = tierDef.passiveEffect;

      const cost = document.createElement('div');
      cost.className   = 'branch-cost';
      cost.textContent = tierDef.cost + 'g';

      const btn = document.createElement('button');
      btn.className   = 'upgrade-btn';
      btn.textContent = 'Choose';
      if (tierLocked) {
        btn.disabled = true;
        btn.title    = 'Unlocked on Map 5';
      }
      btn.addEventListener('click', () =>
        this.game.events.emit('ui:tower-upgrade', { branch }));

      card.append(label, effect, cost, btn);
      container.appendChild(card);
    }
  }
```

### 9d: Update `_onPanelClose`

- [ ] **Replace `_onPanelClose` in `UIScene`**:

```js
  _onPanelClose() {
    document.getElementById('tower-panel').style.display          = 'none';
    document.getElementById('panel-branch-picker').style.display  = 'none';
    document.getElementById('panel-branch-picker').querySelector('.branch-cards').replaceChildren();
    document.getElementById('panel-upgrade-btn').style.display    = '';
    document.getElementById('panel-std-stats').style.display      = 'block';
    document.getElementById('panel-barracks-stats').style.display = 'none';
    document.getElementById('panel-reposition-btn').style.display = 'none';
  }
```

### 9e: Wire the reposition button

- [ ] **Add reposition button listener in `UIScene._bindDOMEvents()`** — append at the end of the method:

```js
    document.getElementById('panel-reposition-btn').addEventListener('click',
      () => this.game.events.emit('ui:barracks-reposition'));
```

- [ ] **Subscribe to `ui:barracks-reposition` in `UIScene._subscribeToGameEvents()`** — append:

```js
    this.game.events.on('ui:barracks-reposition', () => {
      document.getElementById('tower-panel').style.display = 'none';
    }, this);
```

- [ ] **Add cleanup in `UIScene.shutdown()`**

In the `off(...)` block, add:
```js
    this.game.events.off('ui:barracks-reposition', null, this);
```

In the button-clone array, add `'panel-reposition-btn'`:
```js
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn'].forEach(id => {
```

### 9f: Verify

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

- [ ] **Verify branch picker in browser**

Place any non-Barracks tower (e.g. Archer). Upgrade to Tier 2, then Tier 3. Panel should switch to the branch picker showing two cards. Choose a branch — panel header should show "🏹 Archer · Marksman" (or whichever branch). Upgrade button should disappear, "MAX LEVEL" text appears after.

- [ ] **Verify Barracks panel in browser**

Place a Barracks. Click it — panel should show "Soldiers: 3", "HP: 15 each", "DMG: 20 each", "Respawn: 3s", "Blocks: Ground". Upgrade button should show "Upgrade 💰65: Drill Sergeant". Upgrade — stats update, soldiers rebuild.

- [ ] **Verify full reposition flow in browser**

1. Place Barracks — soldiers appear
2. Click Barracks — panel opens with reposition button
3. Click "⟳ Reposition Soldiers" — panel closes, cyan ring and blue dots appear on path
4. Click a path point within range — soldiers jump to new position, panel reopens
5. Click outside range — toast "Click on the path within Barracks range!" appears

- [ ] **Commit**

```bash
git add index.html src/scenes/UIScene.js
git commit -m "feat: add branch picker UI and Barracks soldier stats panel with reposition button"
```

---

## Task 10: Final verification

- [ ] **Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Full browser verification checklist**

Open `npm run dev` and check each item:

- [ ] All 6 towers appear in bottom bar and are placeable
- [ ] Barracks (⚔️) places; 3 green soldiers appear on path near placement point
- [ ] Enemies stop at soldiers; HP bars shrink; soldiers die (disappear) and respawn after 3s
- [ ] Enemies resume moving past dead soldiers
- [ ] Kill counter and gold update correctly when soldiers kill enemies
- [ ] T1→T2→T3 Barracks upgrades rebuild soldiers; panel stats update
- [ ] T3 Barracks shows branch picker (temporarily set `maxTierAllowed: 4` on Map 1 in `src/data/maps.js` to test; revert after)
- [ ] T4A (Vanguard): 3 soldiers, 80hp, `canBlockFlyers: true` in soldierStats
- [ ] T4B (Rapid Response): 4 soldiers, 1.5s respawn
- [ ] Sell Barracks: soldiers disappear, zone freed, gold refunded
- [ ] Reposition flow works end-to-end
- [ ] Tier 3 non-Barracks tower shows branch picker with two cards
- [ ] Choosing a branch upgrades to T4; panel header shows "TowerName · BranchName"
- [ ] On maps with `maxTierAllowed < 4`: branch cards are greyed and disabled
- [ ] All Phase 2/3 checks still pass (menu→game, wave HUD, speed toggle, sell refund, victory/defeat/restart)

- [ ] **Commit any final fixes**

```bash
git add -p
git commit -m "fix: browser verification cleanup"
```
