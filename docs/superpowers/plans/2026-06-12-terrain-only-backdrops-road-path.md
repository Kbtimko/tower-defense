# Terrain-Only Backdrops + Road-Style Path (map 0 pilot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the procedural path as a believable worn road (berms + roadbed + wheel ruts) via a new `planet-road` style, and switch map 0 to it — so the engine path is the single "road" on a terrain-only backdrop.

**Architecture:** Add a pure `offsetPolyline` geometry helper alongside `samplePath`, then extend `PathRenderer.renderPath` with three optional road layers driven by new (optional) `STYLE_SPEC` fields. Existing styles omit those fields and render unchanged. A new `planet-road` style populates them; map 0 switches its `pathRenderStyle` to it.

**Tech Stack:** Phaser 3 Graphics, Vitest + jsdom, the gfx-proxy mock pattern from `PathRenderer.test.js`, centripetal Catmull-Rom sampling in `src/systems/pathGeometry.js`.

**Spec:** `docs/superpowers/specs/2026-06-12-terrain-only-backdrops-road-path.md`

---

## File Structure

- Modify `src/systems/pathGeometry.js` — add pure `offsetPolyline(points, dist)` (parallel curve via per-point normals).
- Modify `src/systems/pathGeometry.test.js` — geometry test for `offsetPolyline`.
- Modify `src/systems/PathRenderer.js` — extract `drawPolylineStroke`, add road layers to `renderPath`, add `planet-road` to `STYLE_SPEC` + `PATH_STYLES`.
- Modify `src/systems/PathRenderer.test.js` — `planet-road` in `PATH_STYLES`, road-style draws extra strokes, existing styles unchanged.
- Modify `src/data/maps.js` — map 0 `pathRenderStyle: 'planet-road'`.

No new files; all changes extend existing focused modules.

---

## Task 1: `offsetPolyline` geometry helper

**Files:**
- Modify: `src/systems/pathGeometry.js`
- Test: `src/systems/pathGeometry.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/systems/pathGeometry.test.js` (it already imports from `./pathGeometry.js`; add `offsetPolyline` to that import or add a new import line):

```js
import { offsetPolyline } from './pathGeometry.js';

describe('offsetPolyline', () => {
  // A straight horizontal centerline. Tangent is +x, so the LEFT normal is
  // (-ty, tx) = (0, 1): a positive offset shifts points to +y, negative to -y.
  const LINE = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];

  it('offsets a horizontal line by +dist along +y', () => {
    const out = offsetPolyline(LINE, 5);
    expect(out).toHaveLength(LINE.length);
    for (const p of out) expect(p.y).toBeCloseTo(5, 6);
    expect(out.map((p) => p.x)).toEqual([0, 10, 20]);
  });

  it('offsets by -dist along -y', () => {
    const out = offsetPolyline(LINE, -5);
    for (const p of out) expect(p.y).toBeCloseTo(-5, 6);
  });

  it('returns the input unchanged in shape for <2 points', () => {
    expect(offsetPolyline([{ x: 1, y: 2 }], 5)).toEqual([{ x: 1, y: 2 }]);
    expect(offsetPolyline([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/pathGeometry.test.js -t offsetPolyline`
Expected: FAIL — `offsetPolyline is not a function` (not exported yet).

- [ ] **Step 3: Write minimal implementation**

Add to `src/systems/pathGeometry.js` (at the end of the file, after the existing exports):

```js
/**
 * Return a polyline parallel to `points`, offset by `dist` pixels along the
 * per-point left normal. The tangent at point i uses neighbours i-1 and i+1
 * (one-sided at the ends); the left normal of tangent (tx,ty) is (-ty,tx).
 * Positive `dist` offsets left, negative offsets right.
 *
 * @param {{x:number,y:number}[]} points
 * @param {number} dist
 * @returns {{x:number,y:number}[]}
 */
export function offsetPolyline(points, dist) {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    out.push({ x: points[i].x + -ty * dist, y: points[i].y + tx * dist });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/pathGeometry.test.js`
Expected: PASS (existing tests + 3 new offsetPolyline tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/pathGeometry.js src/systems/pathGeometry.test.js
git commit -m "feat(path): offsetPolyline normal-offset helper for road ruts"
```

---

## Task 2: Road-layer rendering + `planet-road` style

**Files:**
- Modify: `src/systems/PathRenderer.js`
- Test: `src/systems/PathRenderer.test.js`

Context: `renderPath(gfx, points, style)` currently draws halo → main → dashes from `STYLE_SPEC[style]`. We add three optional road layers (berm, roadbed, ruts) BELOW those, gated on optional fields, and a `planet-road` style that uses them. The shared `samplePath(points, CURVE_SAMPLES)` is already imported; we add `offsetPolyline` and a small `drawPolylineStroke` helper, and refactor `drawSmoothStroke` to use it (DRY).

- [ ] **Step 1: Write the failing test**

In `src/systems/PathRenderer.test.js`:

(a) Update the styles list. Change the assertion at the top of the describe block:
```js
  it('exports the 4 supported style names', () => {
    expect(PATH_STYLES).toEqual(['planet-dust','station-strip','space-nav','organic-glow']);
  });
```
to:
```js
  it('exports the supported style names including planet-road', () => {
    expect(PATH_STYLES).toEqual(['planet-dust','station-strip','space-nav','organic-glow','planet-road']);
  });
```

(b) Update the per-style smoke loop. Change:
```js
  for (const style of ['planet-dust','station-strip','space-nav','organic-glow']) {
```
to:
```js
  for (const style of ['planet-dust','station-strip','space-nav','organic-glow','planet-road']) {
```

(c) Add two new tests inside the `describe('PathRenderer', ...)` block. They count `lineStyle` calls (one per stroke layer) on the gfx-proxy mock:
```js
  const PATH3 = [
    { x: 0,   y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
  ];
  const lineStyleCount = (gfx) => gfx._calls().filter((c) => c.method === 'lineStyle').length;

  it('planet-road draws more stroke layers than planet-dust (road layers present)', () => {
    const road = makeGfx();
    const dust = makeGfx();
    renderPath(road, PATH3, 'planet-road');
    renderPath(dust, PATH3, 'planet-dust');
    // planet-road = berm + roadbed + 2 ruts + dashes; planet-dust = halo + dashes
    expect(lineStyleCount(road)).toBeGreaterThan(lineStyleCount(dust));
    expect(lineStyleCount(road)).toBeGreaterThanOrEqual(5);
  });

  it('a style without road fields draws no road layers (unchanged)', () => {
    const g = makeGfx();
    renderPath(g, PATH3, 'planet-dust');
    // planet-dust = halo (1) + main (1) + dashes (1) = 3 lineStyle calls, no road layers
    expect(lineStyleCount(g)).toBe(3);
  });
```

(Note: `makeGfx` and `PATH` already exist in this file; `PATH3` is added so the new tests are self-contained.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/PathRenderer.test.js`
Expected: FAIL — `PATH_STYLES` no longer equals the old 4; `planet-road` unknown in `renderPath` (throws); road layer counts not met.

- [ ] **Step 3: Write the implementation**

In `src/systems/PathRenderer.js`:

(a) Extend the import at the top:
```js
import { samplePath, offsetPolyline } from './pathGeometry.js';
```

(b) Add `planet-road` to `PATH_STYLES`:
```js
export const PATH_STYLES = ['planet-dust', 'station-strip', 'space-nav', 'organic-glow', 'planet-road'];
```

(c) Add the `planet-road` entry to `STYLE_SPEC` (after `'organic-glow'`). Road fields (berm/roadbed/rut) are new; halo/main are zeroed; dashes are the faint center accent:
```js
  'planet-road': {
    // Road layers (drawn first, bottom→top)
    bermWidth: 34, bermColor: 0x9a8362, bermAlpha: 0.30,
    roadbedWidth: 26, roadbedColor: 0x6b5740, roadbedAlpha: 0.78,
    rutOffset: 6, rutWidth: 2, rutColor: 0x4a3c2c, rutAlpha: 0.55,
    // Accents
    haloColor: 0x000000, haloAlpha: 0, haloWidth: 0,
    mainColor: 0x000000, mainAlpha: 0, mainWidth: 0,
    dashColor: 0x3a2e20, dashAlpha: 0.45, dashWidth: 2, dashOn: 5, dashOff: 9,
  },
```

(d) Replace the body of `renderPath` to draw road layers before the existing accents. Replace the current function from `export function renderPath(gfx, points, style) {` through its closing brace with:
```js
export function renderPath(gfx, points, style) {
  if (points.length < 2) return;
  const spec = STYLE_SPEC[style];
  if (!spec) throw new Error(`PathRenderer: unknown style "${style}"`);

  // ── Road layers (optional; drawn first so accents sit on top) ──
  // Dust berms: soft, wide, light edge underlay.
  if (spec.bermWidth > 0 && spec.bermAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.bermColor, spec.bermAlpha, spec.bermWidth);
  }
  // Packed-earth roadbed.
  if (spec.roadbedWidth > 0 && spec.roadbedAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.roadbedColor, spec.roadbedAlpha, spec.roadbedWidth);
  }
  // Worn wheel ruts: two thin lines offset ± along the curve normals.
  if (spec.rutOffset > 0 && spec.rutWidth > 0 && spec.rutAlpha > 0) {
    const curve = samplePath(points, CURVE_SAMPLES);
    drawPolylineStroke(gfx, offsetPolyline(curve, spec.rutOffset), spec.rutColor, spec.rutAlpha, spec.rutWidth);
    drawPolylineStroke(gfx, offsetPolyline(curve, -spec.rutOffset), spec.rutColor, spec.rutAlpha, spec.rutWidth);
  }

  // ── Themed accents ──
  // Halo layer
  if (spec.haloWidth > 0 && spec.haloAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.haloColor, spec.haloAlpha, spec.haloWidth);
  }
  // Main stroke
  if (spec.mainWidth > 0 && spec.mainAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.mainColor, spec.mainAlpha, spec.mainWidth);
  }
  // Dashed overlay
  if (spec.dashWidth > 0 && spec.dashAlpha > 0) {
    drawDashedStroke(gfx, points, spec.dashColor, spec.dashAlpha, spec.dashWidth, spec.dashOn, spec.dashOff);
  }
}
```

(e) Add a `drawPolylineStroke` helper and refactor `drawSmoothStroke` to use it (DRY). Replace the existing `drawSmoothStroke` function with:
```js
function drawPolylineStroke(gfx, pts, color, alpha, width) {
  if (pts.length < 2) return;
  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    gfx.lineTo(pts[i].x, pts[i].y);
  }
  gfx.strokePath();
}

function drawSmoothStroke(gfx, points, color, alpha, width) {
  if (points.length < 2) return;
  drawPolylineStroke(gfx, samplePath(points, CURVE_SAMPLES), color, alpha, width);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/PathRenderer.test.js`
Expected: PASS — including the smoke loop for `planet-road` and the two new road-layer count tests.

- [ ] **Step 5: Commit**

```bash
git add src/systems/PathRenderer.js src/systems/PathRenderer.test.js
git commit -m "feat(path): worn-road render layers + planet-road style"
```

---

## Task 3: Switch map 0 to `planet-road`

**Files:**
- Modify: `src/data/maps.js`

- [ ] **Step 1: Change map 0's path style**

In `src/data/maps.js`, in the map with `id: 0`, change:
```js
    pathRenderStyle: 'planet-dust',
```
to:
```js
    pathRenderStyle: 'planet-road',
```
(Only map 0. Maps 1, 2, 5, 9 keep `planet-dust`.)

- [ ] **Step 2: Run the full suite (no regressions)**

Run: `npx vitest run`
Expected: PASS. `maps.test` asserts each map's `pathRenderStyle` is in `PATH_STYLES`; `planet-road` is now included, so map 0 passes.

- [ ] **Step 3: Commit**

```bash
git add src/data/maps.js
git commit -m "feat(maps): map 0 uses planet-road style (path renders as the road)"
```

---

## Task 4: Verification + terrain-only art prompt

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS, including the new geometry + road-layer tests; no regressions.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Browser verification of the road look (map 0)**

Run the app (`npm run dev`) and open map 0 (Outpost Sigma). Confirm:
- The path reads as a worn road — visible roadbed band with soft light berms and two darker ruts following the curve, not a thin dashed line.
- Ruts track the bends cleanly (no kinks) through the curviest segments.
- The road sits UNDER towers/enemies/projectiles (depth 10) — no element is obscured, ruts/berms don't bleed over units.
- Take a screenshot for the record.

If road width/colors need tuning, adjust the `planet-road` numbers in `STYLE_SPEC` and re-run Steps 1–3. (Data-only edit; commit any tuning with `git commit -am "tune(path): planet-road palette"`.)

- [ ] **Step 4: Deliver the terrain-only art prompt to the user**

The new backdrop is generated by the user (no image-gen tool here). Provide this prompt (from the spec) for regenerating `assets/backgrounds/map_0_outpost_sigma.png`:

> **Prompt:** Top-down / high-angle war-torn Martian desert battlefield surface — cracked reddish-tan dirt, scattered impact craters, rocky rubble mounds, ruined fortifications and debris around the edges, dramatic hazy fiery horizon along the top. Painterly game-art style, high detail, even readable mid-tone lighting across the central play area.
>
> **Negative / must NOT contain:** road, path, trail, track, dirt road, walkway, line, river, channel, any continuous lane crossing the scene. Unbroken terrain only. Avoid large pure-black or blown-out white regions in the center.
>
> Aspect 4:3 → `assets/backgrounds/map_0_outpost_sigma.png`.

The road renderer works over the current backdrop as a fallback until the new PNG is dropped in.

- [ ] **Step 5: Update notes**

Append a one-line entry to the Completed section of `.claude/notes.md` summarizing the map-0 pilot (road renderer + planet-road + terrain-only prompt). Commit:
```bash
git add .claude/notes.md
git commit -m "docs: record terrain-only/road-path map 0 pilot"
```

---

## Self-Review Notes

- **Spec coverage:** road renderer layers berm/roadbed/ruts (Task 2), normal-offset ruts via `offsetPolyline` (Task 1), `planet-road` style + `PATH_STYLES` (Task 2), map 0 switch (Task 3), existing styles unchanged (Task 2 test), terrain-only prompt + fallback (Task 4), tests + browser verification (Tasks 1–4). Non-goals respected: no maps 1–9 changes, no image generation.
- **Consistency:** `offsetPolyline`, `drawPolylineStroke`, `drawSmoothStroke`, `samplePath`, `CURVE_SAMPLES`, `STYLE_SPEC`, `PATH_STYLES`, and the road field names (`bermWidth/Color/Alpha`, `roadbedWidth/Color/Alpha`, `rutOffset/Width/Color/Alpha`) are used identically across tasks and tests.
- **DRY:** `drawSmoothStroke` is refactored to call `drawPolylineStroke`, so smooth strokes and rut strokes share one implementation.
- **Placeholders:** none — every code step is complete; tuning in Task 4 has concrete starting values from Task 2.
