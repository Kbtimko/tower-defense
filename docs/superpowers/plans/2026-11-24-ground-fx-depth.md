# Ground FX Depth (#39b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the fire field, flame-wave cone and volley lines above the opaque road.

**Architecture:** One data constant, `GROUND_FX_DEPTH`, replaces three depth literals.

**Tech Stack:** Phaser 3, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-24-ground-fx-depth-design.md`

## Global Constraints

- `GROUND_FX_DEPTH = 8.75`, exported from `src/data/roads.js`. No depth literal for these effects stays in `src/scenes` or `src/systems`.
- Every test is written first and seen failing. After it passes, revert the fix, confirm that specific test fails, then restore. Paste both outputs.
- Change nothing else about the effects (shape, colour, duration, damage).
- Stage explicit paths only.

## Review Focus

1. **Every caller of `AreaEffectsManager.add`** (firefield and immolate) gets the new depth through the manager. No caller overrides it.
2. **The ordering invariant reads from the real constants** (`ROAD_DEPTH`, `ENDPOINT_LOOK.depth`, the ambient `near` layer's depth), not copied numbers, so a later depth change fails the test.
3. **The stale comment above `ROAD_DEPTH`** ("Above backdrop (0), area effects (2), ambient (5)") is corrected.

---

### Task 1: GROUND_FX_DEPTH

**Files:**
- Modify: `src/data/roads.js`, `src/systems/AreaEffectsManager.js`, `src/scenes/GameScene.js` (`_handleVolley`, `_handleFlameWave`)
- Test: create `src/data/roads.test.js`; modify `src/systems/AreaEffectsManager.test.js`; create `src/scenes/GameScene.groundFx.test.js`

**Interfaces (produces):** `export const GROUND_FX_DEPTH = 8.75` in `src/data/roads.js`.

- [ ] **Step 1: Failing tests.**
  - `src/data/roads.test.js`: import `ROAD_DEPTH`, `GROUND_FX_DEPTH`, `ENDPOINT_LOOK` from `./roads.js` and `AMBIENT_LAYERS` from `./ambient.js`; take the depth of the layer whose `name` is `'near'`. Assert `ROAD_DEPTH < nearDepth`, `nearDepth < GROUND_FX_DEPTH`, `GROUND_FX_DEPTH < ENDPOINT_LOOK.depth` and `ENDPOINT_LOOK.depth < 10`. 10 is the static layer depth passed to `createStaticBake` in `GameScene.create`. A comment should say so.
  - `AreaEffectsManager.test.js`: `add()` calls `setDepth(GROUND_FX_DEPTH)` on its graphics. Use the file's existing fake scene and add a `setDepth` spy if it lacks one.
  - `GameScene.groundFx.test.js`: call `GameScene.prototype._handleFlameWave` and `_handleVolley` on a minimal fake `this`. Follow `GameScene.handleImmolate.test.js` for the Phaser mock and ctx style. Use `add.graphics` returning a chaining spy, `enemies: []`, `time.delayedCall`, and `game.registry.get` returning null. Assert `setDepth` was called with `GROUND_FX_DEPTH`.
  - Run `npx vitest run src/data/roads.test.js src/systems/AreaEffectsManager.test.js src/scenes/GameScene.groundFx.test.js` and expect a failure, because `GROUND_FX_DEPTH` is undefined.
- [ ] **Step 2: Implement.**
  - Add the constant beside `ROAD_DEPTH`, with a why-comment (above the opaque road so it can't cut a gap; below pads and units, as ground effects).
  - Fix the `ROAD_DEPTH` comment.
  - Replace `setDepth(2)` in `AreaEffectsManager.add`, and `setDepth(5)` in `_handleVolley` and `_handleFlameWave`, with the constant.
- [ ] **Step 3:** Run the three files and expect a pass. Mutation checks, restoring after each:
  1. put `setDepth(2)` back in `AreaEffectsManager`; its test fails;
  2. put `setDepth(5)` back in `_handleFlameWave`; the flame-wave test fails;
  3. do the same in `_handleVolley`; the volley test fails;
  4. set `GROUND_FX_DEPTH = 7`; the ordering test fails.
- [ ] **Step 4:** Run `npx vitest run` (the full suite) and expect exit 0. Paste the summary lines.
- [ ] **Step 5:** Commit with the message `fix(fx): draw fire field, flame wave and volley above the road (#39)`.
