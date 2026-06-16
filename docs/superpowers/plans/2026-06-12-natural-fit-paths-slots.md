# Natural-Fit Paths + Tower Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-fit every map's path and tower slots onto its painted bitmap, backed by one shared curve-geometry module (so the visible path and enemy movement are identical) and a dev-only in-browser overlay editor for doing the fitting.

**Architecture:** Extract the path curve into `src/systems/pathGeometry.js` (`samplePath`, centripetal Catmull-Rom, pass-through). Both `PathRenderer` (draw) and `PathManager` (movement) sample from it, so they can never diverge. `PathManager` exposes raw pixel `waypoints` (control points, used by the renderer and blocker placement) plus the dense `path` (movement/targeting). A dev-only `MapEditorScene` (reached via `?edit=1&map=N`) renders the real pipeline over the bitmap with draggable handles and exports maps.js-ready arrays. Claude does a first-pass fit on all 10 maps; the user refines.

**Tech Stack:** Phaser 3 (RESIZE scale mode, normalized coords), Vitest + jsdom, ES modules.

**Spec:** [docs/superpowers/specs/2026-06-12-natural-fit-paths-slots-design.md](../specs/2026-06-12-natural-fit-paths-slots-design.md)

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/systems/pathGeometry.js` | `samplePath(points, samplesPerSegment)` (centripetal Catmull-Rom, pass-through) + `clampToBounds(points, w, h)` | Create |
| `src/systems/pathGeometry.test.js` | Unit tests for the above | Create |
| `src/systems/PathRenderer.js` | Stroke the `samplePath` polyline instead of internal midpoint-quadratic | Modify |
| `src/systems/PathManager.js` | Store raw `waypoints` (pixel) + dense `path = clampToBounds(samplePath(waypoints))` | Modify |
| `src/systems/PathManager.test.js` | Update assertions for dense path + raw waypoints | Modify |
| `src/scenes/GameScene.js` | Blocker placement + `renderPath` read raw `waypoints` (not dense `path`) | Modify |
| `src/systems/mapEditorUtils.js` | Pure helpers: `serializeMapArrays`, `slotInPathCorridor`, `roundCoord` | Create |
| `src/systems/mapEditorUtils.test.js` | Unit tests for the above | Create |
| `src/scenes/MapEditorScene.js` | Dev-only overlay editor scene | Create |
| `src/scenes/BootScene.js` | Route to `MapEditorScene` when `?edit=1` is present | Modify |
| `src/main.js` | Register `MapEditorScene` in the scene list | Modify |
| `src/data/maps.js` | Re-fitted `waypoints` + `towerSlots` per map (Task 9) | Modify |

---

## Task 1: Shared path geometry (`pathGeometry.js`)

**Files:**
- Create: `src/systems/pathGeometry.js`
- Test: `src/systems/pathGeometry.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// src/systems/pathGeometry.test.js
import { samplePath, clampToBounds } from './pathGeometry.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('samplePath', () => {
  it('returns a copy of the straight segment (densified) for 2 points', () => {
    const out = samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
    expect(out.length).toBe(6); // 5 sub-segments => 6 points
    expect(out[2].x).toBeCloseTo(4, 6); // evenly spaced
  });

  it('first and last sampled points equal the first/last control points exactly', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }, { x: 200, y: 100 }];
    const out = samplePath(pts, 8);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('passes through every interior control point (within float epsilon)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }, { x: 200, y: 100 }];
    const out = samplePath(pts, 16);
    for (const p of pts) {
      const hit = out.some(o => near(o.x, p.x, 1e-3) && near(o.y, p.y, 1e-3));
      expect(hit).toBe(true);
    }
  });

  it('is deterministic', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }];
    expect(samplePath(pts, 10)).toEqual(samplePath(pts, 10));
  });

  it('handles coincident adjacent points without NaN', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
    const out = samplePath(pts, 8);
    expect(out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('returns shallow-copied points for < 2 inputs', () => {
    expect(samplePath([{ x: 1, y: 2 }], 8)).toEqual([{ x: 1, y: 2 }]);
    expect(samplePath([], 8)).toEqual([]);
  });
});

describe('clampToBounds', () => {
  it('clamps each point into [0,w] x [0,h]', () => {
    const out = clampToBounds([{ x: -5, y: 50 }, { x: 120, y: -3 }], 100, 80);
    expect(out).toEqual([{ x: 0, y: 50 }, { x: 100, y: 0 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/pathGeometry.test.js`
Expected: FAIL — module `./pathGeometry.js` not found.

- [ ] **Step 3: Implement `pathGeometry.js`**

```js
// src/systems/pathGeometry.js

// Distance between two points.
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Linear interpolation along a knot interval. If the interval has zero
// length (coincident knots — happens at duplicated endpoints or repeated
// control points), return `a` instead of dividing by zero.
function knotLerp(a, b, ta, tb, t) {
  if (tb === ta) return { x: a.x, y: a.y };
  const f = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * Sample a centripetal Catmull-Rom spline through `points` into a dense
 * polyline that passes through every input point. Endpoints are handled by
 * duplicating the first/last control point. Centripetal parameterization
 * (alpha = 0.5) avoids the cusps plain Catmull-Rom produces on sharp bends.
 *
 * @param {{x:number,y:number}[]} points  control points in pixel space
 * @param {number} samplesPerSegment      sub-segments per control-point span
 * @returns {{x:number,y:number}[]}        dense polyline
 */
export function samplePath(points, samplesPerSegment = 12) {
  const n = points.length;
  if (n < 2) return points.map(p => ({ x: p.x, y: p.y }));

  if (n === 2) {
    const out = [];
    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      out.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        y: points[0].y + (points[1].y - points[0].y) * t,
      });
    }
    return out;
  }

  const out = [{ x: points[0].x, y: points[0].y }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    // Centripetal knot sequence (alpha = 0.5 => sqrt of distance).
    const t0 = 0;
    const t1 = t0 + Math.sqrt(dist(p0, p1));
    const t2 = t1 + Math.sqrt(dist(p1, p2));
    const t3 = t2 + Math.sqrt(dist(p2, p3));

    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = t1 + (t2 - t1) * (s / samplesPerSegment);
      const a1 = knotLerp(p0, p1, t0, t1, t);
      const a2 = knotLerp(p1, p2, t1, t2, t);
      const a3 = knotLerp(p2, p3, t2, t3, t);
      const b1 = knotLerp(a1, a2, t0, t2, t);
      const b2 = knotLerp(a2, a3, t1, t3, t);
      out.push(knotLerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

/**
 * Clamp every point into the canvas rectangle. Guards Catmull-Rom overshoot
 * near the edges.
 *
 * @param {{x:number,y:number}[]} points
 * @param {number} w canvas width
 * @param {number} h canvas height
 */
export function clampToBounds(points, w, h) {
  return points.map(p => ({
    x: Math.max(0, Math.min(w, p.x)),
    y: Math.max(0, Math.min(h, p.y)),
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/pathGeometry.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/systems/pathGeometry.js src/systems/pathGeometry.test.js
git commit -m "feat(path): add shared centripetal Catmull-Rom samplePath geometry"
```

---

## Task 2: Render the sampled curve in `PathRenderer`

`PathRenderer` currently samples a midpoint-quadratic internally. Swap that for `samplePath` so the rendered curve is identical to the movement curve. The public API (`renderPath(gfx, points, style)` — `points` are control points in pixel space) is unchanged.

**Files:**
- Modify: `src/systems/PathRenderer.js`
- Test: `src/systems/PathRenderer.test.js` (existing tests should keep passing; add one)

- [ ] **Step 1: Add a test asserting the renderer samples into many small segments**

Append inside the `describe('PathRenderer', ...)` block in `src/systems/PathRenderer.test.js`:

```js
  it('samples the curve into many lineTo segments (not one straight line)', () => {
    const gfx = makeGfx();
    renderPath(gfx, PATH, 'planet-dust');
    const lineTos = gfx._calls().filter(c => c.method === 'lineTo').length;
    expect(lineTos).toBeGreaterThan(10); // dense sampling, not 2-3 raw segments
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run src/systems/PathRenderer.test.js`
Expected: the new test may already pass (the old sampler also emits many `lineTo`s). If it passes, that is fine — it locks the behavior. Proceed; the real change is in Step 3.

- [ ] **Step 3: Replace the internal sampler with `samplePath`**

In `src/systems/PathRenderer.js`:

Add the import at the top:

```js
import { samplePath } from './pathGeometry.js';
```

Replace the `drawSmoothStroke` function (and the `CURVE_SAMPLES` constant comment) with a version that strokes the shared sampled polyline:

```js
// Samples per Catmull-Rom segment. 12 gives visually-smooth corners at the
// path widths we draw without overspending on Graphics commands.
const CURVE_SAMPLES = 12;

function drawSmoothStroke(gfx, points, color, alpha, width) {
  if (points.length < 2) return;
  const curve = samplePath(points, CURVE_SAMPLES);
  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(curve[0].x, curve[0].y);
  for (let i = 1; i < curve.length; i++) {
    gfx.lineTo(curve[i].x, curve[i].y);
  }
  gfx.strokePath();
}
```

Update `drawDashedStroke` to walk the sampled curve too, so dashes follow the same line. Change its first line from walking `points` directly to walking the sampled curve:

```js
function drawDashedStroke(gfx, points, color, alpha, width, dashOn, dashOff) {
  const curve = samplePath(points, CURVE_SAMPLES);
  gfx.lineStyle(width, color, alpha);
  let phase = 0;
  let remaining = dashOn;
  for (let i = 0; i < curve.length - 1; i++) {
    let x = curve[i].x, y = curve[i].y;
    const tx = curve[i + 1].x, ty = curve[i + 1].y;
    let dx = tx - x, dy = ty - y;
    let segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    let ux = dx / segLen, uy = dy / segLen;
    while (segLen > 0) {
      const step = Math.min(remaining, segLen);
      if (phase === 0) {
        gfx.lineBetween(x, y, x + ux * step, y + uy * step);
      }
      x += ux * step; y += uy * step;
      segLen -= step;
      remaining -= step;
      if (remaining <= 0) {
        phase = 1 - phase;
        remaining = phase === 0 ? dashOn : dashOff;
      }
    }
  }
}
```

(The old `drawSmoothStroke` body — the `prevX/prevY` quadratic loop — is fully replaced. No other code in the file changes.)

- [ ] **Step 4: Run the renderer tests**

Run: `npx vitest run src/systems/PathRenderer.test.js`
Expected: PASS — all existing tests (valid-gfx-method whitelist, no-op for <2 points, throws on unknown style) plus the new sampling test.

- [ ] **Step 5: Commit**

```bash
git add src/systems/PathRenderer.js src/systems/PathRenderer.test.js
git commit -m "refactor(path): render via shared samplePath (Catmull-Rom)"
```

---

## Task 3: Densify the gameplay path in `PathManager` + rewire `GameScene`

`PathManager` keeps the raw pixel waypoints (control points for the renderer and blocker placement) and exposes the dense sampled polyline as `path` (movement/targeting). `GameScene`'s blocker + path-render calls switch to the raw `waypoints`; enemy movement keeps using `path` (now the curve) for free.

**Files:**
- Modify: `src/systems/PathManager.js`
- Modify: `src/scenes/GameScene.js` (lines [1218](../../src/scenes/GameScene.js#L1218), [1230](../../src/scenes/GameScene.js#L1230))
- Test: `src/systems/PathManager.test.js`

- [ ] **Step 1: Update `PathManager.test.js` for the dense path + raw waypoints**

Replace the first two tests (`converts normalized waypoints…` and the body of the `describe` setup is unchanged) and add a raw-waypoints test. The full updated assertions:

```js
import { PathManager } from './PathManager.js';

const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];
const SLOTS = [[0.50, 0.20], [0.20, 0.50], [0.80, 0.80]];
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, SLOTS, 100, 100); });

  it('stores raw pixel waypoints as control points', () => {
    expect(pm.waypoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });

  it('path is a dense polyline passing through every raw waypoint', () => {
    expect(pm.path.length).toBeGreaterThan(WAYPOINTS.length);
    for (const w of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]) {
      expect(pm.path.some(p => near(p.x, w.x) && near(p.y, w.y))).toBe(true);
    }
  });

  it('path endpoints are exactly the first/last waypoint', () => {
    expect(pm.path[0]).toEqual({ x: 0, y: 0 });
    expect(pm.path[pm.path.length - 1]).toEqual({ x: 100, y: 100 });
  });

  it('isOnPath returns true near the curve and false far from it', () => {
    expect(pm.isOnPath(50, 0, 12)).toBe(true);
    expect(pm.isOnPath(100, 50, 12)).toBe(true);
    expect(pm.isOnPath(0, 80, 10)).toBe(false);
  });

  it('buildZones come from supplied slots (not auto-computed)', () => {
    expect(pm.buildZones).toHaveLength(3);
    expect(pm.buildZones[0]).toMatchObject({ cx: 50, cy: 20, radius: 22, occupied: false });
    expect(pm.buildZones[1]).toMatchObject({ cx: 20, cy: 50 });
    expect(pm.buildZones[2]).toMatchObject({ cx: 80, cy: 80 });
  });

  it('getPathPoints returns the dense path array', () => {
    expect(pm.getPathPoints()).toBe(pm.path);
  });

  it('getNearestPathProgress returns ~0 at start and ~1 at end', () => {
    expect(pm.getNearestPathProgress(0, 0)).toBeCloseTo(0, 5);
    expect(pm.getNearestPathProgress(100, 100)).toBeCloseTo(1, 5);
  });

  it('getNearestPathProgress is ~0.5 at the elbow of the symmetric L', () => {
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/PathManager.test.js`
Expected: FAIL — `pm.waypoints` undefined; `pm.path` still the 3 raw points.

- [ ] **Step 3: Update `PathManager` to store raw waypoints + dense path**

Replace the constructor in `src/systems/PathManager.js`:

```js
import { samplePath, clampToBounds } from './pathGeometry.js';

export class PathManager {
  constructor(waypoints, towerSlots, canvasWidth, canvasHeight) {
    // Raw control points in pixel space — used by the renderer and blocker
    // placement (which key off path bends, not the dense samples).
    this.waypoints = waypoints.map(([nx, ny]) => ({ x: nx * canvasWidth, y: ny * canvasHeight }));
    // Dense sampled curve — what enemies, soldiers, targeting, and hover all
    // walk. Clamped so Catmull-Rom edge overshoot can't push enemies off-canvas.
    this.path = clampToBounds(samplePath(this.waypoints), canvasWidth, canvasHeight);
    this.buildZones = (towerSlots ?? []).map(([nx, ny]) => ({
      cx: nx * canvasWidth,
      cy: ny * canvasHeight,
      radius: 22,
      occupied: false,
    }));
  }
```

(The rest of the class — `isOnPath`, `getPathPoints`, `getNearestPathProgress` — is unchanged; they already iterate `this.path`.)

- [ ] **Step 4: Rewire `GameScene` static layers to use raw waypoints**

In `src/scenes/GameScene.js`, in `_renderStaticLayers(map)`:

Change the blocker placement call (line ~1218) from `this.pathMgr.path` to `this.pathMgr.waypoints`:

```js
    const placements = computeBlockerPlacements(this.pathMgr.waypoints, map.blockerVocab, map.blockerSeed);
```

Change the path render call (line ~1230) from `this.pathMgr.path` to `this.pathMgr.waypoints`:

```js
    renderPath(g, this.pathMgr.waypoints, map.pathRenderStyle);
```

(Leave every other `this.pathMgr.path` reference as-is — hero spawn at line 86, IN/OUT labels at 139-141, movement at 353-381, soldier spawns at 872/1075. Those correctly use the dense path.)

- [ ] **Step 5: Run the affected suites**

Run: `npx vitest run src/systems/PathManager.test.js src/systems/PathRenderer.test.js src/scenes/`
Expected: PASS. (GameScene tests don't assert blocker counts off `path`; if any asserts `pathMgr.path` equals raw waypoints, update it to read `pathMgr.waypoints`.)

- [ ] **Step 6: Browser-verify one map renders correctly**

Start the dev server (`npm run dev`) and open a map. Confirm: the curved path is drawn, blockers sit at the path bends (not scattered along the curve), enemies walk along the visible curve, and the IN/OUT labels sit at the path ends. Per project memory, run the app in a real browser before declaring scene/render work done.

- [ ] **Step 7: Commit**

```bash
git add src/systems/PathManager.js src/systems/PathManager.test.js src/scenes/GameScene.js
git commit -m "feat(path): enemies walk the rendered curve via dense sampled path"
```

---

## Task 4: Editor pure helpers (`mapEditorUtils.js`)

The editor's testable logic lives in pure functions, kept out of the Phaser scene so they can be unit-tested without jsdom/Phaser.

**Files:**
- Create: `src/systems/mapEditorUtils.js`
- Test: `src/systems/mapEditorUtils.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// src/systems/mapEditorUtils.test.js
import { roundCoord, serializeMapArrays, slotInPathCorridor } from './mapEditorUtils.js';

describe('roundCoord', () => {
  it('rounds to 3 decimals and strips trailing zeros', () => {
    expect(roundCoord(0.12345)).toBe(0.123);
    expect(roundCoord(0.5)).toBe(0.5);
    expect(roundCoord(0)).toBe(0);
    expect(roundCoord(1)).toBe(1);
  });
});

describe('serializeMapArrays', () => {
  it('emits a maps.js-ready snippet with rounded coords', () => {
    const out = serializeMapArrays(
      [[0, 0.35], [0.18123, 0.35]],
      [[0.1, 0.55], [0.30001, 0.88]],
    );
    expect(out).toBe(
      'waypoints: [[0,0.35],[0.181,0.35]],\n' +
      'towerSlots: [[0.1,0.55],[0.3,0.88]],',
    );
  });
});

describe('slotInPathCorridor', () => {
  // Path is the L (0,0)->(1,0)->(1,1) in normalized space; corridor ~0.05.
  const wp = [[0, 0], [1, 0], [1, 1]];
  it('flags a slot sitting on the path', () => {
    expect(slotInPathCorridor([0.5, 0.0], wp, 0.05)).toBe(true);
  });
  it('passes a slot clear of the path', () => {
    expect(slotInPathCorridor([0.5, 0.5], wp, 0.05)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/mapEditorUtils.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mapEditorUtils.js`**

```js
// src/systems/mapEditorUtils.js

/** Round a normalized coordinate to 3 decimals (numeric, no trailing zeros). */
export function roundCoord(n) {
  return Math.round(n * 1000) / 1000;
}

/** Serialize one [x,y] pair as a compact "[x,y]" string with rounded coords. */
function pair([x, y]) {
  return `[${roundCoord(x)},${roundCoord(y)}]`;
}

/**
 * Serialize waypoints + towerSlots into a maps.js-ready snippet (two lines,
 * trailing commas, ready to paste into a map entry).
 *
 * @param {number[][]} waypoints   normalized [x,y] pairs
 * @param {number[][]} towerSlots  normalized [x,y] pairs
 * @returns {string}
 */
export function serializeMapArrays(waypoints, towerSlots) {
  const wp = waypoints.map(pair).join(',');
  const ts = towerSlots.map(pair).join(',');
  return `waypoints: [${wp}],\ntowerSlots: [${ts}],`;
}

/**
 * True if a slot lies within `margin` (normalized) of any straight segment
 * between consecutive waypoints — i.e. it would sit in the no-build corridor.
 *
 * @param {number[]} slot        [x,y] normalized
 * @param {number[][]} waypoints normalized [x,y] pairs
 * @param {number} margin        normalized corridor half-width
 * @returns {boolean}
 */
export function slotInPathCorridor(slot, waypoints, margin) {
  const [sx, sy] = slot;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, ay] = waypoints[i];
    const [bx, by] = waypoints[i + 1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    if (Math.hypot(cx - sx, cy - sy) <= margin) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/mapEditorUtils.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/mapEditorUtils.js src/systems/mapEditorUtils.test.js
git commit -m "feat(editor): add pure map-editor helpers (serialize, corridor check)"
```

---

## Task 5: `MapEditorScene` skeleton + `?edit=1` activation

A dev-only scene reached via `?edit=1&map=N`. This task wires activation and a minimal scene that loads the map and logs that it started — rendering and interaction land in Tasks 6-7.

**Files:**
- Create: `src/scenes/MapEditorScene.js`
- Modify: `src/main.js`
- Modify: `src/scenes/BootScene.js`

- [ ] **Step 1: Create the minimal scene**

```js
// src/scenes/MapEditorScene.js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';

/**
 * Dev-only overlay editor. Activated by BootScene when the URL has
 * `?edit=1&map=N`. Renders the real path/platform pipeline over the map
 * bitmap with draggable handles and exports maps.js-ready arrays.
 */
export default class MapEditorScene extends Phaser.Scene {
  constructor() { super('MapEditorScene'); }

  init(data) {
    this.mapId = data?.mapId ?? 0;
    const map = MAPS[this.mapId];
    // Local editable copies (normalized) — never mutate MAPS directly.
    this.waypoints = map.waypoints.map(([x, y]) => [x, y]);
    this.slots = map.towerSlots.map(([x, y]) => [x, y]);
  }

  create() {
    // Rendering + interaction added in Tasks 6-7.
    console.log(`[MapEditor] editing map ${this.mapId} (${MAPS[this.mapId].name})`);
  }
}
```

- [ ] **Step 2: Register the scene in `main.js`**

In `src/main.js`, add the import and append the scene to the list:

```js
import MapEditorScene from './scenes/MapEditorScene.js';
```

```js
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
```

- [ ] **Step 3: Route to the editor from `BootScene`**

In `src/scenes/BootScene.js`, replace the `create()` method:

```js
  create() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1') {
      const mapId = Number.parseInt(params.get('map') ?? '0', 10) || 0;
      this.scene.start('MapEditorScene', { mapId });
      return;
    }
    this.scene.start('MenuScene');
  }
```

- [ ] **Step 4: Browser-verify activation**

Run `npm run dev`, open `http://localhost:<port>/?edit=1&map=2`. Open the console and confirm the log `[MapEditor] editing map 2 (The Crater)` appears, and the normal menu does NOT show. Open the root URL (no params) and confirm the menu loads as before.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/MapEditorScene.js src/main.js src/scenes/BootScene.js
git commit -m "feat(editor): add dev-only MapEditorScene reachable via ?edit=1"
```

---

## Task 6: Editor overlay rendering

Render the bitmap, the live curve (real `renderPath` + `samplePath`), platforms, the no-build corridor, draggable handles, and a HUD readout. Pure rendering — interactions land in Task 7.

**Files:**
- Modify: `src/scenes/MapEditorScene.js`

- [ ] **Step 1: Implement rendering**

Add imports and a `_render()` method called at the end of `create()`. Replace the scene body below `init` with:

```js
import { renderPath } from '../systems/PathRenderer.js';
import { renderPlatforms } from '../systems/PlatformRenderer.js';
import { slotInPathCorridor } from '../systems/mapEditorUtils.js';

// ...inside the class:

  create() {
    const { width, height } = this.scale;
    this.W = width; this.H = height;
    const map = MAPS[this.mapId];

    this.cameras.main.setBackgroundColor(map.background);
    const bgKey = `bg_map_${map.id}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(width / 2, height / 2, bgKey).setDisplaySize(width, height).setDepth(0);
    }

    this.layer = this.add.graphics().setDepth(10);  // curve + platforms + corridor
    this.handles = this.add.graphics().setDepth(20); // waypoint/slot handles
    this.labelLayer = this.add.container(0, 0).setDepth(21);
    this.hud = this.add.text(8, 8, '', {
      fontSize: '13px', color: '#fff', fontFamily: 'monospace',
      backgroundColor: '#000a', padding: { x: 6, y: 4 },
    }).setDepth(30);

    this._render();
  }

  // Normalized [x,y] -> pixel {x,y}.
  _toPx([nx, ny]) { return { x: nx * this.W, y: ny * this.H }; }

  _render() {
    const map = MAPS[this.mapId];
    const wpPx = this.waypoints.map(p => this._toPx(p));

    // Curve + platforms (reuse the real renderers).
    this.layer.clear();
    renderPath(this.layer, wpPx, map.pathRenderStyle);
    const zones = this.slots.map(p => {
      const px = this._toPx(p);
      return { cx: px.x, cy: px.y, radius: 22, occupied: false };
    });
    renderPlatforms(this.layer, zones, map.id);

    // No-build corridor (faint band along each straight segment).
    this.layer.lineStyle(80, 0xff3333, 0.06);
    this.layer.beginPath();
    this.layer.moveTo(wpPx[0].x, wpPx[0].y);
    for (let i = 1; i < wpPx.length; i++) this.layer.lineTo(wpPx[i].x, wpPx[i].y);
    this.layer.strokePath();

    // Handles + index labels.
    this.handles.clear();
    this.labelLayer.removeAll(true);
    wpPx.forEach((p, i) => {
      this.handles.fillStyle(0x33ff66, 1).fillCircle(p.x, p.y, 7);
      this._label(p.x, p.y - 14, `w${i}`, '#33ff66');
    });
    const corridorMargin = 80 / Math.max(this.W, this.H) / 2; // matches the band half-width
    this.slots.forEach((s, i) => {
      const p = this._toPx(s);
      const bad = slotInPathCorridor(s, this.waypoints, corridorMargin);
      this.handles.lineStyle(3, bad ? 0xff3333 : 0x66ccff, 1).strokeCircle(p.x, p.y, 22);
      this._label(p.x, p.y - 28, `s${i}`, bad ? '#ff5555' : '#66ccff');
    });

    this._renderHud();
  }

  _label(x, y, text, color) {
    this.labelLayer.add(this.add.text(x, y, text, {
      fontSize: '11px', color, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  _renderHud() {
    const map = MAPS[this.mapId];
    const target = 6 + map.id;
    const ok = this.slots.length === target;
    const inCorridor = this.slots.filter(s =>
      slotInPathCorridor(s, this.waypoints, 80 / Math.max(this.W, this.H) / 2)).length;
    this.hud.setText([
      `Map ${map.id} — ${map.name}`,
      `waypoints: ${this.waypoints.length}`,
      `slots: ${this.slots.length} / ${target} ${ok ? 'OK' : 'MISMATCH'}`,
      `slots in corridor: ${inCorridor}`,
      `[E] export to clipboard+console`,
      `drag handle = move · click path = add waypoint · right-click waypoint = delete`,
    ].join('\n'));
  }
```

- [ ] **Step 2: Browser-verify the overlay**

Run `npm run dev`, open `?edit=1&map=4`. Confirm: the bitmap shows, the curve is drawn over it, platform discs render at slots, green `w#` dots sit on each waypoint, blue `s#` rings on each slot (red if on the path), the faint red corridor follows the path, and the HUD shows correct counts (`slots: 10 / 10 OK` for map 4).

- [ ] **Step 3: Commit**

```bash
git add src/scenes/MapEditorScene.js
git commit -m "feat(editor): render bitmap + curve + platforms + handles overlay"
```

---

## Task 7: Editor interactions + export

Drag handles to move waypoints/slots, click a path segment to insert a waypoint, right-click a waypoint to delete it, and press `E` to export.

**Files:**
- Modify: `src/scenes/MapEditorScene.js`

- [ ] **Step 1: Add `serializeMapArrays` to the imports**

```js
import { serializeMapArrays, slotInPathCorridor } from '../systems/mapEditorUtils.js';
```

- [ ] **Step 2: Wire input at the end of `create()`**

Append to `create()` (after `this._render();`):

```js
    this.drag = null; // { kind: 'wp'|'slot', index }
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer) => {
      const { worldX: x, worldY: y } = pointer;
      const hit = this._hitTest(x, y);
      if (pointer.rightButtonDown()) {
        if (hit?.kind === 'wp' && this.waypoints.length > 2) {
          this.waypoints.splice(hit.index, 1);
          this._render();
        }
        return;
      }
      if (hit) { this.drag = hit; return; }
      // Click on empty space near the path inserts a waypoint there.
      this._insertWaypointAt(x, y);
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.drag) return;
      const nx = Phaser.Math.Clamp(pointer.worldX / this.W, 0, 1);
      const ny = Phaser.Math.Clamp(pointer.worldY / this.H, 0, 1);
      const arr = this.drag.kind === 'wp' ? this.waypoints : this.slots;
      arr[this.drag.index] = [nx, ny];
      this._render();
    });

    this.input.on('pointerup', () => { this.drag = null; });

    this.input.keyboard.on('keydown-E', () => this._export());
```

- [ ] **Step 3: Add hit-testing, insertion, and export methods**

```js
  // Returns { kind, index } for the closest handle within its radius, else null.
  _hitTest(x, y) {
    for (let i = 0; i < this.waypoints.length; i++) {
      const p = this._toPx(this.waypoints[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 10) return { kind: 'wp', index: i };
    }
    for (let i = 0; i < this.slots.length; i++) {
      const p = this._toPx(this.slots[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 22) return { kind: 'slot', index: i };
    }
    return null;
  }

  // Insert a waypoint on the segment nearest the click (only if reasonably close).
  _insertWaypointAt(x, y) {
    let best = { dist: Infinity, index: -1 };
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this._toPx(this.waypoints[i]);
      const b = this._toPx(this.waypoints[i + 1]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const d = Math.hypot(cx - x, cy - y);
      if (d < best.dist) best = { dist: d, index: i + 1 };
    }
    if (best.index >= 0 && best.dist <= 40) {
      this.waypoints.splice(best.index, 0, [
        Phaser.Math.Clamp(x / this.W, 0, 1),
        Phaser.Math.Clamp(y / this.H, 0, 1),
      ]);
      this._render();
    }
  }

  _export() {
    const snippet = serializeMapArrays(this.waypoints, this.slots);
    console.log(`\n=== Map ${this.mapId} (${MAPS[this.mapId].name}) ===\n${snippet}\n`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snippet).then(
        () => { this.hud.setText(this.hud.text + '\n✓ copied to clipboard'); },
        () => { /* clipboard blocked; console output still available */ },
      );
    }
  }
```

- [ ] **Step 4: Browser-verify interactions**

Run `npm run dev`, open `?edit=1&map=0`. Verify each: drag a `w#` dot and the curve follows; drag an `s#` ring onto a pad and the ring turns blue (red if dropped on the path); click on the path between two waypoints and a new waypoint appears; right-click a waypoint and it's removed (count drops in HUD, blocked at 2). Press `E`; confirm the console prints a `waypoints: [...], towerSlots: [...],` snippet and (if the browser allows) the HUD shows "copied to clipboard".

- [ ] **Step 5: Commit**

```bash
git add src/scenes/MapEditorScene.js
git commit -m "feat(editor): drag/insert/delete handles + export to clipboard"
```

---

## Task 8: Full-suite verification before fitting

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green (existing 468+ tests plus the new pathGeometry / mapEditorUtils / updated PathManager + PathRenderer tests).

- [ ] **Step 2: Lint changed files**

Run: `npx eslint src/systems/pathGeometry.js src/systems/PathRenderer.js src/systems/PathManager.js src/systems/mapEditorUtils.js src/scenes/MapEditorScene.js src/scenes/BootScene.js src/scenes/GameScene.js src/main.js`
Expected: no errors.

- [ ] **Step 3: Commit (if lint auto-fixed anything; otherwise skip)**

```bash
git add -A && git commit -m "chore: lint fixes for path-geometry + editor" || echo "nothing to commit"
```

---

## Task 9: First-pass fit of all 10 maps

**Executed in the main session, not a blind subagent** — the fitting needs the live browser, the bitmap, and visual judgment. Use the editor (Task 5-7) as both the fitting and review tool. One commit per map.

**Files:**
- Modify: `src/data/maps.js` (per-map `waypoints` + `towerSlots`)

For each map `N` in 0..9, repeat:

- [ ] **Step A: Read the terrain.** Open `assets/backgrounds/map_N_<slug>.png` (Read tool renders it). Note craters, bulkhead gaps, asteroid faces, flat pads, and which edges the path should enter/exit.

- [ ] **Step B: Draft the arrays.** In `?edit=1&map=N`, drag waypoints so the path skirts hazards and threads gaps (add bends where the art warrants), and drag the `6 + N` slots onto natural pads, keeping every `s#` ring blue (clear of the corridor) and the HUD showing `slots: K / K OK`.

- [ ] **Step C: Export + paste.** Press `E`, copy the snippet, and replace map `N`'s `waypoints` + `towerSlots` in `src/data/maps.js`.

- [ ] **Step D: Verify in gameplay.** Open the map normally (no `?edit`), start a wave, and confirm enemies follow the painted path, blockers sit in the bends, and towers place only on the pads. (Project memory: browser-verify after render work.)

- [ ] **Step E: Commit this map.**

```bash
git add src/data/maps.js
git commit -m "feat(maps): natural-fit path + slots for map N — <name>"
```

- [ ] **Final step: Confirm the schema test still holds**

Run: `npx vitest run src/data/maps.test.js`
Expected: PASS — every map still has `6 + id` slots and all coords normalized in [0,1].

---

## Self-review notes

- **Spec coverage:** §3.1 shared geometry → Task 1; §3.1 renderer wiring → Task 2; §3.1 PathManager + §3.2 downstream consumers → Task 3; §3.3 editor (activation/render/interact/export) → Tasks 5-7; §4 data shape unchanged (verified — `maps.test.js` already permits growing waypoints); §5 per-map workflow → Task 9; §6 tests → Tasks 1-4 + Task 8; §7 risks: Catmull-Rom overshoot → `clampToBounds` (Task 1/3), `waypointIndex` dense-index → Task 3 leaves relative-ordering targeting intact (verified line 718 compares same-path indices), wave-timing easing → flagged for Task 9 Step D playtest.
- **No placeholders:** every code step has complete code; every run step has an expected result.
- **Type consistency:** `samplePath(points, samplesPerSegment)` and `clampToBounds(points, w, h)` used identically in Tasks 1-3; `PathManager.waypoints` / `.path` names consistent across Task 3 and GameScene rewiring; `serializeMapArrays(waypoints, towerSlots)` / `slotInPathCorridor(slot, waypoints, margin)` consistent across Tasks 4, 6, 7.
