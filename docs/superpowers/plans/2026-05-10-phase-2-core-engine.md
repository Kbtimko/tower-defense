# Phase 2: Core Engine Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 482-line GameScene monolith into GameScene (logic + rendering) and UIScene (DOM), convert Tower/Enemy/Projectile to `Phaser.GameObjects.Container` subclasses with emoji/Graphics visuals, and replace the every-frame full-redraw with targeted rendering.

**Architecture:** GameScene and UIScene run as parallel Phaser scenes, communicating exclusively via `this.game.events` (game-level bus). Entity Containers manage their own child Graphics/Text objects and self-render; depth order is set explicitly on creation. Path is drawn once; zones are redrawn reactively; only particles use a per-frame clear/redraw.

**Tech Stack:** Phaser.js 3.x, Vite, Vitest (25 existing tests must stay green throughout)

---

## File Map

| File | Action |
|---|---|
| `src/entities/Tower.js` | Rewrite — extend `Phaser.GameObjects.Container` |
| `src/entities/Enemy.js` | Rewrite — extend `Phaser.GameObjects.Container` |
| `src/entities/Projectile.js` | Rewrite — extend `Phaser.GameObjects.Container` |
| `src/scenes/UIScene.js` | Create — owns all DOM wiring |
| `src/scenes/GameScene.js` | Major edit — event emissions, reactive rendering, no DOM |
| `src/main.js` | Minor edit — add UIScene to scene registry |

---

## Task 1: Tower Container

**Files:**
- Rewrite: `src/entities/Tower.js`
- Modify: `src/scenes/GameScene.js`

Entities have no unit tests — correctness verified via browser after each task.

- [ ] **Step 1: Rewrite `src/entities/Tower.js`**

```js
import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';

export class Tower extends Phaser.GameObjects.Container {
  constructor(scene, { type, x, y, def, zoneIndex }) {
    super(scene, x, y);

    this.type         = type;
    this.level        = 1;
    this.branch       = null;
    this.damage       = def.damage;
    this.range        = def.range;
    this.fireRate     = def.fireRate;
    this.splashRadius = def.splashRadius;
    this.pierce       = def.pierce;
    this.slow         = def.slow;
    this.cooldown     = 0;
    this.totalCost    = def.cost;
    this.zoneIndex    = zoneIndex;

    this._bg        = scene.add.graphics();
    this._icon      = scene.add.text(0, 0, def.icon, { fontSize: '16px', fontFamily: 'Georgia' }).setOrigin(0.5);
    this._rangeRing = scene.add.graphics();

    this.add([this._bg, this._rangeRing, this._icon]);
    scene.add.existing(this);
    this.setDepth(2);
    this._rangeRing.setVisible(false);
    this._redraw();
  }

  _redraw() {
    const def = TOWER_DEFS[this.type];
    const sw  = [1.5, 2, 3, 4][this.level - 1];
    this._bg.clear();
    this._bg.fillStyle(0x2a2a3a, 1);
    this._bg.fillCircle(0, 0, 18);
    this._bg.lineStyle(sw, def.color, 1);
    this._bg.strokeCircle(0, 0, 18);

    this._rangeRing.clear();
    this._rangeRing.lineStyle(1, 0xffd700, 0.25);
    this._rangeRing.strokeCircle(0, 0, this.range);
  }

  upgrade(tier, branch = null) {
    const tierDef = TOWER_DEFS[this.type]['tier' + tier];
    if (!tierDef) return;
    this.level = tier;
    if (branch)                            this.branch       = branch;
    if (tierDef.damage       !== undefined) this.damage       = tierDef.damage;
    if (tierDef.range        !== undefined) this.range        = tierDef.range;
    if (tierDef.splashRadius !== undefined) this.splashRadius = tierDef.splashRadius;
    if (tierDef.slow         !== undefined) this.slow         = tierDef.slow;
    if (tierDef.fireRate     !== undefined) this.fireRate     = tierDef.fireRate;
    if (tierDef.pierce       !== undefined) this.pierce       = tierDef.pierce;
    this._redraw();
  }

  sell() {
    const refund = Math.floor(this.totalCost * 0.6);
    this.destroy();
    return refund;
  }

  showRange() { this._rangeRing.setVisible(true); }
  hideRange()  { this._rangeRing.setVisible(false); }
}
```

- [ ] **Step 2: Update Tower constructor call in `GameScene._onPointerDown`**

Find (line ~268):
```js
this.towers.push(new Tower({
  type: this.selectedType, x: zone.cx, y: zone.cy, def,
  zoneIndex: this.pathMgr.buildZones.indexOf(zone),
}));
```
Replace with:
```js
this.towers.push(new Tower(this, {
  type: this.selectedType, x: zone.cx, y: zone.cy, def,
  zoneIndex: this.pathMgr.buildZones.indexOf(zone),
}));
```

- [ ] **Step 3: Add `tower.showRange()` and `tower.hideRange()` to tower panel methods in GameScene**

In `_openTowerPanel`, add at the end before the closing brace:
```js
tower.showRange();
```

In `_closeTowerPanel`, add before `this.selectedTower = null`:
```js
if (this.selectedTower) this.selectedTower.hideRange();
```

- [ ] **Step 4: Remove `_drawTowers()` from `GameScene.update()` and delete the method**

In `update()`, remove the line:
```js
this._drawTowers();
```

Delete the entire `_drawTowers()` method (lines ~435–444):
```js
_drawTowers() {
  for (const tower of this.towers) {
    // ...
  }
}
```

- [ ] **Step 5: Run existing tests**

```bash
cd /Users/keithtimko/projects/tower-defense && npm test
```
Expected: 25 tests pass, 0 failures.

- [ ] **Step 6: Browser check**

Run `npm run dev`. Open `http://localhost:5173`. Confirm:
- Menu loads, click map, click PLAY
- Towers placed from bottom bar show emoji icon (🏹🔮💣❄️) inside a colored ring on the canvas
- Clicking a placed tower shows range ring; clicking away hides it

- [ ] **Step 7: Commit**

```bash
git add src/entities/Tower.js src/scenes/GameScene.js
git commit -m "feat: convert Tower to Phaser Container with emoji icon and range ring"
```

---

## Task 2: Enemy Container

**Files:**
- Rewrite: `src/entities/Enemy.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Rewrite `src/entities/Enemy.js`**

```js
import Phaser from 'phaser';

export class Enemy extends Phaser.GameObjects.Container {
  constructor(scene, { def, scaleFactor = 1, startX, startY }) {
    super(scene, startX, startY);

    this.def           = def;
    this.waypointIndex = 0;
    this.maxHp         = def.hp * scaleFactor;
    this.hp            = this.maxHp;
    this.armor         = def.armor;
    this.reward        = def.reward;
    this.dead          = false;
    this.statusEffects = { slow: { active: false, timer: 0, factor: 1 } };

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(3);
    this._redrawBody();
    this._redrawHpBar();
  }

  get currentSpeed() {
    return this.statusEffects.slow.active
      ? this.def.speed * this.statusEffects.slow.factor
      : this.def.speed;
  }

  update(dt) {
    if (this.statusEffects.slow.active) {
      this.statusEffects.slow.timer -= dt;
      if (this.statusEffects.slow.timer <= 0) {
        this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
        this._redrawBody();
      }
    }
  }

  takeDamage(amount, pierce = false) {
    const armor = pierce ? 0 : this.armor;
    this.hp -= Math.max(1, amount - armor);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();
  }

  applyStatus({ type, duration, factor }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
      this._redrawBody();
    }
  }

  _redrawBody() {
    const r = this.def.radius;
    this._body.clear();
    this._body.fillStyle(0x000000, 0.25);
    this._body.fillEllipse(0, r + 2, r * 1.5, 6);
    this._body.fillStyle(this.def.color, 1);
    this._body.fillCircle(0, 0, r);
    if (this.statusEffects.slow.active) {
      this._body.lineStyle(2, 0x00eeff, 1);
      this._body.strokeCircle(0, 0, r);
    }
  }

  _redrawHpBar() {
    const r   = this.def.radius;
    const bw  = r * 2.2, bh = 4, bx = -bw / 2, by = -r - 8;
    const pct = this.hp / this.maxHp;
    this._hpBar.clear();
    this._hpBar.fillStyle(0x222222, 1);
    this._hpBar.fillRect(bx, by, bw, bh);
    this._hpBar.fillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xf39c12 : 0xe74c3c, 1);
    this._hpBar.fillRect(bx, by, bw * pct, bh);
  }
}
```

- [ ] **Step 2: Update Enemy constructor call in `GameScene._spawnEnemy`**

Find:
```js
_spawnEnemy({ def, scaleFactor }) {
  const start = this.pathMgr.path[0];
  this.enemies.push(new Enemy({ def, scaleFactor, startX: start.x, startY: start.y }));
}
```
Replace with:
```js
_spawnEnemy({ def, scaleFactor }) {
  const start = this.pathMgr.path[0];
  this.enemies.push(new Enemy(this, { def, scaleFactor, startX: start.x, startY: start.y }));
}
```

- [ ] **Step 3: Add `enemy.destroy()` for dead enemies in `GameScene._updateEnemies`**

Find the filter line at the end of `_updateEnemies`:
```js
this.enemies = this.enemies.filter(e => !e.dead);
```
Replace with:
```js
for (const e of this.enemies) { if (e.dead) e.destroy(); }
this.enemies = this.enemies.filter(e => !e.dead);
```

- [ ] **Step 4: Remove `_drawEnemies()` from `GameScene.update()` and delete the method**

In `update()`, remove:
```js
this._drawEnemies();
```

Delete the entire `_drawEnemies()` method.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: 25 pass.

- [ ] **Step 6: Browser check**

- Enemies spawn and move along the path
- Enemy body circle with shadow and HP bar visible
- HP bar shrinks as enemies take damage; color shifts green → orange → red
- Slow (ice tower) shows cyan ring on enemy body

- [ ] **Step 7: Commit**

```bash
git add src/entities/Enemy.js src/scenes/GameScene.js
git commit -m "feat: convert Enemy to Phaser Container with body and HP bar children"
```

---

## Task 3: Projectile Container

**Files:**
- Rewrite: `src/entities/Projectile.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Rewrite `src/entities/Projectile.js`**

```js
import Phaser from 'phaser';

export class Projectile extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff }) {
    super(scene, x, y);

    this.target       = target;
    this.targetX      = target ? target.x : x;
    this.targetY      = target ? target.y : y;
    this.damage       = damage;
    this.splashRadius = splashRadius;
    this.pierce       = pierce;
    this.slowFactor   = slowFactor;
    this.color        = color;
    this.dead         = false;
    this.speed        = 280;

    const radius = splashRadius > 0 ? 5 : 3;
    const dot    = scene.add.graphics();
    dot.fillStyle(color, 1);
    dot.fillCircle(0, 0, radius);
    if (slowFactor > 0) {
      dot.lineStyle(1, 0xaaffff, 1);
      dot.strokeCircle(0, 0, radius);
    }
    this.add(dot);
    scene.add.existing(this);
    this.setDepth(4);
  }
}
```

- [ ] **Step 2: Update Projectile constructor call in `GameScene._updateTowers`**

Find:
```js
this.projectiles.push(new Projectile({
  x: tower.x, y: tower.y, target: best,
  damage: tower.damage, splashRadius: tower.splashRadius,
  pierce: tower.pierce, slowFactor: tower.slow,
  color: PROJ_COLORS[tower.type] ?? 0xffffff,
}));
```
Replace with:
```js
this.projectiles.push(new Projectile(this, {
  x: tower.x, y: tower.y, target: best,
  damage: tower.damage, splashRadius: tower.splashRadius,
  pierce: tower.pierce, slowFactor: tower.slow,
  color: PROJ_COLORS[tower.type] ?? 0xffffff,
}));
```

- [ ] **Step 3: Add `proj.destroy()` for dead projectiles in `GameScene._updateProjectiles`**

Find:
```js
this.projectiles = this.projectiles.filter(p => !p.dead);
```
Replace with:
```js
for (const p of this.projectiles) { if (p.dead) p.destroy(); }
this.projectiles = this.projectiles.filter(p => !p.dead);
```

- [ ] **Step 4: Remove `_drawProjectiles()` from `GameScene.update()` and delete the method**

In `update()`, remove:
```js
this._drawProjectiles();
```

Delete the entire `_drawProjectiles()` method.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: 25 pass.

- [ ] **Step 6: Browser check**

- Projectiles are visible as colored dots moving toward enemies
- Cannon (AoE) projectile is a larger dot
- Ice projectile shows cyan ring around dot
- Projectiles disappear on hit, particle burst visible

- [ ] **Step 7: Commit**

```bash
git add src/entities/Projectile.js src/scenes/GameScene.js
git commit -m "feat: convert Projectile to Phaser Container with dot child"
```

---

## Task 4: Static Path + Reactive Zone Rendering

**Files:**
- Modify: `src/scenes/GameScene.js`

Replace the single shared `this.gfx` cleared every frame with three targeted Graphics objects. Path drawn once; zones redrawn only when selection or gold changes; particles still clear+draw each frame.

- [ ] **Step 1: Replace `this.gfx` with three targeted Graphics objects in `GameScene.create()`**

Find:
```js
// Phaser graphics (cleared + redrawn every frame)
this.gfx = this.add.graphics();
this.cameras.main.setBackgroundColor(map.background);

// Static IN/OUT text labels
const p = this.pathMgr.path;
this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
```
Replace with:
```js
this.cameras.main.setBackgroundColor(map.background);

this.pathGfx     = this.add.graphics().setDepth(0);
this.zoneGfx     = this.add.graphics().setDepth(1);
this.particleGfx = this.add.graphics().setDepth(5);

// Draw path once
this.pathMgr.renderPath(this.pathGfx, map.pathColor);
const p = this.pathMgr.path;
this.pathGfx.fillStyle(0x27ae60, 1); this.pathGfx.fillCircle(p[0].x, p[0].y, 13);
this.pathGfx.fillStyle(0xc0392b, 1); this.pathGfx.fillCircle(p[p.length-1].x, p[p.length-1].y, 13);
this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
```

- [ ] **Step 2: Add `_redrawZones()` method and initial call in `create()`**

Add this method to GameScene:
```js
_redrawZones() {
  const canAfford = this.selectedType &&
    this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
  this.zoneGfx.clear();
  for (const zone of this.pathMgr.buildZones) {
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

At the end of `create()`, add:
```js
this._redrawZones();
```

- [ ] **Step 3: Call `_redrawZones()` reactively from `_selectTowerType` and `_updateHUD`**

In `_selectTowerType`, add at the end:
```js
this._redrawZones();
```

In `_updateHUD`, add at the end:
```js
this._redrawZones();
```

Also call `_redrawZones()` after tower placement in `_onPointerDown` (after `zone.occupied = true`):
```js
zone.occupied = true;
this._redrawZones();
return;
```

And after sell in `_sellSelectedTower` (after `zone.occupied = false`):
```js
this.pathMgr.buildZones[tower.zoneIndex].occupied = false;
this._redrawZones();
```

- [ ] **Step 4: Update `GameScene.update()` — remove old draw calls, keep particle clear+draw**

Replace the full draw block at the bottom of `update()`:
```js
this.gfx.clear();
this._drawPath();
this._drawZones();
this._drawTowers();
this._drawEnemies();
this._drawProjectiles();
this._drawParticles();
```
With:
```js
this.particleGfx.clear();
this._drawParticles();
```

- [ ] **Step 5: Update `_drawParticles()` to use `this.particleGfx`**

Find `_drawParticles()` and replace `this.gfx` with `this.particleGfx`:
```js
_drawParticles() {
  for (const p of this.particles) {
    this.particleGfx.lineStyle(2, p.color, p.alpha);
    this.particleGfx.strokeCircle(p.x, p.y, p.radius);
  }
}
```

- [ ] **Step 6: Delete `_drawPath()` and `_drawZones()` methods entirely**

Remove the full `_drawPath()` method and the full `_drawZones()` method from GameScene.

- [ ] **Step 7: Run tests**

```bash
npm test
```
Expected: 25 pass.

- [ ] **Step 8: Browser check**

- Path renders correctly on scene load and doesn't flicker
- Build zone circles appear; highlight gold when affordable tower type selected; red when unaffordable
- Placed tower zone disappears from zone list; sold tower zone reappears
- Particle bursts still appear on enemy death and projectile impact

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: replace per-frame gfx redraw with static path and reactive zone rendering"
```

---

## Task 5: UIScene + GameScene Event Wiring

**Files:**
- Create: `src/scenes/UIScene.js`
- Modify: `src/main.js`
- Modify: `src/scenes/GameScene.js`

This task moves all DOM manipulation from GameScene into UIScene. GameScene emits events on `this.game.events`; UIScene listens and updates the DOM.

- [ ] **Step 1: Create `src/scenes/UIScene.js`**

```js
import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';

export default class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    this._selectedType = null;

    document.getElementById('hud').style.display        = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';
    document.getElementById('game-msg').style.display   = 'none';

    this._bindDOMEvents();
    this._subscribeToGameEvents();

    // Read initial state from GameScene (launched before UIScene, so systems are ready)
    const gs = this.scene.get('GameScene');
    if (gs && gs.economy) {
      this._onHudUpdate({
        gold: gs.economy.gold, lives: gs.economy.lives,
        wave: gs.waveMgr.currentWave, waveCount: MAPS[gs.mapId].waveCount,
        kills: gs.kills,
      });
      this._onWaveState({
        active: gs.waveMgr.active, done: gs.waveMgr.done,
        currentWave: gs.waveMgr.currentWave,
      });
    }
  }

  shutdown() {
    document.getElementById('hud').style.display        = 'none';
    document.getElementById('bottom-bar').style.display = 'none';

    this.game.events.off('hud:update',        this._onHudUpdate,  this);
    this.game.events.off('wave:state',         this._onWaveState,  this);
    this.game.events.off('tower:panel-open',   this._onPanelOpen,  this);
    this.game.events.off('tower:panel-close',  this._onPanelClose, this);
    this.game.events.off('game:victory',       this._onVictory,    this);
    this.game.events.off('game:defeat',        this._onDefeat,     this);

    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
  }

  _bindDOMEvents() {
    document.querySelectorAll('.tower-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (this._selectedType === type) {
          this._selectedType = null;
          document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
          this.game.events.emit('ui:tower-type-select', { type: null });
        } else {
          this._selectedType = type;
          document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.game.events.emit('ui:tower-type-select', { type });
        }
      });
    });

    document.getElementById('wave-btn').addEventListener('click',
      () => this.game.events.emit('ui:wave-start'));
    document.getElementById('speed-btn').addEventListener('click',
      () => this._onSpeedToggle());
    document.getElementById('panel-upgrade-btn').addEventListener('click',
      () => this.game.events.emit('ui:tower-upgrade'));
    document.getElementById('panel-sell-btn').addEventListener('click',
      () => this.game.events.emit('ui:tower-sell'));
    document.getElementById('msg-btn').addEventListener('click',
      () => this.game.events.emit('ui:restart'));
  }

  _onSpeedToggle() {
    const btn = document.getElementById('speed-btn');
    this._speedFast = !this._speedFast;
    btn.textContent = this._speedFast ? '⏸ 1x' : '⏩ 2x';
    this.game.events.emit('ui:speed-toggle');
  }

  _subscribeToGameEvents() {
    this.game.events.on('hud:update',       this._onHudUpdate,  this);
    this.game.events.on('wave:state',        this._onWaveState,  this);
    this.game.events.on('tower:panel-open',  this._onPanelOpen,  this);
    this.game.events.on('tower:panel-close', this._onPanelClose, this);
    this.game.events.on('game:victory',      this._onVictory,    this);
    this.game.events.on('game:defeat',       this._onDefeat,     this);
  }

  _onHudUpdate({ gold, lives, wave, waveCount, kills }) {
    document.getElementById('stat-lives').textContent = lives;
    document.getElementById('stat-gold').textContent  = gold;
    document.getElementById('stat-wave').textContent  = `${wave}/${waveCount}`;
    document.getElementById('stat-kills').textContent = kills;
    document.querySelectorAll('.tower-btn').forEach(btn => {
      const cost = TOWER_DEFS[btn.dataset.type]?.cost ?? Infinity;
      btn.style.opacity = gold >= cost ? '1' : '0.4';
    });
  }

  _onWaveState({ active, done, currentWave }) {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (done) {
      btn.disabled = true;  btn.textContent = 'All Waves Done';
    } else if (active) {
      btn.disabled = true;  btn.textContent = `Wave ${currentWave} in progress...`;
    } else {
      btn.disabled = false; btn.textContent = `▶ Send Wave ${currentWave + 1}`;
    }
  }

  _onPanelOpen({ tower, def, x, y, mapId }) {
    const map = MAPS[mapId];
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name;
    document.getElementById('panel-dmg').textContent  = 'Damage: ' + tower.damage;
    document.getElementById('panel-rng').textContent  = 'Range: ' + tower.range;
    document.getElementById('panel-spd').textContent  = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const nextLevel  = tower.level + 1;
    if (tower.level >= 4) {
      upgradeBtn.textContent = 'MAX LEVEL';
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = map.maxTierAllowed < 2 ? 3 : 5;
      upgradeBtn.textContent = `🔒 Unlocked on Map ${unlockMap}`;
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else {
      const tierDef = def['tier' + nextLevel];
      upgradeBtn.textContent = `Upgrade 💰${tierDef.cost}: ${tierDef.label}`;
      upgradeBtn.className   = 'upgrade-btn';
    }
    document.getElementById('panel-sell-btn').textContent = `💰 Sell (${Math.floor(tower.totalCost * 0.6)}g)`;

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(x + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(y - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';

    // Deselect tower build buttons when panel opens
    this._selectedType = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  _onPanelClose() {
    document.getElementById('tower-panel').style.display = 'none';
  }

  _onVictory({ kills, waveCount }) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  = `Survived all ${waveCount} waves! Kills: ${kills}`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _onDefeat({ wave }) {
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${wave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }
}
```

- [ ] **Step 2: Add UIScene to `src/main.js`**

Add import after the GameScene import:
```js
import UIScene from './scenes/UIScene.js';
```

Add UIScene to the scene array:
```js
scene: [BootScene, MenuScene, GameScene, UIScene],
```

- [ ] **Step 3: Rewrite `GameScene.create()` — remove DOM code, add event wiring**

Replace the entire bottom section of `create()` from `// Show DOM UI` through `this._updateWaveButton()`:
```js
// Remove these lines:
document.getElementById('hud').style.display        = 'flex';
document.getElementById('bottom-bar').style.display = 'flex';
document.getElementById('game-msg').style.display   = 'none';
this._bindDOMEvents();
this._updateHUD();
this._updateWaveButton();
```
With:
```js
// Wire UI events from UIScene
this.game.events.on('ui:wave-start',       () => this._startWave(),                 this);
this.game.events.on('ui:speed-toggle',     () => { this.speed = this.speed === 1 ? 2 : 1; }, this);
this.game.events.on('ui:tower-type-select',({ type }) => this._onTowerTypeSelect(type), this);
this.game.events.on('ui:tower-upgrade',    () => this._upgradeSelectedTower(),       this);
this.game.events.on('ui:tower-sell',       () => this._sellSelectedTower(),          this);
this.game.events.on('ui:restart',          () => this.scene.restart({ mapId: this.mapId }), this);

// Bridge EconomyManager's local event to game-level hud:update
this.events.on('economy:update', this._onEconomyUpdate, this);
// Bridge EconomyManager's defeat signal
this.events.on('game:defeat', this._handleDefeat, this);

// Launch UIScene (UIScene reads initial state from GameScene in its own create())
this.scene.launch('UIScene');
```

- [ ] **Step 4: Rewrite `GameScene.shutdown()`**

Replace the entire shutdown method:
```js
shutdown() {
  this.game.events.off('ui:wave-start',        null, this);
  this.game.events.off('ui:speed-toggle',      null, this);
  this.game.events.off('ui:tower-type-select', null, this);
  this.game.events.off('ui:tower-upgrade',     null, this);
  this.game.events.off('ui:tower-sell',        null, this);
  this.game.events.off('ui:restart',           null, this);
  this.scene.stop('UIScene');
}
```

- [ ] **Step 5: Add new GameScene helper methods**

Add these new methods:
```js
_emitHudUpdate() {
  this.game.events.emit('hud:update', {
    gold: this.economy.gold, lives: this.economy.lives,
    wave: this.waveMgr.currentWave, waveCount: MAPS[this.mapId].waveCount,
    kills: this.kills,
  });
}

_emitWaveState() {
  this.game.events.emit('wave:state', {
    active: this.waveMgr.active, done: this.waveMgr.done,
    currentWave: this.waveMgr.currentWave,
  });
}

_onEconomyUpdate() {
  this._emitHudUpdate();
  this._redrawZones();
}

_handleDefeat() {
  this.over = true;
  this.game.events.emit('game:defeat', { wave: this.waveMgr.currentWave });
}

_onTowerTypeSelect(type) {
  this.selectedType = type;
  if (type !== null) {
    if (this.selectedTower) this.selectedTower.hideRange();
    this.selectedTower = null;
    this.game.events.emit('tower:panel-close');
  }
  this._redrawZones();
}
```

- [ ] **Step 6: Update `_dealDamage` to emit `hud:update` instead of direct DOM write**

Find:
```js
_dealDamage(enemy, damage, pierce) {
  enemy.takeDamage(damage, pierce);
  if (enemy.dead) {
    this.economy.earn(enemy.reward);
    this.kills++;
    document.getElementById('stat-kills').textContent = this.kills;
  }
}
```
Replace with:
```js
_dealDamage(enemy, damage, pierce) {
  enemy.takeDamage(damage, pierce);
  if (enemy.dead) {
    this.economy.earn(enemy.reward);
    this.kills++;
    this._emitHudUpdate();
  }
}
```

- [ ] **Step 7: Update wave methods to emit `wave:state`**

Update `_startWave()`:
```js
_startWave() {
  if (this.waveMgr.active) return;
  this.waveMgr.startWave();
  this._emitWaveState();
}
```

Update `_checkWaveComplete()`:
```js
_checkWaveComplete() {
  if (!this.waveMgr.active) return;
  if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
  this.waveMgr.active = false;
  this.economy.earn(38);
  this._emitWaveState();
  if (this.waveMgr.done) this._handleVictory();
}
```

Add `_handleVictory()`:
```js
_handleVictory() {
  this.won = true;
  this.game.events.emit('game:victory', { kills: this.kills, waveCount: MAPS[this.mapId].waveCount });
}
```

- [ ] **Step 8: Update `_onPointerDown` — replace DOM calls with event emissions**

Find the tower-click branch:
```js
this.selectedType = null;
this._deselectButtons();
this._openTowerPanel(tower, mx, my);
return;
```
Replace with:
```js
this.selectedType = null;
if (this.selectedTower) this.selectedTower.hideRange();
this._panelX = mx; this._panelY = my;
this.game.events.emit('tower:panel-open', {
  tower, def: TOWER_DEFS[tower.type], x: mx, y: my, mapId: this.mapId,
});
tower.showRange();
this.selectedTower = tower;
return;
```

Find the panel-close call:
```js
this._closeTowerPanel();
```
Replace with:
```js
if (this.selectedTower) { this.selectedTower.hideRange(); this.selectedTower = null; }
this.game.events.emit('tower:panel-close');
```

- [ ] **Step 9: Update `_upgradeSelectedTower` — call `tower.upgrade()`, emit panel refresh**

Replace the full method:
```js
_upgradeSelectedTower() {
  if (!this.selectedTower) return;
  const tower     = this.selectedTower;
  const def       = TOWER_DEFS[tower.type];
  const map       = MAPS[this.mapId];
  const nextLevel = tower.level + 1;
  if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
  const tierDef = def['tier' + nextLevel];
  if (!tierDef || !this.economy.spend(tierDef.cost)) { this._toast('Not enough gold!'); return; }
  tower.totalCost += tierDef.cost;
  tower.upgrade(nextLevel);
  this.game.events.emit('tower:panel-open', {
    tower, def, x: this._panelX, y: this._panelY, mapId: this.mapId,
  });
}
```

- [ ] **Step 10: Update `_sellSelectedTower` — call `tower.sell()`, emit panel close**

Replace the full method:
```js
_sellSelectedTower() {
  if (!this.selectedTower) return;
  const tower  = this.selectedTower;
  const refund = tower.sell();
  this.economy.earn(refund);
  this.towers = this.towers.filter(t => t !== tower);
  this.pathMgr.buildZones[tower.zoneIndex].occupied = false;
  this.selectedTower = null;
  this.game.events.emit('tower:panel-close');
  this._redrawZones();
}
```

- [ ] **Step 11: Delete removed GameScene methods**

Delete these methods entirely (they are now replaced by UIScene or new helpers):
- `_bindDOMEvents()`
- `_updateHUD()`
- `_updateWaveButton()`
- `_openTowerPanel()`
- `_closeTowerPanel()`
- `_selectTowerType()`
- `_deselectButtons()`
- `_toggleSpeed()`
- `_onVictory()`
- `_onDefeat()`

- [ ] **Step 12: Run tests**

```bash
npm test
```
Expected: 25 pass.

- [ ] **Step 13: Browser check — full golden path**

Run `npm run dev`. Verify all of:
- Menu → Outpost Sigma → PLAY → game canvas loads with HUD and bottom bar
- Path renders; build zones visible as faint circles
- Click archer button: zones highlight gold; button shows `.selected`; archer icon shows cost in bar
- Click a build zone: archer placed, emoji 🏹 visible on canvas, gold decreases, zone disappears
- Click placed tower: range ring shows, tower panel opens with correct stats
- Upgrade: tier increases, ring thickens, cost deducted
- Sell: gold refunded, zone reappears, panel closes
- Send Wave 1: enemies spawn and move; HP bars visible; kills and gold update in HUD
- Speed toggle: game speeds up, button shows ⏸ 1x; toggle again: back to normal
- All waves cleared: Victory overlay appears
- Click Play Again: game restarts cleanly — gold/lives/kills/wave reset; HUD and bottom bar still visible
- Defeat: lose all lives → Defeat overlay; Play Again restarts cleanly

Also verify with Lunar Gate map (startGold 160, more waves).

- [ ] **Step 14: Commit**

```bash
git add src/scenes/UIScene.js src/scenes/GameScene.js src/main.js
git commit -m "feat: extract UIScene from GameScene, wire all DOM via game-level event bus"
```

---

## Post-Implementation

After Task 5 passes browser verification:

- [ ] **Tag the phase**

```bash
git tag phase-2-complete
```
