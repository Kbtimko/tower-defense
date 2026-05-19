# Phase 6: Hero Unit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Commander Rael — a click-to-move hero unit with three abilities (Overcharge Q, Airstrike W, EMP Pulse E) — that levels up by kill count and respawns 20s after death.

**Architecture:** `Hero.js` extends `Phaser.GameObjects.Container` (mirrors Soldier pattern). GameScene owns `this.hero`, calls `hero.update(dt, enemies)` in the game loop, and handles input disambiguation (aim mode → placement → hero move). UIScene wires Q/W/E buttons and keyboard shortcuts, receiving updates via the game-level event bus.

**Tech Stack:** Phaser 3, Vitest (globals: true, jsdom), ES6 modules, DOM-based UI

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/entities/Hero.js` | **create** | Hero entity — movement, auto-attack, respawn, abilities |
| `src/entities/Hero.test.js` | **create** | Unit tests for Hero |
| `src/entities/Enemy.js` | **modify** | Add stun status effect |
| `src/entities/Enemy.test.js` | **create** | Unit tests for Enemy stun |
| `index.html` | **modify** | Hero section markup + CSS in bottom bar |
| `src/scenes/GameScene.js` | **modify** | Hero instantiation, update loop, input, abilities |
| `src/scenes/UIScene.js` | **modify** | Hero event subscriptions, keydown listener, ability buttons |

---

## Task 1: Enemy Stun Status

**Files:**
- Modify: `src/entities/Enemy.js`
- Create: `src/entities/Enemy.test.js`

- [ ] **Step 1: Write failing tests for stun**

Create `src/entities/Enemy.test.js`:

```js
vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      }
    }
  }
}));

import { Enemy } from './Enemy.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {},
  lineStyle() {}, strokeCircle() {}, strokeRect() {},
  fillEllipse() {}, fillPoints() {}, strokePoints() {},
  fillTriangle() {}, strokeTriangle() {}, strokeCircle() {},
  strokeRect() {}, setVisible(v) { this.visible = v; return this; },
});

const makeScene = () => ({
  add: { graphics: makeGraphics, existing() {} },
});

const makeDef = () => ({
  hp: 100, speed: 80, armor: 0, reward: 10,
  radius: 10, color: 0x00ff00, type: 'drone', flying: false,
});

describe('Enemy stun', () => {
  it('applyStatus stun sets active and timer', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    expect(e.statusEffects.stun.active).toBe(true);
    expect(e.statusEffects.stun.timer).toBe(3);
  });

  it('stun timer ticks down in update', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    e.update(1);
    expect(e.statusEffects.stun.timer).toBeCloseTo(2);
  });

  it('stun clears when timer reaches 0', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 1 });
    e.update(1.5);
    expect(e.statusEffects.stun.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/entities/Enemy.test.js --reporter=verbose
```

Expected: FAIL — `stun` property undefined on `statusEffects`

- [ ] **Step 3: Add stun to Enemy.js**

In `src/entities/Enemy.js`, update `statusEffects` initialization in the constructor:

```js
// Replace:
this.statusEffects = { slow: { active: false, timer: 0, factor: 1 } };
// With:
this.statusEffects = {
  slow: { active: false, timer: 0, factor: 1 },
  stun: { active: false, timer: 0 },
};
```

In `Enemy.update(dt)`, add stun tick after the existing slow tick:

```js
update(dt) {
  if (this.statusEffects.slow.active) {
    this.statusEffects.slow.timer -= dt;
    if (this.statusEffects.slow.timer <= 0) {
      this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
      this._redrawBody();
    }
  }
  // ADD:
  if (this.statusEffects.stun.active) {
    this.statusEffects.stun.timer -= dt;
    if (this.statusEffects.stun.timer <= 0) {
      this.statusEffects.stun = { active: false, timer: 0 };
      this._redrawBody();
    }
  }
}
```

In `Enemy.applyStatus({ type, duration, factor })`, add stun case:

```js
applyStatus({ type, duration, factor }) {
  if (type === 'slow') {
    this.statusEffects.slow = { active: true, timer: duration, factor };
    this._redrawBody();
  }
  // ADD:
  if (type === 'stun') {
    this.statusEffects.stun = { active: true, timer: duration };
    this._redrawBody();
  }
}
```

In `Enemy._redrawBody()`, add a white ring when stunned. Find the existing final line of `_redrawBody` (after all the type-specific drawing) and add before the closing brace:

```js
// White stun ring
if (this.statusEffects.stun.active) {
  this._body.lineStyle(2, 0xffffff, 0.85);
  this._body.strokeCircle(0, 0, this.def.radius + 3);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/entities/Enemy.test.js --reporter=verbose
```

Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.test.js
git commit -m "feat: add stun status effect to Enemy"
```

---

## Task 2: Hero Entity — Core

**Files:**
- Create: `src/entities/Hero.js`
- Create: `src/entities/Hero.test.js`

- [ ] **Step 1: Write failing tests for Hero core**

Create `src/entities/Hero.test.js`:

```js
vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) {
          this.scene = scene; this.x = x; this.y = y;
          this.visible = true;
        }
        add() {}
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

import { Hero } from './Hero.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {},
  lineStyle() {}, strokeCircle() {}, strokeRect() {},
  setVisible(v) { this.visible = v; return this; },
});

const makeScene = () => {
  const emitted = [];
  return {
    add: { graphics: makeGraphics, existing() {} },
    events: {
      emitted,
      emit(event, data) { this.emitted.push({ event, data }); },
    },
  };
};

const makeEnemy = (x, y, hp = 50) => ({
  x, y, hp, dead: false,
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  },
});

describe('Hero — movement', () => {
  it('initializes at given position', () => {
    const hero = new Hero(makeScene(), { x: 100, y: 50 });
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(50);
  });

  it('moveTo sets target and moving flag', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(200, 150);
    expect(hero.targetX).toBe(200);
    expect(hero.targetY).toBe(150);
    expect(hero.moving).toBe(true);
  });

  it('moves toward target each update', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(130, 0);
    hero.update(1, []);
    expect(hero.x).toBeGreaterThan(0);
    expect(hero.x).toBeLessThanOrEqual(130);
  });

  it('stops when within 8px of target', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(5, 0);
    hero.update(1, []);
    expect(hero.moving).toBe(false);
  });
});

describe('Hero — combat', () => {
  it('does not attack enemy out of range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(200, 200);
    hero.update(1, [enemy]);
    expect(enemy.hp).toBe(50);
  });

  it('attacks nearest enemy in range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(30, 0);
    // Advance enough time for first attack (attackTimer starts at 0)
    hero.update(0.01, [enemy]);
    expect(enemy.hp).toBeLessThan(50);
  });
});

describe('Hero — takeDamage and respawn', () => {
  it('takeDamage reduces hp', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(30);
    expect(hero.hp).toBe(120);
  });

  it('death sets dead flag and starts respawn timer', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(200);
    expect(hero.dead).toBe(true);
    expect(hero.respawnTimer).toBe(20);
  });

  it('respawn timer ticks in update; hero respawns when timer reaches 0', () => {
    const hero = new Hero(makeScene(), { x: 50, y: 50 });
    hero.takeDamage(200);
    hero.update(20, []);
    expect(hero.dead).toBe(false);
    expect(hero.hp).toBe(150);
  });

  it('respawn repositions hero to spawn point', () => {
    const hero = new Hero(makeScene(), { x: 50, y: 50 });
    hero.moveTo(300, 300);
    hero.update(0.5, []);
    hero.takeDamage(200);
    hero.update(20, []);
    expect(hero.x).toBe(50);
    expect(hero.y).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/entities/Hero.test.js --reporter=verbose
```

Expected: FAIL — Hero module not found

- [ ] **Step 3: Create Hero.js with core implementation**

Create `src/entities/Hero.js`:

```js
import Phaser from 'phaser';

const MOVE_SPEED     = 130;
const MOVE_STOP_DIST = 8;
const ATTACK_RANGE   = 40;
const ATTACK_RATE    = 1.5;
const ATTACK_DAMAGE  = 18;
const MAX_HP         = 150;
const RESPAWN_TIME   = 20;

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y }) {
    super(scene, x, y);

    this.hp           = MAX_HP;
    this.maxHp        = MAX_HP;
    this.level        = 1;
    this.killCount    = 0;
    this.dead         = false;
    this.respawnTimer = 0;
    this._spawnX      = x;
    this._spawnY      = y;

    this.targetX = x;
    this.targetY = y;
    this.moving  = false;

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
  }

  _drawBody() {
    this._body.clear();
    this._body.fillStyle(0x1a2a4a, 1);
    this._body.fillCircle(0, -10, 6);
    this._body.fillRect(-4, -4, 8, 10);
    this._body.lineStyle(2, 0x4fc3f7, 1);
    this._body.strokeCircle(0, -10, 6);
    this._body.strokeRect(-4, -4, 8, 10);
  }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 16, h = 2, ox = -8, oy = -22;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(0x4fc3f7, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  moveTo(x, y) {
    this.targetX = x;
    this.targetY = y;
    this.moving  = true;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = RESPAWN_TIME;
      this._body.setVisible(false);
      this._hpBar.clear();
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
    this._body.setVisible(true);
    this._redrawHpBar();
  }

  _registerKill() {
    this.killCount++;
    const prev = this.level;
    if (this.level < 2 && this.killCount >= 25) this.level = 2;
    if (this.level < 3 && this.killCount >= 75) this.level = 3;
    if (this.level !== prev) this.scene.events.emit('hero:level-up', { level: this.level });
  }

  overcharge() {
    if (this.dead || this.overchargeTimer > 0) return false;
    this.overchargeTimer     = 30;
    this.overchargeActive    = true;
    this.overchargeRemaining = 6;
    return true;
  }

  airstrike(x, y) {
    if (this.dead || this.airstrikeTimer > 0) return null;
    this.airstrikeTimer = 25;
    return { x, y, radius: 70, damage: 80 };
  }

  empPulse() {
    if (this.dead || this.empTimer > 0) return false;
    this.empTimer = 45;
    return true;
  }

  update(dt, enemies) {
    if (this.overchargeTimer    > 0) this.overchargeTimer    = Math.max(0, this.overchargeTimer    - dt);
    if (this.airstrikeTimer     > 0) this.airstrikeTimer     = Math.max(0, this.airstrikeTimer     - dt);
    if (this.empTimer           > 0) this.empTimer           = Math.max(0, this.empTimer           - dt);
    if (this.overchargeRemaining > 0) {
      this.overchargeRemaining = Math.max(0, this.overchargeRemaining - dt);
      if (this.overchargeRemaining === 0) this.overchargeActive = false;
    }

    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

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

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      let nearest = null, nearestDist = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= ATTACK_RANGE && d < nearestDist) { nearest = e; nearestDist = d; }
      }
      if (nearest) {
        nearest.takeDamage(ATTACK_DAMAGE, false);
        if (nearest.dead) this._registerKill();
        this._attackTimer = 1 / ATTACK_RATE;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/entities/Hero.test.js --reporter=verbose
```

Expected: 9 PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js
git commit -m "feat: add Hero entity — movement, auto-attack, respawn"
```

---

## Task 3: Hero Leveling and Abilities

**Files:**
- Modify: `src/entities/Hero.test.js`

- [ ] **Step 1: Add failing tests for leveling and abilities**

Append to `src/entities/Hero.test.js`:

```js
describe('Hero — leveling', () => {
  it('levels up to L2 at 25 kills', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 24; i++) hero._registerKill();
    expect(hero.level).toBe(1);
    hero._registerKill();
    expect(hero.level).toBe(2);
  });

  it('levels up to L3 at 75 kills', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 75; i++) hero._registerKill();
    expect(hero.level).toBe(3);
  });

  it('emits hero:level-up on scene events when leveling', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 25; i++) hero._registerKill();
    expect(scene.events.emitted.some(e => e.event === 'hero:level-up' && e.data.level === 2)).toBe(true);
  });

  it('does not emit level-up when already at max level', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 100; i++) hero._registerKill();
    const l3Events = scene.events.emitted.filter(e => e.event === 'hero:level-up' && e.data.level === 3);
    expect(l3Events.length).toBe(1);
  });
});

describe('Hero — abilities', () => {
  it('overcharge returns true and sets active flag', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    expect(hero.overcharge()).toBe(true);
    expect(hero.overchargeActive).toBe(true);
  });

  it('overcharge returns false while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.overcharge();
    expect(hero.overcharge()).toBe(false);
  });

  it('overchargeActive clears after 6s', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.overcharge();
    hero.update(6.1, []);
    expect(hero.overchargeActive).toBe(false);
  });

  it('airstrike returns target data', () => {
    const hero   = new Hero(makeScene(), { x: 0, y: 0 });
    const result = hero.airstrike(100, 200);
    expect(result).toEqual({ x: 100, y: 200, radius: 70, damage: 80 });
  });

  it('airstrike returns null while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.airstrike(100, 200);
    expect(hero.airstrike(100, 200)).toBeNull();
  });

  it('empPulse returns true and sets cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    expect(hero.empPulse()).toBe(true);
    expect(hero.empTimer).toBe(45);
  });

  it('empPulse returns false while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.empPulse();
    expect(hero.empPulse()).toBe(false);
  });

  it('abilities return false when hero is dead', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(200);
    expect(hero.overcharge()).toBe(false);
    expect(hero.airstrike(0, 0)).toBeNull();
    expect(hero.empPulse()).toBe(false);
  });
});
```

- [ ] **Step 2: Run all Hero tests to verify they pass**

```bash
npx vitest run src/entities/Hero.test.js --reporter=verbose
```

Expected: all tests PASS (leveling and abilities were implemented in Task 2's Hero.js)

- [ ] **Step 3: Commit**

```bash
git add src/entities/Hero.test.js
git commit -m "test: add Hero leveling and ability tests"
```

---

## Task 4: HTML Hero Section

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add hero section CSS**

In `index.html`, inside the `<style>` block, after the `.map-row-stars` rule, add:

```css
#hero-section { display:flex; align-items:center; gap:6px; }
#hero-portrait { width:30px; height:30px; border-radius:50%; background:#1a2a4a;
                 border:2px solid #4fc3f7; display:flex; align-items:center;
                 justify-content:center; font-size:13px; color:#4fc3f7; font-weight:bold; }
#hero-info { display:flex; flex-direction:column; gap:3px; }
#hero-level { font-size:10px; color:#4fc3f7; }
#hero-hp-bg { width:52px; height:5px; background:#333; border-radius:2px; overflow:hidden; }
#hero-hp-fill { height:100%; background:#4fc3f7; border-radius:2px; transition:width 0.15s; }
.ability-btn { background:#1a2a3a; border:2px solid #4fc3f7; border-radius:5px;
               padding:4px 7px; cursor:pointer; display:flex; flex-direction:column;
               align-items:center; gap:1px; color:#4fc3f7; font-family:'Georgia',serif; }
.ability-btn.locked { background:#111; border-color:#333; color:#444; cursor:default; }
.ability-btn:disabled { opacity:0.45; cursor:not-allowed; }
.ability-btn:not(:disabled):not(.locked):hover { background:#253a4a; }
.ability-key  { font-size:11px; font-weight:bold; letter-spacing:1px; }
.ability-name { font-size:12px; }
.ability-cd   { font-size:9px; color:#aaa; min-height:11px; }
.bar-divider  { width:1px; height:36px; background:#333; flex-shrink:0; }
```

- [ ] **Step 2: Add hero section HTML**

In `index.html`, inside `<div id="bottom-bar">`, insert the following **before** the first `<button class="tower-btn"` line:

```html
    <div id="hero-section">
      <div id="hero-portrait">R</div>
      <div id="hero-info">
        <div id="hero-level">Rael L1</div>
        <div id="hero-hp-bg"><div id="hero-hp-fill"></div></div>
      </div>
      <button class="ability-btn" id="ability-q" disabled title="Overcharge — +50% tower fire rate 6s">
        <span class="ability-key">Q</span><span class="ability-name">⚡</span><span class="ability-cd"></span>
      </button>
      <button class="ability-btn locked" id="ability-w" disabled title="Airstrike — AoE damage on target area">
        <span class="ability-key">W</span><span class="ability-name">🎯</span><span class="ability-cd"></span>
      </button>
      <button class="ability-btn locked" id="ability-e" disabled title="EMP Pulse — stuns all aliens 3s">
        <span class="ability-key">E</span><span class="ability-name">💥</span><span class="ability-cd"></span>
      </button>
    </div>
    <div class="bar-divider"></div>
```

- [ ] **Step 3: Verify visually in browser**

```bash
npm run dev
```

Open http://localhost:5173, navigate to any map. The bottom bar should show the hero section (portrait "R", hp bar, Q/W/E buttons) to the left of the tower buttons.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add hero section to bottom bar (portrait, HP bar, Q/W/E buttons)"
```

---

## Task 5: GameScene — Hero Wiring

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Import Hero and add hero to create()**

At the top of `src/scenes/GameScene.js`, add the import after existing entity imports:

```js
import { Hero } from '../entities/Hero.js';
```

In `GameScene.create()`, after the `this.placementManager = ...` block and before the entity arrays section, add:

```js
// Hero
this.hero                    = new Hero(this, this.pathMgr.path[0]);
this.aimMode                 = false;
this._heroOverchargeWasActive = false;
this._heroCooldownAccum      = 0;
```

At the end of `create()`, after `this._updateWaveButton()` and before the DEV check, add the level-up relay listener and initial Q-unlock:

```js
// Relay hero scene events to game bus for UIScene
this.events.on('hero:level-up', ({ level }) => {
  this.game.events.emit('hero:level-up', { level });
}, this);

// Unlock Q immediately (hero starts at L1)
this.time.delayedCall(150, () => {
  this.game.events.emit('hero:level-up', { level: 1 });
});

// Wire ability dispatch
this.game.events.on('ui:ability', this._onAbility, this);
```

- [ ] **Step 2: Add _updateHero to the update loop**

In `GameScene.update()`, after `this._updateSoldiers(dt);`, add:

```js
this._updateHero(dt);
```

- [ ] **Step 3: Implement _updateHero**

Add this method after `_updateSoldiers`:

```js
_updateHero(dt) {
  this.hero.update(dt, this.enemies);

  // Detect overcharge flip
  if (this.hero.overchargeActive !== this._heroOverchargeWasActive) {
    this._heroOverchargeWasActive = this.hero.overchargeActive;
    this._applyOvercharge(this.hero.overchargeActive);
  }

  // Emit HP/level for UIScene
  this.game.events.emit('hero:update', {
    hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
  });

  // Cooldown tick (once per second)
  this._heroCooldownAccum += dt;
  if (this._heroCooldownAccum >= 1) {
    this._heroCooldownAccum = 0;
    this.game.events.emit('hero:cooldown-tick', {
      q: Math.ceil(this.hero.overchargeTimer),
      w: Math.ceil(this.hero.airstrikeTimer),
      e: Math.ceil(this.hero.empTimer),
    });
  }
}
```

- [ ] **Step 4: Implement _applyOvercharge**

Add this method after `_updateHero`:

```js
_applyOvercharge(active) {
  for (const tower of this.placementManager.getTowers()) {
    if (!tower.fireRate) continue;
    if (active) {
      tower._baseFireRate = tower.fireRate;
      tower.fireRate = tower.fireRate * 1.5;
    } else if (tower._baseFireRate !== undefined) {
      tower.fireRate = tower._baseFireRate;
      delete tower._baseFireRate;
    }
  }
}
```

- [ ] **Step 5: Add stun skip in _updateEnemies**

In `GameScene._updateEnemies(dt)`, after `enemy.update(dt);` and before the blocker check, add:

```js
if (enemy.statusEffects.stun.active) continue;
```

The updated section should look like:

```js
for (const enemy of this.enemies) {
  enemy.update(dt);
  if (enemy.statusEffects.stun.active) continue;   // ← ADD THIS LINE
  const blocker = this._checkSoldierBlock(enemy);
  // ... rest unchanged
```

- [ ] **Step 6: Clean up ui:ability in shutdown()**

In `GameScene.shutdown()`, find the array of IDs being cloned and the `.forEach` loop that registers listeners. Add `'ui:ability'` cleanup. Add this line anywhere in `shutdown()`:

```js
this.game.events.off('ui:ability', this._onAbility, this);
```

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: all existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: wire Hero into GameScene — update loop, overcharge, stun skip"
```

---

## Task 6: GameScene — Input and Ability Handlers

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Rewrite _onPointerDown with aim mode + hero moveTo**

Replace the entire `_onPointerDown` method with:

```js
_onPointerDown(pointer) {
  const mx = pointer.x, my = pointer.y;

  // 1. Airstrike aim mode takes priority
  if (this.aimMode) {
    this._triggerAirstrike(mx, my);
    return;
  }

  // 2. Barracks reposition mode
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
    if (this.selectedTower) this._openTowerPanel(barracks, mx, my);
    return;
  }

  // 3. Tower click
  for (const tower of this.placementManager.getTowers()) {
    if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
      this.selectedType = null;
      this._deselectButtons();
      this._openTowerPanel(tower, mx, my);
      return;
    }
  }
  this._closeTowerPanel();

  // 4. Tower placement
  if (this.selectedType) {
    const zones = this.placementManager.getZones();
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
        const tower = this.placementManager.placeTower(i, this.selectedType, this);
        if (!tower) { this._toast('Not enough gold!'); return; }
        if (this.selectedType === 'barracks') {
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(zone.cx, zone.cy);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        }
        return;
      }
    }
    return;
  }

  // 5. Move hero
  this.hero.moveTo(mx, my);
}
```

- [ ] **Step 2: Add _onAbility handler**

Add this method after `_onPointerDown`:

```js
_onAbility({ slot }) {
  switch (slot) {
    case 'q':
      this.hero.overcharge();
      break;
    case 'w':
      if (this.hero.airstrikeTimer > 0 || this.hero.dead) return;
      this.aimMode = true;
      this.game.events.emit('hero:aim-mode');
      break;
    case 'e':
      if (!this.hero.empPulse()) return;
      for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
      break;
  }
}
```

- [ ] **Step 3: Add _triggerAirstrike**

Add this method after `_onAbility`:

```js
_triggerAirstrike(x, y) {
  const result = this.hero.airstrike(x, y);
  if (!result) return;
  for (const e of this.enemies) {
    if (Math.hypot(e.x - x, e.y - y) <= result.radius) {
      this._dealDamage(e, result.damage, true);
    }
  }
  // Particle burst at impact point
  this._addParticle(x, y, 0xff6400, 18);
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    this._addParticle(
      x + Math.cos(angle) * 28,
      y + Math.sin(angle) * 28,
      0xff8800,
      8
    );
  }
  this.aimMode = false;
  this.game.events.emit('hero:aim-cancel');
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: hero input (aim mode, moveTo fallback), abilities (overcharge/airstrike/EMP)"
```

---

## Task 7: UIScene — Hero Events and Keybindings

**Files:**
- Modify: `src/scenes/UIScene.js`

- [ ] **Step 1: Add keydown listener in _bindDOMEvents**

In `UIScene._bindDOMEvents()`, add at the end of the method:

```js
// Ability button clicks
['q', 'w', 'e'].forEach(slot => {
  const btn = document.getElementById('ability-' + slot);
  if (btn) btn.addEventListener('click', () => this.game.events.emit('ui:ability', { slot }));
});

// Keyboard shortcuts
this._onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (['q', 'w', 'e'].includes(key)) {
    this.game.events.emit('ui:ability', { slot: key });
  }
};
document.addEventListener('keydown', this._onKeyDown);
```

- [ ] **Step 2: Subscribe to hero events in _subscribeToGameEvents**

In `UIScene._subscribeToGameEvents()`, add after the existing `this.game.events.on('ui:barracks-reposition', ...)` line:

```js
this.game.events.on('hero:update',      this._onHeroUpdate,      this);
this.game.events.on('hero:level-up',    this._onHeroLevelUp,     this);
this.game.events.on('hero:aim-mode',    this._onHeroAimMode,     this);
this.game.events.on('hero:aim-cancel',  this._onHeroAimCancel,   this);
this.game.events.on('hero:cooldown-tick', this._onHeroCooldownTick, this);
```

- [ ] **Step 3: Add hero event handler methods**

Add these methods after `_onBarracksReposition`:

```js
_onHeroUpdate({ hp, maxHp }) {
  const fill = document.getElementById('hero-hp-fill');
  if (fill) fill.style.width = ((hp / maxHp) * 100).toFixed(1) + '%';
}

_onHeroLevelUp({ level }) {
  document.getElementById('hero-level').textContent = 'Rael L' + level;
  if (level >= 1) {
    const q = document.getElementById('ability-q');
    if (q) { q.disabled = false; }
  }
  if (level >= 2) {
    const w = document.getElementById('ability-w');
    if (w) { w.classList.remove('locked'); w.disabled = false; }
  }
  if (level >= 3) {
    const e = document.getElementById('ability-e');
    if (e) { e.classList.remove('locked'); e.disabled = false; }
  }
}

_onHeroAimMode() {
  document.body.style.cursor = 'crosshair';
  const w = document.getElementById('ability-w');
  if (w) w.style.outline = '2px solid #ff6400';
}

_onHeroAimCancel() {
  document.body.style.cursor = '';
  const w = document.getElementById('ability-w');
  if (w) w.style.outline = '';
}

_onHeroCooldownTick({ q, w, e }) {
  this._setAbilityCd('ability-q', q);
  this._setAbilityCd('ability-w', w);
  this._setAbilityCd('ability-e', e);
}

_setAbilityCd(id, secs) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const cdEl = btn.querySelector('.ability-cd');
  if (secs > 0) {
    btn.disabled = true;
    if (cdEl) cdEl.textContent = secs + 's';
  } else {
    if (!btn.classList.contains('locked')) btn.disabled = false;
    if (cdEl) cdEl.textContent = '';
  }
}
```

- [ ] **Step 4: Add hero events to shutdown cleanup**

In `UIScene.shutdown()`, add hero event deregistration after the existing `game.events.off` block:

```js
this.game.events.off('hero:update',       this._onHeroUpdate,      this);
this.game.events.off('hero:level-up',     this._onHeroLevelUp,     this);
this.game.events.off('hero:aim-mode',     this._onHeroAimMode,     this);
this.game.events.off('hero:aim-cancel',   this._onHeroAimCancel,   this);
this.game.events.off('hero:cooldown-tick',this._onHeroCooldownTick,this);
document.removeEventListener('keydown', this._onKeyDown);
```

Add `'ability-q'`, `'ability-w'`, `'ability-e'` to the button-clone array:

```js
// Replace:
['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn'].forEach(id => {
// With:
['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn',
 'ability-q','ability-w','ability-e'].forEach(id => {
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Browser smoke test**

```bash
npm run dev
```

Open http://localhost:5173 and verify:

1. Bottom bar shows hero portrait, hp bar, Q/W/E buttons — Q enabled (others locked/greyed)
2. Click the canvas with no tower selected → Rael (blue humanoid) walks to the clicked point
3. Click a tower button, then click canvas → tower placement works as before
4. Press Q → Q button goes on cooldown (opacity dims, countdown appears after 1s tick)
5. Kill 25 enemies → W button unlocks
6. Press W → cursor becomes crosshair, W button highlights; click canvas → airstrike explosion, cursor restores
7. Kill 75 total enemies → E button unlocks
8. Press E → all enemies briefly get a white ring (stunned), can't move for 3s
9. Kill Rael (debug: `window.__game.hero.takeDamage(200)`) → hero disappears; respawns at path start after 20s

- [ ] **Step 7: Commit**

```bash
git add src/scenes/UIScene.js
git commit -m "feat: hero UI — ability buttons, keydown Q/W/E, HP bar, cooldown display"
```
