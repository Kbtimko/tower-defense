# Animated Background Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one subtle, theme-keyed, deterministic ambient motion layer per map (dust / electrical / stars / bio-pulse / embers), drawn procedurally at depth 5, with a settings toggle that honors `prefers-reduced-motion`.

**Architecture:** A pure, Phaser-free `ambientFxFamilies.js` registry (each family exposes `init`/`step`/`draw` over a seeded RNG) plus an `AmbientBackgroundLayer` class that owns one depth-5 `Graphics`, runs `step`→`clear`→`draw` each frame, and reads an `ambientMotion` registry flag. Maps gain an `ambientFx: { family, seed }` field. The flag is seeded at boot from `SaveManager` settings, falling back to the inverse of `prefers-reduced-motion`.

**Tech Stack:** Phaser 3, Vitest + jsdom, existing `SeededRandom` (xorshift32), the gfx-proxy mock pattern from `PathRenderer.test.js`.

**Spec:** `docs/superpowers/specs/2026-06-12-animated-background-layer-design.md`

---

## File Structure

- Create `src/systems/ambientFxFamilies.js` — pure `FX_FAMILIES` registry + `MAX_ELEMENTS` + helpers. One responsibility: deterministic fx state + draw calls.
- Create `src/systems/ambientFxFamilies.test.js` — gfx-mock + per-family determinism/bounds/draw tests.
- Create `src/systems/AmbientBackgroundLayer.js` — Phaser glue class + `resolveAmbientMotion` helper.
- Create `src/systems/AmbientBackgroundLayer.test.js` — lifecycle + enable/disable + resolver tests.
- Modify `src/systems/SaveManager.js` — add `ambientMotion: null` default.
- Modify `src/systems/SaveManager.test.js` — update settings-shape expectations.
- Modify `src/data/maps.js` — add `ambientFx` to all 10 maps.
- Modify `src/scenes/GameScene.js` — construct/update/destroy the layer.
- Modify `src/scenes/BootScene.js` — seed the `ambientMotion` registry flag.
- Modify `src/ui/SettingsOverlay.js` — optional `game` arg + "Ambient motion" checkbox wiring.
- Modify `src/ui/SettingsOverlay.test.js` — new tests for the checkbox.
- Modify `src/scenes/MapSelectScene.js:156` — pass `this.game` to `SettingsOverlay`.
- Modify `index.html` — add the checkbox + retitle the overlay.

---

## Task 1: Dust family + registry scaffolding

**Files:**
- Create: `src/systems/ambientFxFamilies.js`
- Test: `src/systems/ambientFxFamilies.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/ambientFxFamilies.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { FX_FAMILIES, MAX_ELEMENTS } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';

// Mirrors the gfx-proxy mock in PathRenderer.test.js: any method NOT in the
// whitelist throws, catching Canvas-API confusion that real Phaser would reject.
const VALID_GFX_METHODS = new Set([
  'lineStyle', 'fillStyle', 'beginPath', 'closePath', 'strokePath', 'fillPath',
  'moveTo', 'lineTo', 'lineBetween', 'fillRect', 'strokeRect',
  'fillCircle', 'strokeCircle', 'arc', 'setDepth', 'setBlendMode', 'clear', 'destroy',
]);
export function makeGfx() {
  const calls = [];
  const stored = {};
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      if (!VALID_GFX_METHODS.has(prop)) {
        throw new TypeError(`Mock Graphics: '${String(prop)}' is not a Graphics method`);
      }
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

const W = 800, H = 600;

describe('FX_FAMILIES.dust', () => {
  const fam = FX_FAMILIES.dust;

  it('init is deterministic for a given seed', () => {
    const a = fam.init(new SeededRandom(7341), W, H);
    const b = fam.init(new SeededRandom(7341), W, H);
    expect(a).toEqual(b);
  });

  it('produces no more than MAX_ELEMENTS drawables', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    expect(s.motes.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('step advances time and keeps motes in bounds', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    for (let i = 0; i < 500; i++) fam.step(s, 16);
    expect(s.t).toBeGreaterThan(0);
    for (const m of s.motes) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(W);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(H);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: FAIL — `Failed to resolve import "./ambientFxFamilies.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/systems/ambientFxFamilies.js`:

```js
// Per-map ambient motion. Each family is pure and deterministic from a
// SeededRandom instance. init() builds element state; step() advances it in
// place; draw() issues only Phaser.Graphics primitive calls. The owning
// AmbientBackgroundLayer sets the gfx blend mode once from family.blendMode.

export const MAX_ELEMENTS = 90;
const TWO_PI = Math.PI * 2;

function wrap(v, max) {
  return ((v % max) + max) % max;
}

export const FX_FAMILIES = {
  // Slow warm motes drifting on a shared wind vector with a sinusoidal sway.
  dust: {
    blendMode: 'NORMAL',
    init(rng, w, h) {
      const motes = [];
      for (let i = 0; i < 40; i++) {
        motes.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1 + rng.next(),
          baseAlpha: 0.08 + rng.next() * 0.10,
          phase: rng.next() * TWO_PI,
          swayAmp: 4 + rng.next() * 6,
          swayFreq: 0.0003 + rng.next() * 0.0004,
        });
      }
      return {
        w, h, motes, t: 0, color: 0x9a8c70,
        driftX: (rng.next() * 0.02 - 0.01),
        driftY: (rng.next() * 0.008 - 0.004),
      };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const m of s.motes) {
        m.x = wrap(m.x + s.driftX * dtMs, s.w);
        m.y = wrap(m.y + s.driftY * dtMs, s.h);
      }
    },
    draw(gfx, s) {
      for (const m of s.motes) {
        const sway = Math.sin(s.t * m.swayFreq + m.phase) * m.swayAmp;
        gfx.fillStyle(s.color, m.baseAlpha);
        gfx.fillCircle(wrap(m.x + sway, s.w), m.y, m.r);
      }
    },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/ambientFxFamilies.js src/systems/ambientFxFamilies.test.js
git commit -m "feat(fx): dust ambient family + registry scaffolding"
```

---

## Task 2: Embers family

**Files:**
- Modify: `src/systems/ambientFxFamilies.js`
- Test: `src/systems/ambientFxFamilies.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/systems/ambientFxFamilies.test.js`:

```js
describe('FX_FAMILIES.embers', () => {
  const fam = FX_FAMILIES.embers;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(6391), W, H))
      .toEqual(fam.init(new SeededRandom(6391), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    expect(s.embers.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('embers rise and respawn within vertical bounds', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    for (let i = 0; i < 2000; i++) fam.step(s, 16);
    for (const e of s.embers) {
      expect(e.y).toBeGreaterThanOrEqual(-10);
      expect(e.y).toBeLessThanOrEqual(H + 10);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js -t embers`
Expected: FAIL — `Cannot read properties of undefined (reading 'init')` (no `embers` family).

- [ ] **Step 3: Write minimal implementation**

Add the `embers` entry to `FX_FAMILIES` in `src/systems/ambientFxFamilies.js` (after `dust`):

```js
  // Warm embers rising with horizontal sway, fading as they climb, wrapping
  // back to the bottom. Additive glow over dark backdrops.
  embers: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const palette = [0xff8844, 0xffaa44];
      const embers = [];
      for (let i = 0; i < 35; i++) {
        embers.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1 + rng.next(),
          vy: -(0.01 + rng.next() * 0.02),
          baseAlpha: 0.3 + rng.next() * 0.4,
          swayAmp: 3 + rng.next() * 5,
          swayFreq: 0.0006 + rng.next() * 0.0006,
          phase: rng.next() * TWO_PI,
          color: palette[Math.floor(rng.next() * palette.length)],
        });
      }
      return { w, h, embers, t: 0 };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const e of s.embers) {
        e.y += e.vy * dtMs;
        if (e.y < -10) e.y += s.h + 20;
      }
    },
    draw(gfx, s) {
      for (const e of s.embers) {
        const sway = Math.sin(s.t * e.swayFreq + e.phase) * e.swayAmp;
        const a = e.baseAlpha * Math.max(0, Math.min(1, e.y / s.h));
        gfx.fillStyle(e.color, a);
        gfx.fillCircle(wrap(e.x + sway, s.w), e.y, e.r);
      }
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: PASS (dust + embers describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/systems/ambientFxFamilies.js src/systems/ambientFxFamilies.test.js
git commit -m "feat(fx): embers ambient family"
```

---

## Task 3: Stars family

**Files:**
- Modify: `src/systems/ambientFxFamilies.js`
- Test: `src/systems/ambientFxFamilies.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/systems/ambientFxFamilies.test.js`:

```js
describe('FX_FAMILIES.stars', () => {
  const fam = FX_FAMILIES.stars;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(6453), W, H))
      .toEqual(fam.init(new SeededRandom(6453), W, H));
  });

  it('total points respect MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    expect(s.far.length + s.near.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('drift keeps stars horizontally in bounds', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    for (let i = 0; i < 800; i++) fam.step(s, 16);
    for (const p of [...s.far, ...s.near]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js -t stars`
Expected: FAIL — no `stars` family.

- [ ] **Step 3: Write minimal implementation**

Add the `stars` entry to `FX_FAMILIES` (after `embers`):

```js
  // Two parallax drift layers plus subtle twinkle. Additive over dark space.
  stars: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const mk = (count, rMin, rRange, aMin, aRange) => {
        const out = [];
        for (let i = 0; i < count; i++) {
          out.push({
            x: rng.next() * w,
            y: rng.next() * h,
            r: rMin + rng.next() * rRange,
            baseAlpha: aMin + rng.next() * aRange,
            phase: rng.next() * TWO_PI,
            twFreq: 0.0008 + rng.next() * 0.0010,
            color: rng.next() < 0.5 ? 0xffffff : 0xcfe6ff,
          });
        }
        return out;
      };
      const far = mk(60, 0.5, 0.6, 0.20, 0.30);
      const near = mk(25, 1.0, 0.7, 0.50, 0.40);
      return { w, h, far, near, t: 0, driftFar: -0.004, driftNear: -0.010 };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const p of s.far) p.x = wrap(p.x + s.driftFar * dtMs, s.w);
      for (const p of s.near) p.x = wrap(p.x + s.driftNear * dtMs, s.w);
    },
    draw(gfx, s) {
      for (const p of [...s.far, ...s.near]) {
        const a = p.baseAlpha * (0.6 + 0.4 * Math.sin(s.t * p.twFreq + p.phase));
        gfx.fillStyle(p.color, Math.max(0, a));
        gfx.fillCircle(p.x, p.y, p.r);
      }
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ambientFxFamilies.js src/systems/ambientFxFamilies.test.js
git commit -m "feat(fx): stars parallax ambient family"
```

---

## Task 4: Electrical family

**Files:**
- Modify: `src/systems/ambientFxFamilies.js`
- Test: `src/systems/ambientFxFamilies.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/systems/ambientFxFamilies.test.js`:

```js
describe('FX_FAMILIES.electrical', () => {
  const fam = FX_FAMILIES.electrical;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(9182), W, H))
      .toEqual(fam.init(new SeededRandom(9182), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    expect(s.lights.length + s.conduits.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('step advances time', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    fam.step(s, 100);
    expect(s.t).toBe(100);
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    // Advance far enough that at least one conduit spark is firing.
    for (let i = 0; i < 200; i++) fam.step(s, 16);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js -t electrical`
Expected: FAIL — no `electrical` family.

- [ ] **Step 3: Write minimal implementation**

Add the `electrical` entry to `FX_FAMILIES` (after `stars`):

```js
  // Blinking station lights (smooth alpha oscillation) plus occasional brief
  // spark arcs along seeded conduit segments. Additive cool-blue glow.
  electrical: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const color = 0x3a8ad0;
      const lights = [];
      for (let i = 0; i < 20; i++) {
        lights.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1.5 + rng.next() * 1.5,
          baseAlpha: 0.4 + rng.next() * 0.4,
          period: 700 + rng.next() * 1800,
          phase: rng.next() * TWO_PI,
        });
      }
      const conduits = [];
      for (let i = 0; i < 4; i++) {
        const x1 = rng.next() * w, y1 = rng.next() * h;
        conduits.push({
          x1, y1,
          x2: x1 + (rng.next() * 80 - 40),
          y2: y1 + (rng.next() * 80 - 40),
          period: 1200 + rng.next() * 2400,
          phase: rng.next() * TWO_PI,
        });
      }
      return { w, h, lights, conduits, t: 0, color };
    },
    step(s, dtMs) {
      s.t += dtMs;
    },
    draw(gfx, s) {
      for (const l of s.lights) {
        const a = l.baseAlpha * (0.5 + 0.5 * Math.sin(s.t * (TWO_PI / l.period) + l.phase));
        gfx.fillStyle(s.color, Math.max(0, a));
        gfx.fillCircle(l.x, l.y, l.r);
      }
      for (const c of s.conduits) {
        const spark = Math.sin(s.t * (TWO_PI / c.period) + c.phase);
        if (spark > 0.9) {
          gfx.lineStyle(2, s.color, 0.7);
          gfx.lineBetween(c.x1, c.y1, c.x2, c.y2);
        }
      }
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ambientFxFamilies.js src/systems/ambientFxFamilies.test.js
git commit -m "feat(fx): electrical ambient family"
```

---

## Task 5: Bio-pulse family

**Files:**
- Modify: `src/systems/ambientFxFamilies.js`
- Test: `src/systems/ambientFxFamilies.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/systems/ambientFxFamilies.test.js`:

```js
describe('FX_FAMILIES["bio-pulse"]', () => {
  const fam = FX_FAMILIES['bio-pulse'];
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(4827), W, H))
      .toEqual(fam.init(new SeededRandom(4827), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    expect(s.blobs.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('blobs drift horizontally in bounds', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    for (let i = 0; i < 1000; i++) fam.step(s, 16);
    for (const b of s.blobs) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(W);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js -t bio-pulse`
Expected: FAIL — no `bio-pulse` family.

- [ ] **Step 3: Write minimal implementation**

Add the `'bio-pulse'` entry to `FX_FAMILIES` (after `electrical`):

```js
  // Large soft radial blobs that breathe (radius + alpha oscillate out of
  // phase) with a faint drift. Additive teal glow for the homeworld.
  'bio-pulse': {
    blendMode: 'ADD',
    init(rng, w, h) {
      const palette = [0x00ffc8, 0x4affd0];
      const blobs = [];
      for (let i = 0; i < 7; i++) {
        blobs.push({
          x: rng.next() * w,
          y: rng.next() * h,
          baseR: 40 + rng.next() * 50,
          baseAlpha: 0.05 + rng.next() * 0.06,
          period: 2600 + rng.next() * 2600,
          phase: rng.next() * TWO_PI,
          driftX: (rng.next() * 0.006 - 0.003),
          color: palette[Math.floor(rng.next() * palette.length)],
        });
      }
      return { w, h, blobs, t: 0 };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const b of s.blobs) b.x = wrap(b.x + b.driftX * dtMs, s.w);
    },
    draw(gfx, s) {
      for (const b of s.blobs) {
        const pulse = 0.5 + 0.5 * Math.sin(s.t * (TWO_PI / b.period) + b.phase);
        const r = b.baseR * (0.8 + 0.4 * pulse);
        const a = b.baseAlpha * (0.5 + 0.5 * pulse);
        gfx.fillStyle(b.color, a);
        gfx.fillCircle(b.x, b.y, r);
      }
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/ambientFxFamilies.test.js`
Expected: PASS (all 5 families).

- [ ] **Step 5: Commit**

```bash
git add src/systems/ambientFxFamilies.js src/systems/ambientFxFamilies.test.js
git commit -m "feat(fx): bio-pulse ambient family"
```

---

## Task 6: AmbientBackgroundLayer + resolveAmbientMotion

**Files:**
- Create: `src/systems/AmbientBackgroundLayer.js`
- Test: `src/systems/AmbientBackgroundLayer.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/AmbientBackgroundLayer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { AmbientBackgroundLayer, resolveAmbientMotion } from './AmbientBackgroundLayer.js';

function makeGfx() {
  const calls = [];
  const gfx = {
    _calls: () => calls,
    setDepth() { return gfx; },
    setBlendMode() { return gfx; },
    clear() { calls.push('clear'); return gfx; },
    fillStyle() { calls.push('fillStyle'); return gfx; },
    fillCircle() { calls.push('fillCircle'); return gfx; },
    lineStyle() { calls.push('lineStyle'); return gfx; },
    lineBetween() { calls.push('lineBetween'); return gfx; },
    destroy() { calls.push('destroy'); return gfx; },
  };
  return gfx;
}
function makeScene(gfx, enabled) {
  return {
    scale: { width: 800, height: 600 },
    add: { graphics: () => gfx },
    registry: { get: (k) => (k === 'ambientMotion' ? enabled : undefined) },
  };
}

describe('resolveAmbientMotion', () => {
  it('returns the saved boolean when set', () => {
    expect(resolveAmbientMotion(true, true)).toBe(true);
    expect(resolveAmbientMotion(false, false)).toBe(false);
  });
  it('falls back to the inverse of prefers-reduced-motion when unset', () => {
    expect(resolveAmbientMotion(null, true)).toBe(false);
    expect(resolveAmbientMotion(null, false)).toBe(true);
    expect(resolveAmbientMotion(undefined, true)).toBe(false);
  });
});

describe('AmbientBackgroundLayer', () => {
  it('throws on an unknown family', () => {
    expect(() => new AmbientBackgroundLayer(makeScene(makeGfx(), true), { family: 'nope', seed: 1 }))
      .toThrow(/unknown family/);
  });

  it('draws fills when motion is enabled', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, true), { family: 'dust', seed: 7341 });
    layer.update(16);
    expect(gfx._calls()).toContain('fillCircle');
  });

  it('clears but does not draw when motion is disabled', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, false), { family: 'dust', seed: 7341 });
    layer.update(16);
    expect(gfx._calls()).toContain('clear');
    expect(gfx._calls()).not.toContain('fillCircle');
  });

  it('destroy() destroys the gfx', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, true), { family: 'dust', seed: 7341 });
    layer.destroy();
    expect(gfx._calls()).toContain('destroy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/AmbientBackgroundLayer.test.js`
Expected: FAIL — cannot resolve `./AmbientBackgroundLayer.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/systems/AmbientBackgroundLayer.js`:

```js
import { FX_FAMILIES } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';

/**
 * Resolve the effective ambient-motion flag. An explicit saved boolean always
 * wins; when unset (null/undefined), default to the inverse of the OS
 * prefers-reduced-motion preference.
 * @param {boolean|null|undefined} saved
 * @param {boolean} prefersReduced
 * @returns {boolean}
 */
export function resolveAmbientMotion(saved, prefersReduced) {
  if (typeof saved === 'boolean') return saved;
  return !prefersReduced;
}

/**
 * Owns one depth-5 Graphics object and runs a single fx family each frame.
 * Reads the `ambientMotion` registry flag every update so the settings toggle
 * takes effect live.
 */
export class AmbientBackgroundLayer {
  constructor(scene, ambientFx) {
    this._scene = scene;
    this._family = FX_FAMILIES[ambientFx.family];
    if (!this._family) {
      throw new Error(`AmbientBackgroundLayer: unknown family "${ambientFx.family}"`);
    }
    const w = scene.scale.width;
    const h = scene.scale.height;
    this._state = this._family.init(new SeededRandom(ambientFx.seed), w, h);
    this._gfx = scene.add.graphics().setDepth(5);
    if (this._family.blendMode) this._gfx.setBlendMode(this._family.blendMode);
  }

  update(dtMs) {
    if (!this._gfx) return;
    if (this._scene.registry.get('ambientMotion') === false) {
      this._gfx.clear();
      return;
    }
    this._family.step(this._state, dtMs);
    this._gfx.clear();
    this._family.draw(this._gfx, this._state);
  }

  destroy() {
    this._gfx?.destroy();
    this._gfx = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/AmbientBackgroundLayer.test.js`
Expected: PASS (6 tests).

Note: the disabled check uses `=== false` so a missing flag (undefined) still renders; BootScene always sets it to a boolean, but this keeps the layer safe if constructed before boot wiring.

- [ ] **Step 5: Commit**

```bash
git add src/systems/AmbientBackgroundLayer.js src/systems/AmbientBackgroundLayer.test.js
git commit -m "feat(fx): AmbientBackgroundLayer lifecycle + motion resolver"
```

---

## Task 7: SaveManager ambientMotion default

**Files:**
- Modify: `src/systems/SaveManager.js:8-10` (`defaultSettings`)
- Test: `src/systems/SaveManager.test.js:91-113`

- [ ] **Step 1: Update the failing test**

In `src/systems/SaveManager.test.js`, update the two settings expectations to include `ambientMotion`. Change the `toEqual` in the "fresh load" test (around line 94) to:

```js
    expect(sm.getSettings()).toEqual({
      masterVol: 0.8,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     false,
      ambientMotion: null,
    });
```

And the "setSettings persists" test (around line 105) to:

```js
    expect(sm.getSettings()).toEqual({
      masterVol: 0.5,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     true,
      ambientMotion: null,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/SaveManager.test.js -t settings`
Expected: FAIL — received object missing `ambientMotion`.

- [ ] **Step 3: Write minimal implementation**

In `src/systems/SaveManager.js`, update `defaultSettings`:

```js
function defaultSettings() {
  return { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false, ambientMotion: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/SaveManager.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "feat(save): ambientMotion setting (null = unset, honor OS preference)"
```

---

## Task 8: Assign ambientFx to all 10 maps

**Files:**
- Modify: `src/data/maps.js` (each of the 10 map objects)

- [ ] **Step 1: Add the field to every map**

For each map object in `src/data/maps.js`, add an `ambientFx` field immediately after its `blockerSeed` line. Reuse the map's existing `blockerSeed` value as the fx seed. Use exactly these family/seed pairs:

| Map id | family | seed |
|---|---|---|
| 0 | `dust` | 7341 |
| 1 | `dust` | 4291 |
| 2 | `dust` | 5582 |
| 3 | `electrical` | 9182 |
| 4 | `stars` | 6453 |
| 5 | `dust` | 1709 |
| 6 | `electrical` | 8924 |
| 7 | `stars` | 3217 |
| 8 | `bio-pulse` | 4827 |
| 9 | `embers` | 6391 |

Each insertion looks like (example, map 0):

```js
    blockerSeed: 7341,
    ambientFx: { family: 'dust', seed: 7341 },
```

And map 9:

```js
    blockerSeed: 6391,
    ambientFx: { family: 'embers', seed: 6391 },
```

- [ ] **Step 2: Verify the data is well-formed**

Run: `node -e "import('./src/data/maps.js').then(m => { const ok = m.MAPS.every(x => x.ambientFx && x.ambientFx.family && Number.isInteger(x.ambientFx.seed)); if (!ok || m.MAPS.length !== 10) { console.error('BAD'); process.exit(1); } console.log('all 10 maps have ambientFx'); })"`
Expected: `all 10 maps have ambientFx`.

- [ ] **Step 3: Run the existing maps tests (if any) + full suite quickly**

Run: `npx vitest run src/data`
Expected: PASS (or "no test files" — that's fine; the node check above is the gate).

- [ ] **Step 4: Commit**

```bash
git add src/data/maps.js
git commit -m "feat(maps): assign ambientFx family + seed to all 10 maps"
```

---

## Task 9: Wire the layer into GameScene

**Files:**
- Modify: `src/scenes/GameScene.js` (imports, `create()` ~line 132, `update()` ~line 271, `shutdown()` ~line 265)

This is Phaser/canvas glue not covered by jsdom unit tests; verification is the full suite (no regressions) plus the browser playthrough in Task 12.

- [ ] **Step 1: Add the import**

At the top of `src/scenes/GameScene.js`, alongside the other system imports (near `import { renderPath } from '../systems/PathRenderer.js';`):

```js
import { AmbientBackgroundLayer } from '../systems/AmbientBackgroundLayer.js';
```

- [ ] **Step 2: Construct the layer in create()**

Immediately after `this._renderStaticLayers(map);` (line ~132) and before the depth-30 `this.gfx` line, add:

```js
    // Ambient motion layer (depth 5) — between the bitmap and the static
    // layers, so it reads as deep environment and never overlaps gameplay.
    this._ambient = map.ambientFx ? new AmbientBackgroundLayer(this, map.ambientFx) : null;
```

- [ ] **Step 3: Update it each frame**

In `update(time, delta)`, immediately after `const dtMs  = delta * this.speed;`, add:

```js
    this._ambient?.update(dtMs);
```

- [ ] **Step 4: Destroy it on shutdown**

In `shutdown()`, next to `this._staticLayers?.destroy();`, add:

```js
    this._ambient?.destroy();
    this._ambient = null;
```

- [ ] **Step 5: Run the full suite for regressions**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new fx/layer/save tests green.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game): mount ambient background layer in GameScene"
```

---

## Task 10: Seed the ambientMotion flag at boot

**Files:**
- Modify: `src/scenes/BootScene.js` (`preload()`, after `this.game.registry.set('save', sm);`)

- [ ] **Step 1: Add the import**

At the top of `src/scenes/BootScene.js`:

```js
import { resolveAmbientMotion } from '../systems/AmbientBackgroundLayer.js';
```

- [ ] **Step 2: Seed the registry flag**

In `preload()`, immediately after `this.game.registry.set('save', sm);`, add:

```js
    const prefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    this.game.registry.set('ambientMotion',
      resolveAmbientMotion(sm.getSettings().ambientMotion, prefersReduced));
```

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/BootScene.js
git commit -m "feat(boot): seed ambientMotion flag from settings + reduced-motion"
```

---

## Task 11: Settings UI — toggle wiring

**Files:**
- Modify: `src/ui/SettingsOverlay.js`
- Modify: `src/ui/SettingsOverlay.test.js`
- Modify: `src/scenes/MapSelectScene.js:156`
- Modify: `index.html` (overlay markup)

- [ ] **Step 1: Write the failing tests**

In `src/ui/SettingsOverlay.test.js`, add an `ambient-motion` checkbox to the DOM fixture. Inside `setupDom()`, before `document.body.appendChild(overlay);`, add:

```js
  const ambient = document.createElement('input');
  ambient.id = 'ambient-motion';
  ambient.type = 'checkbox';
  overlay.appendChild(ambient);
```

Add a `makeGame` helper after `makeAm()`:

```js
function makeGame(initial = true) {
  const store = { ambientMotion: initial, save: { setSettings: vi.fn() } };
  return {
    _store: store,
    registry: {
      get: (k) => store[k],
      set: (k, v) => { store[k] = v; },
    },
  };
}
```

Add two tests inside the `describe('SettingsOverlay', ...)` block:

```js
  it('ambient-motion checkbox reflects the registry flag on open', () => {
    const am = makeAm();
    const game = makeGame(false);
    const ov = new SettingsOverlay(am, game);
    ov.open();
    expect(document.getElementById('ambient-motion').checked).toBe(false);
  });

  it('toggling ambient-motion updates the registry and persists', () => {
    const am = makeAm();
    const game = makeGame(true);
    const ov = new SettingsOverlay(am, game);
    ov.open();
    const cb = document.getElementById('ambient-motion');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.registry.get('ambientMotion')).toBe(false);
    expect(game._store.save.setSettings).toHaveBeenCalledWith({ ambientMotion: false });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/SettingsOverlay.test.js -t ambient`
Expected: FAIL — checkbox not wired (checked stays default / setSettings not called).

- [ ] **Step 3: Implement the wiring**

In `src/ui/SettingsOverlay.js`, change the constructor signature and add the checkbox handling. Update the constructor:

```js
  constructor(audioManager, game = null) {
    this._am        = audioManager;
    this._game      = game;
    this._overlay   = document.getElementById('settings-overlay');
    this._closeBtn  = document.getElementById('settings-close');
    this._mute      = document.getElementById('mute-all');
    this._listeners = [];
    this._onClose   = () => this.close();
    this._onBackdrop = (e) => { if (e.target === this._overlay) this.close(); };
    this._onEsc     = (e) => { if (e.key === 'Escape') this.close(); };
  }
```

In `open()`, immediately after the mute-checkbox block (after the `this._listeners.push({ el: this._mute, ... })` line and before `this._closeBtn.addEventListener(...)`), add:

```js
    const ambientCb = document.getElementById('ambient-motion');
    if (this._game && ambientCb) {
      ambientCb.checked = this._game.registry.get('ambientMotion') !== false;
      const ambientHandler = (e) => {
        const v = e.target.checked;
        this._game.registry.set('ambientMotion', v);
        this._game.registry.get('save')?.setSettings({ ambientMotion: v });
      };
      ambientCb.addEventListener('change', ambientHandler);
      this._listeners.push({ el: ambientCb, evt: 'change', fn: ambientHandler });
    }
```

(The existing `close()` already removes every entry in `this._listeners`, so no change there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/SettingsOverlay.test.js`
Expected: PASS — new ambient tests plus all existing tests (existing tests pass `am` only, so `this._game` is null and the block is skipped).

- [ ] **Step 5: Pass the game into the overlay**

In `src/scenes/MapSelectScene.js:156`, change:

```js
      if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am);
```

to:

```js
      if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am, this.game);
```

- [ ] **Step 6: Add the checkbox to index.html**

In `index.html`, change the overlay title (line ~375) from:

```html
          <span id="settings-overlay-title">Audio Settings</span>
```

to:

```html
          <span id="settings-overlay-title">Settings</span>
```

And immediately after the existing mute row (`<div class="settings-mute">...Mute all audio...</div>`), add:

```html
        <div class="settings-mute">
          <label><input id="ambient-motion" type="checkbox" /> Ambient motion</label>
        </div>
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/SettingsOverlay.js src/ui/SettingsOverlay.test.js src/scenes/MapSelectScene.js index.html
git commit -m "feat(settings): Ambient motion toggle in SettingsOverlay"
```

---

## Task 12: Verification — suite, build, browser, performance

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS, including the new family/layer/save/settings tests; no regressions in the prior suite.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Browser playthrough — every family**

Run the app (`npm run dev`) and open each representative map; confirm subtle motion and that it never obscures enemies/towers/path:
- Map 0 (dust), Map 3 (electrical), Map 4 (stars), Map 8 (bio-pulse), Map 9 (embers).
Spot-check one more dust map (1, 2, or 5) and the second electrical/stars map (6 / 7).

- [ ] **Step 4: Settings toggle + reduced-motion**

- In-run, open Settings, toggle **Ambient motion** off → motion stops live; on → resumes.
- Reload with the OS set to "reduce motion" and no stored preference (clear the `ambientMotion` key or use a fresh profile) → motion defaults **off**.

- [ ] **Step 5: Performance check**

With the browser FPS/performance panel open on **Map 4 or 7 (stars, heaviest)**, confirm steady 60fps and no measurable frame-time regression vs. the same map with the toggle off (target < 1ms/frame added).

- [ ] **Step 6: Update notes**

Move backlog item #6 (Animated background layer) to the Completed section in `.claude/notes.md` with the date and a one-line summary. Commit:

```bash
git add .claude/notes.md
git commit -m "docs: mark animated background layer complete"
```

---

## Self-Review Notes

- **Spec coverage:** architecture (Tasks 1–6), 5 families + map assignment (Tasks 1–5, 8), data shape (Task 8), GameScene wiring + depth 5 (Task 9), performance cap `MAX_ELEMENTS` + check (Tasks 1, 12), settings toggle + reduced-motion (Tasks 7, 10, 11), testing strategy (every task), non-goals respected (no editor task, no new assets).
- **Type/name consistency:** `FX_FAMILIES`, `MAX_ELEMENTS`, `AmbientBackgroundLayer`, `resolveAmbientMotion`, `ambientFx: { family, seed }`, registry key `ambientMotion`, element-array names (`motes`/`embers`/`far`+`near`/`lights`+`conduits`/`blobs`) are used identically across tasks and tests.
- **Blend mode** is one-per-family (`family.blendMode`), set once by the layer, so the layer needs no Phaser import and stays unit-testable.
