# 4.1a High-DPI Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On high-DPI screens, render the Phaser canvas at 2x backing resolution so the world draws at device density, with no change to size, position, input or logic.

**Architecture:** A render scale `k` (1 or 2) is picked once at boot by a pure function and stored in a module-level getter. The Phaser game is created `k` times larger; every world camera gets its viewport in game px and `zoom k`, so world coordinates never change. The one DOM↔world mapping module, all canvas text, and the baked road are made k-aware.

**Tech Stack:** Phaser 3.90, vanilla ES modules, Vite 5, Vitest 2 + jsdom, Playwright (capture harness).

**Spec:** `docs/superpowers/specs/2026-11-21-hidpi-canvas-design.md` (read it, including "Builder-check resolutions").

## Global Constraints

- Tunables in `src/data/`: `RENDER_SCALE = { threshold: 1.25, max: 2 }`. Never hardcode 2 or 1.25 elsewhere.
- k is an integer, 1 or 2 only; picked once at boot; never changes on resize.
- k = 1 must behave exactly as today (same camera calls' effect, same textures, same text).
- World coordinates, `src/sim/`, balance, saves, the DOM HUD and `src/data/layout.js` are untouched.
- The `?res=1|2` override is honoured only when `import.meta.env.DEV || import.meta.env.MODE === 'capture'`.
- Tests that import anything pulling in Phaser must `vi.mock('phaser', ...)` (jsdom has no canvas).
- Conventional Commits; stage explicit paths only (never `git add -A` / `.`).
- Run tests with `npx vitest run <path>`; never pipe test output through `tail`/`head`.
- Every new test must be shown to FAIL against the pre-change code before the fix (break it on purpose if needed) — note the failing assertion in the task report.

## Review Focus

1. **Bad DPR/size input** (dpr `undefined`, `0`, `NaN`; a 0×0 `#game` rect) must give k = 1, never NaN or 0 → Task 1 test `degenerate inputs give 1`.
2. **Resize/rotation after boot at k = 2:** `displayScale` changes while k stays fixed; world↔page mapping must still round-trip → Task 2 test `round-trips at k=2 under any displayScale`.
3. **Pooled damage numbers** are restyled with `setStyle`; a style without `resolution` would silently drop them back to 1x → Task 3 test `restyled numbers keep render resolution`.
4. **Future `add.text` calls** that bypass the helper → Task 3 guard test `no raw add.text outside the helper`.
5. **Road texture cache across replays:** the cached texture key must encode k, so a k = 1 bake is never reused at k = 2 → Task 4 test `texture key and size follow resolution`.

---

### Task 1: Render-scale decision and boot wiring

**Files:**
- Create: `src/data/renderScale.js`
- Create: `src/systems/renderScale.js`
- Create: `src/systems/renderScale.test.js`
- Modify: `src/main.js` (config `width`/`height`, computed before `new Phaser.Game`)

**Interfaces:**
- Produces:
  - `RENDER_SCALE: { threshold: number, max: number }` (data).
  - `renderScaleFor({ cssWidth: number, cssHeight: number, dpr: number }): 1 | 2`.
  - `parseRenderScaleOverride(search: string): 1 | 2 | null` — reads `res`; only `'1'`/`'2'` count, else `null`.
  - `getRenderScale(): number` (defaults to 1) and `setRenderScale(k: number): void` — module state, set once by `main.js`; tests call `setRenderScale` and reset to 1 in `afterEach`.

- [ ] **Step 1: Write the failing tests** in `src/systems/renderScale.test.js`. Use `CANVAS_WIDTH` and `WORLD_HEIGHT` from `src/data/layout.js` and `RENDER_SCALE` from the data module (derive, don't hardcode 1488):
  - `fits by the tighter axis`: for `{cssWidth: 1440, cssHeight: 900, dpr: 2}` → 2; `{1440, 900, dpr 1}` → 1; `{844, 390, dpr 3}` → 2; portrait `{390, 844, dpr 3}` → 1.
  - `threshold boundary`: choose `dpr: 1` and `cssWidth = RENDER_SCALE.threshold * CANVAS_WIDTH`, `cssHeight` large → 2; `cssWidth` one px less → 1.
  - `degenerate inputs give 1`: dpr `undefined`, `0`, `NaN`; cssWidth/cssHeight `0` → 1.
  - `never exceeds max`: with `RENDER_SCALE.max` temporarily set to 1 (`vi.spyOn` or mutate+restore), the 1440×900@2 case → 1.
  - `parseRenderScaleOverride`: `'?res=2'`→2, `'?res=1'`→1, `'?res=3'`, `'?res=abc'`, `''` → null.
  - `getRenderScale defaults to 1; setRenderScale stores it`.

- [ ] **Step 2: Run** `npx vitest run src/systems/renderScale.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/data/renderScale.js` and `src/systems/renderScale.js`. Rule from the spec: fitted CSS width = `min(cssWidth / CANVAS_WIDTH, cssHeight / WORLD_HEIGHT) * CANVAS_WIDTH`; device px = that × dpr; k = 2 if device px ≥ `threshold × CANVAS_WIDTH`, else 1; then `Math.min(k, RENDER_SCALE.max)`. Comment the *why* (FIT backing store is fixed at CANVAS_WIDTH; integer only because fractional zoom shimmers).

- [ ] **Step 4: Run** the test file — Expected: PASS.

- [ ] **Step 5: Wire `src/main.js`.** Before `new Phaser.Game`: measure `document.getElementById('game').getBoundingClientRect()`, fall back to `window.innerWidth/innerHeight` when the rect is 0; `override = (DEV || MODE==='capture') ? parseRenderScaleOverride(location.search) : null`; `k = override ?? renderScaleFor(...)`; `setRenderScale(k)`; config `width: CANVAS_WIDTH * k, height: WORLD_HEIGHT * k`. Leave `applyHudLayerSize`, `fitHudLayer` and everything else as is (they use the logical constants, which is correct).

- [ ] **Step 6: Run** `npx vitest run` (full suite) — Expected: all pass (4046 + new). k is 1 under jsdom, so nothing else moves.

- [ ] **Step 7: Commit**
```bash
git add src/data/renderScale.js src/systems/renderScale.js src/systems/renderScale.test.js src/main.js
git commit -m "feat(render): pick a 1x/2x render scale at boot (4.1a)"
```

---

### Task 2: World cameras and the DOM↔world mapping

**Files:**
- Create: `src/systems/worldCamera.js`, `src/systems/worldCamera.test.js`
- Modify: `src/systems/viewport.js` (`worldToPageCss`, `pageToWorld`) and `src/systems/viewport.test.js`
- Modify: `src/scenes/GameScene.js:327` (camera setup), `src/scenes/MapEditorScene.js:31`
- Modify: `src/ui/loadingBar.js` (`attachLoadingBar`) and `src/ui/loadingBar.test.js`
- Modify: `src/scenes/gameSceneHarness.js:67` (camera mock gains `setZoom`, `centerOn`)

**Interfaces:**
- Consumes: `getRenderScale()`, `setRenderScale(k)` (Task 1).
- Produces: `applyWorldCamera(camera, { x, y, width, height }: logical px, k: number): void` — calls `camera.setViewport(x*k, y*k, width*k, height*k)`, `camera.setZoom(k)`, `camera.centerOn(width/2, height/2)`, so world (0,0) is the viewport's top-left (Phaser zooms about the camera centre).

- [ ] **Step 1: Write failing tests.**
  - `worldCamera.test.js` (mock camera with `vi.fn()` methods): `k=1 matches today's viewport` (setViewport called with `RAIL_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT`, setZoom(1), centerOn(WORLD_WIDTH/2, WORLD_HEIGHT/2)); `k=2 doubles the viewport and zooms 2`.
  - `viewport.test.js`, with a fake `scale = { canvasBounds: {x, y}, displayScale: {x: ds*k, y: ds*k} }` and `setRenderScale(k)`:
    - `worldToPageCss at k=2 equals k=1 for the same CSS layout`: the same world point maps to the same page px when only k (and displayScale ×k) differ.
    - `round-trips at k=2 under any displayScale`: for ds in `[0.5, 0.97, 1.6]`, `pageToWorld(worldToPageCss(p))` ≈ p (toBeCloseTo).
  - `loadingBar.test.js`: at `setRenderScale(2)` with `scene.scale = { width: CANVAS_WIDTH*2, height: WORLD_HEIGHT*2 }`, the bar is laid out in logical px (label x = `CANVAS_WIDTH/2`) and `applyWorldCamera` effect is visible on the scene's mock camera (setZoom(2)).

- [ ] **Step 2: Run** the three test files — Expected: FAIL (missing module; k=2 mapping off by ×2; bar at `CANVAS_WIDTH`).

- [ ] **Step 3: Implement.**
  - `worldCamera.js` as in Interfaces.
  - `viewport.js`: `worldToPageCss` → `gameToPageCss(scale, (worldX + RAIL_WIDTH) * k, worldY * k)`; `pageToWorld` → `{ x: g.x / k - RAIL_WIDTH, y: g.y / k }`, `k = getRenderScale()`. `gameToPageCss`/`pageToGame` stay pure game px. Update the comment ("scroll 0, zoom 1") to say the camera is zoomed k.
  - GameScene and MapEditorScene: replace the `setViewport(RAIL_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT)` line with `applyWorldCamera(this.cameras.main, { x: RAIL_WIDTH, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, getRenderScale())`.
  - `attachLoadingBar`: `applyWorldCamera(scene.cameras.main, { x: 0, y: 0, width: CANVAS_WIDTH, height: WORLD_HEIGHT }, getRenderScale())` and lay out from `CANVAS_WIDTH`/`WORLD_HEIGHT` instead of `scene.scale`.
  - `gameSceneHarness.js`: add `setZoom: vi.fn(), centerOn: vi.fn()` to the camera mock.

- [ ] **Step 4: Run** the three files, then `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src/systems/worldCamera.js src/systems/worldCamera.test.js src/systems/viewport.js src/systems/viewport.test.js src/scenes/GameScene.js src/scenes/MapEditorScene.js src/ui/loadingBar.js src/ui/loadingBar.test.js src/scenes/gameSceneHarness.js
git commit -m "feat(render): world cameras zoom by the render scale; DOM mapping follows (4.1a)"
```

---

### Task 3: Canvas text at render resolution

**Files:**
- Create: `src/ui/hiDpiText.js`, `src/ui/hiDpiText.test.js`
- Modify the nine call sites: `src/ui/loadingBar.js:20`, `src/scenes/MapEditorScene.js:41,130`, `src/scenes/GameScene.js:2273,2274`, `src/systems/DamageNumberOverlay.js:53,70`, `src/systems/CoinFx.js:32`, `src/systems/TowerTierLook.js:115`, `src/entities/Tower.js:41`
- Modify: `src/systems/DamageNumberOverlay.test.js` (or the nearest existing test for it)

**Interfaces:**
- Consumes: `getRenderScale()` (Task 1).
- Produces: `hiDpiStyle(style: object): object` → `{ ...style, resolution: getRenderScale() }` (reads k at call time; does not mutate `style`), and `addText(scene, x, y, text, style)` → `scene.add.text(x, y, text, hiDpiStyle(style))`.

- [ ] **Step 1: Write failing tests.**
  - `hiDpiText.test.js`: `hiDpiStyle adds the current render scale` (k=2 → `resolution: 2`, original object unchanged); `addText passes the hi-DPI style` (mock `scene.add.text`).
  - Guard `no raw add.text outside the helper`: read every non-test `.js` under `src/` (`fs.readFileSync` over a recursive listing, as `src/ui/railCss.test.js` reads source) and assert none except `src/ui/hiDpiText.js` contains `.add.text(`. Assert the scan found > 50 files (vacuity guard).
  - DamageNumberOverlay: `restyled numbers keep render resolution` — at `setRenderScale(2)`, the style passed to `setStyle` has `resolution: 2`.

- [ ] **Step 2: Run** those tests — Expected: FAIL (module missing; guard lists the nine sites; setStyle style lacks resolution).

- [ ] **Step 3: Implement** `hiDpiText.js`; convert each `.add.text(` site to `addText(scene, …)` and the `txt.setStyle(style)` site to `txt.setStyle(hiDpiStyle(style))`.

- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src/ui/hiDpiText.js src/ui/hiDpiText.test.js src/ui/loadingBar.js src/scenes/MapEditorScene.js src/scenes/GameScene.js src/systems/DamageNumberOverlay.js src/systems/DamageNumberOverlay.test.js src/systems/CoinFx.js src/systems/TowerTierLook.js src/entities/Tower.js
git commit -m "feat(render): canvas text rasterises at the render scale (4.1a)"
```

---

### Task 4: Road at render resolution, capture hooks, 2x desktop preset

**Files:**
- Modify: `src/systems/RoadRenderer.js` (`bakeRoad`) and `src/systems/RoadRenderer.test.js`
- Modify: `src/scenes/GameScene.js` `_setupRoad` (~2277–2281)
- Modify: `src/scenes/GameScene.js:163` (`window.__capture` inside module-level `applyDebugCapture(scene)`); test alongside the existing `__capture` assertions in `src/scenes/GameScene.tierLooks.test.js`
- Modify: `scripts/captureDevices.mjs` (`DEVICES`)

**Interfaces:**
- Consumes: `getRenderScale()` (Task 1).
- Produces: `bakeRoad(scene, { key, waypoints, styleKey, seed, width, height, resolution = 1 })` — creates the canvas at `width*resolution × height*resolution` and calls `ctx.scale(resolution, resolution)` before `paintRoad`; `__capture.renderScale: number`; preset `desktop1440x2: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }`.

- [ ] **Step 1: Write failing tests.**
  - `RoadRenderer.test.js` `texture key and size follow resolution`: with a mock scene whose `textures.createCanvas` records `(key, w, h)` and returns a texture whose `getContext()` is the existing fake ctx extended with a `scale` spy: `resolution: 2` → created `WORLD_WIDTH*2 × WORLD_HEIGHT*2` and `ctx.scale(2, 2)` called before the first stroke; default → 1x and `scale` not called (or called with 1).
  - `GameScene.tierLooks.test.js` (it already drives `applyDebugCapture` through the harness): `__capture.renderScale` equals `getRenderScale()` (set it to 2 in the test).

- [ ] **Step 2: Run** both files — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `bakeRoad` as in Interfaces.
  - `_setupRoad`: `const k = getRenderScale()`; key `` `road_map_${map.id}@${k}` ``; pass `resolution: k`; the road image gets `.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)`.
  - `__capture`: add `renderScale: getRenderScale()`.
  - `captureDevices.mjs`: add `desktop1440x2` next to `desktop1440`. Do not change any existing preset.

- [ ] **Step 4: Run** `npx vitest run` and `npm run build` — Expected: all pass, build exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/systems/RoadRenderer.js src/systems/RoadRenderer.test.js src/scenes/GameScene.js src/scenes/GameScene.tierLooks.test.js scripts/captureDevices.mjs
git commit -m "feat(render): road bakes at the render scale; capture exposes it (4.1a)"
```

---

## After the tasks (controller, not a subagent)

Final whole-branch review (Opus), then live verification on the capture build per the spec's "Verification" and "Builder-check resolutions" sections, with host load < 6:

1. Backing store: `desktop1440x2` and `iphone` → 2976×1440; `desktop1440` (DPR 1) → 1488×720; `?res=1` on `desktop1440x2` → 1488×720.
2. Real-input checks at k = 2 (mouse on `desktop1440x2`, touch on `iphone`): build on a pad, radial ring, long-press peek, barracks Move/Rally, hero aim, coin-fly lands on the gold counter, peek card beside its tower, pointer leaving the map.
3. Frozen-frame side-by-side crops (`?res=1` vs `?res=2`, same scene state): towers, enemies, road, damage numbers — sharper at 2, same silhouette bounds.
4. k = 1 frame vs base build `70fd45e`: identical (or within the capture's tolerance).
5. `capture --screens` on desktop1440 and iphone, and the device matrix — green.
6. Frame time: busiest-frame p95 on `iphone`, `?res=1` vs `?res=2`; pass if k = 2 ≤ 1.25 × k = 1. If it fails, set `RENDER_SCALE.max = 1` and report.
7. 0 page errors throughout.
