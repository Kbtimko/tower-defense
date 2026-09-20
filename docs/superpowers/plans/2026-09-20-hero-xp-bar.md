# Hero XP Progress Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a gold progress bar under the hero's HP bar that fills as the hero deals damage, so the player can see how close the hero is to its next level.

**Architecture:** A new pure `heroXpProgress()` joins the existing levelling maths in `src/systems/heroLeveling.js`. `Hero` exposes a one-line `xpProgress()` accessor (the map HP budget and start level are Hero's private state, so the scene must not reach for them). `GameScene._updateHero` adds the result to the `hero:update` event it already emits every frame, and `UIScene` sets a fill width from it. Display only — no change to XP rates, thresholds, or when levels are earned.

**Tech Stack:** Plain ES modules, Phaser 3, Vitest + jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-hero-xp-bar-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/systems/heroLeveling.js` | Levelling maths, shared with the headless simulator | Add `heroXpProgress()` |
| `src/systems/heroLeveling.test.js` | Unit tests for that maths | Add a `describe` block |
| `src/entities/Hero.js` | Hero state and behaviour | Add `xpProgress()` accessor |
| `src/entities/Hero.test.js` | Hero unit tests | Add a `describe` block |
| `src/scenes/GameScene.js` | Relays hero state to the UI | Add `xp` to the `hero:update` payload |
| `src/scenes/GameScene.heroXp.test.js` | Asserts the payload carries `xp` | Create |
| `index.html` | HUD markup and CSS | Add `#hero-xp-bg` / `#hero-xp-fill` |
| `src/scenes/UIScene.js` | Renders the HUD | Render the bar and tooltip; `MAX` label |
| `src/scenes/UIScene.heroXp.test.js` | Asserts the DOM updates | Create |

**Note on the design doc:** the spec sketched `xp: heroXpProgress(...)` inside `GameScene`. That would require the scene to read `hero._mapTotalHp` and `hero._startLevel`, both private. Task 2 adds `Hero.xpProgress()` instead and Task 3 calls that. Same data flow, no private access.

---

### Task 1: `heroXpProgress()` — the pure maths

**Files:**
- Modify: `src/systems/heroLeveling.js`
- Test: `src/systems/heroLeveling.test.js`

Background the implementer needs: `heroXpThresholds(mapTotalHp)` returns four ABSOLUTE damage figures, from `HERO_LEVEL_DAMAGE_FRACTIONS = [0.07, 0.13, 0.21, 0.30]`. `thresholds[i]` is the damage needed to **reach level `i + 2`**. So the window for the level the hero is currently on is:

| current level | previous threshold | next threshold |
|---|---|---|
| 1 | `0` | `thresholds[0]` |
| 2 | `thresholds[0]` | `thresholds[1]` |
| 3 | `thresholds[1]` | `thresholds[2]` |
| 4 | `thresholds[2]` | `thresholds[3]` |
| 5 | — at max, no next | — |

i.e. for level `L` below max: `prev = L >= 2 ? thresholds[L - 2] : 0`, `next = thresholds[L - 1]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/systems/heroLeveling.test.js`:

```js
describe('heroXpProgress', () => {
  const T = TOTAL;                       // 10000, defined at the top of this file
  const [t2, t3, t4, t5] = HERO_LEVEL_DAMAGE_FRACTIONS.map(f => f * T);

  it('is empty at the very start of the run', () => {
    const p = heroXpProgress(0, T, { startLevel: 1, maxLevel: 5 });
    expect(p.level).toBe(1);
    expect(p.progress).toBe(0);
    expect(p.atMax).toBe(false);
  });

  it('is half full halfway through the first level window', () => {
    const p = heroXpProgress(t2 / 2, T, { startLevel: 1, maxLevel: 5 });
    expect(p.level).toBe(1);
    expect(p.progress).toBeCloseTo(0.5);
  });

  it('reports the window, not the running total, as current/needed', () => {
    const p = heroXpProgress(t2 + (t3 - t2) * 0.25, T, { startLevel: 1, maxLevel: 5 });
    expect(p.level).toBe(2);
    expect(p.needed).toBeCloseTo(t3 - t2);
    expect(p.current).toBeCloseTo((t3 - t2) * 0.25);
    expect(p.progress).toBeCloseTo(0.25);
  });

  it('resets to empty the instant a level is earned', () => {
    // exactly ON the threshold counts as the higher level (heroLevelForDamage uses >=)
    const p = heroXpProgress(t3, T, { startLevel: 1, maxLevel: 5 });
    expect(p.level).toBe(3);
    expect(p.progress).toBe(0);
  });

  it('sits full and flags atMax at the top level', () => {
    const p = heroXpProgress(t5 * 3, T, { startLevel: 1, maxLevel: 5 });
    expect(p.level).toBe(5);
    expect(p.atMax).toBe(true);
    expect(p.progress).toBe(1);
  });

  it('honours a maxLevel below 5 rather than the constant', () => {
    const p = heroXpProgress(t5, T, { startLevel: 1, maxLevel: 3 });
    expect(p.level).toBe(3);
    expect(p.atMax).toBe(true);
  });

  // The <hero>_veteran / <hero>_elite meta upgrades set heroStartLevel 2 or 3,
  // so the hero starts mid-ladder with damageDealt 0. The naive formula gives
  // (0 - 0.13T) / 0.08T = -1.6 here.
  it('never goes negative for a hero that started above level 1', () => {
    const p = heroXpProgress(0, T, { startLevel: 3, maxLevel: 5 });
    expect(p.level).toBe(3);
    expect(p.progress).toBe(0);
    expect(p.current).toBe(0);
  });

  it('advances normally once a head-start hero passes its own floor', () => {
    const p = heroXpProgress(t3 + (t4 - t3) * 0.5, T, { startLevel: 3, maxLevel: 5 });
    expect(p.level).toBe(3);
    expect(p.progress).toBeCloseTo(0.5);
  });

  it('yields 0 rather than NaN on a map with no HP budget', () => {
    const p = heroXpProgress(500, 0, { startLevel: 1, maxLevel: 5 });
    expect(Number.isFinite(p.progress)).toBe(true);
    expect(p.progress).toBe(0);
  });

  it('never leaves the 0..1 range for any damage total', () => {
    for (const dealt of [-100, 0, 1, t2 - 1, t2, t4, t5, t5 * 10]) {
      const p = heroXpProgress(dealt, T, { startLevel: 1, maxLevel: 5 });
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThanOrEqual(1);
    }
  });

  it('never decreases as damage accumulates, except when a level is earned', () => {
    let prev = { level: 1, progress: 0 };
    for (let dealt = 0; dealt <= t5; dealt += T / 500) {
      const p = heroXpProgress(dealt, T, { startLevel: 1, maxLevel: 5 });
      if (p.level === prev.level) expect(p.progress).toBeGreaterThanOrEqual(prev.progress - 1e-9);
      prev = p;
    }
  });

  it('defaults startLevel and maxLevel when the options are omitted', () => {
    expect(heroXpProgress(0, T).level).toBe(1);
    expect(heroXpProgress(0, T).progress).toBe(0);
  });
});
```

Also extend the existing import at the top of the file:

```js
import {
  heroXpThresholds, heroLevelForDamage, heroLevelMult, heroAttackDamage, heroMaxHp,
  heroXpProgress,
} from './heroLeveling.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/systems/heroLeveling.test.js`
Expected: FAIL — `heroXpProgress is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/systems/heroLeveling.js`:

```js
// Progress toward the NEXT level, for the HUD bar. Returns the position inside
// the current level's window rather than the running total, because the bar
// empties and refills at each level.
//
// `heroStartLevel` (the veteran/elite meta upgrades) puts a hero above level 1
// with zero damage dealt, which lands below its own window — clamped, not
// negative. A map with no wave table has no HP budget to pace against, so it
// reports empty rather than NaN.
export function heroXpProgress(damageDealt, mapTotalHp, { startLevel = 1, maxLevel = 5 } = {}) {
  const level = heroLevelForDamage(damageDealt, mapTotalHp, { startLevel, maxLevel });
  const atMax = level >= maxLevel;
  if (atMax)            return { level, progress: 1, current: 0, needed: 0, atMax: true };
  if (!(mapTotalHp > 0)) return { level, progress: 0, current: 0, needed: 0, atMax: false };

  const thresholds = heroXpThresholds(mapTotalHp);
  const prev   = level >= 2 ? thresholds[level - 2] : 0;
  const next   = thresholds[level - 1];
  const needed = next - prev;
  if (!(needed > 0)) return { level, progress: 0, current: 0, needed: 0, atMax: false };

  const current = Math.min(Math.max(damageDealt - prev, 0), needed);
  return { level, progress: current / needed, current, needed, atMax: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/systems/heroLeveling.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the whole suite**

Run: `npm run test`
Expected: PASS. Note the totals — the baseline before this plan is **82 files, 1129 tests**.

- [ ] **Step 6: Commit**

```bash
git add src/systems/heroLeveling.js src/systems/heroLeveling.test.js
git commit -m "feat(hero): add heroXpProgress for progress within the current level"
```

---

### Task 2: `Hero.xpProgress()` accessor

**Files:**
- Modify: `src/entities/Hero.js` (import on line 5; new method after `_registerDamage`)
- Test: `src/entities/Hero.test.js`

`Hero` already holds `damageDealt`, `_mapTotalHp`, `_startLevel`, and `def.stats.maxLevel`. This method bundles them so callers never touch the private fields.

- [ ] **Step 1: Write the failing test**

`Hero.test.js` has no hero factory — its tests construct heroes directly as
`new Hero(makeScene(), { x, y })`, with `makeScene()` already defined near the
top of that file. The constructor is
`Hero(scene, { x, y, heroId = 'rael', pathPoints, mapId = 0 }, modifiers = {})`.
Map 0 has **8800** total enemy HP, so the level thresholds are
`[616, 1144, 1848, 2640]`.

Note `_registerDamage` starts with `if (!(dealt > 0)) return;` — every call below
passes a positive number deliberately.

Append to `src/entities/Hero.test.js`:

```js
describe('Hero.xpProgress', () => {
  const MAP0_TOTAL_HP = 8800;   // totalEnemyHpForMap(0); thresholds 616/1144/1848/2640

  it('reports an empty bar for a hero that has dealt no damage', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    const p = h.xpProgress();
    expect(p.level).toBe(1);
    expect(p.progress).toBe(0);
    expect(p.atMax).toBe(false);
  });

  it('advances as the hero registers damage', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    const before = h.xpProgress().progress;
    h._registerDamage(MAP0_TOTAL_HP * 0.03);   // inside the level-1 window (0 -> 616)
    const after = h.xpProgress().progress;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(1);
  });

  it('empties again once a level is earned', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    h._registerDamage(616);                    // exactly the level-2 threshold
    expect(h.level).toBe(2);
    expect(h.xpProgress().progress).toBe(0);
  });

  it('flags atMax once the hero tops out', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    h._registerDamage(MAP0_TOTAL_HP);
    expect(h.xpProgress().atMax).toBe(true);
    expect(h.xpProgress().progress).toBe(1);
  });

  // The <hero>_veteran / <hero>_elite meta upgrades start a hero above level 1
  // with damageDealt still 0, which is below its own window's floor.
  it('clamps to empty for a hero given a head-start level', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 }, { heroStartLevel: 3 });
    expect(h.level).toBe(3);
    const p = h.xpProgress();
    expect(p.progress).toBe(0);
    expect(p.current).toBe(0);
  });

  // damageDealt is run-scoped, not life-scoped.
  it('keeps its progress across a death and respawn', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    h._registerDamage(300);                    // partway into the level-1 window
    const before = h.xpProgress();
    h.hp = 0;
    h.dead = true;
    h.respawn();
    const after = h.xpProgress();
    expect(after.progress).toBeCloseTo(before.progress);
    expect(after.level).toBe(before.level);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/entities/Hero.test.js`
Expected: FAIL — `h.xpProgress is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/entities/Hero.js`, extend the import on line 5:

```js
import { heroLevelForDamage, heroAttackDamage, heroMaxHp, heroXpProgress } from '../systems/heroLeveling.js';
```

Then add this method immediately after `_registerDamage`:

```js
  // Progress toward the next level, for the HUD. The map's HP budget and the
  // start level are this entity's business; the scene only relays the result.
  xpProgress() {
    return heroXpProgress(this.damageDealt, this._mapTotalHp, {
      startLevel: this._startLevel,
      maxLevel:   this.def.stats.maxLevel,
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/entities/Hero.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js
git commit -m "feat(hero): expose xpProgress() so the HUD need not read private level state"
```

---

### Task 3: Carry `xp` on the `hero:update` event

**Files:**
- Modify: `src/scenes/GameScene.js:508-510`
- Test: `src/scenes/GameScene.heroXp.test.js` (create)

The emit block currently reads:

```js
    // Emit HP/level for UIScene
    this.game.events.emit('hero:update', {
      hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
    });
```

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.heroXp.test.js`. It follows the calling convention the sibling GameScene tests use — invoke the prototype method against a hand-built context rather than constructing a scene:

```js
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

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';

const XP = { level: 2, progress: 0.4, current: 240, needed: 600, atMax: false };

function makeCtx() {
  const emit = vi.fn();
  return {
    emit,
    ctx: {
      enemies: [],
      hero: {
        hp: 90, maxHp: 150, level: 2,
        overchargeActive: false,
        _timers: { q: 0, w: 0, e: 0 },
        update: vi.fn(),
        xpProgress: () => XP,
      },
      economy: { earn: vi.fn() },
      kills: 0,
      _updateHUD: vi.fn(),
      _killReward: (r) => r,
      _heroOverchargeWasActive: false,
      _applyOvercharge: vi.fn(),
      _heroCooldownAccum: 0,
      game: { events: { emit } },
    },
  };
}

describe('GameScene hero:update carries XP progress', () => {
  it('includes the hero xpProgress() result in the payload', () => {
    const { emit, ctx } = makeCtx();
    GameScene.prototype._updateHero.call(ctx, 0.1);
    const call = emit.mock.calls.find(([name]) => name === 'hero:update');
    expect(call).toBeDefined();
    expect(call[1].xp).toEqual(XP);
  });

  it('still carries hp, maxHp and level (no regression)', () => {
    const { emit, ctx } = makeCtx();
    GameScene.prototype._updateHero.call(ctx, 0.1);
    const [, payload] = emit.mock.calls.find(([name]) => name === 'hero:update');
    expect(payload.hp).toBe(90);
    expect(payload.maxHp).toBe(150);
    expect(payload.level).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/scenes/GameScene.heroXp.test.js`
Expected: FAIL — the first test reports `call[1].xp` is `undefined`.

- [ ] **Step 3: Write the implementation**

Replace the emit block in `src/scenes/GameScene.js`:

```js
    // Emit HP/level/XP for UIScene
    this.game.events.emit('hero:update', {
      hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
      xp: this.hero.xpProgress(),
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/scenes/GameScene.heroXp.test.js`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.heroXp.test.js
git commit -m "feat(hero): carry XP progress on the hero:update event"
```

---

### Task 4: HUD markup and CSS

**Files:**
- Modify: `index.html` (CSS near line 180; markup near line 473)

No test — this task is static markup, proven by Task 5's DOM test and the live check in Task 7.

- [ ] **Step 1: Add the CSS**

In `index.html`, directly after the `#hero-hp-fill` rule:

```css
    #hero-hp-fill { height:100%; background:#4fc3f7; border-radius:2px; transition:width 0.15s; }
    #hero-xp-bg { width:52px; height:4px; background:#332b12; border-radius:2px; overflow:hidden; }
    #hero-xp-fill { height:100%; width:0%; background:#ffd700; border-radius:2px; transition:width 0.15s; }
```

- [ ] **Step 2: Add the markup**

In `index.html`, inside `#hero-info`, directly after the HP bar div:

```html
      <div id="hero-info">
        <div id="hero-level">Rael L1</div>
        <div id="hero-hp-bg"><div id="hero-hp-fill"></div></div>
        <div id="hero-xp-bg"><div id="hero-xp-fill"></div></div>
      </div>
```

- [ ] **Step 3: Verify the page still builds**

Run: `npm run build`
Expected: exits 0, `dist/index.html` written.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(hud): add the hero XP bar element under the HP bar"
```

---

### Task 5: Render the bar and tooltip in UIScene

**Files:**
- Modify: `src/scenes/UIScene.js` (`_onHeroUpdate`, currently at line 383)
- Test: `src/scenes/UIScene.heroXp.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `src/scenes/UIScene.heroXp.test.js`:

```js
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import UIScene from './UIScene.js';

function setupHeroDOM() {
  document.body.textContent = '';
  const section = document.createElement('div');
  section.id = 'hero-section';
  for (const id of ['hero-hp-fill', 'hero-xp-fill']) {
    const d = document.createElement('div');
    d.id = id;
    section.appendChild(d);
  }
  document.body.appendChild(section);
}

const makeScene = () => Object.create(UIScene.prototype);
const xpFill    = () => document.getElementById('hero-xp-fill').style.width;
const tooltip   = () => document.getElementById('hero-section').title;

describe('UIScene hero XP bar', () => {
  beforeEach(setupHeroDOM);

  it('sets the fill width from the payload progress', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.4, current: 240, needed: 600, atMax: false } });
    expect(xpFill()).toBe('40.0%');
  });

  it('renders an empty bar rather than a blank one at zero progress', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 1, progress: 0, current: 0, needed: 700, atMax: false } });
    expect(xpFill()).toBe('0.0%');
  });

  it('fills the bar at max level', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 5, progress: 1, current: 0, needed: 0, atMax: true } });
    expect(xpFill()).toBe('100.0%');
  });

  it('writes a tooltip naming the level, the percent and the damage window', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.38, current: 456, needed: 1200, atMax: false } });
    expect(tooltip()).toContain('Level 2');
    expect(tooltip()).toContain('38%');
    expect(tooltip()).toContain('Level 3');
    expect(tooltip()).toContain('456');
    expect(tooltip()).toContain('1,200');
  });

  it('says MAX in the tooltip at the top level', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 5, progress: 1, current: 0, needed: 0, atMax: true } });
    expect(tooltip()).toContain('MAX');
  });

  it('does not rewrite the tooltip when the whole percent has not changed', () => {
    const s = makeScene();
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.380, current: 456, needed: 1200, atMax: false } });
    const first = tooltip();
    document.getElementById('hero-section').title = 'SENTINEL';
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.384, current: 461, needed: 1200, atMax: false } });
    expect(tooltip()).toBe('SENTINEL');
    expect(first).toContain('38%');
  });

  it('still drives the HP bar (no regression)', () => {
    makeScene()._onHeroUpdate({ hp: 30, maxHp: 120,
      xp: { level: 1, progress: 0, current: 0, needed: 700, atMax: false } });
    expect(document.getElementById('hero-hp-fill').style.width).toBe('25.0%');
  });

  it('survives a payload with no xp field', () => {
    expect(() => makeScene()._onHeroUpdate({ hp: 50, maxHp: 100 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/scenes/UIScene.heroXp.test.js`
Expected: FAIL — the XP fill width stays `''`.

- [ ] **Step 3: Write the implementation**

In `src/scenes/UIScene.js`, replace `_onHeroUpdate` and add `_renderHeroXp` beneath it:

```js
  _onHeroUpdate({ hp, maxHp, xp }) {
    const fill = document.getElementById('hero-hp-fill');
    if (fill) fill.style.width = ((hp / maxHp) * 100).toFixed(1) + '%';
    this._renderHeroXp(xp);
  }

  // The bar moves every frame; the tooltip string only changes when the whole
  // percent does, so it is rebuilt on that boundary rather than 60 times a second.
  _renderHeroXp(xp) {
    if (!xp) return;
    const fill = document.getElementById('hero-xp-fill');
    if (fill) fill.style.width = (xp.progress * 100).toFixed(1) + '%';

    const pct = Math.floor(xp.progress * 100);
    if (pct === this._heroXpPct && xp.atMax === this._heroXpAtMax) return;
    this._heroXpPct   = pct;
    this._heroXpAtMax = xp.atMax;

    const section = document.getElementById('hero-section');
    if (!section) return;
    section.title = xp.atMax
      ? `Level ${xp.level} — MAX`
      : `Level ${xp.level} — ${pct}% to Level ${xp.level + 1}`
        + ` · damage dealt ${Math.round(xp.current).toLocaleString('en-US')}`
        + ` / ${Math.round(xp.needed).toLocaleString('en-US')}`;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/scenes/UIScene.heroXp.test.js`
Expected: PASS, all eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.js src/scenes/UIScene.heroXp.test.js
git commit -m "feat(hud): render the hero XP bar and its hover tooltip"
```

---

### Task 6: `· MAX` on the level label

**Files:**
- Modify: `src/scenes/UIScene.js` (`_onHeroLevelUp`, currently at line 388)
- Test: `src/scenes/UIScene.heroXp.test.js` (append)

`_onHeroLevelUp` currently always writes `${name} L${level}`. `this._heroDef` is the `HEROES[id]` record, so `this._heroDef.stats.maxLevel` is available.

- [ ] **Step 1: Write the failing test**

Append to `src/scenes/UIScene.heroXp.test.js`:

```js
describe('UIScene hero level label', () => {
  beforeEach(() => {
    setupHeroDOM();
    for (const id of ['hero-level', 'ability-q', 'ability-w', 'ability-e']) {
      const el = document.createElement(id === 'hero-level' ? 'div' : 'button');
      el.id = id;
      document.body.appendChild(el);
    }
  });

  const sceneWithHero = () => {
    const s = Object.create(UIScene.prototype);
    s._heroDef = { shortName: 'Rael', stats: { maxLevel: 5 } };
    return s;
  };

  it('shows a plain level below the cap', () => {
    sceneWithHero()._onHeroLevelUp({ level: 3 });
    expect(document.getElementById('hero-level').textContent).toBe('Rael L3');
  });

  it('marks the label MAX at the cap', () => {
    sceneWithHero()._onHeroLevelUp({ level: 5 });
    expect(document.getElementById('hero-level').textContent).toBe('Rael L5 · MAX');
  });

  it('still unlocks abilities by level (no regression)', () => {
    sceneWithHero()._onHeroLevelUp({ level: 3 });
    expect(document.getElementById('ability-e').disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/scenes/UIScene.heroXp.test.js`
Expected: FAIL — the MAX test gets `'Rael L5'`.

- [ ] **Step 3: Write the implementation**

In `src/scenes/UIScene.js`, replace the first two lines of `_onHeroLevelUp`'s body:

```js
  _onHeroLevelUp({ level }) {
    const name = this._heroDef?.shortName ?? 'Rael';
    const cap  = this._heroDef?.stats?.maxLevel ?? 5;
    document.getElementById('hero-level').textContent =
      level >= cap ? `${name} L${level} · MAX` : `${name} L${level}`;
```

Leave the three ability-unlock blocks below it untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/scenes/UIScene.heroXp.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm run test`
Expected: PASS. Expect roughly **84 files, ~1158 tests** (baseline 82/1129 plus this plan's additions).

- [ ] **Step 6: Commit**

```bash
git add src/scenes/UIScene.js src/scenes/UIScene.heroXp.test.js
git commit -m "feat(hud): mark the hero level label MAX at the cap"
```

---

### Task 7: Live verification and PR

**Files:** none modified.

A green suite is not evidence the bar moves on screen. This project's Definition of Done requires the running game.

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 2: Start the dev server on a dedicated port**

Run: `npm run dev -- --port 5180 --strictPort`
Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5180/` returns `200`.

Do NOT use 5173 or 4173 — other sessions and stale servers commonly hold those.

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:5180/`, click PLAY, dismiss the story dialog (`#story-dialog-skip`), place a couple of towers and send waves. Confirm, watching the hero strip in the bottom bar:

1. The gold XP bar sits under the cyan HP bar and starts empty.
2. It advances as the hero lands hits — and does NOT advance while the hero is idle out of range.
3. It empties and restarts when the level label increments.
4. Hovering the hero strip shows `Level N — X% to Level N+1 · damage dealt A / B`.
5. At level 5 the bar is full and the label reads `Rael L5 · MAX`.

The scene is reachable as `window.__game` in dev, so progress can be read directly:
`window.__game.hero.xpProgress()` — check it matches the rendered width.

Capture a screenshot of the bar partly filled and note the observed values.

- [ ] **Step 4: Stop the dev server**

Run: `pkill -f "vite.*5180"`

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/hero-xp-bar:refs/heads/feat/hero-xp-bar
gh pr create --base main --head feat/hero-xp-bar --title "feat(hud): hero XP progress bar"
```

The PR body must state the observed test totals and what was seen in the browser, not just that tests passed.

---

## Notes for the implementer

- **Do not** change `HERO_LEVEL_DAMAGE_FRACTIONS`, `HERO_LEVEL_STAT_STEP`, or anything in `src/data/`. This feature is display-only; altering them rebalances every map.
- `src/sim/heroUnit.js` (the headless balance simulator) does **not** need `xpProgress` — it models no UI. Leave it alone.
- `Hero.js` and `Soldier.js` size their HP bars from `def.radius`, which has the same latent defect fixed for enemies in PR #68. Out of scope here; do not fix it in this branch.
- Branch is `feat/hero-xp-bar`, already created off `origin/main`. Work in the worktree at `~/.config/superpowers/worktrees/tower-defense/fix-enemy-hit-feedback`, not the primary checkout — another session is using that.
