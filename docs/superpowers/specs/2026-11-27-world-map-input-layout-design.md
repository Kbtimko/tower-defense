# World-map input and re-layout fixes — design (#54 b, c, g, h)

**Backlog:** #54 `[auto]` (3.4 world-map follow-ups), sub-items (b), (c), (g) and (h). These are the four the code still bears out, and none needs a design call. I self-approved this under the `[auto]` rule. The other sub-items are left out: (a) is a measurement-first retune, (e) is a design call, and (d) and (f) are cosmetic.

## The asks, literally

> (b) A bare F5 is still swallowed during the 250-ms map entry guard and the 3.2-s arrival (Ctrl/Cmd/Alt are exempt).
> (c) A window resize rebuilds both offscreen layers synchronously per event; coalesce `_layout` into one rAF.
> (g) After a `resize()` that leaves the canvas size unchanged (fonts `loadingdone`, art `onload`, an early iOS `orientationchange`), the backdrop takes up to ~143 ms to repaint because of the 7-fps idle cap. Fix: force `SpaceCanvas.redraw()`.
> (h) During the arrival, a Ctrl/Alt/Cmd-click on a node, LAUNCH or the meta bar is not swallowed as a skip, because the shortcut exemption also covers pointer events. Limit `isBrowserShortcut` to key events in `_skipArrival`.

## Verified in the code (2026-11-27)

- `isBrowserShortcut(e)` (`src/ui/browserShortcut.js`) returns `e.ctrlKey || e.metaKey || e.altKey` for any event type.
  - `MapSelectScene._swallow`, the entry guard, runs it on `pointerdown/pointerup/click/keydown/keyup`.
  - `_skipArrival` runs it on `pointerdown` and `keydown`.
  - A bare F5 has no modifier, so both swallow it and `preventDefault` blocks the reload.
  - A Ctrl-click is exempt, so during the arrival it reaches the node or LAUNCH. During the guard it isn't swallowed either. The guard has the same flaw as (h), with the same root cause.
- The other callers, `StoryDialogOverlay._onKeyDown` and `ResultsScreen._onKeyDown`, pass only `keydown`.
- The world map has no `<a>` elements, so a modified click there carries no browser behaviour worth protecting.
- `resize`, `orientationchange` and fonts `loadingdone` are bound straight to `_layout` (`MapSelectScene.js` ~121). Each call runs `WorldMapRenderer.resize`, which repaints both offscreen layers.
- `WorldMapRenderer.resize` ends with `this._space.start(this._drawBackdrop)`. That returns early once the canvas is started (`SpaceCanvas.start`: `if (... this._draw) return`), so the new layers wait for the next idle-capped tick.

## Design

1. **`isBrowserShortcut(e)` is true only for keyboard events** (`e.type` starts with `key`), when Ctrl, Meta or Alt is held **or** `e.key === 'F5'`. Fixing the helper fixes (b), (h), and the guard's matching pointer flaw in one place. The keyboard-only callers are unaffected, apart from F5 now being exempt there too. Neither of them acts on F5 today, so for them it only changes whether F5's propagation is stopped.
2. **Coalesce re-layout.** The `resize`, `orientationchange` and `loadingdone` listeners call a new `_scheduleLayout()`. It requests one animation frame if none is pending, and that frame runs `_layout()`. `create()` still calls `_layout()` directly, so the first paint isn't delayed. `shutdown()` cancels a pending frame and removes the listeners for `_scheduleLayout`.
3. **Repaint on resize.** `WorldMapRenderer.resize` calls `this._space.redraw()` right after `this._space.start(...)`, so the new layers paint in the same task. `redraw()` is a frame with dt 0, which already exists for re-layouts.

## Approaches

1. **Fix the helper (chosen).** It's one definition of "a browser's shortcut", it's right for every caller, and the guard's matching flaw goes with it.
2. Patch `_skipArrival` alone, as (h) literally says. That leaves the entry guard with the same Ctrl-click hole.
3. Exempt all of F1–F12. Speculative: only F5 (reload) was reported, and F11/F12 aren't swallowed in a way anyone noticed.

## Rulings (mine)

- **The helper becomes keyboard-only, and the guard gets the same fix.** If wrong: a Ctrl-click during the 250 ms guard would be exempt again, which is a one-line revert.
- **F5 only, not every function key.** If wrong: add keys to one condition.
- **Existing tests that dispatch `resize` and assert synchronously get updated to flush the one scheduled frame.** They are updated, not loosened: each still asserts the same layout.

## Edge cases

| Case | Expected |
|---|---|
| bare F5 keydown during the entry guard | not prevented (the browser reloads) |
| bare F5 keydown during the arrival | not prevented, and not a skip (the arrival keeps playing) |
| Ctrl/Cmd/Alt + key during the arrival | not prevented, not a skip (unchanged) |
| Ctrl/Cmd/Alt + pointerdown during the arrival | a skip: prevented, the arrival ends, the gesture is swallowed |
| Ctrl + click during the entry guard | swallowed |
| plain key or tap | unchanged |
| 3 resize events in one frame | `_layout` runs once, on the next frame |
| shutdown with a re-layout pending | the frame is cancelled; no `_layout` after shutdown |
| `WorldMapRenderer.resize` on a started canvas | the backdrop is redrawn in the same call |
| `WorldMapRenderer.resize` with no 2D context (jsdom) | no-op, no throw (unchanged) |
