# World-Map Input and Re-layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the world map, F5 always reloads, a modified click during the arrival counts as a skip, resize bursts re-lay out once per frame, and a re-layout repaints the backdrop at once.

**Architecture:**
- `isBrowserShortcut` becomes keyboard-only and adds F5.
- `MapSelectScene` coalesces re-layout through one rAF.
- `WorldMapRenderer.resize` forces `SpaceCanvas.redraw()`.

**Tech Stack:** Vanilla JS, Vitest + jsdom (with fake timers in the arrival tests).

**Spec:** `docs/superpowers/specs/2026-11-27-world-map-input-layout-design.md`

## Global Constraints

- `isBrowserShortcut(e)` returns true only when `e.type` starts with `'key'` AND (`e.ctrlKey || e.metaKey || e.altKey || e.key === 'F5'`).
- `create()` keeps its direct synchronous `this._layout()` call. Only the event listeners go through `_scheduleLayout()`.
- `shutdown()` must leave no pending animation frame. The lifecycle test in `MapSelectScene.worldMap.test.js` ("leaves no live listeners or rAF") must stay green unedited.
- Existing tests that dispatch `resize` and then assert layout are updated to flush the scheduled frame before asserting. Their assertions stay the same.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. A Ctrl-pointerdown during the arrival is now a skip. The existing keyboard-shortcut test ("a browser shortcut (Ctrl/Cmd/Alt) mid-arrival is neither prevented nor a skip") must still pass unchanged.
2. A `_layout` pending when `shutdown()` runs must never fire afterwards, because `_renderer` is null then. `_layout` guards on it, but a missing cancel would still leak a frame.
3. `redraw()` right after `start()` on a *first* resize must not double-schedule the rAF loop. `start()` schedules it, and `redraw()` only paints.

---

### Task 1: `isBrowserShortcut` is keyboard-only and covers F5

**Files:**
- Modify: `src/ui/browserShortcut.js` (and its comment).
- Test: `src/ui/browserShortcut.test.js`, `src/scenes/MapSelectScene.arrival.test.js` (the `skip` describe), `src/scenes/MapSelectScene.worldMap.test.js` (the `input guard` describe).

- [ ] **Step 1: Write the failing tests.**
  - `browserShortcut.test.js`:
    - `isBrowserShortcut(new KeyboardEvent('keydown', { key: 'F5' }))` is `true`.
    - For each of `ctrlKey`, `metaKey` and `altKey`, `isBrowserShortcut(new MouseEvent('pointerdown', { [mod]: true }))` is `false`.
    - The existing tests stay.
  - `MapSelectScene.arrival.test.js`, in `skip`, using the same setup as the existing browser-shortcut test (`seedSave(AFTER_FIRST_CLEAR); enter({ from: FIRST_CLEAR_0 }); vi.advanceTimersByTime(LAYOUT.inputGuardMs);`):
    - **"a bare F5 mid-arrival is neither prevented nor a skip"**: a cancelable bubbling `keydown` `{ key: 'F5' }` on `document.body` has `defaultPrevented === false`, and `arrival()` is still `'playing'`.
    - **"a Ctrl/Cmd/Alt-click mid-arrival is a skip"**: for one modifier (ctrlKey), a cancelable bubbling `pointerdown` dispatched on a `.ow-node` has `defaultPrevented === true`, and the arrival has ended. Assert the ended state the same way the existing pointer-skip tests do.
  - `MapSelectScene.worldMap.test.js`, in `input guard`:
    - **"a bare F5 inside inputGuardMs is not swallowed"**: a cancelable `keydown` `{ key: 'F5' }` dispatched before the guard ends is not `defaultPrevented`.
    - **"a Ctrl-click inside inputGuardMs is swallowed"**: a cancelable `click` with `ctrlKey: true` on LAUNCH is `defaultPrevented`, and nothing launches. Mirror the existing "swallows a click on LAUNCH" test's launch assertion.

- [ ] **Step 2: Run to verify they fail.** Run `npx vitest run src/ui/browserShortcut.test.js src/scenes/MapSelectScene.arrival.test.js src/scenes/MapSelectScene.worldMap.test.js`. Expected: the new tests FAIL, and every existing test passes.

- [ ] **Step 3: Implement** the Global Constraints definition in `browserShortcut.js`. Update its comment to say *why* it's keyboard-only: a modified tap has no browser meaning on these screens, which have no links. The comment should also say *why* F5 is there: it's the bare reload key.

- [ ] **Step 4: Run the three files again.** Expected: all PASS.

- [ ] **Step 5: Mutation check.** Paste the raw failure for each, then restore.
  - (a) Drop the `e.type` keyboard check: the pointer tests fail.
  - (b) Drop `e.key === 'F5'`: the F5 tests fail.

- [ ] **Step 6: Commit**

```bash
git add src/ui/browserShortcut.js src/ui/browserShortcut.test.js src/scenes/MapSelectScene.arrival.test.js src/scenes/MapSelectScene.worldMap.test.js
git commit -m "fix(world-map): F5 always reloads; a modified tap during the arrival is a skip (#54b, #54h)"
```

### Task 2: coalesced re-layout and an immediate backdrop repaint

**Files:**
- Modify: `src/scenes/MapSelectScene.js`:
  - constructor binding;
  - the listeners in `create` (~121-124);
  - `shutdown` (~712-717);
  - new `_scheduleLayout`.
- Modify: `src/ui/WorldMapRenderer.js`, `resize` (~44-56).
- Test:
  - `src/scenes/MapSelectScene.worldMap.test.js`;
  - `src/scenes/MapSelectScene.arrival.test.js` (the "resize mid-flight" test);
  - `src/ui/WorldMapRenderer.test.js`.

**Interfaces:**
- `MapSelectScene._scheduleLayout()`: requests one rAF if `this._layoutRaf` is 0. The frame sets `this._layoutRaf = 0`, then calls `this._layout()`. `shutdown()` calls `cancelAnimationFrame(this._layoutRaf)` when it's set and zeroes it.

- [ ] **Step 1: Write the failing tests.**
  - `MapSelectScene.worldMap.test.js`, new describe `'re-layout coalescing (#54c)'`. Stub `requestAnimationFrame` to queue callbacks and `cancelAnimationFrame` to drop them, as the "reduced motion" test does. Spy on `MapSelectScene.prototype._layout` *after* `enter()`.
    - **"three resize events run _layout once, on the next frame"**: dispatch `resize`, `orientationchange`, and then `resize`. `_layout` has 0 calls synchronously. After you flush the queued frames, `_layout` has exactly 1 call.
    - **"a fonts loadingdone schedules too"**: same pattern, using a fake `document.fonts` EventTarget, as the lifecycle test does.
    - **"shutdown with a re-layout pending cancels it"**: dispatch `resize`, call the scene's `shutdown()`, then flush. `_layout` has 0 calls after shutdown.
  - Update the existing resize-driven tests to flush the scheduled frame before asserting. Their assertions stay unchanged. The tests are:
    - "re-measures on layout (resize)";
    - "re-lays out on resize with the compact class at 750x340";
    - `MapSelectScene.arrival.test.js` "a resize mid-flight keeps the fractions in the new geometry".

    That file uses fake timers. If its rAF is faked, advance one frame (`vi.advanceTimersByTime(FRAME_MS)` or the file's own frame helper). In the arrival test, assert on the `render` call made by that frame.
  - `WorldMapRenderer.test.js`: **"resize redraws the backdrop at once, also on a second resize"**. Use the file's existing `recordingCtx` setup and spy on `SpaceCanvas.prototype.redraw`. After the first `r.resize(frame, viewport)` it has been called once; after a second `r.resize(...)` with the same arguments, twice.

- [ ] **Step 2: Run to verify they fail.** Run `npx vitest run src/scenes/MapSelectScene.worldMap.test.js src/scenes/MapSelectScene.arrival.test.js src/ui/WorldMapRenderer.test.js`. Expected:
  - the new coalescing and redraw tests FAIL;
  - the updated resize tests still pass, since flushing a frame is harmless before the change.

- [ ] **Step 3: Implement.**
  - Add `_scheduleLayout` and bind it in the constructor.
  - Point the three listeners and their three removals at it.
  - Cancel any pending frame in `shutdown()`.
  - In `WorldMapRenderer.resize`, call `this._space.redraw();` after `this._space.start(this._drawBackdrop);`, with a one-line comment on why: `start` is a no-op once the canvas is running, and the idle cap would otherwise delay the new layers.

- [ ] **Step 4: Run the three files, then `npm run test`.** Expected: all PASS, including the lifecycle "no live listeners or rAF" test, unedited. Record the counts and the exit code.

- [ ] **Step 5: Mutation check.** Paste the raw failure for each, then restore.
  - (a) Make `_scheduleLayout` call `_layout()` directly: the coalescing tests fail.
  - (b) Remove the cancel from `shutdown()`: the "shutdown with a re-layout pending" test fails. Note whether the lifecycle test also fails.
  - (c) Remove the `redraw()` call: the renderer test fails.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js src/ui/WorldMapRenderer.js src/scenes/MapSelectScene.worldMap.test.js src/scenes/MapSelectScene.arrival.test.js src/ui/WorldMapRenderer.test.js
git commit -m "fix(world-map): coalesce re-layout into one frame; repaint the backdrop on resize (#54c, #54g)"
```
