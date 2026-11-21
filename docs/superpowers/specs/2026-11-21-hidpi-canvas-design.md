# Roadmap 4.1a: render the canvas at screen resolution

Status: design · 2026-11-21 · branch `visual/4.1-2x-rebake` (worktree `.claude/worktrees/rebake-41`)

## Intent

Roadmap 4.1 asks for sprite sheets re-baked at 2x cell size "so on-screen size is
unchanged but crisp on retina/phones", accepted by "side-by-side capture sharper at
2x DPR".

Measured on 2026-11-21 (Chromium, `vite` dev server), the game never draws at retina
resolution. Phaser draws into a fixed `CANVAS_WIDTH x WORLD_HEIGHT` (1488 x 720 with
fine-pointer rails) backing store and the browser stretches it:

| Viewport | Canvas backing | CSS width | Device px across |
|---|---|---|---|
| 1440 x 900 @2x | 1488 x 720 | 1440 | 2880 (≈1.9x stretch) |
| 844 x 390 @3x (phone landscape) | 1488 x 720 | 806 | 2418 (≈1.6x stretch) |

A 128px sheet would be shrunk into the same ~38 canvas px a 64px sheet is today, so a
re-bake alone is close to invisible and the roadmap's acceptance test would fail.

User decision (2026-11-21): do both, as two PRs, canvas first.

- **4.1a (this spec):** render the canvas at a higher resolution on high-DPI screens.
- **4.1b (separate spec, after 4.1a merges):** the 2x re-bake as the roadmap words it,
  sized by what 4.1a measures.

## Goals

1. On a screen whose fitted canvas covers clearly more device pixels than 1488, the
   canvas backing store is `k` times larger (k = 2), and the world renders at that
   resolution: sprites, Graphics, road, text and backdrop all get the extra pixels.
2. Nothing changes size, position or behaviour. World coordinates, game logic,
   `src/sim/`, balance, the DOM HUD and its layout are untouched. `k` is a rendering
   detail.
3. 1x screens (k = 1) render byte-for-byte as today.
4. A capture-build override forces k = 1 or k = 2, so every check can A/B the same
   machine.

## Non-goals

- The sprite re-bake (4.1b).
- Re-generating any art, or any Draw Things use.
- Changing the DOM HUD, its rail metrics or `layout.js` constants.
- k = 3 for 3x phones (fill-rate cost; see Constraints). The cap is a tunable.
- Changing k on resize or rotation. k is picked once at boot, as the backdrop variant
  already is (`pickBackgroundVariant`); a later resize keeps it.
- A player-facing Settings toggle. Not asked for; the tunable cap covers performance
  if 2x proves too costly.

## Anti-goals (a failure even if it "works")

- Any tap, long-press, drag, peek card, radial menu, coin-fly target or tooltip lands
  off its target at k = 2. Input correctness beats sharpness.
- Text (damage numbers, tower icons, tier pips, loading label) gets *blurrier* at
  k = 2 because its texture stayed 1x under a 2x camera.
- Frame rate on the phone emulation drops noticeably at k = 2 with no fallback.
- A capture or matrix run that passes at k = 1 fails at k = 2 for a layout reason.

## Constraints

- Phaser 3.90. The game config has no supported `resolution` option (removed in the
  3.5x line), so the only supported route is a larger game size plus camera zoom.
- `Scale.FIT` stays. The ScaleManager's `displayScale` is game px per CSS px, so at
  k = 2 it doubles; everything that divides by it must be checked.
- The DOM HUD lays itself out in *logical* game px (`hudLayer.js` scales by
  `canvasRect.width / CANVAS_WIDTH` and sets `--canvas-w` from the constant). It must
  keep using the logical constants, not `game.canvas.width`.
- Tunables live in `src/data/`; the k decision is a pure, unit-tested function.
- Memory notes that apply: Phaser scale/camera gotchas (stale canvas after
  orientationchange; `pointer.camera` undefined off the viewport → stale worldX); judge
  visual work with frozen-frame probes; captures gate on host load < 6.
- Fill cost: k = 2 is 4x the pixels per frame (2976 x 1440 ≈ 4.3 MP). Measured, not
  assumed, on the phone emulation.

## What the change touches today (recon, 2026-11-21)

| Area | Today | At k = 2 |
|---|---|---|
| `src/main.js` game config | `width: CANVAS_WIDTH, height: WORLD_HEIGHT` | multiply by k |
| `GameScene` main camera (`GameScene.js:327`) | `setViewport(RAIL_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT)`, zoom 1, scroll 0 | viewport x/y/w/h times k, zoom k, scrolled so world (0,0) is the viewport's top-left |
| `MapEditorScene` camera (`:31`) | same viewport | same treatment |
| `BootScene` loading bar (`src/ui/loadingBar.js`) | positions from `scene.scale` width/height in game px | zoom its camera by k (or lay out in logical px) so it looks the same |
| `src/systems/viewport.js` | `worldToPageCss` / `pageToWorld` assume game px == logical px (`worldX + RAIL_WIDTH`) | convert logical → game px with k before dividing by `displayScale` (and back). The only module that does this mapping; callers: `InspectController` (3), `CoinFx` (1) |
| `InputController._cssDistance` | `(pointer.x - from.x) / displayScale` | already correct (both in game px) |
| Input world hits | `pointer.worldX/worldY`, `pointer.camera` | already correct under camera zoom |
| Text objects (9: `GameScene` IN/OUT, `DamageNumberOverlay`, `CoinFx`, `TowerTierLook` pips, `Tower` icon, `loadingBar`, `MapEditorScene` x2) | default resolution 1 | text resolution k, so glyphs rasterise at device density |
| Baked road (`RoadRenderer.bakeRoad`, a `WORLD_WIDTH x WORLD_HEIGHT` canvas) | 1x texture, drawn at world size | bake at k x size and draw at world size, so the road is crisp (it is the largest drawn surface after the backdrop) |
| Backdrop | `pickBackgroundVariant` already picks a variant by device px | unchanged; it finally gets device pixels to fill |
| Other generated canvases (vignette, contact shadow, fx glow textures, soldier tier recolours) | 1x | unchanged: soft gradients or sprite-derived; no visible gain worth the risk |
| `TitleScene`, `MapSelectScene`, `UIScene` | draw nothing on the canvas (DOM) | unchanged |
| `scripts/capture.mjs` world→page | CSS math from `WORLD_*` constants and the canvas box | unchanged (logical) |

## Approaches considered

1. **Larger game size + camera zoom by k (chosen).** Supported Phaser API, contained:
   one camera per scene, one mapping module, text resolution, one baked texture.
   World coordinates never change, so logic, sim, saves and the HUD are untouched.
2. **Patch the renderer to a hi-res backing store at the same game size.** Phaser 3.90
   has no supported hook; it means overriding WebGL/Canvas renderer internals and the
   ScaleManager's sizing. Fragile across Phaser updates. Rejected.
3. **Upgrade to Phaser 4.** Far larger than this item; unknown migration cost. Rejected.
4. **CSS `image-rendering` tweaks.** Adds no pixels; only changes how the stretch
   looks. Rejected.

## Design decisions (Claude's calls, user said "move forward")

- **k rule.** Pure `renderScaleFor({ cssWidth, cssHeight, dpr })` in
  `src/systems/renderScale.js`, tunables in `src/data/renderScale.js`:
  - fitted canvas CSS width = `min(cssWidth / CANVAS_WIDTH, cssHeight / WORLD_HEIGHT) *
    CANVAS_WIDTH`;
  - device px = that × `dpr`;
  - k = 2 if device px ≥ `RENDER_SCALE.threshold` (1.25) × `CANVAS_WIDTH`, else 1;
  - capped at `RENDER_SCALE.max` (2). Integer k only: non-integer zoom shimmers on
    sprite edges and misaligns 1px Graphics strokes.
  - Measured examples: 1440 x 900 @2x → 2880 ≥ 1860 → k = 2. 1440 x 900 @1x → 1440 → k = 1.
    844 x 390 @3x → 2418 → k = 2. 390 x 844 portrait phone @3x: computed the same way.
- **When.** Computed once in `main.js` before `new Phaser.Game`, from `window.innerWidth`,
  `innerHeight` and `devicePixelRatio`, and exported (a module-level getter, set once)
  so `viewport.js`, scenes and `RoadRenderer` read the same value. (No registry copy: nothing
  would read it; one source of truth.)
- **Override.** Capture build and dev only (same gate as `?debug=`): `?res=1` or `?res=2`
  forces k. Production ignores it.
- **Camera recipe.** One shared helper (e.g. `applyRenderScale(camera, { x, y, w, h })`)
  that sets the viewport in game px (`x*k, y*k, w*k, h*k`), `setZoom(k)`, and scrolls so
  world (0,0) maps to the viewport's top-left. GameScene, MapEditorScene and the Boot
  loading bar use it, so there is one recipe to get right. Camera shake keeps its
  current intensity (it is a fraction of the viewport, so it scales on its own).
- **Text.** One helper or a shared default so every `add.text` gets `resolution: k`
  (Phaser's Text style option). New text objects added later pick it up by using the
  helper.
- **Road.** `bakeRoad` takes the render scale, creates the canvas at `width*k x height*k`,
  `ctx.scale(k, k)` before painting, and GameScene keeps drawing it with
  `setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)`. The texture key includes k so a k = 1
  and k = 2 bake can never be confused.
- **`__capture`.** Exposes `renderScale` so harness runs can assert which k they ran at.

## Builder-check resolutions (Claude's calls)

1. **Frame budget and fallback.** k = 2 passes when the busiest-frame p95 frame time on
   the phone emulation (`iphone` preset, mid-wave, host load < 6) is no more than 25%
   above the same run at `?res=1`. If it fails, the fallback is lowering
   `RENDER_SCALE.max` to 1 (no device-class gating, so `renderScaleFor` keeps its
   signature). Headless emulation does not model a phone GPU, so a real-phone check is
   added to the user's pending G3 list rather than gating this PR.
2. **Harness default.** Runs with no `?res=` follow the natural rule. The desktop
   presets run at DPR 1 (natural k = 1, no change). `phone844`, `phone932`, `iphone`,
   `pixel` and `ipad` run at DPR 2–3 (natural k = 2), so the existing phone gates
   exercise what players get and must stay green. The A/B checks pass `?res=1` and
   `?res=2` explicitly. Add a `desktop1440x2` preset (1440 x 900, DPR 2) to
   `scripts/captureDevices.mjs` for the side-by-side. The captures are audits, not
   pixel goldens, so no baselines need regenerating.
3. **Which size feeds k.** The `#game` element's `getBoundingClientRect()` (it exists in
   the DOM before `new Phaser.Game`), falling back to `window.innerWidth/innerHeight` if
   it measures 0. `#game` is 100% of the page today, so the two agree. Portrait phones
   come out at k = 1 (390 CSS px × 3 ≈ 1170 device px, already under the 1488 backing
   store): that is intended, because there is no detail to gain.

## Verification (definition of done)

- Unit tests (written first, proven to fail on the old code):
  - `renderScaleFor` across the examples above, the threshold boundary (exactly
    1.25 x CANVAS_WIDTH, one pixel under), dpr 1, missing/zero dpr (→ 1), and the cap.
  - `viewport.js` round-trips (`worldToPageCss` then `pageToWorld` returns the point) at
    k = 1 and k = 2, with a fake `scale` whose `displayScale` is k times the CSS ratio.
  - The camera helper sets viewport, zoom and scroll so world (0,0) and
    (WORLD_WIDTH, WORLD_HEIGHT) land on the viewport corners.
  - `bakeRoad` makes a `k`-sized texture.
- Full suite green; `npm run build` green.
- Live, capture build, real mouse/touch, A/B with `?res=1` vs `?res=2` on the same host:
  - canvas backing store is 2976 x 1440 at k = 2 on desktop1440 @2x and the phone
    emulation; 1488 x 720 at k = 1 and on a 1x viewport with no override;
  - every input path still lands: build a tower on a pad, open and use the radial ring,
    long-press peek on touch, Move/Rally a barracks, hero aim, coin-fly lands on the gold
    counter, tower peek card sits next to its tower;
  - frozen-frame side-by-side crops (towers, enemies, road, damage numbers) at 2x DPR:
    k = 2 visibly sharper, same size and position (overlay diff of silhouettes);
  - k = 1 frames match the base build pixel-for-pixel (or within the capture's existing
    tolerance) — goal 3;
  - capture `--screens` and the device matrix pass at k = 2 as they do at k = 1;
  - frame-time sample (mid-wave, busiest frame run) on the phone emulation at k = 1 vs
    k = 2, reported with host load; 0 page errors.

## Left to the builder

- Where exactly the k getter lives (a small `src/systems/renderScale.js` export is the
  expectation) and how tests inject it.
- Whether the Boot loading bar uses the camera helper or lays out in logical px; either
  is fine if it looks identical at k = 1 and k = 2.
- How the text-resolution default is applied (helper vs. per-call), as long as all nine
  call sites and future ones get it.
- Any further callers of `displayScale`, `canvasBounds` or `game.canvas.width` found
  during implementation get the same logical/game-px audit.
