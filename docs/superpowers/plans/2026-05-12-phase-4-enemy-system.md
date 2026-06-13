# Phase 4 — Alien Enemy System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete playable Map 1 with three visually distinct alien enemy types, death particles, and a balanced 10-wave progression.

**Architecture:** Enemy shapes are type-dispatched inside `Enemy._redrawBody()` using two new helper methods. Death particles reuse the existing `GameScene` particle system (`_addParticle` / `_updateParticles`). Wave data moves from a shared `makeWaves()` function to a `MAP_WAVES` keyed object so each map owns its wave definition.

**Tech Stack:** Phaser.js 3.x (`Graphics.fillPoints`, `Graphics.lineBetween`), Vitest, ES6 modules.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/data/enemies.js` | Modify | Add `type` field per def; update alien color palette |
| `src/data/enemies.test.js` | Create | Validate `type` field present and matches key |
| `src/data/waves.js` | Modify | Replace `makeWaves()` with `MAP_WAVES` keyed object |
| `src/data/waves.test.js` | Create | Validate Map 0 wave count, no Colossus, drone-only finale |
| `src/entities/Enemy.js` | Modify | Type-dispatched `_redrawBody()`, `_hexPoints()`, `_diamondPoints()` helpers |
| `src/scenes/GameScene.js` | Modify | Import `MAP_WAVES`; add death particle burst in `_dealDamage` |

---

## Task 1: Add `type` field and alien colors to `enemies.js`

`Enemy._redrawBody()` needs `this.def.type` to dispatch shapes. `WaveManager` spreads the def onto the spawned enemy, so adding `type` to the def is the cleanest path.

**Files:**
- Modify: `src/data/enemies.js`
- Create: `src/data/enemies.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/data/enemies.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS } from './enemies.js';

describe('ENEMY_DEFS', () => {
  const REQUIRED = ['type', 'name', 'hp', 'speed', 'reward', 'armor', 'color', 'radius', 'flying'];
  for (const [key, def] of Object.entries(ENEMY_DEFS)) {
    it(`${key} has all required fields`, () => {
      for (const field of REQUIRED) expect(def).toHaveProperty(field);
    });
    it(`${key}.type matches its key`, () => {
      expect(def.type).toBe(key);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/data/enemies.test.js
```

Expected: FAIL — `type` property missing on each def.

- [ ] **Step 3: Update `enemies.js`**

Replace the file contents:

```js
export const ENEMY_DEFS = {
  drone:    { type: 'drone',    name: 'Veth Drone',    hp: 70,  speed: 50, reward: 14, armor: 0,  color: 0x33ff66, radius: 9,  flying: false },
  skitter:  { type: 'skitter',  name: 'Veth Skitter',  hp: 40,  speed: 90, reward: 15, armor: 0,  color: 0xff6600, radius: 7,  flying: false },
  brute:    { type: 'brute',    name: 'Veth Brute',    hp: 120, speed: 38, reward: 22, armor: 8,  color: 0x667766, radius: 11, flying: false },
  colossus: { type: 'colossus', name: 'Veth Colossus', hp: 400, speed: 28, reward: 55, armor: 15, color: 0x880044, radius: 16, flying: false },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/data/enemies.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/enemies.js src/data/enemies.test.js
git commit -m "feat: add type field and alien color palette to enemy defs"
```

---

## Task 2: Replace `makeWaves()` with `MAP_WAVES`

**Files:**
- Modify: `src/data/waves.js`
- Create: `src/data/waves.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/data/waves.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAP_WAVES } from './waves.js';

describe('MAP_WAVES[0] (Outpost Sigma)', () => {
  const waves = MAP_WAVES[0];

  it('has exactly 10 waves', () => {
    expect(waves).toHaveLength(10);
  });

  it('contains no colossus enemies', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(group.type).not.toBe('colossus');
      }
    }
  });

  it('final wave (index 9) contains only drones', () => {
    for (const group of waves[9]) {
      expect(group.type).toBe('drone');
    }
  });

  it('final wave has at least 15 drones total', () => {
    const total = waves[9].reduce((sum, g) => sum + g.count, 0);
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it('all groups have valid type, positive count, and positive interval', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(typeof group.type).toBe('string');
        expect(group.count).toBeGreaterThan(0);
        expect(group.interval).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/waves.test.js
```

Expected: FAIL — `MAP_WAVES` not exported.

- [ ] **Step 3: Replace `waves.js`**

```js
export const MAP_WAVES = {
  0: [
    [{ type: 'drone',   count: 7,  interval: 1200 }],
    [{ type: 'drone',   count: 9,  interval: 1100 }, { type: 'skitter', count: 3, interval: 950  }],
    [{ type: 'skitter', count: 8,  interval: 850  }],
    [{ type: 'brute',   count: 4,  interval: 1400 }],
    [{ type: 'drone',   count: 8,  interval: 1000 }, { type: 'brute',   count: 3, interval: 1400 }],
    [{ type: 'skitter', count: 6,  interval: 800  }, { type: 'brute',   count: 4, interval: 1300 }],
    [{ type: 'drone',   count: 10, interval: 900  }, { type: 'skitter', count: 5, interval: 750  }],
    [{ type: 'brute',   count: 8,  interval: 1100 }, { type: 'skitter', count: 5, interval: 700  }],
    [{ type: 'drone',   count: 10, interval: 900  }, { type: 'brute',   count: 6, interval: 1000 }, { type: 'skitter', count: 6, interval: 750 }],
    [{ type: 'drone',   count: 20, interval: 700  }],
  ],
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/data/waves.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/waves.js src/data/waves.test.js
git commit -m "feat: replace makeWaves with MAP_WAVES — Map 1 wave balance, Colossus removed"
```

---

## Task 3: Update `GameScene` to use `MAP_WAVES`

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Update the import at the top of `GameScene.js`**

Find line 4:
```js
import { makeWaves } from '../data/waves.js';
```
Replace with:
```js
import { MAP_WAVES } from '../data/waves.js';
```

- [ ] **Step 2: Update the `WaveManager` constructor call in `create()`**

Find line 28:
```js
this.waveMgr  = new WaveManager(makeWaves(this.mapId), this.events);
```
Replace with:
```js
this.waveMgr  = new WaveManager(MAP_WAVES[this.mapId], this.events);
```

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests PASS.

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Open the game, click "Send Wave". Confirm:
- Waves spawn (Drones, Skitters, Brutes — no Colossus)
- Wave 10 is a dense Drone surge
- Game completes after wave 10

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: load waves from MAP_WAVES keyed by mapId"
```

---

## Task 4: Type-dispatched enemy shapes in `Enemy.js`

Replaces the all-circles `_redrawBody()` with per-type alien shapes. Adds two private helper methods for polygon point generation.

**Files:**
- Modify: `src/entities/Enemy.js`

- [ ] **Step 1: Add `_hexPoints()` and `_diamondPoints()` helpers**

Append these two methods to the `Enemy` class (after `_redrawHpBar`):

```js
_hexPoints(r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

_diamondPoints(w, h) {
  return [{ x: 0, y: -h }, { x: w / 2, y: 0 }, { x: 0, y: h }, { x: -w / 2, y: 0 }];
}
```

- [ ] **Step 2: Replace `_redrawBody()` with type-dispatched version**

Replace the existing `_redrawBody()` method:

```js
_redrawBody() {
  const r = this.def.radius;
  this._body.clear();

  // Drop shadow
  this._body.fillStyle(0x000000, 0.25);
  this._body.fillEllipse(0, r + 2, r * 1.5, 6);

  const t = this.def.type;
  if (t === 'drone') {
    // Glow ring
    this._body.fillStyle(0x33ff66, 0.2);
    this._body.fillPoints(this._hexPoints(r * 1.5), true);
    // Body
    this._body.fillStyle(0x33ff66, 1);
    this._body.fillPoints(this._hexPoints(r), true);
  } else if (t === 'skitter') {
    // Glow oval
    this._body.fillStyle(0xff6600, 0.2);
    this._body.fillEllipse(0, 0, r * 2.8, r * 2.0);
    // Body
    this._body.fillStyle(0xff6600, 1);
    this._body.fillPoints(this._diamondPoints(r * 1.4, r), true);
    // Legs
    this._body.lineStyle(1.5, 0xff6600, 0.8);
    for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this._body.lineBetween(lx * r * 0.6, ly * r * 0.5, lx * r * 1.2, ly * r * 1.1);
    }
  } else if (t === 'brute') {
    // Glow ring
    this._body.fillStyle(0x667766, 0.15);
    this._body.fillPoints(this._hexPoints(r * 1.3), true);
    // Dark armor base
    this._body.fillStyle(0x334433, 1);
    this._body.fillPoints(this._hexPoints(r), true);
    // Lighter center plate
    this._body.fillStyle(0x667766, 1);
    this._body.fillPoints(this._hexPoints(r * 0.65), true);
  } else {
    // Fallback for unknown types (colossus, future enemies)
    this._body.fillStyle(this.def.color, 1);
    this._body.fillCircle(0, 0, r);
  }

  if (this.statusEffects.slow.active) {
    this._body.lineStyle(2, 0x00eeff, 1);
    this._body.strokeCircle(0, 0, r + 2);
  }
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all PASS (no Enemy unit tests; this step confirms no import/syntax errors break other tests).

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Start a wave and confirm:
- Drones appear as green hexagons with a soft glow ring
- Skitters appear as orange diamonds with 4 leg lines
- Brutes appear as grey-green layered hexagons with darker armor plating
- Slow effect (ice blue ring) still appears when Ice tower hits an enemy
- HP bar still visible above each enemy

- [ ] **Step 5: Commit**

```bash
git add src/entities/Enemy.js
git commit -m "feat: type-dispatched alien enemy shapes — drone hex, skitter diamond, brute shield"
```

---

## Task 5: Death particles

Reuses the existing `GameScene` particle system. `_dealDamage` already handles enemy kills — add a burst of 7 particles (1 central flash + 6 radial) at the enemy's position on kill.

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Update `_dealDamage` in `GameScene.js`**

Find the existing `_dealDamage` method (around line 222):

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

Replace with:

```js
_dealDamage(enemy, damage, pierce) {
  enemy.takeDamage(damage, pierce);
  if (enemy.dead) {
    this.economy.earn(enemy.reward);
    this.kills++;
    this._emitHudUpdate();
    // Central flash
    this._addParticle(enemy.x, enemy.y, enemy.def.color, 10);
    // Radial burst
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      this._addParticle(
        enemy.x + Math.cos(angle) * enemy.def.radius * 0.8,
        enemy.y + Math.sin(angle) * enemy.def.radius * 0.8,
        enemy.def.color,
        5
      );
    }
  }
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Kill several enemies and confirm:
- Each kill produces a burst of colored particles matching the enemy type (green for drone, orange for skitter, grey-green for brute)
- Particles expand and fade over ~300ms
- No particles appear when an enemy reaches the base (only kills trigger burst)

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: alien death particle burst on enemy kill"
```

---

## Verification

After all 5 tasks are committed, run the full suite one final time:

```bash
npx vitest run
```

Expected: all tests PASS. Then open `npm run dev` and play through waves 1–10 on Map 1 to confirm:
- [ ] All 3 enemy types are visually distinct and alien-themed
- [ ] Wave difficulty escalates smoothly (drones intro → mixed → drone surge finale)
- [ ] No Colossus appears on Map 1
- [ ] Death particles fire on kills, not on enemies reaching the base
- [ ] HP bars, slow rings, and drop shadows still work correctly
