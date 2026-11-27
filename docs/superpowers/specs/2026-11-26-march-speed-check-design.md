# Rally capture checks march speed — design (#65c)

**Backlog:** #65(c) `[auto]` (from the #48 final reviews). Self-approved under the `[auto]` rule. Small change, harness only.

## The ask, literally

> (c) The capture run's walk budgets carry +5 s game-time slack, so they don't check speed (unit + scene tests do).

## Why

The rally run in `scripts/capture.mjs` (step `(d)`/`(e)`) waits for the squad to get halfway and then arrive. Each wait uses `untilGameTime` with `gameMs: walkMs`, which allows `walkMs × 1.33 + 5 s` of game time. For a typical walk of a few seconds, a squad marching at half speed, or arriving almost at once, still passes. So the only live check of the walk ("it doesn't teleport") checks that the squad moved, not how fast. The unit tests pin `marchStep`, but nothing proves the running game feeds it the right `dt` and speed.

## Measured

There's no wave in the rally run (`captureRally` passes no `wave`, on purpose), so no enemy halts the march and no hit-stop freezes it. Soldiers step on game `dt`, the same clock `window.__capture.simMs` adds up. The squad's march time in game time should therefore equal `arcPx / SOLDIER_MARCH.speed`, give or take the frames at each end.

_Corrected after the final review:_ the first draft sampled both ends with fresh Node-side `untilGameTime` polls. The start poll begins after the tap's round trip, and the arrival poll after the mid-walk screenshot. On a slow device the squad (a walk of about 2.1 s on map 0) arrives during the screenshot, and the measured span grows by the overrun, so a correct game fails. Two further offsets apply even with per-frame sampling. The `__capture` write runs before `_updateSoldiers` in a frame, so a sample's `simMs` includes this frame's delta while its rally state is the previous frame's. And the last frame overshoots arrival. Together these bound the span's error to `(−maxDelta, +2·maxDelta)`, where `maxDelta` is the largest frame during the march.

## Design

- New pure helper in `scripts/captureCore.mjs`: `marchTimeProblem({ elapsedMs, arcPx, speed, toleranceMs })`. It returns `null` when `|elapsedMs − arcPx / speed × 1000| ≤ toleranceMs`, and otherwise a message naming the measured time, the distance, and the expected time ± the tolerance.
- `rallyPlan()` also returns `totalPx` (the path length it already computes).
- In `captureRally`:
  - Just before the march tap, an in-page `requestAnimationFrame` recorder (`window.__marchRec`) stores `simMs` on the first frame the squad is marching, the largest per-frame `simMs` step during the march, and `simMs` on the first frame it isn't marching again. No Node round trip or screenshot sits between the two ends.
  - The `(d)`/`(e)` waits are unchanged and only bound a hang.
  - `arcPx` comes from the progress actually walked, `|done.target − before.target| × plan.totalPx`, not from the planned tap point. That way the tap's snap doesn't count against the speed.
  - After the existing on-the-flag check, the run calls `marchTimeProblem(…, toleranceMs: 2 × maxFrameMs)` and throws `(e) …` if it returns a message.
- The existing `untilGameTime` budgets stay as they are. They're there to bound a hang, and they're now explicitly not the speed check.

## Approaches

1. **Measure the elapsed game time and compare it with the speed (chosen).** It checks speed both ways (too slow and too fast), with a tolerance derived from the frames observed during the march.
2. Cut `AUTO_SEND_SLACK_MS` for the march waits only. That catches only *slow* marches, and only loosely; a teleporting squad still passes.
3. Leave it and close the item as covered by unit and scene tests. The gap is that no live check ties the game loop's `dt` to the march, and that's what the capture run is for.

## Rulings (mine)

- **The tolerance is two of the largest frames observed during the march** (see Measured). It adapts to load: about 33 ms on a healthy 60 fps host, and up to 400 ms at Phaser's 200 ms frame cap. If wrong (a flake): the failure message carries the measured span, the expected time and the tolerance.
- **The distance is measured from the actual progress, not the planned arc.** If wrong: tap snapping (≤ 2 px, 33 ms) would add to the error.

## Edge cases

| Case | Expected |
|---|---|
| march at `SOLDIER_MARCH.speed` | elapsed within ±2 observed frames → no problem |
| slow host / slow screenshot mid-walk | both ends sampled in-page per frame → no problem |
| march at a slower speed (e.g. 0.7×) | elapsed far past expected → `(e)` throws with the numbers |
| march too fast / teleport | elapsed far short → throws |
| elapsed exactly expected ± toleranceMs | passes (inclusive bound) |
| the squad never marches or never arrives | the existing `untilGameTime` failures, unchanged |
