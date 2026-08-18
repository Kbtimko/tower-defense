# Responsive Canvas Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game scale cleanly to any browser window size by switching Phaser to `Scale.FIT` at a fixed 1280×720 design resolution, with DOM overlays converted from game-space to CSS pixels.

**Architecture:** `Scale.FIT` uniformly scales the whole canvas to fit the `#game` area (letterbox bars on off-aspect windows). All canvas-drawn content (path, towers, enemies, hero, damage numbers) keeps a constant internal coordinate space, so nothing needs reflowing. A small pure helper, `gameToPageCss`, converts game coords to page CSS pixels for the only non-canvas elements that use game coords: the tower panel and the inspect panels.

**Tech Stack:** JavaScript (ES modules), Phaser 3.90, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-19-responsive-canvas-design.md`

---

### Task 1: `gameToPageCss` pure coordinate helper

**Files:**
- Create: `src/systems/viewport.js`
- Test: `src/systems/viewport.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/viewport.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { gameToPageCss } from './viewport.js';

describe('gameToPageCss', () => {
  it('applies displayScale and canvas offset (identity transform)', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1, y: 1 } };
    expect(gameToPageCss(scale, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  it('scales up when the display is larger than the design resolution', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1.5, y: 1.5 } };
    expect(gameToPageCss(scale, 100, 100)).toEqual({ x: 150, y: 150 });
  });

  it('scales down when the display is smaller', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 0.5, y: 0.5 } };
    expect(gameToPageCss(scale, 200, 200)).toEqual({ x: 100, y: 100 });
  });

  it('adds the letterbox offset from canvasBounds', () => {
    const scale = { canvasBounds: { x: 215, y: 30 }, displayScale: { x: 1, y: 1 } };
    expect(gameToPageCss(scale, 100, 50)).toEqual({ x: 315, y: 80 });
  });

  it('returns coords unchanged when the scale transform is unavailable', () => {
    expect(gameToPageCss({}, 200, 300)).toEqual({ x: 200, y: 300 });
    expect(gameToPageCss(undefined, 200, 300)).toEqual({ x: 200, y: 300 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/systems/viewport.test.js`
Expected: FAIL — `gameToPageCss` is not defined / module not found.

- [ ] **Step 3: Implement the helper**

Create `src/systems/viewport.js`:

```javascript
// Converts a game-space coordinate to page-absolute CSS pixels, accounting for
// the Phaser ScaleManager's FIT scale factor (displayScale) and letterbox offset
// (canvasBounds). When the transform is unavailable (e.g. tests / non-browser),
// returns the coordinate unchanged (identity), which is correct for an unscaled
// 1:1 canvas.
export function gameToPageCss(scale, gameX, gameY) {
  const bounds = scale?.canvasBounds;
  const ds = scale?.displayScale;
  if (!bounds || !ds) return { x: gameX, y: gameY };
  return { x: bounds.x + gameX * ds.x, y: bounds.y + gameY * ds.y };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/systems/viewport.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/viewport.js src/systems/viewport.test.js
git commit -m "feat(viewport): pure gameToPageCss helper for FIT-scaled DOM overlays (backlog #3)"
```

---

### Task 2: Switch Phaser to `Scale.FIT` + fix canvas CSS

**Files:**
- Modify: `src/main.js`
- Modify: `index.html`

This task is configuration; it is verified by a clean build here and by browser
testing in the verify step (no unit test).

- [ ] **Step 1: Update the Phaser scale config**

In `src/main.js`, replace the current config block:

```javascript
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NONE,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};
```

with:

```javascript
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};
```

- [ ] **Step 2: Fix the canvas CSS so FIT can letterbox**

In `index.html`, find these two rules:

```css
    #game { flex: 1; position: relative; min-height: 0; overflow: hidden; }
    #game canvas { display: block; width: 100% !important; height: 100% !important; }
```

Replace them with:

```css
    #game { flex: 1; position: relative; min-height: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; }
    #game canvas { display: block; }
```

(The `width/height: 100% !important` override force-stretched the canvas and would
defeat FIT letterboxing; removing it lets Phaser size the canvas. `#game` becomes a
flex container that centers the letterboxed canvas. The absolutely-positioned
`#tower-panel` child is unaffected — `#game` keeps `position: relative`.)

- [ ] **Step 3: Verify the production build is clean**

Run: `npm run build`
Expected: build completes with no errors (the existing chunk-size warning is pre-existing and fine).

- [ ] **Step 4: Commit**

```bash
git add src/main.js index.html
git commit -m "feat(scale): FIT scaling at fixed 1280x720 design resolution (backlog #3)"
```

---

### Task 3: Convert tower-panel and inspect-panel DOM positions to CSS pixels

**Files:**
- Modify: `src/scenes/GameScene.js` (import + pointer call site ~line 874)
- Modify: `src/scenes/InspectController.js` (import + two `_positionPanel` call sites ~lines 253, 282)
- Test: `src/scenes/InspectController.test.js`

- [ ] **Step 1: Write a failing test for scaled inspect positioning**

In `src/scenes/InspectController.test.js`, add this test inside the
`describe('InspectController — panel positioning', ...)` block (it pins an enemy on a
scene whose ScaleManager reports a 2× display scale, so the panel position must be the
scaled game coords):

```javascript
  it('pin converts target game coords through the scale transform', () => {
    const scene = { enemies: [], hero: null,
      scale: { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 2, y: 2 } } };
    const enemy = makeEnemy({ x: 200, y: 300 });
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'enemy', target: enemy });
    const panel = document.getElementById('enemy-inspector');
    // game (200,300) -> page (400,600); anchor adds +24 to left
    expect(panel.style.left).toBe('424px');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/InspectController.test.js`
Expected: FAIL on the new test — without conversion, `left` is `224px` (200+24), not `424px`.

- [ ] **Step 3: Wire `gameToPageCss` into InspectController**

In `src/scenes/InspectController.js`, add the import at the top with the other imports:

```javascript
import { gameToPageCss } from '../systems/viewport.js';
```

Find the peek-panel positioning call (around line 253):

```javascript
    this._positionPanel(peek, mx, my);
```

replace with:

```javascript
    const peekCss = gameToPageCss(this.scene?.scale, mx, my);
    this._positionPanel(peek, peekCss.x, peekCss.y);
```

Find the pinned-panel positioning method (around line 278-283):

```javascript
  _positionPanelForTarget(spec) {
    const el = spec.kind === 'enemy'
      ? document.getElementById('enemy-inspector')
      : document.getElementById('hero-inspector');
    this._positionPanel(el, spec.target.x, spec.target.y);
  }
```

replace its last line with:

```javascript
  _positionPanelForTarget(spec) {
    const el = spec.kind === 'enemy'
      ? document.getElementById('enemy-inspector')
      : document.getElementById('hero-inspector');
    const css = gameToPageCss(this.scene?.scale, spec.target.x, spec.target.y);
    this._positionPanel(el, css.x, css.y);
  }
```

(`_positionPanel` is unchanged — it keeps its existing `window`-space clamping. The
existing `_positionPanel` unit test and the original `pin` test still pass because
their mock scene has no `scale`, so `gameToPageCss` returns the coords unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/InspectController.test.js`
Expected: PASS (all tests, including the new scaled-pin test and the unchanged `224px` tests).

- [ ] **Step 5: Wire `gameToPageCss` into the GameScene tower panel**

In `src/scenes/GameScene.js`, add the import near the other system imports (e.g. after the `applyFireRateMod` import line):

```javascript
import { gameToPageCss } from '../systems/viewport.js';
```

Find the pointer-handler call that opens the tower panel (around line 874):

```javascript
        this._openTowerPanel(tower, mx, my);
```

replace with:

```javascript
        const panelCss = gameToPageCss(this.scale, mx, my);
        const gRect = document.getElementById('game').getBoundingClientRect();
        this._openTowerPanel(tower, panelCss.x - gRect.left, panelCss.y - gRect.top);
```

(`mx,my` are game-space pointer coords. `gameToPageCss` maps them to page-absolute CSS;
subtracting the `#game` rect origin yields `#game`-relative CSS px, which is what
`_openTowerPanel`'s body expects — it positions `#tower-panel`, an absolutely-positioned
child of `#game`, and clamps against `gRect.width/height`. The reopen call site at
line ~1098 already passes CSS px parsed from `panel.style`, so it is unchanged.)

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all tests green (existing suite + the new viewport and inspect tests).

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/InspectController.js src/scenes/InspectController.test.js
git commit -m "feat(scenes): convert tower/inspect panel positions to CSS px under FIT (backlog #3)"
```

---

## Post-implementation (verify step, handled outside the task loop)

- **Build:** `npm run build` — clean.
- **Browser:** run the dev server; load a level, then resize the window wider, taller, and smaller. Confirm:
  - the world stays aligned and centered with letterbox bars (no clipping, no empty world margins);
  - path, slots, towers, enemies render in correct relative positions;
  - clicking a tower opens its panel aligned to that tower;
  - tower placement still snaps to slots under the pointer;
  - Menu and Map Select remain usable.
