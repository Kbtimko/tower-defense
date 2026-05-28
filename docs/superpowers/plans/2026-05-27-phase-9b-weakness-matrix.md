# Phase 9b — Tower/Enemy Weakness Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a damage-multiplier matrix keyed by (tower-type × enemy-type) with sparse Tier-4 branch overrides and a hero matchup table, and wire it into every player-sourced damage path.

**Architecture:** Two new pure data modules (`weaknessMatrix.js`, `sourceBuilders.js`) keep all lookup and source-construction out of scene code. `Enemy.takeDamage` becomes the single chokepoint that resolves a `source` opt into a multiplier and applies it post-armor. Every existing damage call site is a one-line edit. UI surface — tower-build tooltip, TowerPanel matchup line, Tier-4 branch picker hint — is derived from the same matrix via a `describeMatchups` helper.

**Tech Stack:** Vanilla JavaScript (ES modules), Vitest with `vi.mock` Phaser stubs, DOM-driven UI in `index.html`. No new dependencies. **All DOM injection uses `createElement` + `textContent` (no `innerHTML`).**

**Spec:** `docs/superpowers/specs/2026-05-27-phase-9b-weakness-matrix-design.md`
**Branch:** `feature/phase-9b-weakness-matrix` (off `origin/feature/phase-3-tower-system` at `b9548ea`)

---

## File Structure

**New files (4):**
- `src/data/weaknessMatrix.js` — exports `WEAKNESS_MATRIX`, `TIER4_OVERRIDES`, `HERO_MULTIPLIERS`, `getWeaknessMultiplier(source, enemyType)`, `describeMatchups(source)`
- `src/data/weaknessMatrix.test.js` — unit tests
- `src/data/sourceBuilders.js` — exports `soldierSource(soldier)`, `heroSource()`, `heroAirstrikeSource()` (tower projectiles build source inline from `Projectile.towerType/tier/branch` since the field names differ from Tower's)
- `src/data/sourceBuilders.test.js` — unit tests

**Modified files (6):**
- `src/entities/Enemy.js` — `takeDamage` accepts `opts.source`, applies multiplier post-armor
- `src/entities/Enemy.test.js` — adds formula + source tests
- `src/entities/Projectile.js` — constructor accepts `tier` and `branch`, stores them
- `src/entities/Hero.js` — auto-attack passes `{source: heroSource()}` to `nearest.takeDamage`
- `src/entities/Hero.test.js` — verifies hero source is passed
- `src/scenes/GameScene.js` — `_dealDamage` opts pass-through, `_onProjectileHit` source, `_updateTowers` Projectile construction, `_updateEnemies` soldier source, `_triggerAirstrike` source, `_openTowerPanel` matchup line, `_renderBranchPicker` override line
- `src/scenes/UIScene.js` — tooltip handlers on `.tower-btn`, `_renderBranchPicker` override line
- `index.html` — `#tower-tooltip` floating div, `#panel-matchups` inside `#tower-panel`, CSS

**Total: ~10 files touched, ~250 lines of source + ~250 lines of tests.**

---

## Task 1: Core matrix data + `getWeaknessMultiplier`

**Files:**
- Create: `src/data/weaknessMatrix.js`
- Create: `src/data/weaknessMatrix.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/data/weaknessMatrix.test.js`:

```js
import { getWeaknessMultiplier, WEAKNESS_MATRIX, TIER4_OVERRIDES, HERO_MULTIPLIERS } from './weaknessMatrix.js';

describe('getWeaknessMultiplier — defaults', () => {
  it('returns 1.0 for null source', () => {
    expect(getWeaknessMultiplier(null, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for undefined source', () => {
    expect(getWeaknessMultiplier(undefined, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for unknown enemy type', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'unknown-enemy')).toBe(1.0);
  });
  it('returns 1.0 for unknown tower type', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'unknown-tower', tier: 1, branch: null }, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for tower row with no entry for that enemy', () => {
    // archer has no `drone` entry
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 1, branch: null }, 'drone')).toBe(1.0);
  });
});

describe('getWeaknessMultiplier — base matrix', () => {
  it('cannon vs brute = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'brute')).toBe(1.5);
  });
  it('cannon vs phantom = 0.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'phantom')).toBe(0.5);
  });
  it('sniper vs titan = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 1, branch: null }, 'titan')).toBe(1.5);
  });
  it('mage vs phantom = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'mage', tier: 1, branch: null }, 'phantom')).toBe(1.5);
  });
  it('archer vs titan = 0.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 1, branch: null }, 'titan')).toBe(0.5);
  });
});

describe('getWeaknessMultiplier — Tier 4 overrides', () => {
  it('sniper-A vs titan = 2.5 (override replaces base 1.5)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'titan')).toBe(2.5);
  });
  it('sniper-A vs colossus = 2.0 (override)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'colossus')).toBe(2.0);
  });
  it('sniper-A vs skitter = 0.75 (no override → falls through to base)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'skitter')).toBe(0.75);
  });
  it('sniper-B vs titan = 1.5 (B has no overrides → falls through to base)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'B' }, 'titan')).toBe(1.5);
  });
  it('cannon-A vs skitter = 2.0 (override)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 4, branch: 'A' }, 'skitter')).toBe(2.0);
  });
  it('archer-B vs brute = 1.25 (Marksman armor-piercing)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 4, branch: 'B' }, 'brute')).toBe(1.25);
  });
  it('mage-B vs colossus = 1.5 (Frost Mage Shatter synergy)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'mage', tier: 4, branch: 'B' }, 'colossus')).toBe(1.5);
  });
  it('ice-B vs brute = 1.5 (Shatter)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'ice', tier: 4, branch: 'B' }, 'brute')).toBe(1.5);
  });
});

describe('getWeaknessMultiplier — Tier 2/3 inherit base row', () => {
  it('sniper tier 2 vs titan = 1.5 (no overrides apply at tier 2)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 2, branch: null }, 'titan')).toBe(1.5);
  });
  it('sniper tier 3 vs titan = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 3, branch: null }, 'titan')).toBe(1.5);
  });
});

describe('getWeaknessMultiplier — hero source', () => {
  it('hero vs phantom = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'hero' }, 'phantom')).toBe(1.5);
  });
  it('hero vs brute = 1.0 (no entry)', () => {
    expect(getWeaknessMultiplier({ kind: 'hero' }, 'brute')).toBe(1.0);
  });
  it('hero with ability field still uses hero table', () => {
    expect(getWeaknessMultiplier({ kind: 'hero', ability: 'airstrike' }, 'phantom')).toBe(1.5);
  });
  it('hero vs titan = 1.0 (HERO_MULTIPLIERS has no titan entry; tower matrix is not consulted)', () => {
    expect(getWeaknessMultiplier({ kind: 'hero' }, 'titan')).toBe(1.0);
  });
});

describe('matrix shape sanity', () => {
  it('WEAKNESS_MATRIX has rows for all 6 towers', () => {
    for (const t of ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks']) {
      expect(WEAKNESS_MATRIX[t]).toBeDefined();
    }
  });
  it('TIER4_OVERRIDES uses A/B branch keys only', () => {
    for (const tower of Object.keys(TIER4_OVERRIDES)) {
      for (const branch of Object.keys(TIER4_OVERRIDES[tower])) {
        expect(['A', 'B']).toContain(branch);
      }
    }
  });
  it('HERO_MULTIPLIERS only references known enemy types', () => {
    const known = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];
    for (const enemy of Object.keys(HERO_MULTIPLIERS)) {
      expect(known).toContain(enemy);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: FAIL with module-not-found error (the source file doesn't exist yet).

- [ ] **Step 3: Write the source module**

Create `src/data/weaknessMatrix.js`:

```js
// Base 6×6 (TOWER × ENEMY). Omitted = 1.0.
export const WEAKNESS_MATRIX = {
  archer:   {                       skitter: 1.25, brute: 0.75, colossus: 0.75, phantom: 1.25, titan: 0.5  },
  mage:     { drone:  1.25,                                     colossus: 1.25, phantom: 1.5,  titan: 1.25 },
  cannon:   { drone:  0.75, skitter: 0.5,  brute: 1.5, colossus: 1.5,  phantom: 0.5,  titan: 1.25 },
  ice:      {                                                                                  titan: 0.75 },
  sniper:   {               skitter: 0.75, brute: 1.25, colossus: 1.5, phantom: 0.75, titan: 1.5  },
  barracks: {               skitter: 1.25, brute: 1.25,                phantom: 0.5,  titan: 0.75 },
};

// Sparse Tier-4 branch overrides. Override REPLACES the base cell (does not multiply).
export const TIER4_OVERRIDES = {
  archer: { B: {                       brute: 1.25, colossus: 1.25                          } }, // Marksman: armor-piercing
  mage:   { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Frost Mage: Shatter synergy
  cannon: { A: { skitter: 2.0                                                               } }, // Artillery: splits → swarm
  ice:    { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Shatter explicit
  sniper: { A: {                                    colossus: 2.0,                titan: 2.5 } }, // Assassin: the titan answer
};

// Hero damage (auto-attack + airstrike). Omitted = 1.0.
export const HERO_MULTIPLIERS = {
  phantom: 1.5, // hero is the anti-air baseline
};

export function getWeaknessMultiplier(source, enemyType) {
  if (!source) return 1.0;
  if (source.kind === 'hero') return HERO_MULTIPLIERS[enemyType] ?? 1.0;
  if (source.kind === 'tower') {
    if (source.tier === 4 && source.branch) {
      const override = TIER4_OVERRIDES[source.type]?.[source.branch]?.[enemyType];
      if (override !== undefined) return override;
    }
    return WEAKNESS_MATRIX[source.type]?.[enemyType] ?? 1.0;
  }
  return 1.0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: no regressions; new file adds passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/weaknessMatrix.js src/data/weaknessMatrix.test.js
git commit -m "feat(data): weakness matrix + getWeaknessMultiplier lookup"
```

---

## Task 2: `describeMatchups` UI helper

**Files:**
- Modify: `src/data/weaknessMatrix.js` (add export)
- Modify: `src/data/weaknessMatrix.test.js` (add test cases)

- [ ] **Step 1: Add failing tests**

Append to `src/data/weaknessMatrix.test.js`:

```js
import { describeMatchups } from './weaknessMatrix.js';

describe('describeMatchups', () => {
  it('returns empty effective/weak for unknown source', () => {
    expect(describeMatchups(null)).toEqual({ effective: [], weak: [] });
  });

  it('archer base row → effective skitter/phantom, weak brute/colossus/titan', () => {
    const result = describeMatchups({ kind: 'tower', type: 'archer', tier: 1, branch: null });
    expect(result.effective.sort()).toEqual(['phantom', 'skitter']);
    expect(result.weak.sort()).toEqual(['brute', 'colossus', 'titan']);
  });

  it('cannon base row → effective brute/colossus/titan, weak drone/skitter/phantom', () => {
    const result = describeMatchups({ kind: 'tower', type: 'cannon', tier: 1, branch: null });
    expect(result.effective.sort()).toEqual(['brute', 'colossus', 'titan']);
    expect(result.weak.sort()).toEqual(['drone', 'phantom', 'skitter']);
  });

  it('ice base row → effective empty, weak titan only', () => {
    const result = describeMatchups({ kind: 'tower', type: 'ice', tier: 1, branch: null });
    expect(result.effective).toEqual([]);
    expect(result.weak).toEqual(['titan']);
  });

  it('Tier-4A sniper folds override → titan moves into effective', () => {
    const result = describeMatchups({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' });
    expect(result.effective).toContain('titan');
    expect(result.effective).toContain('colossus');
    expect(result.effective).toContain('brute'); // base 1.25 stays effective
  });

  it('Tier-4B sniper (no overrides) matches base row', () => {
    const base   = describeMatchups({ kind: 'tower', type: 'sniper', tier: 1, branch: null });
    const tier4B = describeMatchups({ kind: 'tower', type: 'sniper', tier: 4, branch: 'B' });
    expect(tier4B.effective.sort()).toEqual(base.effective.sort());
    expect(tier4B.weak.sort()).toEqual(base.weak.sort());
  });

  it('hero source → effective phantom, weak empty', () => {
    const result = describeMatchups({ kind: 'hero' });
    expect(result.effective).toEqual(['phantom']);
    expect(result.weak).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: FAIL — `describeMatchups is not a function` (or import error).

- [ ] **Step 3: Add the helper**

Append to `src/data/weaknessMatrix.js`:

```js
const ENEMY_TYPES = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];
const EFFECTIVE_THRESHOLD = 1.25;
const WEAK_THRESHOLD      = 0.75;

export function describeMatchups(source) {
  const effective = [];
  const weak = [];
  if (!source) return { effective, weak };
  for (const enemy of ENEMY_TYPES) {
    const m = getWeaknessMultiplier(source, enemy);
    if (m >= EFFECTIVE_THRESHOLD) effective.push(enemy);
    else if (m <= WEAK_THRESHOLD) weak.push(enemy);
  }
  return { effective, weak };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: all `describeMatchups` cases pass; previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/weaknessMatrix.js src/data/weaknessMatrix.test.js
git commit -m "feat(data): describeMatchups helper for UI surfaces"
```

---

## Task 3: `sourceBuilders.js` pure helpers

**Files:**
- Create: `src/data/sourceBuilders.js`
- Create: `src/data/sourceBuilders.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/data/sourceBuilders.test.js`:

```js
import { soldierSource, heroSource, heroAirstrikeSource } from './sourceBuilders.js';

describe('soldierSource', () => {
  it('reads tier and branch from soldier.barracks', () => {
    const soldier = { barracks: { level: 1, branch: null } };
    expect(soldierSource(soldier))
      .toEqual({ kind: 'tower', type: 'barracks', tier: 1, branch: null });
  });
  it('Tier 4A barracks (Vanguard) propagates branch', () => {
    const soldier = { barracks: { level: 4, branch: 'A' } };
    expect(soldierSource(soldier))
      .toEqual({ kind: 'tower', type: 'barracks', tier: 4, branch: 'A' });
  });
});

describe('heroSource / heroAirstrikeSource', () => {
  it('heroSource → kind hero, no ability field', () => {
    expect(heroSource()).toEqual({ kind: 'hero' });
  });
  it('heroAirstrikeSource → kind hero with ability "airstrike"', () => {
    expect(heroAirstrikeSource()).toEqual({ kind: 'hero', ability: 'airstrike' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/sourceBuilders.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the source module**

Create `src/data/sourceBuilders.js`:

```js
export function soldierSource(soldier) {
  return { kind: 'tower', type: 'barracks', tier: soldier.barracks.level, branch: soldier.barracks.branch };
}

export function heroSource() {
  return { kind: 'hero' };
}

export function heroAirstrikeSource() {
  return { kind: 'hero', ability: 'airstrike' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/data/sourceBuilders.test.js`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/sourceBuilders.js src/data/sourceBuilders.test.js
git commit -m "feat(data): sourceBuilders helpers for damage-source objects"
```

---

## Task 4: Wire `Enemy.takeDamage` to use the matrix

**Files:**
- Modify: `src/entities/Enemy.js` (lines 51-77 — `takeDamage` method, plus add import)
- Modify: `src/entities/Enemy.test.js` (append test block)

The change must (a) leave existing no-source / bare-boolean-pierce callers behaving identically, (b) apply multiplier post-armor, (c) preserve audio + `damage-dealt` event emission.

- [ ] **Step 1: Add failing tests**

Open `src/entities/Enemy.test.js`. Before adding new tests, check existing tests don't call `takeDamage`:

```bash
grep -n "takeDamage" src/entities/Enemy.test.js
```

If matches found, replace `makeScene` for those tests with `makeRichScene` (defined below). At plan-write time, the existing file only has stun tests — no `takeDamage` calls.

Append the following at the end of the file:

```js
describe('Enemy.takeDamage — weakness matrix integration', () => {
  const makeDefWith = (overrides) => ({
    hp: 100, speed: 80, armor: 0, reward: 10,
    radius: 10, color: 0x00ff00, type: 'drone', flying: false,
    ...overrides,
  });

  // Richer scene that satisfies takeDamage's audio/event hooks.
  const makeRichScene = () => {
    const emitted = [];
    return {
      add: { graphics: makeGraphics, existing() {} },
      events: { emit(event, data) { emitted.push({ event, data }); }, _emitted: emitted },
      game: { registry: { get: () => null } }, // no audio manager
    };
  };

  it('no source → backcompat (armor only)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45);
    expect(e.hp).toBe(200 - 37); // max(1, 45-8) = 37
  });

  it('source applied post-armor (cannon vs brute, 1.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    expect(e.hp).toBe(200 - 55); // floor((45-8) * 1.5) = 55
  });

  it('pierce + multiplier (sniper-Assassin vs titan, 2.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'titan', hp: 5000, armor: 20 }), startX: 0, startY: 0 });
    e.takeDamage(300, { pierce: true, source: { kind: 'tower', type: 'sniper', tier: 4, branch: 'A' } });
    expect(e.hp).toBe(5000 - 750); // floor((300-0) * 2.5) = 750
  });

  it('floor at 1 (ice vs titan, 0.75x, armor 20)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'titan', hp: 100, armor: 20 }), startX: 0, startY: 0 });
    e.takeDamage(8, { source: { kind: 'tower', type: 'ice', tier: 1, branch: null } });
    expect(e.hp).toBe(99); // max(1, 8-20)=1, floor(1*0.75)=0, max(1,0)=1
  });

  it('cannon vs phantom (0.5x, no armor)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'phantom', hp: 60, armor: 0, flying: true }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    expect(e.hp).toBe(60 - 22); // floor((45-0) * 0.5) = 22
  });

  it('hero vs phantom (1.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'phantom', hp: 60, armor: 0, flying: true }), startX: 0, startY: 0 });
    e.takeDamage(25, { source: { kind: 'hero' } });
    expect(e.hp).toBe(60 - 37); // floor((25-0) * 1.5) = 37
  });

  it('damage-dealt event reports post-multiplier amount', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    const evt = scene.events._emitted.find(x => x.event === 'damage-dealt');
    expect(evt).toBeDefined();
    expect(evt.data.amount).toBe(55);
  });

  it('bare-boolean pierce still works (backcompat path)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, true); // bare boolean
    expect(e.hp).toBe(200 - 45); // pierce → armor 0 → max(1, 45-0)=45, no source → mult 1.0
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: the 8 new tests FAIL because the matrix isn't applied yet (cannon vs brute returns 37 not 55, etc.).

- [ ] **Step 3: Add import to Enemy.js**

At the top of `src/entities/Enemy.js`, add after the existing `import Phaser from 'phaser';`:

```js
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';
```

- [ ] **Step 4: Replace `takeDamage` body**

Replace the existing `takeDamage` method (lines 51-77) with:

```js
  takeDamage(amount, opts = false) {
    // Back-compat: callers used to pass `pierce` as a bare boolean.
    const optsObj = (opts && typeof opts === 'object') ? opts : { pierce: Boolean(opts) };
    const armor = optsObj.pierce ? 0 : this.armor;
    const afterArmor = Math.max(1, amount - armor);
    const mult = getWeaknessMultiplier(optsObj.source, this.def.type);
    const dmg = Math.max(1, Math.floor(afterArmor * mult));
    this.hp -= dmg;
    const justDied = this.hp <= 0 && !this.dead;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();

    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
    this.scene.events.emit('damage-dealt', {
      target: this,
      amount: dmg,
      isCrit: optsObj.isCrit ?? false,
      isAoe:  optsObj.isAoe  ?? false,
      abilityLabel: optsObj.abilityLabel ?? null,
    });

    if (justDied) {
      const t = this.def?.type;
      const isLarge = t === 'brute' || t === 'titan';
      if (am) am.playSfx(isLarge ? 'enemy-death-large' : 'enemy-death-small');
      if (t === 'titan') this.scene.events.emit('boss-died', { bossType: t });
    }
  }
```

(Two changes vs. existing: introduce `afterArmor` and `mult` lookup; final `dmg = Math.max(1, Math.floor(afterArmor * mult))` replaces the old single-line `this.hp -= Math.max(1, amount - armor)`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/entities/Enemy.test.js`
Expected: all 8 new tests pass; existing stun tests still pass.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.test.js
git commit -m "feat(enemy): takeDamage applies weakness multiplier post-armor"
```

---

## Task 5: Extend `Projectile` to carry tier + branch

**Files:**
- Modify: `src/entities/Projectile.js`

No test file for `Projectile`; the constructor change is trivial (two new optional fields with defaults). Task 6 verifies the fields propagate.

- [ ] **Step 1: Edit Projectile.js**

Replace the existing constructor signature (line 4) and add two field assignments. The full constructor becomes:

```js
  constructor(scene, { x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff, towerType = 'default', tier = 1, branch = null }) {
    super(scene, x, y);

    this.target      = target;
    this.targetX     = target ? target.x : x;
    this.targetY     = target ? target.y : y;
    this.damage      = damage;
    this.splashRadius = splashRadius;
    this.pierce      = pierce;
    this.slowFactor  = slowFactor;
    this.color       = color;
    this.tier        = tier;
    this.branch      = branch;
    this.dead        = false;
    this.speed       = 280;

    const radius = splashRadius > 0 ? 5 : 3;
    const dot = scene.add.graphics();
    dot.fillStyle(color, 1);
    dot.fillCircle(0, 0, radius);
    if (slowFactor > 0) {
      dot.lineStyle(1, 0xaaffff, 1);
      dot.strokeCircle(0, 0, radius);
    }
    this.add(dot);
    scene.add.existing(this);
    this.setDepth(4);

    this.towerType = towerType;
    this._trail = null;
    if (scene.particleSpawner) {
      this._trail = scene.particleSpawner.spawnProjectileTrail(this, towerType);
    }
  }
```

Only changes vs. existing: add `tier = 1, branch = null` to destructured params; add `this.tier = tier; this.branch = branch;` after `this.color = color;`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: no regressions. Defaults preserve existing construction.

- [ ] **Step 3: Commit**

```bash
git add src/entities/Projectile.js
git commit -m "feat(projectile): carry tier + branch from firing tower"
```

---

## Task 6: Wire tower projectiles → source through `_dealDamage`

**Files:**
- Modify: `src/scenes/GameScene.js` (three sites: `_updateTowers`, `_onProjectileHit`, `_dealDamage`)

- [ ] **Step 1: Verify `_dealDamage` already accepts opts**

Open `src/scenes/GameScene.js`, find `_dealDamage` (current line ~482). Confirm the signature is:

```js
_dealDamage(enemy, damage, pierce, opts = {}) {
```

And the call passes opts through:

```js
enemy.takeDamage(damage, { pierce, ...opts });
```

This is already in place from Phase 8. **No code change required for `_dealDamage` itself in this task** — just verify, do NOT edit.

- [ ] **Step 2: Update `_updateTowers` Projectile construction**

Find `_updateTowers` (current line ~414). Inside the `if (best)` block, locate the `new Projectile(this, {...})` call. Replace its options object to add `tier` and `branch`:

```js
this.projectiles.push(new Projectile(this, {
  x: tower.x, y: tower.y, target: best,
  damage: tower.damage, splashRadius: tower.splashRadius,
  pierce: tower.pierce, slowFactor: tower.slow,
  color: PROJ_COLORS[tower.type] ?? 0xffffff,
  towerType: tower.type,
  tier: tower.level, branch: tower.branch,
}));
```

- [ ] **Step 3: Update `_onProjectileHit` to build and pass source**

Find `_onProjectileHit` (current line ~467). Replace the entire method body:

```js
_onProjectileHit(proj) {
  const source = { kind: 'tower', type: proj.towerType, tier: proj.tier, branch: proj.branch };
  if (proj.splashRadius > 0) {
    for (const enemy of this.enemies) {
      if (Math.hypot(enemy.x - proj.targetX, enemy.y - proj.targetY) <= proj.splashRadius) {
        this._dealDamage(enemy, proj.damage, proj.pierce, { source, isAoe: true });
      }
    }
    this._addParticle(proj.targetX, proj.targetY, 0xff8800, 14);
  } else if (proj.target && !proj.target.dead) {
    this._dealDamage(proj.target, proj.damage, proj.pierce, { source });
    if (proj.slowFactor > 0) proj.target.applyStatus({ type: 'slow', duration: 2, factor: proj.slowFactor });
    this._addParticle(proj.targetX, proj.targetY, proj.color, 7);
  }
}
```

Changes vs. existing: build `source` inline at the top from `proj.towerType/tier/branch`, and pass `{ source, isAoe: true }` for splash hits, `{ source }` for direct hits. (Source inline; no import needed — fields are on the projectile already.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: no regressions. Task 4's Enemy tests verify the formula; this task plumbs source through.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): tower projectiles carry source through _dealDamage"
```

---

## Task 7: Wire soldier melee → source

**Files:**
- Modify: `src/scenes/GameScene.js` (`_updateEnemies` soldier melee, current line ~250)

- [ ] **Step 1: Add import to GameScene.js**

If not already present (it isn't at this point in the plan), add at the top of `src/scenes/GameScene.js`:

```js
import { soldierSource } from '../data/sourceBuilders.js';
```

- [ ] **Step 2: Edit `_updateEnemies` soldier branch**

Find the soldier-blocker damage line (current line ~250):

```js
this._dealDamage(enemy, blocker.damage, false);
```

Replace with:

```js
this._dealDamage(enemy, blocker.damage, false, { source: soldierSource(blocker) });
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): soldier melee carries barracks source"
```

---

## Task 8: Wire hero auto-attack → source

**Files:**
- Modify: `src/entities/Hero.js` (auto-attack line ~167)
- Modify: `src/entities/Hero.test.js` (extend `makeEnemy`, add test)

- [ ] **Step 1: Add failing test**

Open `src/entities/Hero.test.js`. First, replace the existing `makeEnemy` helper (around line 36) so it captures the second argument:

```js
const makeEnemy = (x, y, hp = 50) => {
  const calls = [];
  return {
    x, y, hp, dead: false,
    _calls: calls,
    takeDamage(amount, opts) {
      calls.push({ amount, opts });
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    },
  };
};
```

Then append a new `describe` block at the end of the file:

```js
describe('Hero — auto-attack source', () => {
  it('passes {source: {kind: "hero"}} to enemy.takeDamage', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10, 10); // well within ATTACK_RANGE
    hero._attackTimer = 0; // force the attack to fire this tick
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(1);
    expect(enemy._calls[0].opts).toEqual({ source: { kind: 'hero' } });
  });

  it('does not call takeDamage when no enemies are in range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10000, 10000); // far away
    hero._attackTimer = 0;
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/entities/Hero.test.js`
Expected: the new "passes source" test FAILS — current production code calls `nearest.takeDamage(ATTACK_DAMAGE)` with one argument.

- [ ] **Step 3: Update Hero.js auto-attack**

In `src/entities/Hero.js`:

Add the import at the top (alongside existing imports):

```js
import { heroSource } from '../data/sourceBuilders.js';
```

Then change the auto-attack line (~line 167):

```js
nearest.takeDamage(ATTACK_DAMAGE);
```

To:
```js
nearest.takeDamage(ATTACK_DAMAGE, { source: heroSource() });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/entities/Hero.test.js`
Expected: new tests pass; existing Hero tests still pass.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Hero.js src/entities/Hero.test.js
git commit -m "feat(hero): auto-attack carries hero source for weakness lookup"
```

---

## Task 9: Wire hero airstrike → source

**Files:**
- Modify: `src/scenes/GameScene.js` (`_triggerAirstrike`, current line ~365)

- [ ] **Step 1: Add import (if not already added by Task 7)**

If `src/scenes/GameScene.js` doesn't already import from sourceBuilders, add:

```js
import { heroAirstrikeSource, soldierSource } from '../data/sourceBuilders.js';
```

(If `soldierSource` was added by Task 7 already, append `heroAirstrikeSource` to that existing import line.)

- [ ] **Step 2: Edit `_triggerAirstrike`**

Find the damage loop in `_triggerAirstrike` (current line ~376):

```js
this._dealDamage(e, result.damage, true, { isAoe: true, abilityLabel: 'AIRSTRIKE' });
```

Add `source` to the opts:

```js
this._dealDamage(e, result.damage, true, { isAoe: true, abilityLabel: 'AIRSTRIKE', source: heroAirstrikeSource() });
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): hero airstrike carries hero source"
```

---

## Task 10: HTML + CSS scaffolding for tooltip and matchups

**Files:**
- Modify: `index.html`

Adds DOM containers and CSS rules consumed by Tasks 11, 12, 13.

- [ ] **Step 1: Add CSS rules**

Open `index.html`. Find the `.tower-btn` CSS block (around line 22-29). After the last `.tower-btn ...` rule, add:

```css
    #tower-tooltip { position: absolute; display: none; z-index: 50;
                     background: #0f0f1e; border: 1px solid #8b6914; border-radius: 5px;
                     padding: 6px 8px; font-size: 11px; color: #ddd;
                     pointer-events: none; white-space: nowrap; max-width: 220px; }
    #tower-tooltip strong { display: block; margin-bottom: 3px; color: #ffd700; }
    #tower-tooltip .tt-line-good { display: block; color: #6f6; }
    #tower-tooltip .tt-line-bad  { display: block; color: #f88; }
    #tower-panel .panel-matchups { font-size: 10px; margin: 4px 0; line-height: 1.4; }
    #tower-panel .panel-matchups .mu-good { display: block; color: #6f6; }
    #tower-panel .panel-matchups .mu-bad  { display: block; color: #f88; }
    .branch-card .branch-matchup { color: #ffcc66; font-size: 10px; margin-bottom: 3px; }
```

- [ ] **Step 2: Add `#panel-matchups` to the tower panel**

Find the `#tower-panel` block (around line 223). Between `#panel-lvl` (line 237) and `#panel-branch-picker` (line 238), insert the matchups container:

```html
      <div class="panel-stat" id="panel-lvl">Level: -</div>
      <div class="panel-matchups" id="panel-matchups"></div>
      <div id="panel-branch-picker" style="display:none"></div>
```

- [ ] **Step 3: Add `#tower-tooltip` floating element**

Just before the closing `</body>` tag in `index.html`, add:

```html
    <div id="tower-tooltip"></div>
```

(If the body's last child is a `<script>` block, place the div immediately before that script.)

- [ ] **Step 4: Verify dev server still loads**

Run: `npm run dev` (background) and open the dev URL. Confirm the game still loads with no console errors. Stop the dev server.

(Subagent: if you can't run a dev server, skip — Tasks 11/12/13 will exercise these elements.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "chore(html): tower-tooltip + panel-matchups scaffolding"
```

---

## Task 11: TowerPanel matchup line

**Files:**
- Modify: `src/scenes/GameScene.js` (imports + `_openTowerPanel`, current line ~592)

All DOM construction uses `createElement` + `textContent` — no `innerHTML`.

- [ ] **Step 1: Add imports**

At the top of `src/scenes/GameScene.js`, add (alongside other imports):

```js
import { describeMatchups } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
```

If `ENEMY_DEFS` is already imported, do not add a duplicate import.

- [ ] **Step 2: Add the matchups render block inside `_openTowerPanel`**

Find `_openTowerPanel` (current line ~592). After all existing field updates (after the `panel-lvl` text is set) and before the existing `this._renderBranchPicker(...)` call, insert:

```js
    // Phase 9b: Matchup line — uses safe DOM construction (no innerHTML)
    const matchupsEl = document.getElementById('panel-matchups');
    matchupsEl.replaceChildren();
    const m = describeMatchups({ kind: 'tower', type: tower.type, tier: tower.level, branch: tower.branch });
    const renderEnemyNames = (types) =>
      types.map(t => (ENEMY_DEFS[t]?.name ?? t).replace(/^Veth\s+/, '')).join(', ');
    if (m.effective.length) {
      const line = document.createElement('span');
      line.className = 'mu-good';
      line.textContent = `Effective vs: ${renderEnemyNames(m.effective)}`;
      matchupsEl.appendChild(line);
    }
    if (m.weak.length) {
      const line = document.createElement('span');
      line.className = 'mu-bad';
      line.textContent = `Weak vs: ${renderEnemyNames(m.weak)}`;
      matchupsEl.appendChild(line);
    }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`. Place each of the 6 tower types and click each — confirm the panel shows the right Effective/Weak lines. Upgrade a Sniper to Tier 4 → Assassin and confirm Titan + Colossus appear in the Effective list (the override is reflected).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): TowerPanel matchup line via describeMatchups"
```

---

## Task 12: BottomBar tower-build tooltip

**Files:**
- Modify: `src/scenes/UIScene.js` (imports + `.tower-btn` setup, current line ~65)

All DOM construction uses `createElement` + `textContent` — no `innerHTML`.

- [ ] **Step 1: Add imports**

At the top of `src/scenes/UIScene.js`, add (only the ones missing — check existing imports first):

```js
import { describeMatchups } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
```

- [ ] **Step 2: Extend the `.tower-btn` setup**

Find the `.tower-btn` setup block. The existing pattern (around line 61-75) is:

```js
document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
document.querySelectorAll('.tower-btn').forEach(btn => {
  // ... existing click-handler code ...
});
```

Inside the second `forEach`, AFTER the existing click handler is bound, add tooltip handlers:

```js
      btn.addEventListener('mouseenter', () => {
        const type = btn.dataset.type;
        const def  = TOWER_DEFS[type];
        if (!def) return;
        const m = describeMatchups({ kind: 'tower', type, tier: 1, branch: null });
        const renderEnemyNames = (types) =>
          types.map(t => (ENEMY_DEFS[t]?.name ?? t).replace(/^Veth\s+/, '')).join(', ');
        const tt = document.getElementById('tower-tooltip');
        tt.replaceChildren();
        const header = document.createElement('strong');
        header.textContent = `${def.icon} ${def.name} — ${def.cost}g`;
        tt.appendChild(header);
        if (m.effective.length) {
          const line = document.createElement('span');
          line.className = 'tt-line-good';
          line.textContent = `Effective vs: ${renderEnemyNames(m.effective)}`;
          tt.appendChild(line);
        }
        if (m.weak.length) {
          const line = document.createElement('span');
          line.className = 'tt-line-bad';
          line.textContent = `Weak vs: ${renderEnemyNames(m.weak)}`;
          tt.appendChild(line);
        }
        const rect = btn.getBoundingClientRect();
        tt.style.left = `${rect.left}px`;
        tt.style.top  = `${rect.top - tt.offsetHeight - 6}px`;
        tt.style.display = 'block';
        // After display:block, offsetHeight is now real; reposition once.
        requestAnimationFrame(() => {
          tt.style.top = `${rect.top - tt.offsetHeight - 6}px`;
        });
      });

      btn.addEventListener('mouseleave', () => {
        const tt = document.getElementById('tower-tooltip');
        tt.style.display = 'none';
      });
```

(The first-paint `top` placement uses the as-yet-zero `offsetHeight`, so the `requestAnimationFrame` callback re-anchors after the browser computes layout. Two writes look ugly but it's the standard pattern for "position above an absolutely-positioned element with content that arrived just now.")

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`. Hover each of the 6 tower-build buttons. Confirm a tooltip appears with the correct Effective/Weak lines. Tooltip should disappear on mouseleave.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.js
git commit -m "feat(ui-scene): tower-build button tooltip (effective/weak vs)"
```

---

## Task 13: Tier-4 branch picker override line

**Files:**
- Modify: `src/scenes/GameScene.js` (`_renderBranchPicker`, current line ~679)
- Modify: `src/scenes/UIScene.js` (`_renderBranchPicker`, current line ~232)

Two near-identical edits to two parallel `_renderBranchPicker` render paths.

- [ ] **Step 1: Add imports to both files**

`src/scenes/GameScene.js` — `TIER4_OVERRIDES` and `TOWER_DEFS` and `ENEMY_DEFS` likely already imported from Task 11. Add only what's missing:

```js
import { TIER4_OVERRIDES } from '../data/weaknessMatrix.js';
```

(`TOWER_DEFS` is imported in GameScene.js per existing code; `ENEMY_DEFS` was added in Task 11.)

`src/scenes/UIScene.js` — same additions (`TIER4_OVERRIDES` not yet imported; `TOWER_DEFS` and `ENEMY_DEFS` added in Task 12):

```js
import { TIER4_OVERRIDES } from '../data/weaknessMatrix.js';
```

- [ ] **Step 2: Add `headlineOverride` helper to both files**

At the bottom of `src/scenes/GameScene.js` (after the class, OR at the top above the class — either is fine; pick once and stay consistent), add a module-private function:

```js
function headlineOverride(towerType, branch) {
  const cells = TIER4_OVERRIDES[towerType]?.[branch];
  if (!cells || Object.keys(cells).length === 0) return null;
  let bestEnemy = null;
  let bestVal = -Infinity;
  for (const enemy of Object.keys(cells).sort()) { // alphabetical tiebreak
    const v = cells[enemy];
    if (v > bestVal) { bestVal = v; bestEnemy = enemy; }
  }
  const niceName = (ENEMY_DEFS[bestEnemy]?.name ?? bestEnemy).replace(/^Veth\s+/, '');
  return { enemy: bestEnemy, value: bestVal, name: niceName };
}
```

Add the same helper at the bottom of `src/scenes/UIScene.js`. (Duplicated by design — the two `_renderBranchPicker` methods are already a pre-existing duplicated pair; consolidating them is out of scope for this phase per spec §5.2.)

- [ ] **Step 3: Edit `GameScene._renderBranchPicker`**

Find `_renderBranchPicker` in `src/scenes/GameScene.js` (current line ~679). At the very top of the method body, derive the `towerType` from the passed-in `def` by reverse-lookup:

```js
_renderBranchPicker(container, def, map) {
    const towerType = Object.keys(TOWER_DEFS).find(k => TOWER_DEFS[k] === def);
    // ... existing code continues ...
```

Then inside the `for (const [branch, tierDef] of [['A', def.tier4A], ['B', def.tier4B]])` loop, after the existing `effect` text element is appended to the `card` (but before the cost element is created), insert:

```js
      const headline = headlineOverride(towerType, branch);
      if (headline) {
        const matchup = document.createElement('div');
        matchup.className = 'branch-matchup';
        matchup.textContent = `⚡ ${headline.value}× vs ${headline.name}`;
        card.appendChild(matchup);
      }
```

- [ ] **Step 4: Edit `UIScene._renderBranchPicker`**

Find `_renderBranchPicker` in `src/scenes/UIScene.js` (current line ~232). Apply the identical pattern:
- Add `const towerType = Object.keys(TOWER_DEFS).find(k => TOWER_DEFS[k] === def);` at the top of the method.
- Inside the `for (const [branch, tierDef] of [['A', def.tier4A], ['B', def.tier4B]])` loop, after the effect text append, insert the same `if (headline)` block as in Step 3.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`. Upgrade towers and check the Tier-3 → Tier-4 branch picker:
- **Sniper**: Assassin (A) card → `⚡ 2.5× vs Titan`. Rapid Fire (B) card → no matchup line.
- **Cannon**: Artillery (A) card → `⚡ 2× vs Skitter`. Rapid Cannon (B) card → no matchup line.
- **Archer**: Marksman (B) card → `⚡ 1.25× vs Brute` (tied with Colossus; alphabetical winner is Brute). Volley (A) card → no matchup line.
- **Mage**: Frost Mage (B) card → `⚡ 1.5× vs Brute` (tied with Colossus). Archmage (A) card → no matchup line.
- **Ice**: Shatter (B) card → `⚡ 1.5× vs Brute` (tied with Colossus). Permafrost (A) card → no matchup line.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/UIScene.js
git commit -m "feat(ui): Tier-4 branch picker headline matchup override"
```

---

## Task 14: Manual browser walkthrough + acceptance

**Files:** none — verification only.

If a regression is found, fix it in a follow-up task — do NOT bundle the fix into this verification step.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: prior ≥ 235 tests plus ~40 new tests (Tasks 1, 2, 3, 4, 8) all pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 3: Run dev server**

Run: `npm run dev`
Open the URL in a browser.

- [ ] **Step 4: Walkthrough (spec §8.5)**

1. **Map 1, hover tooltips.** Hover each of the 6 tower-build buttons. Confirm Effective/Weak lines match the matrix.
2. **Cannon vs Brutes.** Place a Cannon near brutes. Confirm visible HP-bar bites are larger than vs Skitters (matrix 1.5× vs 0.5×).
3. **Archer vs Phantoms then Titans.** Confirm Phantoms drop fast (1.25×), Titans take many hits (0.5×).
4. **Sniper-Assassin.** Upgrade Sniper to Tier-3 → pick Assassin. Confirm:
   - Branch picker showed `⚡ 2.5× vs Titan`.
   - TowerPanel matchup line includes Titan + Colossus + Brute in Effective.
   - Titan dies in ~2 hits.
5. **Hero vs Phantom.** Confirm hero auto-attack drops Phantoms (1.5×) faster than Brutes (1.0×).
6. **Hero airstrike** on a phantom cluster. Near-one-shot kills.
7. **Barracks vs Phantom.** Soldiers (Tier-4A Vanguard if needed) block but kill slowly (0.5× multiplier).
8. **No regression** on existing flows: gold income, wave progression, hero level-ups, story banners, audio cues — all unchanged.

- [ ] **Step 5: Push branch and open PR (if walkthrough passes)**

```bash
git push -u origin feature/phase-9b-weakness-matrix
gh pr create --title "feat: Phase 9b — tower/enemy weakness matrix" --body "$(cat <<'EOF'
## Summary
- Damage multiplier matrix keyed by (tower-type × enemy-type) with sparse Tier-4 branch overrides
- Hero matchup table (Phantom 1.5× baseline)
- Multiplier applied post-armor in `Enemy.takeDamage`; unknown source / unknown enemy → 1.0× (zero regression)
- UI: tower-build hover tooltip, TowerPanel matchup line, Tier-4 branch picker headline override

## Test plan
- [ ] `npm test` — all unit tests pass (new: weaknessMatrix, sourceBuilders, Enemy formula, Hero source)
- [ ] `npm run build` — clean
- [ ] Manual walkthrough per `docs/superpowers/specs/2026-05-27-phase-9b-weakness-matrix-design.md` §8.5

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Update `.claude/notes.md`**

Append a phase-completion bullet for Phase 9b (mirror the format of the 9a entry that already exists in notes.md). Reference the PR number once GitHub returns it.

---

## Self-Review Notes (filled out by plan author)

**Spec coverage (every requirement maps to a task):**
- Spec §2 formula → Task 4 ✓
- Spec §3 damage scope (tower, soldier, hero auto-attack, hero airstrike) → Tasks 6, 7, 8, 9 ✓
- Spec §4 data tables → Task 1 ✓
- Spec §4 `describeMatchups` → Task 2 ✓
- Spec §5.1 file list, source builders → Task 3 ✓
- Spec §5.3 source object shape → Tasks 6/7/8/9 produce the right shapes
- Spec §6.1 BottomBar tooltip → Task 12 ✓
- Spec §6.2 TowerPanel matchup line → Task 11 ✓
- Spec §6.3 Tier-4 branch picker hint → Task 13 ✓
- Spec §7 edge cases — covered by Task 1 (defaults), Task 4 (no-source backcompat), Task 13 (tied-cell tiebreak via alphabetical sort)
- Spec §8.1 weaknessMatrix tests → Task 1 + Task 2 ✓
- Spec §8.2 Enemy formula tests → Task 4 ✓
- Spec §8.3 source-builder tests → Task 3 ✓
- Spec §8.4 UI verification → in-task browser checks in Tasks 11, 12, 13
- Spec §8.5 manual walkthrough → Task 14 ✓
- Spec §11 acceptance criteria → Task 14 covers all 7 items

**Placeholder scan:** every code step contains executable code or an exact command. No TBD, no "implement appropriately." Long-press / touch tooltip handling is explicitly deferred per spec §6.1 v1.

**Type/symbol consistency:**
- `getWeaknessMultiplier(source, enemyType)` — same name in Tasks 1, 4
- `describeMatchups(source)` — same name in Tasks 2, 11, 12
- `WEAKNESS_MATRIX`, `TIER4_OVERRIDES`, `HERO_MULTIPLIERS` exports consistent across Tasks 1, 2, 13
- Source object shape `{kind: 'tower', type, tier, branch}` for towers and `{kind: 'hero', ability?: string}` for hero — used identically across Tasks 6, 7, 8, 9
- `tower.level` is the runtime field on the `Tower` class; the source object's `tier` field maps from `tower.level`. Confirmed at Tasks 5 and 6.
- `blocker.barracks.level/branch` — `Soldier` constructor stores `this.barracks` (Phase 6); confirmed available.

**Security:** All DOM construction uses `createElement` + `textContent`. No `innerHTML` anywhere. No user-supplied input feeds the UI — all strings derive from `ENEMY_DEFS`/`TOWER_DEFS` constants.

**Scope:** 13 implementation tasks + 1 acceptance. One PR. No new dependencies. No scope creep beyond the spec.
