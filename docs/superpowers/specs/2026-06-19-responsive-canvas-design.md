# Responsive Canvas Scaling — Design (backlog #3)

**Date:** 2026-06-19
**Status:** Approved
**Backlog item:** #3 — Resize game canvas as the browser window resizes

## Problem

The Phaser config uses `Scale.RESIZE` with `width/height = window.innerWidth/Height`,
but **no scene listens for resize**, and every world element is baked into absolute
pixels exactly once in `create()` from the create-time `this.scale` dimensions:

- `PathManager` scales normalized waypoints/slots by canvas size → absolute pixels.
- The background image is placed at `(width/2, height/2)` with `setDisplaySize(width, height)`.
- Tower slots, hero spawn, blockers — all absolute pixels from create-time dimensions.

So when the window resizes, `Scale.RESIZE` changes the canvas/camera size but the
baked world does not reflow: content misaligns, clips, or leaves empty margins.

## Goal

On any window resize, the game remains fully visible, correctly laid out, and
centered — with no clipping or misalignment. Maps are authored 16:9.

## Approach: `Scale.FIT` with a fixed 16:9 design resolution

Switch from `Scale.RESIZE` to `Scale.FIT` with a fixed internal resolution
**1280×720** (16:9, matching the backdrops). Phaser then uniformly scales the whole
game to fit the `#game` area on every resize, centered with letterbox bars on
off-aspect windows.

Because the internal coordinate space is now constant, **all canvas-drawn content
stays aligned with zero reflow logic** — paths, slots, background, towers, enemies,
hero, projectiles, damage numbers, and the ambient layer all scale together
automatically. No live-entity rescaling, no path/slot recomputation.

The only elements that need attention are **DOM overlays positioned from pointer or
entity game-space coordinates**, which no longer equal CSS pixels once the canvas is
scaled/letterboxed.

## Components / changes

### 1. `src/main.js` — scale config
- Add module consts `DESIGN_WIDTH = 1280`, `DESIGN_HEIGHT = 720`.
- Set `width: DESIGN_WIDTH`, `height: DESIGN_HEIGHT`.
- `scale.mode: Phaser.Scale.FIT`, `scale.autoCenter: Phaser.Scale.CENTER_BOTH`.

Scenes already read `this.scale.{width,height}` at create, so they consistently get
1280×720 — no scene changes needed for layout.

### 2. `index.html` — CSS
- Remove the `#game canvas { width:100% !important; height:100% !important }` rule
  (it force-stretches the canvas and would defeat FIT letterboxing).
- Make `#game` center its child: add `display:flex; align-items:center; justify-content:center`
  to the existing `#game` rule (keeps `flex:1; position:relative; overflow:hidden`).

Top `#hud` and bottom `#bottom-bar` live outside `#game`, so they keep spanning the
full window width; only the game world letterboxes in the middle area.

### 3. DOM-overlay coordinate conversion
Add a small pure helper module `src/systems/viewport.js`:

```js
// Converts a game-space coordinate to page-absolute CSS pixels, accounting for
// the ScaleManager's FIT scale factor and letterbox offset.
export function gameToPageCss(scale, gameX, gameY) {
  const b = scale.canvasBounds;          // page-relative canvas rect (Phaser.Geom.Rectangle)
  const ds = scale.displayScale;         // { x, y } game→display scale factors
  return { x: b.x + gameX * ds.x, y: b.y + gameY * ds.y };
}
```

Apply it at the DOM-positioning sites that currently use game-space coords:

- **Tower panel** — `GameScene._openTowerPanel(tower, mx, my)`. It is called two ways:
  from the pointer handler (line ~874) with **game coords** (`pointer.x/y`), and on
  reopen (line ~1098) with already-correct **CSS px** (`parseInt(panel.style.left/top)`).
  Fix at the pointer call site: convert the game coords to `#game`-relative CSS px
  before passing, so `_openTowerPanel` always receives CSS px (its body positions the
  panel, an absolutely-positioned child of `#game`). `gameToPageCss` returns page-absolute
  px; subtract the `#game` rect origin.
  *(Note: `UIScene._onPanelOpen` also positions `#tower-panel` but is **dead code** — it
  listens for `tower:panel-open`, which nothing emits. Do not edit it.)*
- **Inspect panels** — `InspectController` calls `_positionPanel` with game coords at two
  sites: the peek panel (line ~253, pointer `mx,my`) and the pinned panel (line ~282,
  entity `spec.target.x/y`). Convert with `gameToPageCss(this.scene.scale, x, y)` at both
  call sites; `_positionPanel` keeps its existing `window`-space clamping unchanged
  (it already has `this.scene`).

Hit-testing and gameplay logic (`getNearestSlot`, `isOnPath`, reposition snapping)
continue to use game coords unchanged — only DOM placement is converted.

## Out of scope
- Live-entity reflow (unnecessary with FIT).
- MapSelect / Menu DOM UI (already CSS-responsive via flexbox).
- Tower/enemy/hero rendering and art.
- `MapEditorScene` (dev-only) gets the fixed res automatically; no extra work.

## Testing

- **Unit:** pure `gameToPageCss` — verify scale-up (display larger than design),
  scale-down, and non-zero letterbox offset all map correctly.
- **Browser:** load a level; resize the window wider, taller, and smaller. Confirm:
  - the world stays aligned and centered with letterbox bars (no clipping/empty world margins);
  - path, slots, towers, enemies render in correct relative positions;
  - clicking a tower opens its panel aligned to that tower;
  - tower placement still snaps to slots under the pointer.
  - Menu and Map Select remain usable (DOM-driven).

## Risks / notes
- The `gameToPageCss` conversion is the only non-trivial piece; it is pure and unit-tested.
- Phaser 3.90 exposes `scale.canvasBounds` and `scale.displayScale`; both update on resize.
