# Phase 3 — Tower System: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the tower system — add Sniper and Barracks data, extract TowerPlacementManager, build the branch picker UI, and implement the Barracks soldier-blocking mechanic.

**Architecture:** TowerPlacementManager extracts tower/zone ownership from GameScene. Barracks extends Tower and owns a `soldiers[]` array of Soldier Container entities. Soldiers stand on the path at a player-configurable position; enemies stop and fight them. UIScene gets a branch picker view (shown at Tier 3) and a Barracks panel with a reposition button.

**Tech Stack:** Phaser.js 3 (Containers, Graphics, Text), Vite/ES modules, Vitest+jsdom for unit tests.

---

## Setup: Create branch from Phase 2

- [ ] **Create feature branch from phase-2-complete tag**

```bash
git checkout -b feature/phase-3-tower-system phase-2-complete
```

- [ ] **Verify the dev server starts and the existing game runs**

```bash
npm run dev
```

Open http://localhost:5173 — confirm menu → map select → game loads, all 4 towers placeable, waves work.

- [ ] **Run existing tests to confirm baseline**

```bash
npm test
```

Expected: 25 tests pass.

---

## Task 1: Tower data + HTML buttons

**Files:**
- Modify: `src/data/towers.js`
- Modify: `index.html`
- Test: `src/data/towers.test.js` (existing — runs automatically for all TOWER_DEFS entries)

The existing `towers.test.js` runs for every entry in `TOWER_DEFS` and requires these fields on each: `name icon cost color range damage fireRate splashRadius pierce slow tier2 tier3 tier4A tier4B ability`. Barracks must pass this test — add `damage: 0, fireRate: 0, splashRadius: 0, pierce: false, slow: 0` as placeholder values. The targeting loop skips Barracks via `!tower.fireRate` (added in Task 7).

- [ ] **Add Sniper and Barracks to `src/data/towers.js`**

Append after the `ice` entry (before the closing `};`):

```js
  sniper: {
    name: 'Sniper', icon: '🎯', cost: 120, color: 0x8B8B00,
    range: 150, damage: 80, fireRate: 0.4, splashRadius: 0, pierce: false, slow: 0,
    tier2: { cost: 80, damage: 130, range: 170, label: 'Long Shot' },
    tier3: { cost: 110, damage: 200, range: 190, label: 'Precision' },
    tier4A: { cost: 160, damage: 300, label: 'Assassin', passiveEffect: 'Ignores armor, stuns boss 1s' },
    tier4B: { cost: 160, damage: 200, range: 280, label: 'Hunter', passiveEffect: '+100% range, fires at 2 targets simultaneously (Phase 4)' },
    ability: { label: 'Headshot', cooldown: 20, description: 'Instakill non-boss enemy' },
  },
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
    tier2: { cost: 65, label: 'Trained Guard' },
    tier3: { cost: 95, label: 'Elite Squad' },
    tier4A: { cost: 140, label: 'Elite Guard',    passiveEffect: 'Soldiers block flying enemies too' },
    tier4B: { cost: 140, label: 'Rapid Response', passiveEffect: '4 soldiers; respawn time halved' },
    ability: { label: 'Reinforce', cooldown: 15, description: '+2 soldiers for 15s' },
  },
```

- [ ] **Run tests — confirm all pass including new sniper/barracks entries**

```bash
npm test
```

Expected: all tests pass (auto-generated tests cover sniper and barracks).

- [ ] **Add Sniper and Barracks buttons to `index.html`**

Inside `#bottom-bar`, after the `ice` button and before `#wave-btn`:

```html
    <button class="tower-btn" data-type="sniper">
      <span class="t-icon">🎯</span><span class="t-cost">120g</span><span class="t-name">Sniper</span>
    </button>
    <button class="tower-btn" data-type="barracks">
      <span class="t-icon">⚔️</span><span class="t-cost">100g</span><span class="t-name">Barracks</span>
    </button>
```

Add CSS inside the `<style>` tag (for branch picker and Barracks panel, used in Tasks 4 and 8):

```css
    .branch-header { font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
                     color: #f0a500; margin-bottom: 7px; }
    .branch-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 8px; }
    .branch-card { border: 1px solid #555; border-radius: 5px; padding: 7px; font-size: 11px; }
    .branch-card:not(.locked) { border-color: #f0a500; background: #1a1400; }
    .branch-card.locked { opacity: 0.45; }
    .branch-label { font-weight: bold; margin-bottom: 3px; }
    .branch-effect { color: #888; margin-bottom: 4px; font-size: 10px; }
    .branch-cost { color: #f0a500; font-weight: bold; margin-bottom: 5px; }
    .reposition-btn { width: 100%; background: #1a2a3a; border: 1px solid #4fc3f7;
                      color: #4fc3f7; padding: 5px; border-radius: 4px;
                      cursor: pointer; font-size: 11px; margin-top: 3px; }
    .reposition-btn:hover { background: #223344; }
```

Replace the existing `#tower-panel` div with the expanded version that includes new DOM nodes needed in Tasks 4 and 8:

```html
    <div id="tower-panel">
      <div class="panel-name" id="panel-name">Tower</div>
      <div id="panel-std-stats">
        <div class="panel-stat" id="panel-dmg">Damage: -</div>
        <div class="panel-stat" id="panel-rng">Range: -</div>
        <div class="panel-stat" id="panel-spd">Fire rate: -</div>
      </div>
      <div id="panel-barracks-stats" style="display:none">
        <div class="panel-stat" id="panel-soldier-count">Soldiers: -</div>
        <div class="panel-stat" id="panel-soldier-hp">HP: -</div>
        <div class="panel-stat" id="panel-soldier-dmg">DMG: -</div>
        <div class="panel-stat" id="panel-soldier-respawn">Respawn: -</div>
        <div class="panel-stat" id="panel-soldier-blocks">Blocks: -</div>
      </div>
      <div class="panel-stat" id="panel-lvl">Level: -</div>
      <div id="panel-branch-picker" style="display:none"></div>
      <button class="upgrade-btn" id="panel-upgrade-btn">Upgrade</button>
      <button class="reposition-btn" id="panel-reposition-btn" style="display:none">&#8635; Reposition Soldiers</button>
      <button class="sell-btn" id="panel-sell-btn">&#128176; Sell</button>
    </div>
```

- [ ] **Commit**

```bash
git add src/data/towers.js index.html
git commit -m "feat: add Sniper and Barracks tower definitions and HTML buttons"
```

---

## Task 2: PathManager additions

**Files:**
- Modify: `src/systems/PathManager.js`
- Modify: `src/systems/PathManager.test.js`

Two new methods:
- `getPathPoints()` — returns `this.path`. Used by Soldier and Barracks to compute world positions.
- `getNearestPathProgress(x, y)` — returns a 0–1 value for the closest point on the path to `(x, y)`. Used by Barracks initial placement and the reposition click handler.

- [ ] **Write failing tests in `src/systems/PathManager.test.js`**

Append inside the `describe('PathManager', ...)` block:

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
    // L-path: (0,0)→(100,0)→(100,100), total length = 200, elbow at (100,0) is at 100/200 = 0.5
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 5);
  });
```

- [ ] **Run tests — confirm new tests fail**

```bash
npm test
```

Expected: 4 new failures.

- [ ] **Add both methods to `src/systems/PathManager.js`** (append inside the class, after `renderPath`):

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
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
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

Expected: all tests pass (was 25, now 29).

- [ ] **Commit**

```bash
git add src/systems/PathManager.js src/systems/PathManager.test.js
git commit -m "feat: add PathManager.getPathPoints and getNearestPathProgress"
```

---

## Task 3: TowerPlacementManager

**Files:**
- Create: `src/systems/TowerPlacementManager.js`
- Create: `src/systems/TowerPlacementManager.test.js`
- Modify: `src/scenes/GameScene.js`

TowerPlacementManager takes the zones array (same reference as `pathMgr.buildZones`) and an `entityFactory` function for dependency injection. This keeps Tower/Barracks/Phaser out of the unit-test environment.

After creating TowerPlacementManager, GameScene is refactored: `this.towers[]` is removed, and `_onPointerDown`, `_upgradeSelectedTower`, `_sellSelectedTower`, `_updateTowers`, and `_redrawZones` all route through the manager.

- [ ] **Write failing tests in `src/systems/TowerPlacementManager.test.js`**

```js
import { TowerPlacementManager } from './TowerPlacementManager.js';
import { TOWER_DEFS } from '../data/towers.js';

const makeEconomy = (gold = 500) => ({
  gold,
  spend(cost) { if (this.gold < cost) return false; this.gold -= cost; return true; },
  earn(amount) { this.gold += amount; },
});

const makeFactory = () =>
  (type, _scene, opts) => ({
    type, zoneIndex: opts.zoneIndex,
    level: 1, branch: null, totalCost: opts.def.cost ?? 0,
    upgrade(tier, branch) { this.level = tier; if (branch) this.branch = branch; },
    destroy() {},
  });

describe('TowerPlacementManager', () => {
  it('getZones returns the zones array', () => {
    const zones = [{ cx: 100, cy: 100, radius: 22, occupied: false }];
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    expect(mgr.getZones()).toBe(zones);
  });

  it('getTowers returns empty array initially', () => {
    const mgr = new TowerPlacementManager([], makeEconomy(), makeFactory());
    expect(mgr.getTowers()).toEqual([]);
  });

  it('placeTower marks zone occupied, deducts gold, assigns id', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null);
    expect(tower).not.toBeNull();
    expect(tower.type).toBe('archer');
    expect(tower.id).toBe(0);
    expect(zone.occupied).toBe(true);
    expect(economy.gold).toBe(500 - TOWER_DEFS.archer.cost);
  });

  it('placeTower returns null when gold insufficient', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(50);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    expect(mgr.placeTower(0, 'archer', null)).toBeNull();
    expect(zone.occupied).toBe(false);
    expect(economy.gold).toBe(50);
  });

  it('placeTower returns null when zone already occupied', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: true };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    expect(mgr.placeTower(0, 'archer', null)).toBeNull();
  });

  it('getTowerAtZone returns tower with matching zoneIndex', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    const tower = mgr.placeTower(0, 'archer', null);
    expect(mgr.getTowerAtZone(0)).toBe(tower);
  });

  it('getTowerAtZone returns null when zone empty', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    expect(mgr.getTowerAtZone(0)).toBeNull();
  });

  it('sellTower frees zone, earns 60% refund, removes from array', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // spends 60g → economy.gold = 440
    mgr.sellTower(tower);
    expect(economy.gold).toBe(440 + Math.floor(60 * 0.6)); // 440 + 36 = 476
    expect(zone.occupied).toBe(false);
    expect(mgr.getTowers()).toHaveLength(0);
  });

  it('upgradeTower spends gold, updates totalCost, calls tower.upgrade with branch', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // spends 60g
    mgr.upgradeTower(tower, 4, 'A');
    const t4aCost = TOWER_DEFS.archer.tier4A.cost; // 120
    expect(economy.gold).toBe(500 - 60 - t4aCost);
    expect(tower.totalCost).toBe(60 + t4aCost);
    expect(tower.level).toBe(4);
    expect(tower.branch).toBe('A');
  });

  it('upgradeTower returns false when gold insufficient', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(60); // only enough to place
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // now economy.gold = 0
    const result = mgr.upgradeTower(tower, 2, null); // tier2 costs 50, economy has 0
    expect(result).toBe(false);
    expect(tower.level).toBe(1);
  });
});
```

- [ ] **Run tests — confirm new tests fail**

```bash
npm test
```

Expected: 11 new failures.

- [ ] **Create `src/systems/TowerPlacementManager.js`**

```js
import { TOWER_DEFS } from '../data/towers.js';

export class TowerPlacementManager {
  constructor(zones, economy, entityFactory) {
    this.zones    = zones;
    this.economy  = economy;
    this._factory = entityFactory;
    this.towers   = [];
    this._nextId  = 0;
  }

  getZones()  { return this.zones; }
  getTowers() { return this.towers; }

  getTowerAtZone(zoneIndex) {
    return this.towers.find(t => t.zoneIndex === zoneIndex) ?? null;
  }

  placeTower(zoneIndex, type, scene) {
    const zone = this.zones[zoneIndex];
    if (!zone || zone.occupied) return null;
    const def = TOWER_DEFS[type];
    if (!def || !this.economy.spend(def.cost)) return null;
    const tower = this._factory(type, scene, { type, x: zone.cx, y: zone.cy, def, zoneIndex });
    tower.id       = this._nextId++;
    tower.totalCost = def.cost;
    zone.occupied  = true;
    this.towers.push(tower);
    return tower;
  }

  sellTower(tower) {
    const refund = Math.floor(tower.totalCost * 0.6);
    this.economy.earn(refund);
    this.zones[tower.zoneIndex].occupied = false;
    this.towers = this.towers.filter(t => t !== tower);
    tower.destroy();
  }

  upgradeTower(tower, tier, branch = null) {
    const def    = TOWER_DEFS[tower.type];
    const key    = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    const tierDef = def[key];
    if (!tierDef || !this.economy.spend(tierDef.cost)) return false;
    tower.totalCost += tierDef.cost;
    tower.upgrade(tier, branch);
    return true;
  }
}
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

Expected: all tests pass (was 29, now 40).

- [ ] **Refactor `src/scenes/GameScene.js` to use TowerPlacementManager**

**Add imports at top:**
```js
import { TowerPlacementManager } from '../systems/TowerPlacementManager.js';
import { Tower } from '../entities/Tower.js';
import { Barracks } from '../entities/Barracks.js';
```

**In `create()`, replace `this.towers = []` with:**
```js
    this.placementManager = new TowerPlacementManager(
      this.pathMgr.buildZones,
      this.economy,
      (type, scene, opts) => type === 'barracks'
        ? new Barracks(scene, opts)
        : new Tower(scene, opts)
    );
    this.repositionMode        = false;
    this.repositioningBarracks = null;
```

**Replace `_updateTowers(dt)`:**
```js
  _updateTowers(dt) {
    for (const tower of this.placementManager.getTowers()) {
      if (!tower.fireRate) continue;
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      let best = null, bestProg = -1;
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.range
            && enemy.waypointIndex > bestProg) {
          best = enemy; bestProg = enemy.waypointIndex;
        }
      }
      if (best) {
        this.projectiles.push(new Projectile(this, {
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
        }));
        tower.cooldown = 1 / tower.fireRate;
      }
    }
  }
```

**Replace `_onPointerDown(pointer)`:**
```js
  _onPointerDown(pointer) {
    const mx = pointer.x, my = pointer.y;

    if (this.repositionMode && this.repositioningBarracks) {
      const barracks = this.repositioningBarracks;
      if (this.pathMgr.isOnPath(mx, my, 30) &&
          Math.hypot(mx - barracks.x, my - barracks.y) <= barracks.range) {
        const progress = this.pathMgr.getNearestPathProgress(mx, my);
        barracks.repositionSoldiers(progress, this.pathMgr.getPathPoints());
      } else {
        this._toast('Click on the path within Barracks range!');
      }
      this.repositionMode        = false;
      this.repositioningBarracks = null;
      this._redrawZones();
      if (this.selectedTower) {
        this.game.events.emit('tower:panel-open', {
          tower: this.selectedTower, def: TOWER_DEFS[this.selectedTower.type],
          x: this._panelX, y: this._panelY, mapId: this.mapId,
        });
      }
      return;
    }

    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        if (this.selectedTower) this.selectedTower.hideRange();
        this._panelX = mx; this._panelY = my;
        this.game.events.emit('tower:panel-open', {
          tower, def: TOWER_DEFS[tower.type], x: mx, y: my, mapId: this.mapId,
        });
        tower.showRange();
        this.selectedTower = tower;
        return;
      }
    }

    if (this.selectedTower) { this.selectedTower.hideRange(); this.selectedTower = null; }
    this.game.events.emit('tower:panel-close');
    if (!this.selectedType) return;

    const zones = this.placementManager.getZones();
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
        const tower = this.placementManager.placeTower(i, this.selectedType, this);
        if (!tower) { this._toast('Not enough gold!'); return; }
        if (tower.type === 'barracks') {
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(tower.x, tower.y);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        }
        this._redrawZones();
        return;
      }
    }
  }
```

**Replace `_upgradeSelectedTower()`:**
```js
  _upgradeSelectedTower(branch = null) {
    if (!this.selectedTower) return;
    const tower = this.selectedTower;
    const map   = MAPS[this.mapId];
    const nextLevel = tower.level + 1;
    if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
    if (!this.placementManager.upgradeTower(tower, nextLevel, branch)) {
      this._toast('Not enough gold!');
      return;
    }
    if (tower.type === 'barracks') {
      tower._rebuildSoldiers(this, this.pathMgr.getPathPoints());
    }
    this.game.events.emit('tower:panel-open', {
      tower, def: TOWER_DEFS[tower.type], x: this._panelX, y: this._panelY, mapId: this.mapId,
    });
  }
```

**Replace `_sellSelectedTower()`:**
```js
  _sellSelectedTower() {
    if (!this.selectedTower) return;
    this.placementManager.sellTower(this.selectedTower);
    this.selectedTower = null;
    this.game.events.emit('tower:panel-close');
    this._redrawZones();
  }
```

**Replace `_redrawZones()`:**
```js
  _redrawZones() {
    const canAfford = this.selectedType && this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
    this.zoneGfx.clear();
    for (const zone of this.placementManager.getZones()) {
      if (zone.occupied) continue;
      const color = this.selectedType ? (canAfford ? 0xffd700 : 0x884444) : 0x444444;
      const alpha = this.selectedType ? 1 : 0.3;
      this.zoneGfx.lineStyle(this.selectedType ? 2 : 1, color, alpha);
      this.zoneGfx.strokeCircle(zone.cx, zone.cy, zone.radius);
      if (this.selectedType && canAfford) {
        this.zoneGfx.fillStyle(0xffd700, 0.07);
        this.zoneGfx.fillCircle(zone.cx, zone.cy, zone.radius);
      }
    }
  }
```

**Update `ui:tower-upgrade` listener in `create()` to pass branch:**
```js
    this.game.events.on('ui:tower-upgrade', ({ branch } = {}) => this._upgradeSelectedTower(branch ?? null), this);
```

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Verify game still works in browser** — place/upgrade/sell/wave/victory on Map 1.

- [ ] **Commit**

```bash
git add src/systems/TowerPlacementManager.js src/systems/TowerPlacementManager.test.js src/scenes/GameScene.js
git commit -m "feat: extract TowerPlacementManager from GameScene"
```

---

## Task 4: Fix Tower.upgrade for tier4 + Branch picker UI

**Files:**
- Modify: `src/entities/Tower.js`
- Modify: `src/scenes/UIScene.js`

Currently `Tower.upgrade(tier, branch)` looks up `TOWER_DEFS[type]['tier' + tier]` which returns `undefined` for tier 4 (key is `tier4A`/`tier4B`, not `tier4`). Fix first, then build the branch picker.

Branch picker uses DOM methods (`createElement`, `appendChild`) rather than `innerHTML` to avoid XSS risk — even though this content comes from trusted config, the pattern is correct for maintainability.

- [ ] **Fix `upgrade()` in `src/entities/Tower.js`**

Replace the `upgrade` method:

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

- [ ] **Add `this._openTowerId = null` to `UIScene.create()`** (alongside `_selectedType` and `_speedFast`).

- [ ] **Replace `_onPanelOpen` in `src/scenes/UIScene.js`**

```js
  _onPanelOpen({ tower, def, x, y, mapId }) {
    this._openTowerId = tower.id ?? null;
    const map = MAPS[mapId];

    const branchLabel = tower.branch ? ` · ${def['tier4' + tower.branch]?.label ?? ''}` : '';
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name + branchLabel;
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    if (tower.type === 'barracks') {
      document.getElementById('panel-std-stats').style.display      = 'none';
      document.getElementById('panel-barracks-stats').style.display = 'block';
      const ss = tower.soldierStats;
      document.getElementById('panel-soldier-count').textContent   = 'Soldiers: '  + ss.count;
      document.getElementById('panel-soldier-hp').textContent      = 'HP: '        + ss.hp        + ' each';
      document.getElementById('panel-soldier-dmg').textContent     = 'DMG: '       + ss.damage    + ' each';
      document.getElementById('panel-soldier-respawn').textContent = 'Respawn: '   + ss.respawnDuration + 's';
      document.getElementById('panel-soldier-blocks').textContent  = 'Blocks: '    + (ss.canBlockFlyers ? 'Ground + Air' : 'Ground');
    } else {
      document.getElementById('panel-std-stats').style.display      = 'block';
      document.getElementById('panel-barracks-stats').style.display = 'none';
      document.getElementById('panel-dmg').textContent = 'Damage: '    + tower.damage;
      document.getElementById('panel-rng').textContent = 'Range: '     + tower.range;
      document.getElementById('panel-spd').textContent = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    }

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const picker     = document.getElementById('panel-branch-picker');
    picker.style.display = 'none';
    picker.replaceChildren();
    upgradeBtn.style.display = '';

    if (tower.level === 3 && !tower.branch && tower.type !== 'barracks') {
      upgradeBtn.style.display = 'none';
      picker.style.display     = 'block';
      this._renderBranchPicker(picker, def, map);
    } else {
      this._setUpgradeButton(upgradeBtn, tower, def, map);
    }

    document.getElementById('panel-reposition-btn').style.display =
      tower.type === 'barracks' ? 'block' : 'none';

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

- [ ] **Add `_setUpgradeButton` and `_renderBranchPicker` to `UIScene`**

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

  _renderBranchPicker(container, def, map) {
    const tierLocked = map.maxTierAllowed < 4;

    const header = document.createElement('div');
    header.className   = 'branch-header';
    header.textContent = '⚡ Choose Tier 4 Path';
    container.appendChild(header);

    const cards = document.createElement('div');
    cards.className = 'branch-cards';

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
      btn.className   = 'upgrade-btn branch-choose-btn';
      btn.textContent = 'Choose';
      if (tierLocked) {
        btn.disabled = true;
        btn.title    = 'Unlocked on Map 5';
      }
      btn.addEventListener('click', () =>
        this.game.events.emit('ui:tower-upgrade', { branch }));

      card.append(label, effect, cost, btn);
      cards.appendChild(card);
    }
    container.appendChild(cards);
  }
```

- [ ] **Replace `_onPanelClose()` in UIScene**

```js
  _onPanelClose() {
    document.getElementById('tower-panel').style.display         = 'none';
    document.getElementById('panel-branch-picker').style.display = 'none';
    document.getElementById('panel-branch-picker').replaceChildren();
    document.getElementById('panel-upgrade-btn').style.display   = '';
    document.getElementById('panel-std-stats').style.display     = 'block';
    document.getElementById('panel-barracks-stats').style.display = 'none';
    document.getElementById('panel-reposition-btn').style.display = 'none';
  }
```

- [ ] **Add `'panel-reposition-btn'` to the cloned buttons in `UIScene.shutdown()`**

```js
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn'].forEach(id => {
```

- [ ] **Verify branch picker in browser**

Temporarily set `maxTierAllowed: 4` for Map 1 in `src/data/maps.js`. Place a tower, upgrade twice to Tier 3 — branch picker should appear with two cards. Choose a branch — panel shows Tier 4 with branch name in header. On Map 1 with `maxTierAllowed: 2`: branch cards show lock icon and disabled state. Revert the temporary change.

- [ ] **Commit**

```bash
git add src/entities/Tower.js src/scenes/UIScene.js
git commit -m "feat: fix Tower.upgrade for tier4 branches and add branch picker UI"
```

---

## Task 5: Soldier entity

**Files:**
- Create: `src/entities/Soldier.js`

Soldier extends `Phaser.GameObjects.Container`. Manages its own graphics, respawn timer, and attack timer. No unit tests — browser verified.

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

- [ ] **Commit**

```bash
git add src/entities/Soldier.js
git commit -m "feat: add Soldier entity with HP bar, respawn timer, and path positioning"
```

---

## Task 6: Barracks entity

**Files:**
- Create: `src/entities/Barracks.js`

The GameScene entity factory (added in Task 3) already routes `type === 'barracks'` to `new Barracks(...)`. No TowerPlacementManager changes needed.

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
    const count = this.soldierStats.count;
    for (let i = 0; i < count; i++) {
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

- [ ] **Run tests — confirm all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Verify in browser** — place a Barracks on Map 1; three green soldier shapes should appear on the path near the Barracks.

- [ ] **Commit**

```bash
git add src/entities/Barracks.js
git commit -m "feat: add Barracks entity extending Tower with soldier spawning"
```

---

## Task 7: Enemy blocking + soldier update loop

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Add constants at the top of `src/scenes/GameScene.js`** (after imports, before the class):

```js
const ENEMY_MELEE_DAMAGE = 20; // damage/second dealt by any enemy to a blocking soldier
const MELEE_RANGE        = 30; // pixels — enemy halts this close to a living soldier
```

- [ ] **Add `_checkSoldierBlock` and `_updateSoldiers` to `src/scenes/GameScene.js`**

```js
  _checkSoldierBlock(enemy) {
    for (const tower of this.placementManager.getTowers()) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) {
        if (soldier.dead) continue;
        if (enemy.def.flying && !soldier.canBlockFlyers) continue;
        if (Math.hypot(enemy.x - soldier.x, enemy.y - soldier.y) < MELEE_RANGE) return soldier;
      }
    }
    return null;
  }

  _updateSoldiers(dt) {
    for (const tower of this.placementManager.getTowers()) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) soldier.update(dt);
    }
  }
```

- [ ] **Update `_updateEnemies(dt)` — insert blocking check after `enemy.update(dt)`**

Inside the `for (const enemy of this.enemies)` loop, immediately after `enemy.update(dt);` add:

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

- [ ] **Call `_updateSoldiers(dt)` from `update()`** — add after `_updateProjectiles(dt)`:

```js
    this._updateSoldiers(dt);
```

- [ ] **Verify in browser**
- Place a Barracks, send a wave — enemies stop at soldiers and exchange attacks.
- Soldier HP bar shrinks. When HP reaches 0, soldier disappears. After ~3 seconds it reappears.
- Enemies continue past the soldier position while it is dead.
- Kill gold and HUD update correctly when a soldier kills an enemy.

- [ ] **Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: implement soldier blocking — enemies stop and fight soldiers in melee"
```

---

## Task 8: Reposition flow

**Files:**
- Modify: `src/scenes/UIScene.js`
- Modify: `src/scenes/GameScene.js`

The panel button and DOM nodes already exist (Task 1). The pointer-down reposition handler in `_onPointerDown` is already wired (Task 3). This task connects the button click to the GameScene mode.

- [ ] **Add reposition button listener in `UIScene._bindDOMEvents()`** (append at end of the method):

```js
    document.getElementById('panel-reposition-btn').addEventListener('click',
      () => this.game.events.emit('ui:barracks-reposition', { towerId: this._openTowerId }));
```

- [ ] **Add `ui:barracks-reposition` subscription in `UIScene._subscribeToGameEvents()`** (append at end):

```js
    this.game.events.on('ui:barracks-reposition', () => {
      document.getElementById('tower-panel').style.display = 'none';
    }, this);
```

- [ ] **Add `ui:barracks-reposition` cleanup in `UIScene.shutdown()`** (append to `.off(...)` block):

```js
    this.game.events.off('ui:barracks-reposition', null, this);
```

- [ ] **Add `ui:barracks-reposition` handler in `GameScene.create()`** (append to UIScene event block):

```js
    this.game.events.on('ui:barracks-reposition', ({ towerId }) => {
      const barracks = this.placementManager.getTowers().find(t => t.id === towerId);
      if (!barracks) return;
      this.repositionMode        = true;
      this.repositioningBarracks = barracks;
      this._redrawZones();
      this._toast('Click on the path within Barracks range to reposition soldiers');
    }, this);
```

- [ ] **Add `ui:barracks-reposition` cleanup in `GameScene.shutdown()`** (append to `.off(...)` block):

```js
    this.game.events.off('ui:barracks-reposition', null, this);
```

- [ ] **Append reposition overlay rendering to `_redrawZones()` in GameScene**:

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

- [ ] **Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Verify full reposition flow in browser**

1. Place a Barracks — 3 soldiers appear on the path.
2. Click the Barracks — panel shows soldier stats and "Reposition Soldiers" button.
3. Click the button — panel closes, barracks range ring highlights in cyan, path waypoints within range show blue dots, toast explains what to do.
4. Click a path point within range — soldiers move to new position; panel re-opens.
5. Click outside range — toast "Click on the path within Barracks range!" appears; reposition mode exits.

- [ ] **Commit**

```bash
git add src/scenes/UIScene.js src/scenes/GameScene.js
git commit -m "feat: implement Barracks reposition flow"
```

---

## Final: Browser verification checklist

Run full test suite before browser check:

```bash
npm test
```

Expected: all tests pass.

Open `npm run dev` and verify each item:

- [ ] All 6 tower types appear in bottom bar and are placeable
- [ ] Sniper (🎯) places with correct damage/range stats in panel
- [ ] Barracks (⚔️) places; 3 green soldiers appear on path
- [ ] Enemies stop at soldiers; HP bars shrink; soldiers die (disappear) and respawn after 3s
- [ ] Tier 3 tower shows branch picker with two cards (temporarily set `maxTierAllowed: 4` on Map 1 to test)
- [ ] Choosing a branch upgrades to Tier 4; panel header shows "TowerName · BranchName"
- [ ] On Map 1 with `maxTierAllowed: 2`: branch cards show lock icon and are disabled
- [ ] Sell any tower refunds 60%; Barracks sell destroys its soldiers
- [ ] Barracks T1→T2→T3 upgrade updates soldier stats in panel; soldiers rebuild with new stats
- [ ] Barracks T4A: 3 stronger soldiers; T4B: 4 soldiers with 1.5s respawn
- [ ] Reposition flow: panel → button → cyan overlay → click path → soldiers move → panel re-opens
- [ ] All Phase 2 checks still pass (menu→game, wave HUD, speed toggle, upgrade ring, victory/defeat/restart)

- [ ] **Commit any final fixes, then tag**

```bash
git add -p
git commit -m "fix: browser verification cleanup"
git tag phase-3-complete
```
