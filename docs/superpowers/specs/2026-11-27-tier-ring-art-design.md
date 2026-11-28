# Drop the tier stroke ring on towers with art — design (#66)

**Backlog:** #66 `[auto]` (#49 follow-up). User decision, 2026-11-27: "drop the ring for 66". They chose from the comparison sheet (bottom row: the ring only on art-less fallback towers).

## The ask, literally

> `Tower._redraw` still strokes the r=18 tier circle (1.5–4 px) OVER the sprite (S6 kept it). With pips/badge/core/ring it reads as clutter across the new core glow. Drop it when art is on, or keep only for the no-art fallback — user's call.

The user picked "drop". The fallback keeps both the ring and the disc, as in the sheet's bottom row.

## Verified in the code (2026-11-27)

- `Tower._redraw` (`src/entities/Tower.js` ~95) fills the dark disc only when `!this._sprite?.active`, but strokes `strokeCircle(0, 0, 18)` at `[1.5, 2, 3, 4][level - 1]` px every time.
- `Barracks extends Tower` and does not override `_redraw`, so the change covers it too.
- No other module reads `_bg`. The T4 ring (`GameScene._tierRingGfx`) is a separate graphic and is unaffected.
- The `_redraw` comment ("tier ... is encoded ONLY in this stroke width") has been out of date since 4.2: tier now reads from the pips, the A/B badge and the T4 ring.

## Design

In `_redraw`, the `lineStyle` and `strokeCircle` calls move inside the existing `if (!this._sprite?.active)` block. With art on, `_bg` draws nothing. The range ring and everything else stay the same. Both stale comments are updated.

## Approaches

1. **Move the stroke into the fallback branch (chosen).** Fallback towers have no pips, badge or embers on art, so they still need the stroke for tier.
2. Remove the stroke everywhere. Then an art-less fallback tower shows no tier at all. Rejected.
3. Hide `_bg` when art is on. Same pixels, but it adds a visibility state that `_redraw` would have to keep in step. Rejected.

## Rulings (mine)

- **The fallback keeps its ring.** That's what the sheet showed. If wrong: delete two lines.

## Edge cases

| Case | Expected |
|---|---|
| art on, tier 1 | no stroke, no fill on `_bg` |
| art on, upgraded to tier 3, then to T4 A/B | still no stroke after each `_redraw` |
| no art, tier 1 → 3 | fill + stroke; width 1.5 → 3 (unchanged) |
| barracks with art | no stroke (inherits `_redraw`) |
| range ring | drawn as before in both cases |
