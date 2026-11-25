# Map Editor Road Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The map editor shows the game's baked road, re-baked when an edit settles, with a cheap live line while a waypoint is dragged.

**Architecture:** One change to `src/scenes/MapEditorScene.js`. `_render()` decides between the baked road and the live `renderPath` line. A `_roadDirty` flag gates re-baking, and `pointerup` moves into a testable `_onPointerUp()`.

**Tech Stack:** Vanilla JS ES modules, Phaser 3.90, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-editor-road-preview-design.md`

## Global Constraints

- Texture key `road_editor@${k}` with `k = getRenderScale()`; `bakeRoad(this, { key, resolution: k, waypoints: <world-px {x,y} array>, styleKey: map.pathRenderStyle, seed: map.blockerSeed, width: WORLD_WIDTH, height: WORLD_HEIGHT })`.
- Before a re-bake, `this.textures.remove(key)` if `this.textures.exists(key)`.
- One road image at `ROAD_DEPTH` (from `src/data/roads.js`), created once with `this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, key).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(ROAD_DEPTH)`, then `setTexture(key)` after each later bake.
- Procedural vs legacy is decided by `roadRendererFor(map)` (`src/data/roads.js`).
- Never bake from a `pointermove`. Slot drags never re-bake.
- No change to `bakeRoad`, `GameScene` or map data.

## Review Focus

- A slot drag or HUD-only `_render()` re-bakes (wasted full-canvas paint). Test 2 pins this.
- A waypoint drag leaves the stale baked road visible under the live line. Test 3 pins this.
- A re-bake without removing the old key silently keeps the OLD road (`bakeRoad` reuses keys). Test 4 pins this.
- Insert or delete waypoint never re-bakes. Test 6 pins this.

---

### Task 1: Baked road preview in the map editor

**Files:**
- Modify: `src/scenes/MapEditorScene.js`
- Test: `src/scenes/MapEditorScene.test.js` (add `describe('MapEditorScene road preview', …)`)

**Interfaces:**
- Consumes: `bakeRoad` (`src/systems/RoadRenderer.js`), `roadRendererFor` and `ROAD_DEPTH` (`src/data/roads.js`), `getRenderScale` (`src/systems/renderScale.js`), and the existing `renderPath` and `renderPlatforms`.
- Produces: `MapEditorScene.prototype._onPointerUp()`. The `pointerup` listener in `create()` becomes `this.input.on('pointerup', this._onPointerUp, this)`.

**Test harness.**
- Extend the file's `vi.mock` set: mock `../systems/RoadRenderer.js` (`bakeRoad: vi.fn((scene, o) => o.key)`), `../systems/PathRenderer.js` (`renderPath: vi.fn()`), `../systems/PlatformRenderer.js` (`renderPlatforms: vi.fn()`) and `../systems/renderScale.js` (`getRenderScale: () => 2`).
- Build the scene with `Object.create(MapEditorScene.prototype)` and these fakes:
  - `layer`, `handles` and `labelLayer` with chainable no-op methods;
  - `hud` with `setText`;
  - `textures: { exists: vi.fn(), remove: vi.fn() }`;
  - `add.image` returning a fake image with chainable `setDisplaySize`, `setDepth`, `setTexture` and `setVisible` spies that record `visible`.
- Stub `_label` as a no-op. Use `mapId: 0`, the map's own waypoints and slots, `W`/`H` from `layout.js`, and `_roadDirty: true`.
- Use `beforeEach` to clear the mocks.

- [ ] **Step 1: Write the failing tests**:
  1. `bakes the game's road on first render`: call `_render()`. Expect:
     - `bakeRoad` called once with `key: 'road_editor@2'`, `resolution: 2`, `styleKey: MAPS[0].pathRenderStyle`, `seed: MAPS[0].blockerSeed`, `width: WORLD_WIDTH`, `height: WORLD_HEIGHT`;
     - `waypoints[0]` equal to `{ x: MAPS[0].waypoints[0][0] * WORLD_WIDTH, y: MAPS[0].waypoints[0][1] * WORLD_HEIGHT }`;
     - `add.image` called once, and the image's `setDepth` called with `ROAD_DEPTH`;
     - `renderPath` not called.
  2. `does not re-bake when only the slots change`: call `_render()`, clear the mocks, set `drag = { kind: 'slot', index: 0 }`, call `_render()` again, then `_onPointerUp()`. Expect `bakeRoad` not called.
  3. `shows a live line and hides the baked road while a waypoint is dragged`: `_render()`, clear the mocks, set `drag = { kind: 'wp', index: 1 }` and `_roadDirty = true` (as the move handler would), `_render()`. Expect `renderPath` called once, `bakeRoad` not called, and the image's last `setVisible` call `false`.
  4. `re-bakes once when the waypoint drag ends`: as test 3, then `textures.exists` returns `true`, then `_onPointerUp()`. Expect:
     - `textures.remove` called with `'road_editor@2'` BEFORE `bakeRoad` (compare `mock.invocationCallOrder`);
     - `bakeRoad` called once and `setTexture('road_editor@2')` called;
     - the image's last `setVisible` call `true`;
     - `drag` is `null`.
  5. `pointermove on a waypoint marks the road dirty without baking`: call the extracted move logic. If the move handler stays inline, extract it to `_onPointerMove(pointer)`, and the listener becomes `this.input.on('pointermove', this._onPointerMove, this)`. Use `drag = { kind: 'wp', index: 1 }` and a pointer with `worldX: 300, worldY: 200`. Expect `_roadDirty === true`, `bakeRoad` not called, and `waypoints[1]` equal to `[300 / WORLD_WIDTH, 200 / WORLD_HEIGHT]`.
  6. `inserting or deleting a waypoint re-bakes`:
     - after a first `_render()` and a mock clear, call the real `_insertWaypointAt` at a point on the path. Use the midpoint of waypoints 0 and 1 in px. Expect `bakeRoad` called once.
     - then clear, and right-click-delete via `_onPointerDown` with `rightButtonDown: () => true`, `camera: {}`, and the pointer on waypoint 1's px position. Expect `bakeRoad` called once.
  7. `a legacy map keeps the renderPath look`: set `MAPS[0].roadRenderer = 'legacy'` (restore in `finally`), `_render()`. Expect `renderPath` called and `bakeRoad` not called.

- [ ] **Step 2: Run** `npx vitest run src/scenes/MapEditorScene.test.js`. Expected: tests 1-6 fail on the current code. Test 7 may pass, since it pins today's behaviour. Paste the raw output.

- [ ] **Step 3: Implement** in `MapEditorScene`:
  - `init` sets `this._roadDirty = true; this._roadImage = null;`;
  - `_render()` computes `live = this.drag?.kind === 'wp'` and `procedural = roadRendererFor(map) === 'procedural'`:
    - when `procedural && !live`, it calls `_showBakedRoad(wpPx, map)`. That method re-bakes only when `_roadDirty`, then shows the image;
    - otherwise it hides the image if one exists and calls `renderPath(this.layer, wpPx, map.pathRenderStyle)`;
  - waypoint insert and delete set `_roadDirty = true` before their `_render()`;
  - `_onPointerMove` sets `_roadDirty = true` when the drag kind is `'wp'`;
  - `_onPointerUp()` records whether the ending drag was `'wp'`, sets `drag = null`, and calls `_render()` only in that case.

- [ ] **Step 4: Run** the file, then the full suite with `npx vitest run`. Expected: all pass, exit 0. Never pipe through `tail` or `head`.

- [ ] **Step 5: Mutation checks.** Paste the raw failing output for each, then restore:
  - (a) bake on every `_render()`, ignoring `_roadDirty` → test 2 fails;
  - (b) skip `textures.remove` → test 4 fails;
  - (c) don't hide the image during a waypoint drag → test 3 fails;
  - (d) don't set `_roadDirty` on insert or delete → test 6 fails.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapEditorScene.js src/scenes/MapEditorScene.test.js
git commit -m "fix(editor): preview the game's baked road, re-baked when an edit settles (#39c)"
```
