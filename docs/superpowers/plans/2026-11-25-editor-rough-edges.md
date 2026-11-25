# Map Editor Rough Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the map editor's stale slot target, its three pointer edge cases, and its reach on production builds (backlog #88 a–e).

**Architecture:** Small edits to the `MapEditorScene` input handlers and HUD, plus one boot gate in `BootScene.create`. (f) is closed without code (see the spec).

**Tech Stack:** Vanilla JS ES modules, Phaser 3.90, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-editor-rough-edges-design.md`

## Global Constraints

- Slot target = `MAPS[this.mapId].towerSlots.length`. The HUD line format is unchanged: `slots: <n> / <target> OK|MISMATCH`.
- `_onPointerDown` returns immediately while `this.drag` is set, before the rail guard and the hit test.
- `_onPointerMove` gets world coordinates from `this.cameras.main.getWorldPoint(pointer.x, pointer.y)`, never `pointer.worldX/Y`. Then it clamps to [0, 1] as today. The `!pointer.isDown` lost-mouse-up branch stays first after the `!this.drag` return.
- `_onPointerUp(pointer)` returns without ending the drag when `pointer && !pointer.leftButtonReleased()`. Called with no argument, it ends the drag as today.
- BootScene enters `MapEditorScene` only when `(import.meta.env.DEV || import.meta.env.MODE === 'capture') && params.get('edit') === '1'`. Otherwise it falls through to the existing debug and title paths.
- No change to the #39c road-preview logic (`_render`, `_showBakedRoad`, `_roadDirty`).

## Review Focus

- A slot drag across a rail must also clamp: the camera conversion applies to both drag kinds. Test 3b pins this.
- A touch end (`buttons 0`, `button 0`) must still end a drag. Phaser's `leftButtonReleased()` returns true for it, and test 4 uses a pointer whose `leftButtonReleased` returns true.
- With the gate on, `?edit=1&map=3` in production must reach `TitleScene` with `{}`, not stop at a blank screen. Test 5a pins this.
- The existing #39c test "pointermove on a waypoint marks the road dirty" feeds `worldX/worldY`. It must move to the camera fake, keeping its expected values.

---

### Task 1: Editor rough edges (#88 a–e)

**Files:**
- Modify: `src/scenes/MapEditorScene.js`, `src/scenes/BootScene.js`
- Test: `src/scenes/MapEditorScene.test.js`, `src/scenes/BootScene.test.js`

**Interfaces:**
- Consumes: Phaser `Camera.getWorldPoint(x, y)` → `{x, y}`; `Pointer.leftButtonReleased()` → boolean.
- Produces: `_onPointerUp(pointer?)` (pointer now optional and read).

**Test fakes.** Give the editor fakes `cameras: { main: { getWorldPoint: vi.fn((x, y) => ({ x: <wx>, y: <wy> })) } }` and pointers `{ x, y, isDown: true }`. Use world values that differ from `x, y` (for example `x: 900, y: 50` mapping to world `300, 200`), so a test still reading `pointer.worldX` or the raw `x` fails.

- [ ] **Step 1: Write the failing tests** (add to the existing files):
  1. **(a)** `the HUD slot target is the map's shipped slot count`: pick `id = MAPS.findIndex(m => m.towerSlots.length !== 6 + m.id)` and assert `id >= 0`. On the road-preview `makeScene()` with that `mapId` and its own slots, call `_renderHud()`. Expect the HUD text to contain `slots: ${n} / ${n} OK`, where `n = MAPS[id].towerSlots.length`. Push one more slot and call it again. Expect `slots: ${n + 1} / ${n} MISMATCH`.
  2. **(b)** `a press during a drag is ignored`: on `makeEditor()` with three waypoints and `drag = { kind: 'wp', index: 1 }`:
     - a right-press (`rightButtonDown: () => true`, camera `{}`) with `_hitTest` returning `{ kind: 'wp', index: 1 }` leaves `waypoints.length` at 3 and `drag` unchanged;
     - a left press calls neither `_hitTest` nor `_insertWaypointAt`.
  3. **(c)** `a drag over a rail follows the cursor to the edge`:
     - (3a) `drag = { kind: 'wp', index: 1 }`, pointer `{ x: 5, y: 300, isDown: true, worldX: 640, worldY: 360 }` with no camera, and `getWorldPoint` returning `{ x: -40, y: 200 }`. Expect `getWorldPoint` called with `(5, 300)` and `waypoints[1]` equal to `[0, 200 / H]`.
     - (3b) the same with `drag = { kind: 'slot', index: 0 }`, `getWorldPoint` returning `{ x: W + 30, y: 100 }`. Expect `slots[0]` equal to `[1, 100 / H]`.
  4. **(d)** `only the left button's release ends a drag`: with `drag = { kind: 'wp', index: 1 }`:
     - `_onPointerUp({ leftButtonReleased: () => false })` leaves `drag` unchanged and does not call `_render`;
     - `_onPointerUp({ leftButtonReleased: () => true })` sets `drag` to `null`;
     - after re-setting the drag, `_onPointerUp()` sets it to `null`.
  5. **(e)** in `BootScene.test.js`, using the portrait suite's `makeScene([])` and a `start` spy, with the URL set via `window.history.replaceState(null, '', '/?edit=1&map=3')` and restored to `'/'` in `finally`:
     - (5a) `vi.stubEnv('DEV', false)` and `vi.stubEnv('MODE', 'production')`. Expect `start` called with `('TitleScene', {})` and never with `'MapEditorScene'`.
     - (5b) `vi.stubEnv('MODE', 'capture')` with `DEV` false. Expect `start` called with `('MapEditorScene', { mapId: 3 })`.
     - (5c) the default test env (`DEV` true). Expect `('MapEditorScene', { mapId: 3 })`.
     - Call `vi.unstubAllEnvs()` in `afterEach`. If `vi.stubEnv` cannot flip `import.meta.env.DEV` in this Vitest version, stop and report `NEEDS_CONTEXT` with the observed output. Do not restructure the gate to make the test pass.
  - Update the existing #39c test `pointermove on a waypoint marks the road dirty without baking` to the camera fake. `getWorldPoint` returns `{ x: 300, y: 200 }`, and the pointer's `x, y` are different values. Its expectations are unchanged.
- [ ] **Step 2: Run** `npx vitest run src/scenes/MapEditorScene.test.js src/scenes/BootScene.test.js`. Expected: tests 1, 2, 3a, 3b, 4 and 5a fail. 5b and 5c may pass today. Paste the raw output.
- [ ] **Step 3: Implement** per the Global Constraints. Keep the existing `// Over a HUD rail ...` comment on the pointerdown guard. Give the move conversion a one-line *why* comment.
- [ ] **Step 4: Run** the two files, then `npx vitest run`. Expected: all pass, exit 0. Never pipe through `tail` or `head`. Report the test count.
- [ ] **Step 5: Mutation checks.** For each, paste the raw failing output, then restore:
  - (a) target back to `6 + map.id` → test 1 fails;
  - (b) drop the `this.drag` guard → test 2 fails;
  - (c) read `pointer.worldX/worldY` → tests 3a and 3b fail;
  - (d) drop the `leftButtonReleased` check → test 4 fails;
  - (e) drop the env gate → test 5a fails.
- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapEditorScene.js src/scenes/MapEditorScene.test.js src/scenes/BootScene.js src/scenes/BootScene.test.js
git commit -m "fix(editor): real slot target, drag-safe input, dev/capture-only route (#88)"
```
