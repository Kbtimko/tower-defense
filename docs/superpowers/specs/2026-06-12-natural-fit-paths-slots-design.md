# Natural-Fit Paths + Tower Slots Per Map — Design Spec

**Date:** 2026-06-12
**Backlog item:** "Natural-fit paths + tower slots per map" (notes.md backlog #7, added 2026-06-07)
**Status:** Approved (brainstorm phase complete; ready for implementation plan)
**Sister work:** [2026-06-06-space-themed-backgrounds-design.md](./2026-06-06-space-themed-backgrounds-design.md) (PR #26, shipped) — produced the painted bitmaps this work fits onto.

---

## 1. Goal

PR #26 added an AI-generated painted bitmap backdrop per map plus a procedural overlay (curved bezier path, thematic blockers, tower-platform discs). The bitmaps look good in isolation, but the `waypoints` and `towerSlots` arrays in [src/data/maps.js](../../../src/data/maps.js) are still the generic normalized coordinates from *before* the bitmaps existed. The result:

- Paths slice straight through painted craters instead of skirting them.
- Tower slots land on top of important art instead of on natural pads.
- Bends are arbitrary — they don't reflect what the terrain suggests.

**Re-fit every map** so the path follows real terrain features (skirts craters, threads through bulkhead gaps, weaves between asteroids — using *more* bends where the art warrants) and tower slots land on natural pads (crater rims, ship platforms, asteroid faces). Build the tooling to make that fitting fast and repeatable, and use it to do a first pass on all 10 maps.

## 2. Scope decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **In-browser overlay editor** (`MapEditorScene`, dev-only) for fitting | WYSIWYG against the real render pipeline; far faster than blind coord-editing or external tracing (Figma/Inkscape) which can't see gameplay constraints. |
| 2 | **Align gameplay to the visible curve** — `PathManager` consumes a densified sample of the same curve the renderer draws | Enemies walk exactly the line the player sees. The follow-loop already walks any polyline, so this is a small change that also fixes today's minor corner-cutting and makes "more bends" safe. |
| 3 | **Keep normalized `[x,y]` arrays in maps.js** — no SVG, no sidecar JSON, no alpha masks | Everything already reads `waypoints`/`towerSlots`. The fix is *better numbers + more waypoints*, not a new data model. YAGNI. |
| 4 | **Centripetal Catmull-Rom** smoothing (pass-through), replacing the midpoint-quadratic (pass-near) | When a designer drops a waypoint on a crater rim, the path must go *through* it. Essential for a fitting tool. |
| 5 | **Slot count stays `6 + id`** — fitting repositions existing slots, never changes the count | Preserves the difficulty curve and the `maps.test.js` contract. |
| 6 | **Claude does a first-pass fit on all 10 maps; user refines** via the editor | Path-on-art aesthetics is subjective; Claude's screenshot-based pass gives a working draft, the user's review gate makes it tasteful. |
| 7 | **Out of scope:** animated backgrounds (backlog #6), tower-type-per-slot rules | Keep this focused on re-fitting + tooling. |

## 3. Architecture

### 3.1 Shared path geometry — `src/systems/pathGeometry.js` (NEW)

Today the curve math lives inside `PathRenderer` (`drawSmoothStroke`, midpoint-quadratic sampling) and enemies ignore it entirely (`PathManager.path` is the raw waypoints; `GameScene` walks straight segments). Extract the curve into one module so renderer and movement can never diverge:

```js
// src/systems/pathGeometry.js
/**
 * Sample a centripetal Catmull-Rom spline through `points` into a dense polyline.
 * Passes through every input point. Endpoints use duplicated phantom points so
 * the curve starts/ends exactly at points[0] / points[last].
 *
 * @param {{x:number,y:number}[]} points  control points in PIXEL space, length >= 2
 * @param {number} samplesPerSegment       sub-segments per control-point span (default 12)
 * @returns {{x:number,y:number}[]}        dense polyline, clamped to [0,W]x[0,H] by caller
 */
export function samplePath(points, samplesPerSegment = 12) { /* ... */ }
```

- **Centripetal** parameterization (alpha = 0.5) — avoids the cusps/overshoot plain (uniform) Catmull-Rom produces on sharp bends.
- Returns dense points in pixel space. The two-point case (`points.length === 2`) returns the straight segment.
- Deterministic: same input → same output.

Both consumers call it:

- **`PathRenderer.renderPath(gfx, points, style)`** — replace the internal `drawSmoothStroke` sampling with `samplePath(points)` then stroke the resulting polyline (halo / main / dash stay as three stacked strokes over the *same* sampled polyline). `drawDashedStroke` walks the sampled polyline too.
- **`PathManager` constructor** — `this.path = clampToBounds(samplePath(scaledWaypoints), canvasWidth, canvasHeight)` instead of the raw scaled waypoints. `clampToBounds` clamps each point to `[0,W]x[0,H]` (guards Catmull-Rom edge overshoot).

### 3.2 What rides the sampled path automatically

These already read `PathManager.path` / `getPathPoints()`, so they align with zero further change:

- Enemy movement — [GameScene.js:368](../../../src/scenes/GameScene.js#L368) `while (rem > 0 && enemy.waypointIndex < path.length - 1)` walks any-length polyline.
- Hero spawn — [GameScene.js:86](../../../src/scenes/GameScene.js#L86) `this.pathMgr.path[0]` (curve starts at waypoint 0, unchanged).
- Barracks soldiers — `getPathPoints()` at [GameScene.js:872](../../../src/scenes/GameScene.js#L872), [:1075](../../../src/scenes/GameScene.js#L1075).
- Targeting / progress — `getNearestPathProgress` returns normalized 0..1, still valid on the denser polyline.
- `isOnPath(margin)` — operates on the denser polyline; behavior preserved.

**Consequence to note:** `waypointIndex` now indexes into the *dense* polyline, not raw waypoints. Anything comparing raw `waypointIndex` magnitudes across enemies (e.g. "furthest along" targeting at [GameScene.js:718](../../../src/scenes/GameScene.js#L718)) still works because all enemies index the same dense path; only the absolute numbers change. Verify this site during implementation.

### 3.3 The editor — `MapEditorScene` (NEW, dev-only)

**Activation:** a query-param check in the boot flow — `?edit=1&map=N` launches `MapEditorScene` for map `N` instead of starting normal gameplay. Without the param, nothing changes. The scene is registered but never auto-started (consistent with [the scene-array no-autostart behavior](../../../src/scenes/) noted in project memory).

**Renders (the view — used by Claude's screenshots and the user's eyes):**

- The map bitmap backdrop (real `BootScene`-loaded texture).
- The live curve via the real `PathRenderer` + `samplePath`.
- Tower-platform discs via the real `PlatformRenderer` at each slot.
- **Waypoint handles** — draggable dots with index labels.
- **Slot handles** — draggable discs with index labels.
- **The 40px no-build path corridor** drawn faintly, so the user can see when a slot is illegally close to the path.

**Interactions (the editor — used by the user's refine pass):**

- Drag a waypoint handle → moves that waypoint.
- Drag a slot handle → moves that slot.
- Click on a path segment → inserts a new waypoint at that point.
- Right-click a waypoint handle → deletes it (min length 2 enforced).
- Drag is in pixel space; values stored/exported are normalized.
- A **HUD readout**: current map name/id, waypoint count, slot count vs `6 + id` target (green/red), and a warning list of any slot whose center is within the path corridor.

**Export:**

- A button (and a keyboard shortcut) serializes the current map's `waypoints` + `towerSlots` to a maps.js-ready snippet, normalized and rounded to 3 decimals:
  ```
  waypoints: [[0,0.35],[0.18,0.35], ...],
  towerSlots: [[0.1,0.55], ...],
  ```
- Writes the snippet to the clipboard **and** `console.log`s it. No browser-to-disk writes; the user/Claude pastes into [maps.js](../../../src/data/maps.js).

**Scope guard:** the editor is dev tooling. It is not part of any gameplay code path, carries a minimal test burden (export-format unit test only), and is harmless in a production build (inert without the query param).

## 4. Data shape

No schema change to [maps.js](../../../src/data/maps.js). Each map keeps:

```js
waypoints: [[nx, ny], ...],   // normalized, length >= 2, may GROW (more bends)
towerSlots: [[nx, ny], ...],  // normalized, length === 6 + id (UNCHANGED count)
```

Fitting changes the *values* (and adds waypoints); it never changes the slot count or the field shapes.

## 5. Per-map fitting workflow

Claude's first pass, per map:

1. Screenshot the raw bitmap (`assets/backgrounds/map_<N>_<slug>.png`) to read terrain — locate craters, bulkhead gaps, asteroid faces, pads.
2. Write fitted `waypoints` (skirting hazards, threading gaps) and `towerSlots` (on pads) into maps.js. Preserve slot count `6 + id`.
3. Load `?edit=1&map=N`, screenshot the overlay.
4. Compare: does the path avoid craters and follow suggested terrain? Do slots sit on pads and clear the path corridor? Adjust numbers; repeat 3–4 until good.
5. Commit (`feat(maps): natural-fit path + slots for map N — <name>`), one map per commit.

Then the **user review gate**: for each map, open `?edit=1&map=N`, nudge anything off, export, paste, commit. The editor *is* the per-map "this looks right" review tool.

## 6. Tests

| Test | Covers |
|------|--------|
| `pathGeometry.test.js` — pass-through | `samplePath` output includes (within float epsilon) every input control point |
| `pathGeometry.test.js` — endpoints | First/last sampled point equal `points[0]` / `points[last]` exactly |
| `pathGeometry.test.js` — determinism | Same input → identical output across calls |
| `pathGeometry.test.js` — two-point | `length === 2` returns the straight segment (densified) |
| `PathManager.test.js` — sampled path | `path` is the sampled polyline; `isOnPath` / `getNearestPathProgress` behave on it (update existing assertions that assumed `path === raw waypoints`) |
| `PathRenderer.test.js` — strokes | Renderer strokes the `samplePath` polyline; stroke sequence per style preserved (update existing test) |
| `maps.test.js` — slots | `towerSlots.length === 6 + id` retained; `waypoints` relaxed to "length >= 2, every entry `[x,y]` with `0 <= x,y <= 1`" |
| `MapEditorScene` — export format | Serializer emits a valid maps.js snippet with 3-decimal rounding |

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Aligning to the curve + more bends makes paths longer/curvier → enemies travel slightly slower → mild global easing | Not unit-testable. Flag for playtest; hand-tune wave timing only if a specific map plays soft after fitting. |
| Centripetal Catmull-Rom overshoots near canvas edges | `clampToBounds` on the sampled polyline in `PathManager`; the renderer samples the same clamped geometry. |
| `waypointIndex` now indexes the dense polyline — code comparing raw index magnitudes could shift | Verify [GameScene.js:718](../../../src/scenes/GameScene.js#L718) ("furthest along" targeting) during implementation; all enemies share one dense path so relative ordering holds. |
| Switching smoothing changes existing path shapes before refitting | We refit all 10 anyway; tune against the new smoothing, not the old. |
| Editor adds dev surface area | Behind a query param, excluded from gameplay paths, minimal tests, inert in production. |

## 8. Out of scope

- **Animated background layer** (drifting dust, sparking conduits) → backlog #6.
- **Per-platform tower-type restrictions.**
- **Changing slot counts** or the `6 + id` difficulty contract.
- **Re-generating any bitmap art** — this fits to the existing PR #26 assets.

## 9. Estimated effort

- `pathGeometry` extraction + Catmull-Rom + wiring `PathRenderer`/`PathManager` + test updates: ~2–3h.
- `MapEditorScene` (view + interactions + export): ~3–4h.
- Claude first-pass fit of 10 maps (screenshot-iterate-commit): ~2–3h.
- User refine pass: your time, ~1–2h.
- **Total: ~7–10h dev + your review pass.**
