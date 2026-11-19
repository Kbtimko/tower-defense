# Map 9 and map 8 starting gold (backlog #37)

Roadmap 5.4 / gate G4, map 9 part. Maps 2 and 5 (#35, #36) are separate items.

## Why

On current `visual/integration` (after #75–#77), `npm run balance` shows:

| Map | Shipped | Result | Needs |
|---|---|---|---|
| 7 | start 240, reward 0.44 | 14/15 waves | 1.05x |
| 8 | start 270, reward 0.39 | 14/16 waves | 1.08x |
| 9 | start 300, reward 0.31 | **1/18 waves, 3 of 20 towers built** | 1.36x |

Map 9 dies on wave 1. #32 already showed that this isn't a strategy artefact: every barracks strategy loses.

## What the sweep showed (2026-11-19, best-of-5 headline)

- **The waves aren't the problem.** Scaling every map 9 enemy count down by 10–40% still needs 1.36–1.52x, because fewer kills also means less gold.
- **Raising the kill reward alone doesn't move it.** At reward 0.36 or 0.41 it still needs 1.36x.
- **Starting gold does, because it arrives early** (#16: "timing, not total"):

| Map 9 start | No perk | With +40% logistics |
|---|---|---|
| 600 | 1.05x | not measured |
| 630 / 660 | 1.03x | not measured |
| 675 / 690 / 705 / 720 | wins, 60 / 60 / 40 / 80% of lives | 690 → 966: wins, 60% |

- Map 8: start 390 / **405** / 420 gives 25% / **33%** of lives / a loss at 1.03x. 405 with the perk (567) keeps 67%.
- Map 7 at 240 already wins with the perk (336 → 42%), so it is left alone.
- The rejected mix (start 510 + reward 0.38) keeps 60% without the perk but 100% with it (too easy). Raising starting gold doesn't make maps too easy once the perk is added, because the board fills up and early gold stops helping.

## User's call (2026-11-19)

"Start gold 690" for map 9, and "Fix 8, leave 7" (map 8 start 405).

## Design

- `src/data/maps.js`:
  - map 9 `startGold: 690`; map 8 `startGold: 405`.
  - Both get an OVERRIDDEN comment in the style of map 5's: the derived value (25% of the cheap board), why it was overridden (the wave-1 cliff, the sweep numbers above), and that `rewardMult` stays derived.
- `src/data/mapsEconomy.test.js`:
  - Add a pin test, "late maps carry the #37 starting-gold overrides": map 8 starts with 405, map 9 with 690. Same style as the on-ramp pin.
  - The depth-ratio spread test excludes map 9, with a comment giving the reason. Map 9's ratio goes from about 0.56 to 0.62. Map 8 goes to about 0.58, which still fits the 0.05 spread.
  - These guards must stay green unedited:
    - gold per HP never rises (map 7 0.0400 ≥ map 8 ≈0.0350 ≥ map 9 ≈0.0263);
    - the opening hand never shrinks (240 → 405 → 690);
    - no late map is richer than map 2.
- **Fixtures that move for a legitimate reason:**
  - `legacyGolden.json`: re-capture with `node scripts/captureSimGolden.mjs`. Only the 10 keys `8:*` and `9:*` may change.
  - The #75 tiers 1–3 snapshot in `src/sim/t4Abilities.test.js` covers maps 0, 4 and 8. Only the map 8 entry may change.
- `UpgradeManager.test.js:216`: the comment "map 9: same as today's 300 + 120" is now stale. Make it "#31's sizing: 300 + 120". The input literal stays.
- **The logistics perk gives more on map 9:** +276 instead of +120, because it is a percentage of `startGold` (#31). This is accepted: with the perk, map 9 measured 60% of lives.

## Non-goals

- Map 7, map 2 (#36), map 5 (#35).
- `rewardMult` and wave tables are untouched.
- No campaign-wide re-derivation of the economy rule.

## Verification

- Unit: the pin test fails first at 300/270. The guard suite passes. Only the expected golden and snapshot keys change.
- Balance:
  - `npm run balance`: maps 8 and 9 move to OK, and every other row is byte-identical.
  - The auto-send "harder than before" count stays 0. If map 8 or 9 becomes harder under the countdown, stop and report.
  - `--t4` is run and its diff summarised.
- Live: the production build on map 9 opens with 690 gold (and on map 8 with 405), with 0 page errors.
