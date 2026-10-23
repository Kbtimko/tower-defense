# 2026-10-23 — #52 Scout Mark hotfix, then roadmap 3.4 → 3.6

**Decisions (user):**
- #52 ships as a hotfix on `main` (deploys), then gets forward-ported (the #44 pattern).
- After #52: roadmap 3.4 → 3.5 → 3.6. #48/#49/#51 wait until after.

**#52: Scout Vex's Mark Target (Q)**
- Root cause: `Hero.fireAbility` hands aimed abilities the click point `{x, y}`, and `scoutMark` passed it on as the enemy. `_handleMark`'s `!target.dead` guard let it through, and `applyStatus` threw after the cooldown had started. The old unit test passed an enemy object, so it encoded the wrong contract.
- Fix: `scoutMark` picks the nearest live enemy within `MARK_PICK_RADIUS` (40 px, `src/data/heroAbilities.js`) and returns `null` on a miss, which leaves the cooldown unspent. The mark reticle stays the 24-px single-target crosshair.
- `main`: #110, merged. The production bundle `index-i4kWoJMU.js` contains the fix.
- Forward-port: the integration-only `heroes.aimRadius.test.js` now supplies an enemy under the aim point.
- Verification:
  - Each production build was instrumented with `window.__game` (never committed) and driven with real input.
  - `main`: the unfixed build reproduced the exact production `TypeError`. The fixed build applied a ×2/6 s mark with 0 errors.
  - Integration, desktop 1440×900 + iPhone 14 touch: a miss keeps the cooldown, a hit marks, 0 errors.
  - Tests: 1521 (`main`) / 2648 (integration). `npm run matrix`: 4/4 PASS.

**Lessons:**
- The map-start story dialog covers the canvas. Clicking the overlay does not dismiss it; use `#story-dialog-skip`. A probe click that "missed" was really advancing the dialog. `elementFromPoint` exposed this.
- The MCP browser was locked again. `playwright-core` in the scratchpad, launched with `executablePath` pointing at the cached `chromium-1248`, works without a download.
