# HUD consistency (backlog #40 b, c) — design

**Status:** self-approved (`[auto]` item), 2026-11-25. Part (a) shipped in roadmap 2.1.

## Intent

Two small HUD defects, both raised by the 1.8 reviews:

- **(b)** The wave stat (`#stat-wave`) reads its total from `MAPS[id].waveCount`. The wave banner reads `waveMgr.waves.length`, which is the table that actually spawns. The two agree today, but nothing stops them drifting, and then the HUD would read "3/10" while the banner says "Final wave".
- **(c)** The `.life-lost-pulse` and `.gold-gain-pulse` classes (and `#wave-btn`'s `.cd-tick`) are added by `pulseClass` and never removed. `#hud-layer` is set to `display: none` when a level shuts down and back to `block` in the next `create()`. A CSS animation restarts when its element is displayed again, so the next level opens with a stale red lives pulse and gold pulse.

## Goals

- `_updateHUD` writes `${currentWave}/${this.waveMgr.waves.length}`, the same source as the banner.
- A data test pins `MAPS[i].waveCount === MAP_WAVES[i].length` for every map. The capture harness (`scripts/capture.mjs`, `deviceFlow.js`) still reads `map.waveCount` for its expected text, and the pin keeps that valid.
- When `create()` shows the HUD, it first strips every HUD pulse class from `#hud-layer`'s descendants. The classes are `life-lost-pulse`, `gold-gain-pulse` and `cd-tick`.

## Non-goals

- Pulses inside a level are unchanged: same classes, the same `pulseClass` restart, the same CSS.
- The wave banner and boss frame live outside `#hud-layer` and are never hidden, so they cannot replay. They are untouched.
- `#game.life-lost-frame` is on an element that is never hidden, so it cannot replay either. Untouched.

## Approaches for (c)

1. **Strip the classes when the HUD is shown (chosen).** It is deterministic and covers every way a level ends, including an exit mid-pulse. It sits beside the existing "clear `.disabled` left over from a previous game-over" reset in `create()`.
2. **Remove the class on `animationend`** (the backlog's suggestion). An exit mid-pulse hides the HUD, which cancels the animation, so `animationend` never fires and the class stays. Also listening for `animationcancel` races `pulseClass`'s own remove-and-re-add restart: the cancel event of the old run arrives after the class is re-added, and would kill the new pulse. Rejected.

## Approaches for (b)

1. **HUD reads `waveMgr.waves.length`, plus a data pin (chosen).**
2. Delete `maps.js` `waveCount` and move the harness to `MAP_WAVES`. It is cleaner in the long run, but it touches ten map entries, the required-fields test, `deviceFlow` and `capture.mjs` for no visible change. Rejected for this item.

## Left to the builder

Local helper names and the test harness shape.
