# Entity Sprite-Rendering Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sprite-rendering infrastructure for game entities behind a Graphics fallback, and consolidate the redundant double-render path — shipping with zero art so the game looks correct today and each entity lights up as real sprites the moment its PNG + one manifest entry land.

**Architecture:** A declarative manifest (`src/data/sprites.js`) describes per-entity, per-state art; `BootScene` loads it 404-tolerantly and records which texture keys actually exist on the registry. A pure resolver (`src/systems/spriteKeys.js`) maps `(category, type, state)` → registered key or `null`. A reusable `EntitySprite` component (`src/systems/EntitySprite.js`) shows a Phaser `Sprite` when keys are registered and otherwise stays inactive, leaving each entity's existing `Graphics` drawing as the fallback. Each entity (Enemy/Tower/Hero/Soldier/SentryTurret) owns an `EntitySprite` and the redundant immediate-mode `GameScene` entity draws are removed so the entity Containers are the single render source.

**Tech Stack:** Vanilla JS (ES modules), Phaser 3.60+, Vite, Vitest + jsdom (Phaser `vi.mock`'d in entity tests).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/systems/spriteKeys.js` (create) | Pure key derivation/resolution — no Phaser import |
| `src/systems/spriteKeys.test.js` (create) | Unit tests for the resolver |
| `src/data/sprites.js` (create) | `SPRITE_MANIFEST` + `getSpriteConfig` — declarative art data |
| `src/data/sprites.test.js` (create) | Manifest shape guard |
| `src/systems/EntitySprite.js` (create) | Sprite-or-fallback component attached to a container |
| `src/systems/EntitySprite.test.js` (create) | Component behavior (mocked scene) |
| `src/scenes/BootScene.js` (modify) | Load manifest art; record registered keys on registry |
| `src/entities/Enemy.js` (modify) | Body/overlay split + EntitySprite |
| `src/entities/Tower.js` (modify) | EntitySprite + attack state |
| `src/entities/Hero.js` (modify) | EntitySprite |
| `src/entities/Soldier.js` (modify) | EntitySprite |
| `src/entities/SentryTurret.js` (modify) | EntitySprite |
| `src/scenes/GameScene.js` (modify) | Remove `_drawTowers`/`_drawEnemies`/`_drawProjectiles`; wire tower-attack + enemy-facing |
| `assets/sprites/PROMPTS.md` (create) | Art-pipeline scaffolding for sub-projects (b)/(c)/(d) |

**Scope note (planner refinement of the spec):** the spec table listed `Projectile` with an `idle` sprite state. Projectiles are ephemeral and projectile art is YAGNI for the infra cycle, so **(a) consolidates projectiles** (removes the redundant `_drawProjectiles` gfx draw — the `Projectile` container already renders its `dot`) **but does not attach an `EntitySprite` to `Projectile`.** The generic component makes adding it trivial later (most naturally within towers, sub-project (c)). No double-render remains anywhere.

---

## Task 1: Pure key resolver — `spriteKeys.js`

**Files:**
- Create: `src/systems/spriteKeys.js`
- Test: `src/systems/spriteKeys.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/systems/spriteKeys.test.js
import { describe, it, expect } from 'vitest';
import { spriteTextureKey, entitySpriteKey, registeredStates } from './spriteKeys.js';

describe('spriteTextureKey', () => {
  it('derives sprite-<category>-<type>-<state>', () => {
    expect(spriteTextureKey('enemy', 'drone', 'move')).toBe('sprite-enemy-drone-move');
    expect(spriteTextureKey('tower', 'archer', 'attack')).toBe('sprite-tower-archer-attack');
  });
});

describe('entitySpriteKey', () => {
  const reg = ['sprite-enemy-drone-move', 'sprite-tower-archer-idle'];
  it('returns the key when registered', () => {
    expect(entitySpriteKey('enemy', 'drone', 'move', reg)).toBe('sprite-enemy-drone-move');
  });
  it('returns null when not registered', () => {
    expect(entitySpriteKey('enemy', 'drone', 'death', reg)).toBeNull();
  });
  it('returns null for an empty registry', () => {
    expect(entitySpriteKey('tower', 'archer', 'idle', [])).toBeNull();
  });
});

describe('registeredStates', () => {
  it('filters to only the registered states', () => {
    const reg = ['sprite-enemy-drone-move'];
    expect(registeredStates('enemy', 'drone', ['idle', 'move', 'death'], reg)).toEqual(['move']);
  });
  it('returns [] when nothing registered', () => {
    expect(registeredStates('enemy', 'drone', ['idle', 'move'], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/spriteKeys.test.js`
Expected: FAIL — `Failed to resolve import "./spriteKeys.js"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```js
// src/systems/spriteKeys.js
// Pure, dependency-free sprite-key resolution. Mirrors src/systems/sfxKeys.js:
// the caller passes the list of registered texture keys so this module has no
// Phaser coupling and is fully unit-testable.

export function spriteTextureKey(category, type, state) {
  return `sprite-${category}-${type}-${state}`;
}

// Returns the registered texture key for the requested state, or null (the
// signal to fall back to the entity's Graphics drawing).
export function entitySpriteKey(category, type, state, registeredKeys) {
  const key = spriteTextureKey(category, type, state);
  return registeredKeys.includes(key) ? key : null;
}

// Of `states`, the subset that has a registered texture for this entity.
export function registeredStates(category, type, states, registeredKeys) {
  return states.filter(st => entitySpriteKey(category, type, st, registeredKeys) !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/spriteKeys.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/systems/spriteKeys.js src/systems/spriteKeys.test.js
git commit -m "feat(sprites): pure sprite-key resolver with registry fallback"
```

---

## Task 2: Sprite manifest — `sprites.js`

**Files:**
- Create: `src/data/sprites.js`
- Test: `src/data/sprites.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/data/sprites.test.js
import { describe, it, expect } from 'vitest';
import { SPRITE_MANIFEST, getSpriteConfig } from './sprites.js';

describe('SPRITE_MANIFEST', () => {
  it('is an array', () => {
    expect(Array.isArray(SPRITE_MANIFEST)).toBe(true);
  });
  it('every entry is well-formed', () => {
    for (const entry of SPRITE_MANIFEST) {
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.states).toBe('object');
      for (const def of Object.values(entry.states)) {
        expect(typeof def.path).toBe('string');
        if (def.frames && def.frames > 1) {
          expect(typeof def.frameWidth).toBe('number');
          expect(typeof def.frameHeight).toBe('number');
        }
      }
    }
  });
});

describe('getSpriteConfig', () => {
  it('returns null for an unknown entity', () => {
    expect(getSpriteConfig('enemy', 'does-not-exist')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/sprites.test.js`
Expected: FAIL — `Failed to resolve import "./sprites.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/data/sprites.js
// Declarative entity-art manifest. Tunables live here (no Phaser import).
//
// Each entry maps an entity category+type to per-state art. A state is either:
//   single image:  { path }
//   spritesheet:   { path, frameWidth, frameHeight, frames, frameRate }
// Looping states (idle/move) repeat forever; one-shot states (attack/death)
// play once. Texture keys are DERIVED, not stored — see spriteKeys.js
// (sprite-<category>-<type>-<state>).
//
// This ships EMPTY: no art is committed in sub-project (a), so every lookup
// falls back to the entity's Graphics drawing. Adding art = drop the PNG under
// assets/sprites/ + add one entry here (see assets/sprites/PROMPTS.md).
//
// Example entry shape (kept as a comment until real art lands):
//   {
//     category: 'enemy', type: 'drone',
//     scale: 1, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
//     states: {
//       move:  { path: 'assets/sprites/enemies/drone_move.png',
//                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 10 },
//       death: { path: 'assets/sprites/enemies/drone_death.png',
//                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 12 },
//     },
//   },
export const SPRITE_MANIFEST = [];

// Look up the manifest entry for an entity, or null if none is registered.
export function getSpriteConfig(category, type) {
  return SPRITE_MANIFEST.find(e => e.category === category && e.type === type) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/sprites.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/sprites.js src/data/sprites.test.js
git commit -m "feat(sprites): declarative entity-art manifest (starts empty)"
```

---

## Task 3: Sprite component — `EntitySprite.js`

**Files:**
- Create: `src/systems/EntitySprite.js`
- Test: `src/systems/EntitySprite.test.js`

**Note:** `EntitySprite` does NOT import Phaser — it only touches the `scene` object passed in, so tests use a hand-rolled scene mock (no Phaser mock needed). The active-path test `vi.mock`'s `../data/sprites.js` to supply a fake config, since the real manifest is empty.

- [ ] **Step 1: Write the failing test**

```js
// src/systems/EntitySprite.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake manifest so we can exercise the active path (real manifest is empty).
vi.mock('../data/sprites.js', () => ({
  getSpriteConfig: (category, type) =>
    category === 'enemy' && type === 'drone'
      ? {
          category: 'enemy', type: 'drone', scale: 2, anchor: { x: 0.5, y: 0.5 },
          baseFacing: 'right',
          states: {
            move:   { path: 'x.png', frameWidth: 16, frameHeight: 16, frames: 4, frameRate: 8 },
            attack: { path: 'y.png', frameWidth: 16, frameHeight: 16, frames: 3, frameRate: 8 },
          },
        }
      : null,
  SPRITE_MANIFEST: [],
}));

import { EntitySprite } from './EntitySprite.js';

function makeSpriteStub() {
  const s = {
    flipX: false, texture: null, played: [],
    setOrigin: vi.fn(() => s), setScale: vi.fn(() => s),
    setTexture: vi.fn((k) => { s.texture = k; return s; }),
    setFlipX: vi.fn((v) => { s.flipX = v; return s; }),
    play: vi.fn((cfg) => { s.played.push(cfg.key ?? cfg); return s; }),
    on: vi.fn(() => s), once: vi.fn(() => s), destroy: vi.fn(),
  };
  return s;
}

function makeScene(registeredKeys) {
  const sprite = makeSpriteStub();
  return {
    sprite,
    add: { sprite: vi.fn(() => sprite) },
    anims: { exists: vi.fn(() => false), create: vi.fn(), generateFrameNumbers: vi.fn(() => []) },
    game: { registry: { get: vi.fn(() => registeredKeys) } },
  };
}

function makeContainer() {
  return { children: [], addAt: vi.fn(function (c, i) { this.children.splice(i, 0, c); }) };
}

describe('EntitySprite (inactive / fallback)', () => {
  it('is inactive when no keys are registered', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    expect(es.active).toBe(false);
    expect(scene.add.sprite).not.toHaveBeenCalled();
  });
  it('is inactive for an unknown entity', () => {
    const scene = makeScene(['sprite-enemy-drone-move']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'ghost' });
    expect(es.active).toBe(false);
  });
  it('no-ops setState/setFacing and calls back synchronously from playOnce', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone' });
    expect(() => es.setState('move')).not.toThrow();
    expect(() => es.setFacing(-1)).not.toThrow();
    const cb = vi.fn();
    es.playOnce('death', cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('EntitySprite (active)', () => {
  let scene, es;
  beforeEach(() => {
    scene = makeScene(['sprite-enemy-drone-move', 'sprite-enemy-drone-attack']);
    es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
  });
  it('creates a sprite, applies scale/anchor, and is active', () => {
    expect(es.active).toBe(true);
    expect(scene.add.sprite).toHaveBeenCalledTimes(1);
    expect(scene.sprite.setScale).toHaveBeenCalledWith(2);
    expect(scene.sprite.setOrigin).toHaveBeenCalledWith(0.5, 0.5);
  });
  it('registers one animation per registered spritesheet state', () => {
    expect(scene.anims.create).toHaveBeenCalledTimes(2); // move + attack
  });
  it('plays the initial looping state', () => {
    expect(scene.sprite.played).toContain('sprite-enemy-drone-move');
  });
  it('setFacing flips relative to baseFacing right', () => {
    es.setFacing(-1);
    expect(scene.sprite.setFlipX).toHaveBeenCalledWith(true);
    es.setFacing(1);
    expect(scene.sprite.setFlipX).toHaveBeenCalledWith(false);
  });
  it('setState plays the requested registered animation', () => {
    es.setState('attack');
    expect(scene.sprite.played).toContain('sprite-enemy-drone-attack');
  });
  it('setState ignores an unregistered state', () => {
    es.setState('death');
    expect(scene.sprite.played).not.toContain('sprite-enemy-drone-death');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/EntitySprite.test.js`
Expected: FAIL — `Failed to resolve import "./EntitySprite.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/systems/EntitySprite.js
// Sprite-or-fallback render component for an entity Container. When the entity's
// art is registered (BootScene loaded the PNGs), it adds a child Phaser Sprite
// and drives its animations; otherwise it stays inactive and the entity keeps
// drawing its Graphics body (the fallback). No Phaser import — only touches the
// passed-in `scene`, so it is unit-testable with a plain scene stub.
import { getSpriteConfig } from '../data/sprites.js';
import { spriteTextureKey, registeredStates } from './spriteKeys.js';

const LOOPING = new Set(['idle', 'move']);

export class EntitySprite {
  constructor(container, scene, { category, type, initialState = 'idle' }) {
    this.scene    = scene;
    this.category = category;
    this.type     = type;
    this.active   = false;
    this.sprite   = null;
    this._busy    = false; // true while a one-shot (attack/death) anim is playing

    const config = getSpriteConfig(category, type);
    if (!config) return;
    const registeredKeys = scene.game?.registry?.get('spriteKeys') ?? [];
    const states = registeredStates(category, type, Object.keys(config.states ?? {}), registeredKeys);
    if (states.length === 0) return;

    this._config = config;
    this._states = new Set(states);

    const anchor = config.anchor ?? { x: 0.5, y: 0.5 };
    this.sprite = scene.add.sprite(0, 0, spriteTextureKey(category, type, states[0]));
    this.sprite.setOrigin(anchor.x, anchor.y);
    if (config.scale != null) this.sprite.setScale(config.scale);
    container.addAt(this.sprite, 0); // below the entity's overlay/HP-bar graphics

    for (const st of states) {
      const def = config.states[st];
      if (!def.frames || def.frames <= 1) continue; // single-image state — no animation
      const key = spriteTextureKey(category, type, st);
      if (scene.anims.exists(key)) continue;        // idempotent across many entities of a type
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: def.frames - 1 }),
        frameRate: def.frameRate ?? 10,
        repeat: LOOPING.has(st) ? -1 : 0,
      });
    }

    this.active = true;
    // One-shot states (attack) revert to a looping default when they complete.
    const start = this._states.has(initialState) ? initialState : states[0];
    this._defaultState = LOOPING.has(start)
      ? start
      : (this._states.has('idle') ? 'idle' : (this._states.has('move') ? 'move' : start));
    this.sprite.on('animationcomplete', this._onAnimComplete, this);
    this.setState(start);
  }

  setState(name) {
    if (!this.active || !this._states.has(name)) return;
    const oneShot = !LOOPING.has(name);
    if (this._busy && !oneShot) return; // don't interrupt a one-shot (attack) with a loop
    const key = spriteTextureKey(this.category, this.type, name);
    const def = this._config.states[name];
    if (!def.frames || def.frames <= 1) { this.sprite.setTexture(key); return; }
    this._busy = oneShot;
    this.sprite.play({ key, repeat: oneShot ? 0 : -1 }, true);
  }

  playOnce(name, onComplete) {
    if (!this.active || !this._states.has(name)) { onComplete?.(); return; }
    const key = spriteTextureKey(this.category, this.type, name);
    this.sprite.once('animationcomplete', () => onComplete?.());
    this.sprite.play({ key, repeat: 0 }, true);
  }

  setFacing(dirX) {
    if (!this.active || dirX === 0) return;
    const facesRight = (this._config.baseFacing ?? 'right') === 'right';
    this.sprite.setFlipX(facesRight ? dirX < 0 : dirX > 0);
  }

  _onAnimComplete() {
    // Looping anims never fire this; for one-shots, clear busy and return to the
    // default loop (per-frame call sites then resume move/idle next frame).
    this._busy = false;
    this.setState(this._defaultState);
  }

  destroy() {
    if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
    this.active = false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/EntitySprite.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/systems/EntitySprite.js src/systems/EntitySprite.test.js
git commit -m "feat(sprites): EntitySprite component with Graphics fallback"
```

---

## Task 4: Load manifest art + record registered keys — `BootScene`

**Files:**
- Modify: `src/scenes/BootScene.js`

- [ ] **Step 1: Add the manifest imports**

In `src/scenes/BootScene.js`, add after line 5 (`import { resolveAmbientMotion } ...`):

```js
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey } from '../systems/spriteKeys.js';
```

- [ ] **Step 2: Load the manifest art in `preload()`**

In `preload()`, immediately after the map-backdrop loop (after line 26's closing `}`), add:

```js
    // Preload entity sprite art declared in the manifest. Missing files log a
    // 404 but don't crash (same as map backdrops). Keys whose PNG is absent
    // simply never register, so the entity keeps its Graphics fallback.
    for (const entry of SPRITE_MANIFEST) {
      for (const [state, def] of Object.entries(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (def.frames && def.frames > 1) {
          this.load.spritesheet(key, def.path, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
        } else {
          this.load.image(key, def.path);
        }
      }
    }
```

- [ ] **Step 3: Record which keys actually loaded, in `create()`**

In `create()`, add at the very top (before the `const params = ...` line):

```js
    // Record which manifest textures actually loaded so the pure resolver can
    // tell "registered" from "fall back". Textures are guaranteed present by
    // the time create() runs.
    const registeredSpriteKeys = [];
    for (const entry of SPRITE_MANIFEST) {
      for (const state of Object.keys(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (this.textures.exists(key)) registeredSpriteKeys.push(key);
      }
    }
    this.game.registry.set('spriteKeys', registeredSpriteKeys);
```

- [ ] **Step 4: Verify the suite + build still pass**

Run: `npx vitest run`
Expected: PASS (no behavior change — manifest is empty, so `spriteKeys` registry value is `[]`).

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BootScene.js
git commit -m "feat(sprites): load manifest art and record registered keys in BootScene"
```

---

## Task 5: Enemy — body/overlay split + EntitySprite, remove gfx draw

**Files:**
- Modify: `src/entities/Enemy.js`
- Modify: `src/scenes/GameScene.js` (remove `_drawEnemies`; add enemy facing)
- Test: `src/entities/Enemy.test.js` (status overlay split)

The current `_redrawBody()` (Enemy.js:125-202) draws the alien shape AND the slow/stun rings into `_body`. Once a sprite hides `_body`, the rings would vanish — so split rings onto a separate `_overlay` graphic that is always visible.

**Test-file conventions (verified):** `src/entities/Enemy.test.js` `vi.mock`'s `phaser` and uses `makeGraphics` stubs whose draw methods are plain no-ops (not spies), so assert on **state/object identity**, not call counts. There is an existing `makeEnemy()` helper (Enemy.test.js:56) and the existing status tests assert `statusEffects` state only — none assert on `_body` draw calls, so nothing needs retargeting. EntitySprite's inactive path returns before touching `scene.add.sprite`/`scene.game` (empty manifest → `getSpriteConfig` null), so the existing Enemy tests stay green unchanged.

- [ ] **Step 1: Add the failing test for the overlay split**

In `src/entities/Enemy.test.js`, add this block (after the existing `makeEnemy` helper / status describes):

```js
describe('Enemy status overlay', () => {
  it('creates a separate overlay graphic distinct from the body', () => {
    const e = makeEnemy();
    expect(e._overlay).toBeDefined();
    expect(e._overlay).not.toBe(e._body);
  });
  it('redraws the overlay without throwing when slow is applied', () => {
    const e = makeEnemy();
    expect(() => e.applyStatus({ type: 'slow', duration: 2, factor: 0.5 })).not.toThrow();
    expect(e.statusEffects.slow.active).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/entities/Enemy.test.js`
Expected: FAIL — `_overlay` is undefined / ring still drawn on `_body`.

- [ ] **Step 3: Implement the split + EntitySprite in `Enemy.js`**

Add the import at the top of `src/entities/Enemy.js` (after line 4):

```js
import { EntitySprite } from '../systems/EntitySprite.js';
```

Replace the constructor block that creates `_body`/`_hpBar` (Enemy.js:26-32) with:

```js
    this._body    = scene.add.graphics();
    this._overlay = scene.add.graphics();  // status rings — always visible
    this._hpBar   = scene.add.graphics();
    this.add([this._body, this._overlay, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(3);
    this._redrawBody();
    this._redrawStatusOverlay();
    this._redrawHpBar();

    this._sprite = new EntitySprite(this, scene, {
      category: 'enemy', type: def.type, initialState: 'move',
    });
    if (this._sprite.active) this._body.setVisible(false);
```

Replace `_redrawBody()` (Enemy.js:125-202) so it draws ONLY the shape (delete the trailing slow/stun ring block, lines 186-201) and add a new `_redrawStatusOverlay()`. The shape body becomes:

```js
  _redrawBody() {
    const r = this.def.radius;
    this._body.clear();

    // Drop shadow
    this._body.fillStyle(0x000000, 0.25);
    this._body.fillEllipse(0, r + 2, r * 1.5, 6);

    const t = this.def.type;
    if (t === 'drone') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillPoints(this._hexPoints(r * 1.5), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r), true);
    } else if (t === 'skitter') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillEllipse(0, 0, r * 2.8, r * 2.0);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._diamondPoints(r * 1.4, r), true);
      this._body.lineStyle(1.5, this.def.color, 0.8);
      for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._body.lineBetween(lx * r * 0.6, ly * r * 0.5, lx * r * 1.2, ly * r * 1.1);
      }
    } else if (t === 'brute') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillPoints(this._hexPoints(r * 1.3), true);
      this._body.fillStyle(0x334433, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.65), true);
    } else if (t === 'phantom') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillCircle(0, 0, r * 1.8);
      this._body.lineStyle(2, this.def.color, 0.7);
      this._body.strokeCircle(0, 0, r * 1.4);
      this._body.fillStyle(this.def.color, 0.9);
      this._body.fillCircle(0, 0, r * 0.6);
    } else if (t === 'titan') {
      this._body.fillStyle(0x1a0000, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(0x660000, 1);
      this._body.fillPoints(this._hexPoints(r * 0.72), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.44), true);
    } else {
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }
  }

  _redrawStatusOverlay() {
    const r = this.def.radius;
    const t = this.def.type;
    this._overlay.clear();
    if (this.statusEffects.slow.active) {
      this._overlay.lineStyle(2, 0x00eeff, 1);
      if (t === 'drone' || t === 'brute') {
        this._overlay.strokePoints(this._hexPoints(r + 2), true);
      } else if (t === 'skitter') {
        this._overlay.strokePoints(this._diamondPoints(r * 1.4 + 2, r + 2), true);
      } else {
        this._overlay.strokeCircle(0, 0, r + 2);
      }
    }
    if (this.statusEffects.stun.active) {
      this._overlay.lineStyle(2, 0xffffff, 0.85);
      this._overlay.strokeCircle(0, 0, r + 3);
    }
  }
```

Then change every status-driven `this._redrawBody()` call to `this._redrawStatusOverlay()` — at Enemy.js:46, :53 (slow/stun expiry in `update`) and :109, :113 (slow/stun in `applyStatus`). The shape never changes after construction, so those call sites only need the overlay redraw.

- [ ] **Step 4: Run the Enemy tests to verify they pass**

Run: `npx vitest run src/entities/Enemy.test.js`
Expected: PASS.

- [ ] **Step 5: Remove the redundant gfx draw + add facing in `GameScene.js`**

In `update()` (GameScene.js:317-323), delete the `this._drawEnemies();` line. Delete the `_drawEnemies()` method (GameScene.js:1357-1374).

In `_updateEnemies(dt)`, add enemy facing right after the movement `while` loop closes and before the `if (enemy.waypointIndex >= path.length - 1)` check (around GameScene.js:413):

```js
      const aheadIdx = Math.min(enemy.waypointIndex + 1, path.length - 1);
      enemy._sprite?.setFacing(path[aheadIdx].x - enemy.x);
```

- [ ] **Step 6: Run full suite + build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.test.js src/scenes/GameScene.js
git commit -m "feat(sprites): Enemy sprite path + status-overlay split; drop gfx enemy draw"
```

---

## Task 6: Tower — EntitySprite + attack state, remove gfx draw

**Files:**
- Modify: `src/entities/Tower.js`
- Modify: `src/scenes/GameScene.js` (remove `_drawTowers`; trigger attack state on fire)

- [ ] **Step 1: Add EntitySprite to `Tower.js`**

Add the import at the top of `src/entities/Tower.js` (after line 2):

```js
import { EntitySprite } from '../systems/EntitySprite.js';
```

In the constructor, after `this._redraw();` (Tower.js:31), add:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'tower', type, initialState: 'idle',
    });
    if (this._sprite.active) { this._bg.setVisible(false); this._icon.setVisible(false); }
```

- [ ] **Step 2: Remove the redundant gfx draw in `GameScene.js`**

In `update()` (GameScene.js:317-323), delete the `this._drawTowers();` line. Delete the `_drawTowers()` method (GameScene.js:1346-1355).

- [ ] **Step 3: Trigger the attack state when a tower fires**

In `_updateTowers(dt)`, inside the `if (best) { ... }` block, after `tower.cooldown = 1 / tower.fireRate;` (GameScene.js:766), add:

```js
        tower._sprite?.setState('attack');
```

(The `EntitySprite` reverts to `idle` automatically when the one-shot attack animation completes; with no art this is a no-op.)

- [ ] **Step 4: Run full suite + build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Browser-verify the tower icon now shows**

Run: `npm run dev`, open `http://localhost:5173/`, start map 0, build a tower. Confirm the tower renders its emoji icon + ring (the container drawing) — previously masked by the gfx disc — and that there is no flat overlay disc. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Tower.js src/scenes/GameScene.js
git commit -m "feat(sprites): Tower sprite path + attack state; drop gfx tower draw"
```

---

## Task 7: Hero — EntitySprite

**Files:**
- Modify: `src/entities/Hero.js`

The Hero already tracks `moving`, `_facingX`, and attacks in `update()`. Wire those to `EntitySprite`. The fallback draw is `this.def.draw(this._body)` and death already hides `_body` (Hero.js:106) / respawn shows it (Hero.js:132) — keep that, and mirror it onto the sprite.

- [ ] **Step 1: Add EntitySprite to `Hero.js`**

Add the import after line 3 (`import { HEROES } ...`):

```js
import { EntitySprite } from '../systems/EntitySprite.js';
```

In the constructor, after `this.def.draw(this._body);` (Hero.js:53), add:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'hero', type: heroId, initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
```

- [ ] **Step 2: Mirror death/respawn visibility onto the sprite**

In `takeDamage()`, the death branch hides the body (Hero.js:106 `this._body.setVisible(false);`). Add a line right after it so the sprite hides too:

```js
      if (this._sprite?.active) this._sprite.sprite.setVisible(false);
```

In `respawn()`, **replace** the single line `this._body.setVisible(true);` (Hero.js:132) with these two lines, so the fallback body only reappears when there is no active sprite:

```js
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
```

- [ ] **Step 3: Drive movement / attack / facing states in `update()`**

In `update()`, in the movement block (Hero.js:211-222), after `this.setPathPosition(this.pathProgress);` add:

```js
      this._sprite?.setState('move');
      this._sprite?.setFacing(this._facingX);
```

And when movement stops, set idle. After the movement `if (this.moving && ...) { ... }` block closes (Hero.js:222), add:

```js
    if (!this.moving) this._sprite?.setState('idle');
```

In the attack block, after `nearest.takeDamage(...)` and before resetting `_attackTimer` (Hero.js:235-240), add:

```js
        this._sprite?.setState('attack');
```

- [ ] **Step 4: Run the Hero tests + full suite**

Run: `npx vitest run src/entities/Hero.test.js`
Expected: PASS (Hero tests `vi.mock` Phaser; `EntitySprite` is inactive under the test scene since `registry.get('spriteKeys')` is absent → `?? []`, so all `_sprite` calls are no-ops).

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Hero.js
git commit -m "feat(sprites): Hero sprite path (idle/move/attack + facing)"
```

---

## Task 8: Soldier — EntitySprite

**Files:**
- Modify: `src/entities/Soldier.js`

Soldiers have one type. Use `type: 'default'`. Soldiers don't have an explicit attack animation hook in their own class (combat is driven from `GameScene._updateEnemies` via `blocker.attackTimer`), so wire `idle` only in (a); attack state can be added with art in sub-project (d).

- [ ] **Step 1: Add EntitySprite to `Soldier.js`**

Add the import after line 1 (`import Phaser from 'phaser';`):

```js
import { EntitySprite } from '../systems/EntitySprite.js';
```

In the constructor, after `this._drawBody();` (Soldier.js:26), add:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'soldier', type: 'default', initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
```

- [ ] **Step 2: Guard death/respawn body visibility**

In `takeDamage()` death branch, after `this._body.setVisible(false);` (Soldier.js:82) add:

```js
      if (this._sprite?.active) this._sprite.sprite.setVisible(false);
```

In `respawn()`, change `this._body.setVisible(true);` (Soldier.js:91) to:

```js
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
```

- [ ] **Step 3: Run Soldier tests + full suite**

Run: `npx vitest run src/entities/Soldier.test.js`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/entities/Soldier.js
git commit -m "feat(sprites): Soldier sprite path (idle)"
```

---

## Task 9: SentryTurret — EntitySprite

**Files:**
- Modify: `src/entities/SentryTurret.js`

- [ ] **Step 1: Add EntitySprite to `SentryTurret.js`**

Add the import after line 2 (`import { Projectile } ...`):

```js
import { EntitySprite } from '../systems/EntitySprite.js';
```

In the constructor, after `this.setDepth(3);` (SentryTurret.js:23), add:

```js
    this._sprite = new EntitySprite(this, scene, {
      category: 'sentry', type: 'default', initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
```

- [ ] **Step 2: Trigger attack on fire**

In `update()`, inside `if (target) { ... }` after `this._cooldown += 1 / this.rate;` (SentryTurret.js:59), add:

```js
        this._sprite?.setState('attack');
```

- [ ] **Step 3: Run SentryTurret tests + full suite**

Run: `npx vitest run src/entities/SentryTurret.test.js`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/entities/SentryTurret.js
git commit -m "feat(sprites): SentryTurret sprite path (idle/attack)"
```

---

## Task 10: Projectile consolidation — remove gfx draw

**Files:**
- Modify: `src/scenes/GameScene.js`

The `Projectile` container already renders its `dot` graphic; the gfx `_drawProjectiles` is redundant. Remove it (no `EntitySprite` for projectiles in (a) — see the scope note at the top).

- [ ] **Step 1: Remove the redundant gfx draw**

In `update()` (GameScene.js:317-323), delete the `this._drawProjectiles();` line. Delete the `_drawProjectiles()` method (GameScene.js:1376-1385).

- [ ] **Step 2: Confirm `_drawParticles`, `_drawPath`, `_drawZones` remain**

Verify `update()` still calls `this.gfx.clear(); this._drawPath(); this._drawZones(); this._drawParticles();` (these stay — not entity art).

- [ ] **Step 3: Run full suite + build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "refactor(sprites): drop redundant gfx projectile draw (container renders it)"
```

---

## Task 11: Art-pipeline scaffolding — `assets/sprites/PROMPTS.md`

**Files:**
- Create: `assets/sprites/PROMPTS.md`

- [ ] **Step 1: Create the prompts doc**

```markdown
# Entity Sprite Art — Prompts & Pipeline

Deferred-asset pipeline for backlog #8 sub-projects (b) enemies, (c) towers,
(d) heroes/soldiers/sentries. Mirrors `assets/overworld/PROMPTS.md` and
`assets/audio/PROMPTS.md`: the rendering infrastructure (sub-project (a)) is
already wired with a Graphics fallback, so dropping a PNG + adding one manifest
entry lights an entity up with no code change.

## How to add art (per entity, per state)

1. Produce a transparent PNG. For an animation, lay frames out left-to-right in
   a single row (a spritesheet); for a static look, a single frame is fine.
2. Save it under `assets/sprites/<category>/<type>_<state>.png`, e.g.
   `assets/sprites/enemies/drone_move.png`.
3. Add an entry to `src/data/sprites.js` `SPRITE_MANIFEST`:
   ```js
   {
     category: 'enemy', type: 'drone',
     scale: 1, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
     states: {
       move:  { path: 'assets/sprites/enemies/drone_move.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 10 },
       death: { path: 'assets/sprites/enemies/drone_death.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 12 },
     },
   }
   ```
   - `frames: 1` (or omitted) → loaded as a single image (no animation).
   - Looping states: `idle`, `move`. One-shot states: `attack`, `death`.
   - The texture key is derived as `sprite-<category>-<type>-<state>` — never set it.

## Texture-key / state conventions

- Categories: `enemy`, `tower`, `hero`, `soldier`, `sentry`.
- States used by the wiring today: `idle`, `move`, `attack` (and `death`,
  reserved — see "Death animations" below).
- `baseFacing` is the direction the art faces at rest (`'right'` default); the
  renderer mirrors via `flipX` to face travel/target direction.
- Recommended frame size: size art so the on-screen footprint matches the
  current `def.radius` (enemies) / ~18px disc (towers) at `scale: 1`; adjust
  `scale` to fit.

## Needed art (placeholders for follow-up cycles)

### (b) Enemies — `assets/sprites/enemies/`
`drone`, `skitter`, `brute`, `phantom`, `titan`, `colossus` — `move` (looping)
required; `death` optional. Convey the alien silhouette each currently draws
(hex drone, diamond skitter, armored brute, ghostly phantom, layered titan).

### (c) Towers — `assets/sprites/towers/`
`archer`, `mage`, `cannon`, `ice`, `sniper`, `barracks` — `idle` + `attack`.
Tier-4 branch variants can use distinct `type` keys later if desired.

### (d) Heroes / Soldiers / Sentries
- Heroes — `assets/sprites/heroes/`: `rael`, `dax`, `vex`, `mira` — `idle`,
  `move`, `attack`.
- Soldier — `assets/sprites/soldiers/default_*.png` — `idle` (+ `attack`).
- Sentry — `assets/sprites/sentry/default_*.png` — `idle`, `attack`.

## Death animations (reserved)

The `death` state is supported by the manifest + `EntitySprite.playOnce`, but
sub-project (a) does NOT delay entity destruction to play it (that is a
combat-timing change). Wire the destroy-delay in the per-entity cycle that adds
death frames.
```

- [ ] **Step 2: Commit**

```bash
git add assets/sprites/PROMPTS.md
git commit -m "docs(sprites): art-pipeline prompts for entity sprite cycles (b/c/d)"
```

---

## Task 12: Full verification — suite, build, browser parity, light-up proof

**Files:** none (verification only). Temporary throwaway files are reverted before merge.

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run`
Expected: PASS, with no decrease from the baseline count (~786 on the deploy line) plus the new spriteKeys/sprites/EntitySprite tests.

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Browser — fallback parity & single-source render**

Run `npm run dev`. Open `http://localhost:5173/`, start map 0, build 2–3 towers, send a wave. Verify:
- Towers show their emoji icons (no flat disc on top).
- Enemies render their alien shapes (hex/diamond/etc.) with HP bars and slow/stun rings still appearing.
- In DevTools console, confirm the entity draws are gone from the shared gfx — only path/zones/particles remain:
  ```js
  // before this change gfx held ~2900+ cmds with enemies on screen; now far fewer
  window.__game.gfx.commandBuffer.length
  ```
- No console errors.

- [ ] **Step 3: Browser — light-up proof (throwaway, reverted)**

Temporarily add ONE manifest entry for a single enemy type pointing at a small test spritesheet PNG you drop under `assets/sprites/enemies/`, reload, start a wave, and confirm the real animated sprite renders in place of the fallback shape (and faces its travel direction) with no other change. Then **revert** the throwaway manifest entry and delete the test PNG:

```bash
git checkout src/data/sprites.js
git status   # confirm no stray assets/sprites/*.png remain
```

- [ ] **Step 4: Verify on representative themed maps**

Spot-check maps with different themes (e.g. a desert, a station/space, an organic map) to confirm the consolidated fallback looks correct on each backdrop. Stop the dev server.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(sprites): verification fixups"   # only if Step 1-4 surfaced fixes
```

---

## Definition of Done

- All tasks' tests pass; `npx vitest run` and `npm run build` clean.
- The shared `gfx` no longer draws towers/enemies/projectiles (single render source); confirmed via the `commandBuffer` probe.
- Game is visually correct on multiple maps with the empty manifest (fallback path) — towers show icons, enemies show alien shapes, status/HP overlays intact.
- A throwaway sprite proves an entity lights up with one manifest entry + a PNG and no logic change; throwaway reverted.
- `assets/sprites/PROMPTS.md` documents the pipeline for (b)/(c)/(d).
- No committed sprite art; no `death`-state destroy-delay (deferred).
```
