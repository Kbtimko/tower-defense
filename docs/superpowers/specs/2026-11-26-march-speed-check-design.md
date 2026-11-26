# Rally capture checks march speed — design (#65c)

**Backlog:** #65(c) `[auto]` (from the #48 final reviews). Self-approved under the `[auto]` rule. Small change, harness only.

## The ask, literally

> (c) The capture run's walk budgets carry +5 s game-time slack, so they don't check speed (unit + scene tests do).

## Why

The rally run in `scripts/capture.mjs` (step `(d)`/`(e)`) waits for the squad to get halfway and then arrive. Each wait uses `untilGameTime` with `gameMs: walkMs`, which allows `walkMs × 1.33 + 5 s` of game time. For a typical walk of a few seconds, a squad marching at half speed, or arriving almost at once, still passes. So the only live check of the walk ("it doesn't teleport") checks that the squad moved, not how fast. The unit tests pin `marchStep`, but nothing proves the running game feeds it the right `dt` and speed.

## Measured

There's no wave in the rally run (`captureRally` passes no `wave`, on purpose), so no enemy halts the march and no hit-stop freezes it. Soldiers step on game `dt`, the same clock `window.__capture.simMs` adds up. The squad's march time in game time should therefore equal `arcPx / SOLDIER_MARCH.speed`, give or take the frames at each end. The first poll that sees `marching` and the first that sees arrival each land on a frame boundary, so the measured span differs from the true walk by less than one frame. Phaser caps a frame's delta at `PHASER_MAX_DELTA_MS` (200).

## Design

- New pure helper in `scripts/captureCore.mjs`: `marchTimeProblem({ elapsedMs, arcPx, speed, frameMs })`. It returns `null` when `|elapsedMs − arcPx / speed × 1000| ≤ frameMs`, and otherwise a message naming the measured time, the distance, and the expected time ± the tolerance.
- `rallyPlan()` also returns `totalPx` (the path length it already computes).
- In `captureRally`:
  - the `(d)` "squad marched" wait returns `window.__capture.simMs` from the first frame where it's marching;
  - the `(e)` arrival wait returns the arrival frame's `simMs` along with the rally state;
  - `arcPx` comes from the progress actually walked: `|done.target − before.target| × plan.totalPx`, not the planned tap point, so the snap of the tap doesn't count against the speed;
  - after the existing on-the-flag check, a non-null `marchTimeProblem(…, frameMs: PHASER_MAX_DELTA_MS)` throws as `(e) …`.
- The existing `untilGameTime` budgets stay as they are. They're there to bound a hang, and they're now explicitly not the speed check.

## Approaches

1. **Measure the elapsed game time and compare it with the speed (chosen).** It checks speed both ways (too slow and too fast), with a tolerance derived from the frame cap.
2. Cut `AUTO_SEND_SLACK_MS` for the march waits only. That catches only *slow* marches, and only loosely; a teleporting squad still passes.
3. Leave it and close the item as covered by unit and scene tests. The gap is that no live check ties the game loop's `dt` to the march, and that's what the capture run is for.

## Rulings (mine)

- **Tolerance is one max frame (200 ms of game time).** For the map 0 walk, that's well under the change a real speed bug makes. If wrong (a flake): the frame lateness is measurable in the failure message, and the fix is one constant.
- **The distance is measured from the actual progress, not the planned arc.** If wrong: tap snapping (≤ 2 px, 33 ms) would add to the error.

## Edge cases

| Case | Expected |
|---|---|
| march at `SOLDIER_MARCH.speed` | elapsed within ±1 frame → no problem |
| march at a slower speed (e.g. 0.7×) | elapsed far past expected → `(e)` throws with the numbers |
| march too fast / teleport | elapsed far short → throws |
| elapsed exactly expected ± frameMs | passes (inclusive bound) |
| the squad never marches or never arrives | the existing `untilGameTime` failures, unchanged |
