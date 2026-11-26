# Reposition Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barracks move mode draws a rally-style ghost range ring at the pad a tap would land on, replacing the stale cyan ring and dots (backlog #63).

**Architecture:** `GameScene._drawRallyOverlay` (the `_rallyOverlayGfx` layer, cleared once per frame) gains a reposition branch. The old block in `_drawZones` goes. `_startReposition` seeds the cursor and draws, and `_repositionTo` redraws (clears) after it ends the mode.

**Tech Stack:** Vanilla JS ES modules, Phaser 3.90 (Graphics), Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-reposition-overlay-design.md`

## Global Constraints
- Destination: `this.placementManager.getNearestSlot(this._buildCursorX, this._buildCursorY, REPOSITION_SNAP_RADIUS, true)`. This is the exact call `_repositionTo` makes. The result is `{ slotIndex, x, y }`.
- The ring: centre at the slot's `x, y`, or at the cursor when there is no slot. Radius `barracks.range`. Strokes, in this order:
  1. `lineStyle(RALLY_FLAG.lineWidth + 2 * RALLY_FLAG.haloPx, RALLY_HALO, RALLY_FLAG.ghostAlpha)`, then `strokeCircle`.
  2. `lineStyle(RALLY_FLAG.lineWidth, slot ? RALLY_OK : RALLY_BAD, RALLY_FLAG.ghostAlpha)`, then `strokeCircle`.
- Draw on `_rallyOverlayGfx`. One `clear()` per call. Rally mode takes precedence if both flags are somehow set.
- Remove the `if (this.repositionMode && this.repositioningBarracks)` block in `_drawZones`, including the `0x4fc3f7` ring and the path dots.
- `_startReposition` sets `_buildCursorX/Y` to the barracks' `x/y` and calls `_drawRallyOverlay()` after setting the mode.
- `_repositionTo` calls `_drawRallyOverlay()` after it clears the mode, on both the no-slot and the moved paths.
- No change to `REPOSITION_SNAP_RADIUS`, the snap rule, the toast, the Cancel button or rally drawing.

## Review Focus
- The ghost must use the same snap call as the commit, or the ring lies about where a tap lands. Test 1 places the cursor where the nearest free pad differs from the nearest pad overall.
- Under a user pause, a committed or cancelled move must not leave a ring. Tests 3 and 4.
- The barracks' own pad is occupied, so it is never the OK target. Test 2.

---

### Task 1: Rally-style reposition overlay

**Files:**
- Modify: `src/scenes/GameScene.js`
- Test: new `src/scenes/GameScene.reposition.test.js`. Copy the mocks, the harness setup and the Graphics-recording approach from `src/scenes/GameScene.rally.test.js`, including its `RALLY_FLAG.lineWidth` override, so the halo and line widths differ.

**Interfaces:**
- Consumes: `loadShippedDOM`, `liveScene`, `startLevel` (`src/scenes/gameSceneHarness.js`); `RALLY_FLAG` (`src/data/soldiers.js`); `REPOSITION_SNAP_RADIUS` (`src/data/input.js`).

- [ ] **Step 1: Write the failing tests.** Start a level on map 0, then place a real barracks on a pad the way the rally test does. Enter move mode through `_startReposition()` with the barracks selected.
  1. `the ghost ring sits on the free pad a tap would land on`. Set the cursor near a different, free pad. Choose the point so that its nearest pad overall is occupied, but a free pad is within `REPOSITION_SNAP_RADIUS`. If map 0's layout can't give that, use the nearest free pad and say so in the report. Call `_drawRallyOverlay()`. Expect:
     - two `strokeCircle` calls at that pad's `x, y` with radius `barracks.range`;
     - the first after a halo `lineStyle`, the second after an OK `lineStyle`, both at `ghostAlpha`;
     - nothing drawn at the barracks' own `x, y`.
  2. `with no free pad in reach the ring is bad, at the cursor`. Set the cursor to the barracks' own position, which is occupied, with no other free pad within the snap radius. Pick the point so that is true and assert it in the test. Expect one halo ring and one `RALLY_BAD` ring at the cursor.
  3. `starting move mode draws at once and seeds the cursor on the barracks`. Clear the recorder before `_startReposition()`. Expect `_buildCursorX/Y` to equal the barracks' `x, y`, and rings already recorded after the call, with no `update()`.
  4. `committing or cancelling the move clears the ring`. After `_repositionTo(x, y)` to a free pad, the overlay's last call is `clear()` with nothing drawn after it. Do the same after `_repositionTo` far from any pad, which is the no-slot path.
  5. `the old cyan ring and path dots are gone`. In move mode, run `_drawZones()` and expect no `lineStyle` with `0x4fc3f7` on the main `gfx`.
- [ ] **Step 2: Run** `npx vitest run src/scenes/GameScene.reposition.test.js`. Expected: all five fail on today's code. Test 5 fails because the cyan block is still there. Paste the raw output.
- [ ] **Step 3: Implement** per the Global Constraints. Update the comment above `_drawRallyOverlay` to say it draws both modes' ghosts.
- [ ] **Step 4: Run** the new file and `src/scenes/GameScene.rally.test.js`, then `npx vitest run`. Expected: all pass, exit 0. Never pipe through `tail` or `head`.
- [ ] **Step 5: Mutation checks.** Paste the raw failing output for each, then restore:
  - (a) use `requireFree=false` in the ghost's snap call: test 1 or 2 fails;
  - (b) drop the `_drawRallyOverlay()` call in `_startReposition`: test 3 fails;
  - (c) drop it in `_repositionTo`: test 4 fails;
  - (d) restore the cyan block in `_drawZones`: test 5 fails.
- [ ] **Step 6: Commit**
```bash
git add src/scenes/GameScene.js src/scenes/GameScene.reposition.test.js
git commit -m "fix(barracks): move mode ghosts the destination pad's range in the rally style (#63)"
```
