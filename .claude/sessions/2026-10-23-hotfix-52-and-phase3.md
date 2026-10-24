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

**Roadmap 3.4 — title screen + story world map** (branch `visual/3.4-title-world-map`)
- **Brainstorm.** Visual companion mockups.
  - Title: the user picked option A, "beam sweep".
  - World map: the user said it had "no background, no connection to progress in a story — why am I going map to map?". They picked the deep-space vista and asked for more planets.
  - After a win: the user wants to "transition back to the world map and show the movement to the next stage".
  - The user said "move forward", so Claude settled the spec's §12 questions itself (listed in the spec).
- **Pipeline:**
  - spec (spec-writer, then a builder check)
  - plan with 10 tasks, plus review-plan
  - subagent-driven execution: sonnet for the pure modules, opus for UI/lifecycle work and all reviews
  - final whole-branch review on opus, then one fix wave
- **The controller's own live checks caught issues the tests and reviews passed:**
  - the ship covering a node label;
  - route lines cutting through labels;
  - the quote clipped on iPhone;
  - the trail running ahead of the ship.
- **Reviews caught:**
  - a hudLayer `#game canvas` regression: the new world-map canvas sat under `#game`, which gave a zero map rect in levels;
  - harness checks that passed even when the skip was broken;
  - Space dead on the world map after a level (UIScene outlives levels);
  - an idle full-viewport repaint, now capped at about 6.6/s.
- **Gates:**
  - `npm test` 2888
  - build
  - matrix: desktop 17/17, touch 18/18
  - capture `--screens`: 5 devices, 0 problems
- **Live smoke (production build, 1440×900 and iPhone 14):**
  - fresh save: title → intro → LAUNCH reaches the level
  - partial and complete saves
  - a v2 save migrates
  - the only console noise was `/favicon.ico`
- **Lessons:**
  - A new canvas under `#game` silently changes any `#game canvas` lookup. Use `#game > canvas`.
  - A harness "expect done" with a 10 s timeout passes even when a skip does nothing, because the animation finishes by itself. Bound the wait tighter than the remaining animation.
  - An event handler in a scene that outlives levels must check that its scene is active, or it eats input on other screens.
