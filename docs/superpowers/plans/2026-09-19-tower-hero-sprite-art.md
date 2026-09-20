# Tower + Hero/Soldier/Sentry Sprite Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real sprite art for the last 12 entities — 6 towers, 4 heroes, the barracks soldier and the engineer sentry — closing backlog #8(c) and #8(d).

**Architecture:** The rendering infrastructure already exists (PR #42): `EntitySprite` renders a Phaser Sprite when art is registered and a Graphics fallback otherwise, and `SPRITE_MANIFEST` in `src/data/sprites.js` is the single registration point. This plan fixes two entity-ID mismatches that would make the art silently fail to render, makes the enemy-only sprite compositor category-aware, adds the three transforms towers and humans need (`idle` static, `idle` breathe, `attack` recoil), generates and composites the art, and closes two small wiring gaps found during design — towers never called `setFacing`, and the soldier never entered its `attack` state.

**Tech Stack:** Phaser 3, vanilla ES modules, Vitest 2 + jsdom, Vite 5. Art generation is FLUX.1 [schnell] via the local Draw Things HTTP API (`npm run art`); frame compositing is Python 3 with `rembg`/`Pillow`/`numpy`/`scipy` (`scripts/build-sprite-sheets.py`).

**Spec:** `docs/superpowers/specs/2026-09-19-tower-hero-sprite-art-design.md`

---

## Preconditions (verified 2026-09-19, re-check before Task 7)

- Python deps installed: `python3 -c "import rembg, scipy, numpy, PIL"` prints nothing and exits 0.
- Draw Things API Server is running in **HTTP** mode: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7860/sdapi/v1/options` prints `200`.
- `.art-cache/sprites/` holds 5 enemy references (brute, colossus, phantom, skitter, titan). The drone's reference predates the cache and is absent — this is expected, and Task 6's regression check accounts for it.
- **Machine limit:** FLUX-schnell q8p is 12.3 GB resident on a 24 GB machine. Generating with Chrome open exhausted swap and wedged Draw Things twice. Close the browser before Task 7 and generate in small batches.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `public/assets/sprites/PROMPTS.md` | The art brief; `npm run art` parses it | Modify — rename 3 hero bullets to runtime ids, add the anti-emplacement phrasing to hero/soldier prompts |
| `src/assets/promptParser.js` | Parses PROMPTS.md into generation jobs | Modify — soldier/sentry emit `type: 'default'` |
| `src/assets/promptParser.test.js` | Parser tests | Modify — add the id-agreement regression test |
| `src/entities/Tower.js` | Tower entity + its Graphics fallback | Modify — keep the tier ring visible under sprite art |
| `src/entities/Tower.test.js` | Tower tests | **Create** — none exists today |
| `src/scenes/GameScene.js` | Tower fire loop, soldier block loop | Modify — two `setState`/`setFacing` calls |
| `src/scenes/GameScene.towerFacing.test.js` | Tower facing at the fire site | **Create** |
| `src/scenes/GameScene.soldierAttack.test.js` | Soldier attack state at the block site | **Create** |
| `scripts/build-sprite-sheets.py` | Reference → animation sheets | Modify — category routing + 3 new transforms |
| `src/data/sprites.js` | `SPRITE_MANIFEST` registration | Modify — 12 new entries |
| `public/assets/sprites/{towers,heroes,soldiers,sentry}/` | The art | **Create** — 27 PNGs |

---

## Task 1: Fix the entity-ID mismatches

Three hero prompt bullets use character names rather than the runtime `HEROES` keys, and the soldier/sentry bullets emit their own name where both entities construct with `type: 'default'`. `getSpriteConfig(category, type)` matches on the runtime type, so art generated under the wrong name would parse, composite, register — and never render.

| PROMPTS.md bullet | Runtime `type` |
|---|---|
| `dax` | `engineer` |
| `vex` | `scout` |
| `mira` | `pyro` |
| `soldier` | `default` |
| `sentry` | `default` |

**Files:**
- Modify: `public/assets/sprites/PROMPTS.md`
- Modify: `src/assets/promptParser.js:164-168`
- Modify: `src/assets/promptParser.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/assets/promptParser.test.js`. Import `HEROES` and `TOWER_DEFS` at the top of the file if not already imported.

```js
import { HEROES } from '../data/heroes.js';
import { TOWER_DEFS } from '../data/towers.js';
import { ENEMY_DEFS } from '../data/enemies.js';

describe('parseSpritePrompts entity-id agreement', () => {
  // A prompt bullet whose name is not the entity's runtime `type` produces art
  // that parses, composites and registers but never renders, because
  // getSpriteConfig(category, type) matches on the runtime type. Soldier and
  // sentry both construct with type 'default'.
  const VALID = {
    enemy:   Object.keys(ENEMY_DEFS),
    tower:   Object.keys(TOWER_DEFS),
    hero:    Object.keys(HEROES),
    soldier: ['default'],
    sentry:  ['default'],
  };

  it('emits only types that some entity actually constructs', () => {
    const md = readFileSync('public/assets/sprites/PROMPTS.md', 'utf8');
    const offenders = parseSpritePrompts(md)
      .filter(p => !(VALID[p.category] ?? []).includes(p.type))
      .map(p => `${p.category}/${p.type}`);
    expect(offenders).toEqual([]);
  });

  it('covers every hero, tower and enemy exactly once', () => {
    const md = readFileSync('public/assets/sprites/PROMPTS.md', 'utf8');
    const got = parseSpritePrompts(md).map(p => `${p.category}/${p.type}`);
    expect(new Set(got).size).toBe(got.length);            // no duplicates
    for (const t of Object.keys(TOWER_DEFS)) expect(got).toContain(`tower/${t}`);
    for (const h of Object.keys(HEROES))     expect(got).toContain(`hero/${h}`);
    expect(got).toContain('soldier/default');
    expect(got).toContain('sentry/default');
  });
});
```

`readFileSync` is already imported in this test file; if not, add `import { readFileSync } from 'node:fs';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/assets/promptParser.test.js`
Expected: FAIL. The first test reports offenders `["hero/dax", "hero/vex", "hero/mira", "soldier/soldier", "sentry/sentry"]`; the second fails on the missing `hero/engineer`.

- [ ] **Step 3: Rename the hero bullets in PROMPTS.md**

In the `### (d) Heroes / Soldiers / Sentries` section, rename three bullet keys. **Keep the character names in the prose** — only the key changes, because the key is the runtime type.

```markdown
- **engineer** — `Engineer Dax`, support/builder:
```
```markdown
- **scout** — `Scout Vex`, ranged anti-air:
```
```markdown
- **pyro** — `Pyromancer Mira`, AoE burn:
```

(`- **rael** — \`Commander Rael\`, ...` is already correct and is left alone.)

- [ ] **Step 4: Make the parser emit `default` for soldier and sentry**

In `src/assets/promptParser.js`, the `out.push` at the end of `parseSpritePrompts` currently reads:

```js
    out.push({
      // soldier/sentry are their own manifest categories despite sharing the
      // heroes heading.
      category: category === 'hero' && (type === 'soldier' || type === 'sentry') ? type : category,
      type,
      subject: cleanSubject(subject),
    });
```

Replace it with:

```js
    // soldier/sentry are their own manifest categories despite sharing the
    // heroes heading, and both entities construct with type 'default' — the
    // type must be the runtime one or getSpriteConfig never matches.
    const isUnit = category === 'hero' && (type === 'soldier' || type === 'sentry');
    out.push({
      category: isUnit ? type : category,
      type: isUnit ? 'default' : type,
      subject: cleanSubject(subject),
    });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/assets/promptParser.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 6: Confirm the generation job list is now correct**

Run: `npm run art -- --dry-run --kind sprite 2>&1 | grep '^── '`
Expected: 13 lines — `enemy_drone`, the six `tower_*`, `hero_rael`, `hero_engineer`, `hero_scout`, `hero_pyro`, `soldier_default`, `sentry_default`. No `dax`, `vex`, `mira`, `soldier_soldier` or `sentry_sentry`.

- [ ] **Step 7: Commit**

```bash
git add public/assets/sprites/PROMPTS.md src/assets/promptParser.js src/assets/promptParser.test.js
git commit -m "fix(art): prompt bullet names must be runtime entity ids

Three hero bullets used character names (dax/vex/mira) rather than the
HEROES keys (engineer/scout/pyro), and soldier/sentry emitted their own
name where both entities construct with type 'default'. getSpriteConfig
matches on the runtime type, so art under those names would have parsed,
composited and registered without ever rendering."
```

---

## Task 2: Keep the tower tier ring visible under sprite art

A tower's tier (1–4) is encoded **only** in the `_bg` circle's stroke width, and `Tower.js:36` hides `_bg` entirely once sprite art is active. Dropping tower art would therefore make tier invisible on the board. Keep `_bg` visible, but draw it as a tier ring with no dark fill so it reads as a base ring under the sprite rather than a disc behind it.

**Files:**
- Modify: `src/entities/Tower.js:33-36` and `_redraw`
- Test: `src/entities/Tower.test.js` (**create**)

- [ ] **Step 1: Write the failing test**

Create `src/entities/Tower.test.js`.

Two things this test must not depend on. **The manifest entries land in Task 8**, so the real `src/data/sprites.js` has no tower entry yet and `EntitySprite` would stay inactive — the module is mocked with one instead, which also keeps the test independent of later manifest edits. And **`Tower`'s constructor destructures `def` and reads `def.damage` immediately**, so it must be passed a real `TOWER_DEFS` entry.

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        addAt() {}
        setDepth() { return this; }
        destroy() {}
      },
    },
  },
}));

// The real tower entries are registered in Task 8. Mock the manifest so this
// test exercises the sprite-active path today and stays stable afterwards.
vi.mock('../data/sprites.js', () => ({
  SPRITE_MANIFEST: [],
  getSpriteConfig: (category, type) =>
    category === 'tower' && type === 'archer'
      ? {
          scale: 0.6, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
          states: {
            idle:   { path: 'x_idle.png',   frameWidth: 64, frameHeight: 64, frames: 1 },
            attack: { path: 'x_attack.png', frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
          },
        }
      : null,
}));

import { TOWER_DEFS } from '../data/towers.js';
import { Tower } from './Tower.js';

// Records the calls a Graphics object receives so the test can assert on what
// was drawn rather than on pixels.
const makeGraphics = () => {
  const calls = [];
  const g = {
    _calls: calls,
    visible: true,
    setVisible(v) { g.visible = v; return g; },
  };
  for (const m of ['clear', 'fillStyle', 'fillCircle', 'fillRect',
                   'lineStyle', 'strokeCircle', 'strokeRect']) {
    g[m] = (...args) => { calls.push([m, ...args]); return g; };
  }
  return g;
};

const makeScene = (spriteKeys = []) => ({
  add: {
    graphics: () => makeGraphics(),
    text: () => ({ setOrigin: () => ({ setVisible() {} }) }),
    sprite: () => ({
      setOrigin() { return this; }, setScale() { return this; },
      setFlipX() { return this; }, setTexture() {}, play() {}, on() {}, once() {},
      destroy() {},
    }),
    existing() {},
  },
  anims: { exists: () => false, create() {}, generateFrameNumbers: () => [] },
  game: { registry: { get: () => spriteKeys } },
});

const strokeWidths = g => g._calls.filter(c => c[0] === 'lineStyle').map(c => c[1]);

// `def` is required: the constructor reads def.damage/range/fireRate directly.
const makeTower = (scene) =>
  new Tower(scene, { type: 'archer', x: 0, y: 0, def: TOWER_DEFS.archer, zoneIndex: 0 });

describe('Tower tier ring with sprite art active', () => {
  // Every tower state the mocked manifest declares, so EntitySprite goes active.
  const ARCHER_KEYS = ['sprite-tower-archer-idle', 'sprite-tower-archer-attack'];

  it('keeps the tier ring visible and drops the dark fill disc', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    expect(t._sprite.active).toBe(true);
    expect(t._bg.visible).toBe(true);
    // The dark disc would sit as an opaque plate behind the sprite; after the
    // post-sprite redraw the ring must be all that is left.
    expect(t._bg._calls.some(c => c[0] === 'fillCircle')).toBe(false);
    expect(t._icon.visible).toBe(false);
  });

  it('thickens the tier ring as the tower upgrades', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    expect(strokeWidths(t._bg)).toContain(1.5);   // tier 1
    t.upgrade(3);
    expect(strokeWidths(t._bg)).toContain(3);     // tier 3
  });

  it('still fills the disc when there is no sprite art (Graphics fallback)', () => {
    const t = makeTower(makeScene([]));
    expect(t._sprite.active).toBe(false);
    expect(t._bg._calls.some(c => c[0] === 'fillCircle')).toBe(true);
    expect(t._icon.visible).toBe(true);
  });
});
```

Note on the first assertion: `_redraw` runs once in the constructor *before* `_sprite` exists (so it does fill), and the implementation in Step 3 calls `_bg.clear()` and redraws after the sprite is created. `clear()` does not erase the recorded `_calls`, so assert on the calls made *after* the last `clear()`:

```js
const sinceLastClear = g => {
  const i = g._calls.map(c => c[0]).lastIndexOf('clear');
  return g._calls.slice(i);
};
```

Use `sinceLastClear(t._bg).some(c => c[0] === 'fillCircle')` in the first and third tests, and `sinceLastClear(t._bg).filter(...)` in `strokeWidths`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/entities/Tower.test.js`
Expected: FAIL — `t._bg.visible` is `false` and `fillCircle` was called, because `_redraw` runs before the sprite exists and `_bg` is then hidden outright.

- [ ] **Step 3: Implement**

In `src/entities/Tower.js`, `_redraw` currently always fills the disc:

```js
  _redraw() {
    const def = TOWER_DEFS[this.type];
    const sw  = [1.5, 2, 3, 4][this.level - 1];
    this._bg.clear();
    this._bg.fillStyle(0x2a2a3a, 1);
    this._bg.fillCircle(0, 0, 18);
    this._bg.lineStyle(sw, def.color, 1);
    this._bg.strokeCircle(0, 0, 18);
```

Replace those lines with:

```js
  _redraw() {
    const def = TOWER_DEFS[this.type];
    const sw  = [1.5, 2, 3, 4][this.level - 1];
    this._bg.clear();
    // With sprite art the disc would be an opaque plate behind the sprite; the
    // ring alone still carries tier, which is encoded ONLY in this stroke width.
    if (!this._sprite?.active) {
      this._bg.fillStyle(0x2a2a3a, 1);
      this._bg.fillCircle(0, 0, 18);
    }
    this._bg.lineStyle(sw, def.color, 1);
    this._bg.strokeCircle(0, 0, 18);
```

Then in the constructor, stop hiding `_bg` and redraw once the sprite exists. Replace:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'tower', type, initialState: 'idle',
    });
    if (this._sprite.active) { this._bg.setVisible(false); this._icon.setVisible(false); }
```

with:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'tower', type, initialState: 'idle',
    });
    // _redraw ran before the sprite existed, so the fallback disc is on the
    // canvas; redraw now that `_sprite.active` is known. The tier ring stays.
    if (this._sprite.active) { this._redraw(); this._icon.setVisible(false); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/entities/Tower.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS. Record the total count; it should be 968 + the tests added so far.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Tower.js src/entities/Tower.test.js
git commit -m "fix(towers): keep the tier ring visible under sprite art

Tier 1-4 is encoded only in the _bg stroke width, and _bg was hidden
outright once sprite art was active, so tower art would have made tier
invisible on the board. Draw the ring without the fill disc instead."
```

---

## Task 3: Face the tower toward its target

`GameScene._updateTowers` already calls `tower._sprite?.setState('attack')` at the fire site, but nothing ever calls `setFacing`, so a turret authored muzzle-right would always point right. The target enemy is already in hand as `best`.

No deadzone is needed here, unlike the enemy path (`src/systems/facing.js`): a tower's target jumps between discrete enemies rather than tracking a dense path, so the 13–26px hairpin backtracks that caused mid-stride mirror-flipping do not arise.

**Files:**
- Modify: `src/scenes/GameScene.js:770`
- Test: `src/scenes/GameScene.towerFacing.test.js` (**create**)

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.towerFacing.test.js`:

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

vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));

import GameScene from './GameScene.js';

const makeTower = (x, y) => ({
  type: 'archer', branch: null, x, y, range: 200, damage: 10, fireRate: 1,
  cooldown: 0, level: 1, splashRadius: 0, pierce: 0, slow: 0,
  _sprite: { setFacing: vi.fn(), setState: vi.fn() },
});
const makeEnemy = (x, y, waypointIndex = 1) => ({ x, y, waypointIndex });
const makeCtx = (towers, enemies) => ({
  placementManager: { getTowers: () => towers },
  enemies,
  projectiles: [],
  particleSpawner: null,
  game: { registry: { get: () => null } },
});

describe('GameScene._updateTowers facing', () => {
  it('faces the tower right when the target is to its right', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(180, 100)]), 1);
    expect(tower._sprite.setFacing).toHaveBeenCalledOnce();
    expect(tower._sprite.setFacing.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('faces the tower left when the target is to its left', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(20, 100)]), 1);
    expect(tower._sprite.setFacing.mock.calls[0][0]).toBeLessThan(0);
  });

  it('faces before it plays the attack beat', () => {
    const order = [];
    const tower = makeTower(100, 100);
    tower._sprite.setFacing = vi.fn(() => order.push('face'));
    tower._sprite.setState  = vi.fn(() => order.push('attack'));
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(180, 100)]), 1);
    expect(order).toEqual(['face', 'attack']);
  });

  it('does not touch facing when nothing is in range', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(9000, 9000)]), 1);
    expect(tower._sprite.setFacing).not.toHaveBeenCalled();
    expect(tower._sprite.setState).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.towerFacing.test.js`
Expected: FAIL on the first test — `setFacing` was never called.

- [ ] **Step 3: Implement**

In `src/scenes/GameScene.js`, inside `_updateTowers`, the block currently ends:

```js
        tower.cooldown = 1 / tower.fireRate;
        tower._sprite?.setState('attack');
```

Change it to:

```js
        tower.cooldown = 1 / tower.fireRate;
        // No deadzone, unlike the enemy path (systems/facing.js): a tower's
        // target jumps between discrete enemies rather than tracking a dense
        // path, so there is no hairpin backtrack to filter out.
        tower._sprite?.setFacing(best.x - tower.x);
        tower._sprite?.setState('attack');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.towerFacing.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.towerFacing.test.js
git commit -m "feat(towers): face the tower toward its target when it fires

setState('attack') was already wired at the fire site but setFacing was
not, so a turret authored muzzle-right would always point right."
```

---

## Task 4: Enter the soldier's attack state

Heroes (`Hero.js:237`) and sentries (`SentryTurret.js:65`) both call `setState('attack')`. The soldier is the only entity whose attack state is wired to nothing, so its attack art would never play. The soldier's attack lands in the block loop at `GameScene.js:389-392`.

**Files:**
- Modify: `src/scenes/GameScene.js:389-392`
- Test: `src/scenes/GameScene.soldierAttack.test.js` (**create**)

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.soldierAttack.test.js`:

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

// `barracks` needs level/branch: _dealDamage tags the hit via soldierSource(),
// which reads soldier.barracks.level and .branch.
const makeSoldier = (attackTimer) => ({
  damage: 5, attackRate: 1, attackTimer,
  barracks: { type: 'barracks', level: 1, branch: null },
  takeDamage: vi.fn(),
  _sprite: { setState: vi.fn() },
});
const makeEnemy = () => ({
  x: 0, y: 0, dead: false, waypointIndex: 0, currentSpeed: 0,
  statusEffects: { stun: { active: false } },
  update() {},
});
const makeCtx = (soldier, enemy) => ({
  enemies: [enemy],
  pathMgr: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  _checkSoldierBlock: () => soldier,
  _dealDamage: vi.fn(),
});

describe('GameScene soldier attack state', () => {
  it('enters the attack state on the beat the soldier deals damage', () => {
    const soldier = makeSoldier(0);
    GameScene.prototype._updateEnemies.call(makeCtx(soldier, makeEnemy()), 0.016);
    expect(soldier._sprite.setState).toHaveBeenCalledWith('attack');
  });

  it('does not re-enter the attack state while the swing is on cooldown', () => {
    const soldier = makeSoldier(0.5);
    GameScene.prototype._updateEnemies.call(makeCtx(soldier, makeEnemy()), 0.016);
    expect(soldier._sprite.setState).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.soldierAttack.test.js`
Expected: FAIL on the first test — `setState` was never called.

- [ ] **Step 3: Implement**

In `src/scenes/GameScene.js`, `_updateEnemies` currently reads:

```js
        if (blocker.attackTimer <= 0) {
          this._dealDamage(enemy, blocker.damage, false, { source: soldierSource(blocker) });
          blocker.attackTimer = 1 / blocker.attackRate;
        }
```

Change it to:

```js
        if (blocker.attackTimer <= 0) {
          this._dealDamage(enemy, blocker.damage, false, { source: soldierSource(blocker) });
          blocker.attackTimer = 1 / blocker.attackRate;
          blocker._sprite?.setState('attack');
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.soldierAttack.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.soldierAttack.test.js
git commit -m "feat(soldiers): enter the attack state when the soldier swings

Heroes and sentries already did; the soldier was the only entity whose
attack state was wired to nothing, so its attack art would never play."
```

---

## Task 5: Make the compositor category-aware

`scripts/build-sprite-sheets.py` is enemy-only in three places — it globs `enemy_*.png`, hardcodes `OUT_DIR` to `sprites/enemies`, and its `TINTS` table covers only the six enemies — and it knows only `move` and `death`. This task adds the routing tables; Task 6 adds the transforms. Splitting them keeps each change small enough to verify on its own.

Per-entity cell sizes move from the `--cell` CLI flag into a table so that one `--all` run reproduces every committed sheet, which is what makes Task 6's regression check possible.

**Files:**
- Modify: `scripts/build-sprite-sheets.py`

- [ ] **Step 1: Replace the module constants**

In `scripts/build-sprite-sheets.py`, replace:

```python
REF_DIR = ROOT / '.art-cache' / 'sprites'
OUT_DIR = ROOT / 'public' / 'assets' / 'sprites' / 'enemies'
```

with:

```python
REF_DIR = ROOT / '.art-cache' / 'sprites'
SPRITE_ROOT = ROOT / 'public' / 'assets' / 'sprites'

# Output directory per category. These names are what PROMPTS.md documents and
# what SPRITE_MANIFEST paths point at — do not "tidy" the singular `sentry`.
OUT_DIRS = {
    'enemy':   SPRITE_ROOT / 'enemies',
    'tower':   SPRITE_ROOT / 'towers',
    'hero':    SPRITE_ROOT / 'heroes',
    'soldier': SPRITE_ROOT / 'soldiers',
    'sentry':  SPRITE_ROOT / 'sentry',
}

# Which states each category gets, and the default cell size. Towers are static
# emplacements, so their idle is a single frame; heroes walk the path, so they
# get a gait; soldiers and sentries are markedly smaller than any enemy.
PLAN = {
    'enemy':   {'states': ('move', 'death'),           'cell': 64},
    'tower':   {'states': ('idle', 'attack'),          'cell': 64},
    'hero':    {'states': ('idle', 'move', 'attack'),  'cell': 64},
    'soldier': {'states': ('idle', 'attack'),          'cell': 48},
    'sentry':  {'states': ('idle', 'attack'),          'cell': 48},
}

# Per-entity overrides. The barracks is a building and never fires.
STATE_OVERRIDES = {('tower', 'barracks'): ('idle',)}

# A bigger creature needs more source pixels than a 64px cell leaves it: a 64px
# cell left the titan 24px wide inside it. Set from the measured silhouette.
CELL_OVERRIDES = {('enemy', 'colossus'): 96, ('enemy', 'titan'): 128}

# Flyers bob without footfalls, so their gait drops the rock.
HOVER = {('enemy', 'phantom')}
```

- [ ] **Step 2: Replace the TINTS table**

The emissive tint drives the death dissolve's burning rim and the attack flash. Replace the existing enemy-only `TINTS` dict with a `(category, type)`-keyed table covering every entity. Enemy values are unchanged; tower values are `TOWER_DEFS[].color` and hero values are each hero's `strokeColor`, both from `src/data/`.

```python
# Per-entity emissive tint: the burning rim of the death dissolve and the flash
# on the attack beat. Enemies mirror ENEMY_DEFS colours in src/data/enemies.js;
# towers mirror TOWER_DEFS[].color and heroes their strokeColor.
TINTS = {
    ('enemy', 'drone'):      (120, 255, 170),
    ('enemy', 'skitter'):    (255, 150,  60),
    ('enemy', 'brute'):      (170, 200, 170),
    ('enemy', 'colossus'):   (255,  90, 160),
    ('enemy', 'phantom'):    (200, 140, 255),
    ('enemy', 'titan'):      (255, 120, 100),
    ('tower', 'archer'):     (0x8b, 0x45, 0x13),
    ('tower', 'mage'):       (0x6a, 0x0d, 0xad),
    ('tower', 'cannon'):     (0x66, 0x66, 0x66),
    ('tower', 'ice'):        (0x4a, 0x8f, 0xa8),
    ('tower', 'sniper'):     (0x55, 0x6b, 0x2f),
    ('tower', 'barracks'):   (0x4c, 0xaf, 0x50),
    ('hero',  'rael'):       (0x4f, 0xc3, 0xf7),
    ('hero',  'engineer'):   (0xff, 0x99, 0x33),
    ('hero',  'scout'):      (0x3f, 0xb9, 0x50),
    ('hero',  'pyro'):       (0xe7, 0x4c, 0x3c),
    ('soldier', 'default'):  (0x4c, 0xaf, 0x50),
    ('sentry',  'default'):  (0xff, 0x99, 0x33),
}
```

- [ ] **Step 3: Rewrite `main` to route by category**

Replace the whole `main()` function with:

```python
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*',
                    help='entities as category_type, e.g. tower_archer hero_rael')
    ap.add_argument('--all', action='store_true', help='every reference present')
    ap.add_argument('--cell', type=int, default=None,
                    help='override the cell size for every entity built')
    ap.add_argument('--no-mirror', action='store_true',
                    help='reference already faces right')
    ap.add_argument('--keep-debris', action='store_true',
                    help='skip largest-component isolation (subject is several blobs)')
    args = ap.parse_args()

    names = sorted(p.stem for p in REF_DIR.glob('*_*.png')) if args.all else args.names
    if not names:
        sys.exit(f'nothing to build; put references in {REF_DIR} via '
                 f'`npm run art -- --kind sprite`')

    for name in names:
        category, _, etype = name.partition('_')
        if category not in PLAN:
            print(f'  {name}: SKIP (unknown category {category!r})')
            continue
        ref_path = REF_DIR / f'{name}.png'
        if not ref_path.exists():
            print(f'  {name}: SKIP (no reference at {ref_path})')
            continue

        states = STATE_OVERRIDES.get((category, etype), PLAN[category]['states'])
        cell = args.cell or CELL_OVERRIDES.get((category, etype), PLAN[category]['cell'])
        tint = TINTS.get((category, etype), (255, 255, 255))
        out_dir = OUT_DIRS[category]
        out_dir.mkdir(parents=True, exist_ok=True)

        ref = cutout(ref_path, keep_largest=not args.keep_debris)
        # Author facing RIGHT; the renderer mirrors via flipX. FLUX drew every
        # enemy facing left whatever the prompt said, so flip by default and
        # pass --no-mirror for a reference that already faces right.
        if not args.no_mirror:
            ref = ref.transpose(Image.FLIP_LEFT_RIGHT)

        for st in states:
            out_path = out_dir / f'{etype}_{st}.png'
            if st == 'move':
                build_move(ref, out_path, cell=cell,
                           hover=(category, etype) in HOVER)
            elif st == 'death':
                build_death(ref, out_path, tint, cell=cell)
            elif st == 'idle':
                # Emplacements do not breathe; living units do.
                if category == 'tower':
                    build_idle_static(ref, out_path, cell=cell)
                else:
                    build_idle_breathe(ref, out_path, cell=cell)
            elif st == 'attack':
                build_attack(ref, out_path, tint, cell=cell)
        print(f'  {name}: {" + ".join(states)} -> {out_dir}')

    print('\nNow add/confirm the SPRITE_MANIFEST entries in src/data/sprites.js, '
          'then: npm run assets')
```

- [ ] **Step 4: Update the module docstring's usage lines**

Replace the usage block at the top of the file:

```
    npm run art -- --kind sprite          # generate references into .art-cache/
    python3 scripts/build-sprite-sheets.py drone skitter ...
    python3 scripts/build-sprite-sheets.py --all
```

with:

```
    npm run art -- --kind sprite          # generate references into .art-cache/
    python3 scripts/build-sprite-sheets.py tower_archer hero_rael ...
    python3 scripts/build-sprite-sheets.py --all

Entities are named `category_type`, matching the reference filenames that
`npm run art` writes. The type MUST be the entity's runtime type — the hero
ids are rael/engineer/scout/pyro, and soldier/sentry are both `default`.
```

- [ ] **Step 5: Verify it parses and reports the right plan**

The three `build_idle_static` / `build_idle_breathe` / `build_attack` functions do not exist yet, so only the routing can be checked here. Run:

```bash
python3 scripts/build-sprite-sheets.py --all 2>&1 | head -20
```

Expected: the five cached enemy references (brute, colossus, phantom, skitter, titan) each print `move + death -> .../enemies`, and no `NameError` is raised, because no enemy routes to a Task-6 function.

- [ ] **Step 6: Confirm the enemy rebuild is byte-identical**

The routing refactor must not change enemy output. The cell overrides now come from `CELL_OVERRIDES` rather than a `--cell` flag, so this also proves that table is right.

```bash
git status --porcelain public/assets/sprites/enemies/
```

Expected: **empty output**. Five of the six enemies were just rebuilt from their cached references, and the sheets are identical to the committed ones. (`drone` has no cached reference, so it was skipped — its committed sheets are untouched.)

If any file shows as modified, stop and find out which of these it is before touching anything else:

- `CELL_OVERRIDES` or `HOVER` disagrees with how that enemy was originally built (colossus is 96, titan is 128, phantom hovers).
- That enemy was originally built with `--no-mirror` or `--keep-debris`. Those are per-run CLI flags and were not recorded anywhere, so a plain `--all` rebuild cannot reproduce such a sheet. This is a limitation of the check, not a bug in the refactor.

Run `git diff --stat public/assets/sprites/enemies/` to see which files differ, then `git checkout -- public/assets/sprites/enemies/` to restore the committed art either way. **Never commit a rebuilt enemy sheet** — the committed PNGs are the source of truth, and the references that produced them are gitignored. If the cause was a wrong table value, fix the table and re-run; if it was a per-run flag, note it in the PR and move on.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-sprite-sheets.py
git commit -m "refactor(art): make the sprite compositor category-aware

Routes output directory, state set, cell size and tint by category so the
same script builds towers, heroes, soldiers and sentries. Per-entity cell
sizes move from the --cell flag into a table, so one --all run reproduces
every committed sheet; verified byte-identical for the five enemies with
cached references."
```

---

## Task 6: Add the idle and attack transforms

Three transforms the enemies never needed. Towers get a static idle because emplacements do not breathe; heroes, soldiers and sentries get a small breathing idle; everything that fires gets a recoil beat.

**Files:**
- Modify: `scripts/build-sprite-sheets.py`

- [ ] **Step 1: Add the attack beat table**

Add near the other module constants, after `HOVER`:

```python
# The firing beat, one entry per frame: (x offset as a fraction of the cell,
# flash strength 0-1). Art faces right, so a negative offset is a pull back and
# a positive one a lunge. The LAST entry must equal the first: EntitySprite
# reverts to the idle loop on animationcomplete, and a final frame that is not
# the rest pose makes that revert visibly jump.
ATTACK_BEAT = [(0.0, 0.0), (-0.085, 0.15), (0.098, 1.0), (0.030, 0.35), (0.0, 0.0)]
FLASH_MIX = 0.55        # how far the flash pushes a pixel toward the tint
```

- [ ] **Step 2: Add the three builders**

Add after `build_death`:

```python
def build_idle_static(ref, out_path, cell=64):
    """A single centred cell. Towers are emplacements and do not breathe.

    `frames: 1` is handled by EntitySprite.setState via setTexture rather than
    an animation, and a static state is a legal default to revert to after a
    one-shot — only a single-frame ONE-SHOT is broken (no animationcomplete)."""
    big = cell * SS
    ref = _fit(ref, big)
    cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    cellim.paste(ref, (round((big - ref.width) / 2), round((big - ref.height) / 2)), ref)
    sheet = cellim.resize((cell, cell), Image.LANCZOS)
    sheet.save(out_path)
    return sheet


def build_idle_breathe(ref, out_path, cell=64, frames=6):
    """A living unit standing still: the gait with the stride taken out.
    Same code path as build_move so the two cannot drift apart."""
    return build_move(ref, out_path, cell=cell, frames=frames,
                      bob=0.012, rock=0.0, squash=0.018, hover=True)


def build_attack(ref, out_path, tint, cell=64):
    """One-shot firing beat: pull back, lunge with a flash in the entity's
    tint, settle back to rest. Frame count comes from ATTACK_BEAT."""
    frames = len(ATTACK_BEAT)
    big = cell * SS
    ref = _fit(ref, big)
    sheet = Image.new('RGBA', (cell * frames, cell), (0, 0, 0, 0))
    for i, (off, flash) in enumerate(ATTACK_BEAT):
        f = ref
        if flash > 0:
            a = np.array(ref).astype(np.float32)
            m = FLASH_MIX * flash
            for c in range(3):
                a[..., c] = a[..., c] * (1 - m) + tint[c] * m
            f = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
        cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        cellim.paste(f, (round((big - f.width) / 2 + off * big),
                         round((big - f.height) / 2)), f)
        sheet.paste(cellim.resize((cell, cell), Image.LANCZOS), (i * cell, 0))
    sheet.save(out_path)
    return sheet
```

- [ ] **Step 3: Verify the transforms run on a real reference**

No Python test framework exists in this repo, so verify against a cached reference and throw the output into a temp directory. Use `enemy_brute` — it is a reference that exists, and enemies never route to these functions in normal use, so nothing committed is touched.

The script's filename contains hyphens and is not importable by name, so load it by path:

```bash
python3 - <<'PY'
import importlib.util, tempfile
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('bss', 'scripts/build-sprite-sheets.py')
bss = importlib.util.module_from_spec(spec); spec.loader.exec_module(bss)

ref = bss.cutout(Path('.art-cache/sprites/enemy_brute.png'))
out = Path(tempfile.mkdtemp())
bss.build_idle_static(ref, out / 'i.png', cell=64)
bss.build_idle_breathe(ref, out / 'b.png', cell=64)
bss.build_attack(ref, out / 'a.png', (255, 0, 0), cell=64)

assert Image.open(out / 'i.png').size == (64, 64),   Image.open(out / 'i.png').size
assert Image.open(out / 'b.png').size == (384, 64),  Image.open(out / 'b.png').size
assert Image.open(out / 'a.png').size == (320, 64),  Image.open(out / 'a.png').size

# The revert to idle must not jump: last attack frame == first.
a = Image.open(out / 'a.png')
first = a.crop((0, 0, 64, 64)).tobytes()
last  = a.crop((256, 0, 320, 64)).tobytes()
assert first == last, 'last attack frame must equal the rest pose'
print('transforms OK: idle 64x64, breathe 6x64, attack 5x64, beat returns to rest')
PY
```

Expected: `transforms OK: idle 64x64, breathe 6x64, attack 5x64, beat returns to rest`

- [ ] **Step 4: Confirm the enemies are still untouched**

```bash
git status --porcelain public/assets/sprites/enemies/
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-sprite-sheets.py
git commit -m "feat(art): idle-static, idle-breathe and attack transforms

Towers get a single static idle (emplacements do not breathe); heroes,
soldiers and sentries get the gait with the stride taken out. The attack
beat pulls back, lunges with a flash in the entity tint and returns to
the rest pose, which the revert to idle on animationcomplete requires."
```

---

## Task 7: Generate the 12 references

This is the art step and the one human-judgment gate in the plan: **every reference is looked at before it is composited.** Only the reference is judged — once it is right, every frame derives from it by transform, so identity drift is impossible by construction.

**Files:**
- Create: `.art-cache/sprites/{tower_*,hero_*,soldier_default,sentry_default}.png` (gitignored)
- Modify: `public/assets/sprites/PROMPTS.md` (prompt phrasing)

- [ ] **Step 1: Re-check the preconditions**

```bash
python3 -c "import rembg, scipy, numpy, PIL; print('deps OK')"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7860/sdapi/v1/options
```

Expected: `deps OK` and `200`. If the curl fails, Draw Things is not in **HTTP** API mode — it listens on 7859 in gRPC mode, which `npm run art` does not speak.

**Close Chrome before generating.** FLUX-schnell q8p is 12.3 GB resident on a 24 GB machine; generating with the browser open exhausted swap and wedged Draw Things twice.

- [ ] **Step 2: Add the anti-emplacement phrasing to the hero and soldier prompts**

The shared style anchor says "sci-fi tower-defense **unit**", which biases the generator toward emplacements. For the enemies this was the bug: skitter came back a turret and phantom a monolith until their prompts said "living creature" explicitly.

For **towers the bias is correct** — leave the anchor and all six tower prompts alone.
For the **sentry** the bias is also correct — it is a deployable auto-turret. Leave it alone.
The **four heroes and the soldier** need the same explicit correction the creatures needed. Append this clause to each of those five fenced prompts in `public/assets/sprites/PROMPTS.md`:

```
, one single standing human character, full body, not a turret, not a
building, not an emplacement
```

- [ ] **Step 3: Generate in two batches**

Batch the run; do not generate 12 at once.

```bash
npm run art -- --kind sprite --only tower_archer,tower_mage,tower_cannon,tower_ice,tower_sniper,tower_barracks
```

```bash
npm run art -- --kind sprite --only hero_rael,hero_engineer,hero_scout,hero_pyro,soldier_default,sentry_default
```

Expected: 12 files in `.art-cache/sprites/`. Confirm with `ls .art-cache/sprites/`.

- [ ] **Step 4: Review every reference before compositing**

Open each of the 12 PNGs and check, per the failures this pipeline has actually produced:

1. **Baked-in lettering.** FLUX renders text into artwork unprompted — a quoted proper noun in a prompt got drawn as "LAST LIGNT" poster text on six of ten overworld nodes. Any reference with lettering is a re-roll.
2. **Right kind of thing.** A hero that came back as a turret, or a tower that came back as a creature, is a re-roll — that is exactly the style-anchor bias.
3. **One subject.** The compositor's largest-connected-component pass drops loose debris, but a second *attached* figure survives it.
4. **Which way it faces.** Note it per entity; it decides the `--no-mirror` flag in Task 8. Do not assume left — that held for the creatures, not necessarily for turrets and humans.
5. **Faces and hands** (heroes and the soldier only). Diffusion mangles these far more visibly than it mangles chitin. At a 64px cell most of it disappears, but a clearly broken face is a re-roll.

Re-roll a bad reference with a different seed:

```bash
npm run art -- --kind sprite --only hero_scout --seed 41337 --force
```

Repeat until all 12 are on-model. Report to the maintainer which entities needed re-rolls and why.

- [ ] **Step 5: Commit the prompt change**

The references are gitignored and are not committed — only the prompt edit is.

```bash
git add public/assets/sprites/PROMPTS.md
git commit -m "docs(art): say 'human character, not an emplacement' for heroes

Same correction the creature prompts needed: the shared style anchor's
'tower-defense unit' biases the generator toward emplacements. Correct
for towers and the sentry, wrong for the four heroes and the soldier."
```

---

## Task 8: Composite the sheets and register the manifest

**Files:**
- Create: 27 PNGs under `public/assets/sprites/{towers,heroes,soldiers,sentry}/`
- Modify: `src/data/sprites.js`

- [ ] **Step 1: Composite**

Build per entity, passing `--no-mirror` for any reference Task 7 Step 4 found already facing right:

```bash
python3 scripts/build-sprite-sheets.py \
  tower_archer tower_mage tower_cannon tower_ice tower_sniper tower_barracks \
  hero_rael hero_engineer hero_scout hero_pyro \
  soldier_default sentry_default
```

Expected: 12 lines. Towers print `idle + attack` (barracks `idle`), heroes `idle + move + attack`, soldier and sentry `idle + attack`.

Confirm the file count:

```bash
find public/assets/sprites/{towers,heroes,soldiers,sentry} -name '*.png' | wc -l
```

Expected: `27`.

- [ ] **Step 2: Measure each silhouette to set `scale`**

Set `scale` from the measured silhouette against the footprint the entity's Graphics body occupies — never by eye. This is the rule that came out of the titan sitting 24px wide inside a 64px cell and needing `scale: 2.2` to compensate, which looked soft.

**Which axis governs differs by category.** Towers and the sentry are discs seen from above, so their *width* is the footprint. Heroes and the soldier are standing figures that are much taller than they are wide, so fitting them on width would make them enormous — their *height* is the dimension to match.

Target footprints, read off the Graphics bodies being replaced:

| Category | Graphics body | Target | Axis |
|---|---|---|---|
| towers | `fillCircle(0, 0, 18)` (`Tower._redraw`) | 36px | width |
| sentry | `fillCircle(0, 0, 7)` + an 8px barrel (`SentryTurret`) | 15px | width |
| soldier | head `circle(r=4)` at y=-8 over a `6x8` body (`Soldier._drawBody`) → y spans -12..+4 | 16px | height |
| heroes | head `circle(r=6)` at y=-10 over a `8x10` body (`heroes.js` `draw`) → y spans -16..+6 | 22px | height |

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path

# (target px, axis) per category directory — see the table above.
TARGET = {
    'towers':   (36, 'w'),
    'sentry':   (15, 'w'),
    'soldiers': (16, 'h'),
    'heroes':   (22, 'h'),
}
for d, (target, axis) in TARGET.items():
    for p in sorted(Path(f'public/assets/sprites/{d}').glob('*_idle.png')):
        im = Image.open(p)
        cell = im.height
        bbox = im.crop((0, 0, cell, cell)).getbbox()
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        got = w if axis == 'w' else h
        print(f'{p.name:28} cell {cell:3}  silhouette {w:3}x{h:<3}  '
              f'fit {axis}={got:3} -> scale {target / got:.2f}')
PY
```

Use the printed `scale` for each entity's manifest entry, rounded to 2dp. If any value lands outside roughly 0.2–1.4, the reference is badly framed inside its cell — re-check it before accepting the number, since that is the symptom that made the titan need `scale: 2.2` and look soft.

- [ ] **Step 3: Register the 12 manifest entries**

Append to `SPRITE_MANIFEST` in `src/data/sprites.js`, before the closing `];`. Substitute the measured `scale` values from Step 2 and the `frames` counts the compositor produced (idle-breathe 6, attack 5, move 8).

```js
  // ── Towers ────────────────────────────────────────────────────────────────
  // Emplacements: a single static idle frame, plus the firing beat. `frames: 1`
  // loads as a plain texture (no animation), which is a legal state to revert
  // to when the one-shot attack completes.
  {
    category: 'tower', type: 'archer',
    scale: 0.00, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/archer_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 1 },
      attack: { path: 'assets/sprites/towers/archer_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
```

Repeat that entry shape for `mage`, `cannon`, `ice` and `sniper`, changing only `type`, the two paths and `scale`.

The barracks is a building and never fires, so it gets `idle` only:

```js
  // The barracks never fires — soldiers do the fighting — so it has no attack.
  {
    category: 'tower', type: 'barracks',
    scale: 0.00, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle: { path: 'assets/sprites/towers/barracks_idle.png',
              frameWidth: 64, frameHeight: 64, frames: 1 },
    },
  },
  // ── Heroes ────────────────────────────────────────────────────────────────
  // Heroes walk the path, so they get a real gait alongside the breathing idle.
  {
    category: 'hero', type: 'rael',
    scale: 0.00, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/heroes/rael_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 8 },
      move:   { path: 'assets/sprites/heroes/rael_move.png',
                frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      attack: { path: 'assets/sprites/heroes/rael_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
```

Repeat that hero entry for `engineer`, `scout` and `pyro`, changing only `type`, the three paths and `scale`.

```js
  // ── Barracks soldier ──────────────────────────────────────────────────────
  // Path-positioned and static (it holds a blocking post), so idle + attack.
  // `type: 'default'` — Soldier.js constructs with that, not 'soldier'.
  {
    category: 'soldier', type: 'default',
    scale: 0.00, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/soldiers/default_idle.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 8 },
      attack: { path: 'assets/sprites/soldiers/default_attack.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 16 },
    },
  },
  // ── Engineer sentry ───────────────────────────────────────────────────────
  {
    category: 'sentry', type: 'default',
    scale: 0.00, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/sentry/default_idle.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 8 },
      attack: { path: 'assets/sprites/sentry/default_attack.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 16 },
    },
  },
```

- [ ] **Step 4: Validate every declared asset**

Run: `npm run assets`
Expected: every sprite row present at the declared size. `requiredAssets` checks `frameWidth * frames` by `frameHeight`, so a wrong `frames` count fails here. Fix any mismatch in the manifest, not by renaming files.

- [ ] **Step 5: Add a manifest invariant test**

Append to `src/data/sprites.test.js` (create the file with the `import { describe, it, expect } from 'vitest'` header if it does not exist):

```js
import { SPRITE_MANIFEST, getSpriteConfig } from './sprites.js';
import { TOWER_DEFS } from './towers.js';
import { HEROES } from './heroes.js';

describe('SPRITE_MANIFEST', () => {
  it('registers every tower and hero under its runtime id', () => {
    for (const t of Object.keys(TOWER_DEFS)) expect(getSpriteConfig('tower', t)).not.toBeNull();
    for (const h of Object.keys(HEROES))     expect(getSpriteConfig('hero', h)).not.toBeNull();
    expect(getSpriteConfig('soldier', 'default')).not.toBeNull();
    expect(getSpriteConfig('sentry',  'default')).not.toBeNull();
  });

  it('gives every one-shot state more than one frame', () => {
    // A single-frame one-shot never fires animationcomplete, so the entity
    // would stay stuck on that frame forever (and a dead enemy never destroys).
    for (const e of SPRITE_MANIFEST) {
      for (const st of ['attack', 'death']) {
        if (!e.states[st]) continue;
        expect(e.states[st].frames, `${e.category}/${e.type} ${st}`).toBeGreaterThan(1);
      }
    }
  });

  it('has a looping state to revert to after every one-shot', () => {
    for (const e of SPRITE_MANIFEST) {
      if (!e.states.attack) continue;
      expect(Boolean(e.states.idle || e.states.move),
             `${e.category}/${e.type}`).toBe(true);
    }
  });
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm run test`
Expected: PASS. Record the total count.

- [ ] **Step 7: Commit**

```bash
git add public/assets/sprites/towers public/assets/sprites/heroes \
        public/assets/sprites/soldiers public/assets/sprites/sentry \
        src/data/sprites.js src/data/sprites.test.js
git commit -m "feat(sprites): art for the six towers, four heroes, soldier and sentry

27 sheets from 12 references. Towers get a static idle plus a firing
beat (the barracks never fires); heroes get idle, gait and attack;
soldier and sentry get idle and attack at a 48px cell. Scales are set
from measured silhouettes against each Graphics body's footprint."
```

---

## Task 9: Verify against the running game

A green suite is not the definition of done. The last three art items each shipped a failure no test could see: art outside `public/` that 404s only in the production build, entities hidden behind the build-pad layer, and enemies mirror-flipping mid-stride.

**Files:** none — this is verification.

- [ ] **Step 1: Build and preview the PRODUCTION build**

```bash
npm run build && npm run preview
```

Do **not** verify against `npm run dev`. Vite copies only `publicDir` into `dist/`, so the dev server serves files the build silently drops — that shipped broken backdrops for two months.

Check the exit code of the build explicitly; do not pipe it through `head` or `tail`.

- [ ] **Step 2: Confirm every new asset serves 200 from the built site**

```bash
for f in $(find public/assets/sprites/{towers,heroes,soldiers,sentry} -name '*.png' | sed 's|^public/||'); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:4173/$f")
  [ "$code" = 200 ] || echo "MISS $code $f"
done
echo "asset check done"
```

Expected: `asset check done` with no `MISS` lines. Use whatever port `npm run preview` actually printed. Confirm no other project's dev server or service worker is on that port first — ports 3000 and 4173 are frequent offenders.

- [ ] **Step 3: Verify the towers in the browser**

Open the previewed site and play a level with build pads for several tower types. Confirm:

- Each of the six towers renders as sprite art, not a coloured disc with an emoji.
- The **tier ring is visible** under the sprite, and thickens on upgrade to tiers 2, 3 and 4.
- A tower **mirrors** to face an enemy crossing from the far side.
- The **attack beat plays and returns to idle** — no tower is left frozen on a lunge frame. Watch one tower through at least ten shots; a stuck attack frame is the failure mode a single-frame one-shot produces.
- Nothing is hidden behind the depth-10 build-pad layer.

- [ ] **Step 4: Verify the heroes, soldier and sentry**

- Each of the four heroes (rael, engineer, scout, pyro) renders and visibly switches between **idle, move and attack**. Swap heroes from Map Select to reach all four.
- A **barracks soldier** renders and plays its attack while blocking an enemy.
- An **engineer sentry** renders and plays its attack.

- [ ] **Step 5: Verify the enemies did not regress**

The compositor was refactored under them. Play through a wave and confirm enemies still walk, face the right way, and dissolve on death as they did before.

- [ ] **Step 6: Record the evidence**

Report, per the project's verification standard: the command run, the raw output, and the conclusion. Include the test count, the build result, the asset-check output, and what was observed in the browser for each of the four groups above. Screenshots of a board with towers at mixed tiers and of each hero are worth capturing.

---

## Task 10: Open the PR and close the backlog item

- [ ] **Step 1: Confirm the branch state**

```bash
git fetch --all --prune && git status -sb && git log --oneline origin/main..HEAD
```

Expected: the branch is `feat/tower-hero-sprite-art` tracking `origin/main`, with the commits from Tasks 1–8 and nothing unexpected. Confirm the base is `main`.

- [ ] **Step 2: Update the backlog**

In `.claude/notes.md`, under backlog item 8, mark **(c)** and **(d)** done with the PR number, the sheet count, the test count and the verification evidence, matching how (a) and (b) are written. Also correct the stale "PR #56 is open and unmerged" line under **Loose ends** — it merged as `1ae069a` on 2026-09-19 — and refresh the **Current Status** header.

Record the two findings worth not re-deriving under "Hard-won facts":
- Prompt bullet names must be the runtime entity ids. Three hero bullets used character names and both unit bullets used their own name; art under those names parses, composites and registers but never renders, because `getSpriteConfig` matches on the runtime type.
- A tower's tier is encoded only in the `_bg` stroke width, so hiding `_bg` behind sprite art makes tier invisible on the board.

- [ ] **Step 3: Commit the notes**

```bash
git add .claude/notes.md
git commit -m "docs(notes): close backlog #8(c) and #8(d) — tower and hero sprite art"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/tower-hero-sprite-art
```

Open a PR against `main` describing: the 27 sheets across 12 entities, the two ID mismatches fixed, the three decisions taken during design (flipX facing, tier ring, no death art), the compositor refactor with its byte-identical enemy check, the four code changes, and the browser verification evidence from Task 9.

**Merging auto-deploys to production** — `main` is the Vercel production branch. Do not merge without an explicit ask.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Scope table — 27 sheets across 12 entities | 7, 8 |
| Out of scope: no death art for (d) | Not built; `PLAN` state table omits `death` for hero/soldier/sentry (Task 5) |
| Decision 1 — tower `flipX` facing | 3 |
| Decision 2 — tier-only ring | 2 |
| Decision 3 — core states only | 5 (`PLAN`), 8 (manifest) |
| Two ID mismatches | 1 |
| Prompt phrasing — heroes/soldier only | 7 Step 2 |
| Compositor: routing, out dirs, TINTS | 5 |
| Compositor: idle-static, idle-breathe, attack | 6 |
| Compositor: enemy output unchanged | 5 Step 6, 6 Step 4 |
| Code change 1 — `Tower._redraw` | 2 |
| Code change 2 — `setFacing` at the fire site | 3 |
| Code change 3 — soldier `attack` state | 4 |
| Code change 4 — 12 manifest entries | 8 |
| Cell sizes 64/48, scale from measured silhouette | 5 (`PLAN`), 8 Step 2 |
| Testing: parser, Tower, GameScene, Soldier, manifest, suite | 1, 2, 3, 4, 8 |
| Verification: production build, per-group browser checks | 9 |
| Risks: machine limits, gitignored refs, humans re-roll | 7 |

No spec requirement is without a task.

**Placeholder scan.** The `scale: 0.00` values in Task 8 Step 3 are deliberate and are not placeholders in the prohibited sense: Step 2 is a runnable command that prints the exact value for each, and its output is the input to Step 3. Every other code block is complete.

**Type consistency.** `build_idle_static` / `build_idle_breathe` / `build_attack` are named identically in the Task 5 dispatch and the Task 6 definitions. `PLAN`, `STATE_OVERRIDES`, `CELL_OVERRIDES`, `HOVER`, `OUT_DIRS`, `TINTS`, `ATTACK_BEAT` and `FLASH_MIX` are each defined once (Task 5, except `ATTACK_BEAT`/`FLASH_MIX` in Task 6) and referenced consistently. `TINTS` is `(category, type)`-keyed everywhere, including the `build_death` call that previously used a bare type key. Manifest `type` values are the runtime ids throughout: `engineer`/`scout`/`pyro` and `default` for both units, matching Task 1's parser change.

**Known ordering constraints.** Two places where a task depends on a later one, both handled rather than left to bite:

- Task 5's dispatch references the three Task 6 builders, so between those commits the script raises `NameError` for any non-enemy entity. Task 5 Step 5 only builds enemies, which never route to those functions, so the intermediate state is verifiable. Tasks 5 and 6 must land in order and neither should be skipped.
- Task 2 asserts the sprite-active path, but the tower manifest entries do not land until Task 8. Task 2's test mocks `src/data/sprites.js` rather than reading the real manifest, so it passes at Task 2 and stays stable once Task 8 lands.

**Review fixes applied.** The first pass of this plan had five defects, found by checking its claims against the code rather than re-reading the plan: the `Tower` constructor requires a `def` argument the test did not pass (would have crashed); Task 2 depended on Task 8's manifest; Task 6 Step 3 carried a dead, non-functional first code block; Task 8 Step 2 measured silhouette *width* for heroes and the soldier, which are standing figures where height governs, and used a guessed 26px hero target instead of the 22px the `draw` functions actually span; and Task 5 Step 6's remediation assumed a table error when an unrecorded per-run CLI flag is equally likely. A sixth was found while fixing the first: `Graphics.clear()` does not erase the recorded call log in the test double, so the tier-ring assertions must look only at calls made after the last `clear()`.
