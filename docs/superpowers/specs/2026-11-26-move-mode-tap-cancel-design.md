# Move mode: tapping the barracks cancels — design (#89)

**Backlog:** #89 `[auto]` (raised 2026-11-25 by the #63 final review). Self-approved under the `[auto]` rule.

## The ask, literally

> Tapping the barracks in move mode does not cancel. Rally mode exits when the player taps the barracks itself (`_rallyTo`), but move mode snaps the tap to the nearest free pad within `REPOSITION_SNAP_RADIUS` (60 px). On the 26 of 139 pads with a neighbour that close (maps 3 and 5-9; the closest pair is 33 px, map 5), a player tapping the barracks to back out moves it to the neighbour. Fix: treat a tap within `TAP_TOWER_RADIUS` of the moving barracks as cancel.

## Why

The barracks is the thing the player just tapped to open the ring and pick Move. Tapping it again is the natural "never mind", and rally mode already honours it. In move mode the same gesture silently relocates the barracks to a neighbour pad on 26 pads, which reads as a misclick the game punished.

## Behaviour

- In move mode, a tap whose distance to the moving barracks is `< TAP_TOWER_RADIUS` (22 game px, strict, the same test `_rallyTo` uses) **cancels** through `_cancelMode()`, exactly as rally mode does. The barracks, its pad, and every zone's `occupied` flag are unchanged.
- Any other tap behaves as today: snap to the nearest free pad within 60 px and move, or cancel silently when none is in reach.
- **The #63 ghost must not lie.** While the cursor is within `TAP_TOWER_RADIUS` of the moving barracks, the overlay draws the cancel look, which is the existing bad (red) ring with halo, centred on **the barracks** and not at the cursor or on a neighbour pad. Outside that radius the overlay is unchanged.
- The move mode entry seeds the cursor on the barracks (#63), so the first frame now always shows the red ring on the barracks' own pad. The comment in `_startReposition` that says otherwise is updated.

## Approaches

1. **Check in `_repositionTo` and `_drawRallyOverlay` (chosen).** A two-line guard in each, mirroring `_rallyTo`. This is the smallest change, and it keeps the overlay and the tap on the same predicate.
2. Teach `resolveTap` a new `cancel` action when the tap hits the repositioning barracks. That is more general, but `_tapHits.tower` finds *any* tower within 22 px. That spreads move-mode semantics into the pure resolver for one case, and it would diverge from how rally handles the same gesture. Rejected.
3. Shrink `REPOSITION_SNAP_RADIUS` below the 33 px minimum pad gap. That would break the deliberately loose drag-drop snap everywhere. Rejected.

## Rulings (mine)

- **The cancel ring is centred on the barracks, not the cursor.** It reads as "stays here". If that's wrong, the fix is one coordinate.
- **Use `_cancelMode()`, not the silent no-slot clear**, to match rally exactly (it also closes the radial and syncs Cancel). If that's wrong, nothing is lost, because the effect is identical in this state.

## Non-goals

- Taps on *other* towers in move mode are unchanged. They still snap to a free pad within 60 px.
- A barracks sold while in move mode is not in scope.

## Edge cases

| Case | Expected |
|---|---|
| Tap at the barracks centre (0 px) | cancel; barracks stays |
| Tap 21 px from the barracks toward a free pad 33 px away | cancel (inside 22) |
| Tap 23 px from it toward that pad | moves to that pad (outside 22, inside 60 of the pad) |
| Tap on the barracks when no free pad is in reach | cancel (same visible result as before) |
| Cursor on the barracks | red ring on the barracks, none on the neighbour |
| Cursor 23 px out toward the neighbour | green ring on the neighbour (unchanged #63 behaviour) |
| Cancel while paused | overlay cleared (`_cancelMode` redraws) |
