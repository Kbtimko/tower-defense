# Bad ghost at full alpha — design (#65a)

**Backlog:** #65(a) `[auto]` (from the #48 final reviews). Self-approved under the `[auto]` rule.

## The ask, literally

> (a) The out-of-range red ghost reads pink at `ghostAlpha` 0.6 on red maps — consider full alpha for the bad ghost.

## Why

The red ghost is the game saying "this tap won't do what you want": a rally point out of range or off the road, or a move with no pad in reach (or a cancel, since #89). At 0.6 it mixes with warm ground into a salmon-orange that reads as a tint of the map, not a warning.

## Measured (before choosing)

These are composites of `PALETTE.danger` `#f07a7a` and the halo `PALETTE.panel` `#0f1424` over mean ground pixels from live captures. The 2 px stroke sits on its own halo, so the mark is blended over the halo composite, not the bare ground. CR is the WCAG contrast ratio.

_Corrected after the final review: the first draft blended the 0.6 mark straight over the ground. The live frozen-frame reading of the old ring, (157,87,82) after anti-aliasing, matches these rows._

| Ground | alpha | Halo | Mark colour | CR mark/ground | CR mark/halo |
|---|---|---|---|---|---|
| map 5 desert (211,142,57) | 0.6 | (93,69,44) | (181,101,91) | 1.55 | 2.12 |
| | 1.0 | (15,20,36) | (240,122,122) | 1.01 | **6.78** |
| map 0 (155,90,53) | 0.6 | (71,48,43) | (172,92,90) | 1.13 | 2.57 |
| | 1.0 | (15,20,36) | (240,122,122) | **1.99** | **6.78** |

Full alpha raises the mark-to-halo contrast 3.2× on the desert and 2.6× on map 0, and the halo becomes a solid dark outline instead of a 60% brown smear. On the desert, the full-strength danger red has the same luminance as the sand (CR 1.01), so there the halo carries the legibility. The "pink" is partly the palette's own `#f07a7a`, a salmon red. Changing the palette is out of scope, because the same token colours the UI's danger buttons.

**Measured live after the change** (map 5, frozen frame, median of the strongest-coloured pixel at the ring radius over 120 angles): bad ring (157,87,82) → (208,107,110). The OK ring was unchanged at (85,123,131).

## Behaviour

- New tunable `RALLY_FLAG.badAlpha = 1` in `src/data/soldiers.js`.
- **Every mark drawn in `RALLY_BAD` uses `badAlpha` for itself and for its halo.** OK marks keep `ghostAlpha` (0.6), so the green or blue ghost still reads as a preview.
  - Rally range ring: bad iff `t.onRoad && !t.inRange` → the ring's halo and stroke use `badAlpha`; otherwise `ghostAlpha`.
  - Rally ghost flag: bad iff `!t.valid` → the flag's halo and marks use `badAlpha`; otherwise `ghostAlpha`. Each mark's alpha follows its own colour: off the road the flag is bad while the ring stays OK.
  - Move ring: bad iff `!slot` (no pad in reach, or the #89 cancel) → the halo and stroke use `badAlpha`.
- Route dots and the planted-flag fade are untouched. They are never bad.

## Approaches

1. **Full alpha for bad marks (chosen).** This is the backlog's suggestion, and the measurement backs it. One tunable.
2. A separate, deeper in-world red (for example `#d94040`). This fixes the hue too, but introduces an off-palette colour, which roadmap 3.1 policed out. It is a palette decision for the user.
3. A thicker bad stroke. Width doesn't fix a hue that blends with the ground.

## Rulings (mine)

- **The halo goes to full alpha with its mark.** The halo is what carries contrast on the desert. If that's wrong, it's one argument per call site.
- **The palette is not changed; noted for the user.** If wrong: approach 2 is a follow-up.

## Edge cases

| Case | Expected |
|---|---|
| Rally: cursor on the road, in range | ring and flag OK at 0.6 |
| Rally: on the road, out of range | ring and flag bad at 1 (halo too) |
| Rally: off the road | ring OK at 0.6, flag bad at 1 |
| Move: over a free pad | ring OK at 0.6 |
| Move: no pad in reach / cursor on the barracks | ring bad at 1 (halo too) |
