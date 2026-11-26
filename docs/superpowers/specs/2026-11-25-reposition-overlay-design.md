# Move mode shows where the barracks will go (backlog #63) — design

**Status:** self-approved (`[auto]` item), 2026-11-25. The backlog left "match the rally look or drop it" open. I chose "match", as stated below.

## Intent
Barracks **Move** (reposition) mode lets the player tap a free pad, and the barracks moves there (`_repositionTo` snaps the tap to the nearest free pad within `REPOSITION_SNAP_RADIUS`). The overlay it draws (`_drawZones`, GameScene ~2405) has two problems:
- It is a cyan range ring around the barracks' **current** pad, plus cyan dots on every path point inside that ring. It shows where the barracks is, not where it would go, and the dots are the pre-#48 rally visual.
- It is on the wrong layer. The #48 rally mode draws a halo'd ring and ghost in `RALLY_FLAG` colours on `_rallyOverlayGfx`.

## Goals
- In move mode the overlay is a **ghost range ring at the pad a tap would land on**. That is the same `placementManager.getNearestSlot(cursorX, cursorY, REPOSITION_SNAP_RADIUS, true)` call `_repositionTo` makes, with radius `barracks.range`, drawn in the rally style:
  - a `RALLY_HALO` stroke `lineWidth + 2 * haloPx` wide;
  - an `RALLY_OK` stroke `lineWidth` wide;
  - both at `ghostAlpha`, on `_rallyOverlayGfx`.
- If no free pad is in snap range, the ring is drawn at the cursor in `RALLY_BAD` (with the halo). A tap there does nothing.
- The old cyan ring and path dots are removed.
- The overlay is drawn at once when move mode starts, and cleared when a tap commits or cancels the move. This matters under a user pause, because `update()` does not run then (rally's S5).
- When move mode starts, the cursor is put on the barracks, so the first frame previews a tap on the barracks itself: its nearest free pad in reach, else a bad ring on its own pad.

## Non-goals
- No change to the snapping rule, the move itself, the toast, the Cancel button or rally mode.
- No pad highlighting. The existing pad beacons already mark the free pads.

## Approaches
1. **A ghost ring at the destination, in rally style (chosen).** It answers the question the player has in this mode: what will this cover from there?
2. Drop the overlay. Simpler, but the player loses the range preview while choosing a pad.
3. Keep a ring at the current pad, restyled. That is still the wrong information.

## Left to the builder
Whether `_drawRallyOverlay` grows a reposition branch or calls a helper, as long as it uses one Graphics layer and one clear per frame.
