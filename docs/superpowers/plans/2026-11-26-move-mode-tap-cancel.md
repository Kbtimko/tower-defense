# Move-mode tap-to-cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In barracks move mode, tapping the barracks itself cancels the move, and the ghost overlay shows that before the tap.

**Architecture:** A guard in `GameScene._repositionTo` and a matching branch in `GameScene._drawRallyOverlay`. Both use `Math.hypot(barracks - point) < TAP_TOWER_RADIUS`, the same test as `_rallyTo`.

**Tech Stack:** Phaser 3, Vitest + jsdom. Vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-26-move-mode-tap-cancel-design.md`

## Global Constraints

- The cancel radius is `TAP_TOWER_RADIUS` (22) from `src/data/input.js`, with a strict `<`, exactly as `_rallyTo` (`src/scenes/GameScene.js`, `_rallyTo`). Do not add a new constant.
- A cancel goes through `this._cancelMode()`.
- The cancel overlay is the existing bad style: a halo ring `(RALLY_FLAG.lineWidth + 2 * RALLY_FLAG.haloPx, RALLY_HALO, RALLY_FLAG.ghostAlpha)`, then `(RALLY_FLAG.lineWidth, RALLY_BAD, RALLY_FLAG.ghostAlpha)`, radius `mover.range`, **centred on the mover's (x, y)**.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only.
- Never pipe test output through `tail` or `head`.

## Review Focus

1. A tap between the barracks and a 33 px neighbour: the 22 px boundary decides. Pinned by the 21/23 px tests.
2. The overlay and the tap disagreeing: pinned by asserting both for the same cursor points.
3. Taps on the barracks with no free pad nearby still end the mode. Covered by the existing map 0 no-slot test plus a map 0 tap-on-barracks assertion.
4. A cancel leaves every zone's `occupied` flag untouched (no freed or double-occupied pad).
5. The existing #63 tests stay green, especially "starting move mode draws at once" (now always red on the barracks).

---

### Task 1: Tap on the moving barracks cancels; the ghost agrees

**Files:**
- Modify: `src/scenes/GameScene.js`, in `_repositionTo`, `_drawRallyOverlay` (the `repositionMode && mover` branch), and the comment in `_startReposition` that starts "The first frame previews a tap on the barracks itself".
- Test: `src/scenes/GameScene.reposition.test.js`. Add a `describe('move-mode tap on the barracks cancels (#89, map 5)', ...)` block. Generalise the file's `level()` helper to `level(mapId = 0)`.

**Interfaces:**
- Consumes the existing helpers in the test file: `buildBarracks(scene, slotIndex)`, `padXY`, `enterMove`, `overlay`, `rings`, and the `OK`/`BAD`/`HALO`/`HALO_WIDTH` constants. Taps go through the real `scene._onTap(mx, my)`.
- Map 5 fixture: the barracks is on **pad 6**, and **pad 10** is free, **33.3 px** away. That is the closest pair in the campaign and is inside the 60 px snap. Assert the distance from `getZones()` in the test rather than trusting this number.

- [ ] **Step 1: Write the failing tests** (map 5, barracks on pad 6, pad 10 free). Let `u` be the unit vector from pad 6 toward pad 10 and `at(d) = barracks + d*u`.
  - `tapping the barracks centre cancels and leaves it on its pad`: `s._onTap(b.x, b.y)`. Expect `s.repositionMode === false`, `b.zoneIndex === 6`, `(b.x, b.y)` equal to pad 6, `zones[6].occupied === true`, `zones[10].occupied === false`, and `document.getElementById('cancel-btn').hidden === true`.
  - `the cancel boundary is TAP_TOWER_RADIUS`: in a fresh level, `s._onTap(...at(21))` cancels, with the barracks still on pad 6. Re-enter move mode. `s._onTap(...at(23))` moves the barracks to pad 10 (`b.zoneIndex === 10`, `zones[6].occupied === false`). Also assert in the test that `getNearestSlot(at(21), REPOSITION_SNAP_RADIUS, true).slotIndex === 10`, which proves the 21 px tap *would* have moved before the fix.
  - `the ghost on the barracks is the cancel ring`: cursor at `(b.x, b.y)` and `_drawRallyOverlay()`. Expect exactly 2 rings: `r[0]` `{x:b.x, y:b.y, r:b.range, width:HALO_WIDTH, colour:HALO, alpha:ghostAlpha}`, `r[1]` `{x:b.x, y:b.y, r:b.range, width:RALLY_FLAG.lineWidth, colour:BAD, alpha:ghostAlpha}`. No ring is centred on pad 10.
  - `the ghost 21 px out is still the cancel ring centred on the barracks`: cursor `at(21)`. Expect 2 rings, both at `(b.x, b.y)` (not at the cursor), with the second `BAD`.
  - `the ghost 23 px out is the move ring on the neighbour`: cursor `at(23)`. Expect 2 rings at pad 10, with the second `OK`.
  - In the map 0 describe block, add `tapping the barracks with no free pad in reach cancels`: `s._onTap(b.x, b.y)`. Expect `repositionMode === false`, `b.zoneIndex === 0`, and the overlay's last call to be `clear`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/scenes/GameScene.reposition.test.js`
Expected: the map 5 tap and ghost tests FAIL. The barracks moves to pad 10, and the ghost is green on pad 10. The map 0 no-slot tap test may already pass (it was a silent cancel before). Note which ones in the report.

- [ ] **Step 3: Implement**

In `_repositionTo`, before the snap, mirror `_rallyTo`: `if (Math.hypot(barracks.x - mx, barracks.y - my) < TAP_TOWER_RADIUS) { this._cancelMode(); return; }`. In `_drawRallyOverlay`'s move branch, when the cursor `(x, y)` is within the same radius of `mover`, draw the bad ring pair centred on `(mover.x, mover.y)` and skip the snap lookup. Otherwise keep the existing code. Update the `_startReposition` comment: the first frame now always previews the cancel ring on the barracks' own pad. Update the comment above the move branch ("The exact call _repositionTo makes ...") so it still describes both checks truthfully.

- [ ] **Step 4: Run the tests to verify they pass, then run the full suite**

Run: `npx vitest run src/scenes/GameScene.reposition.test.js`, then `npm run test`.
Expected: all green. Record the total test and file counts from the full run.

- [ ] **Step 5: Mutation check.** Paste the failing output for each mutation in the report.
  - (a) Remove the `_repositionTo` guard. The tap tests fail, and the ghost tests still pass.
  - (b) Remove the overlay branch. The ghost-on-barracks and 21 px ghost tests fail.
  - (c) Change `<` to `<=` with a radius of 23 (or use `TAP_TOWER_RADIUS + 2`). The boundary test fails.
  - Restore after each.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js src/scenes/GameScene.reposition.test.js
git commit -m "fix(barracks): tapping the barracks in move mode cancels (#89)"
```
