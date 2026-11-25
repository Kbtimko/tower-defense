# 2026-11-25 — HUD consistency (#40 b, c)

**Accomplished:**
- #149 (#88 editor rough edges) merged into `visual/integration`.
- **Backlog #40 (b, c):**
  - (c) HUD pulse classes no longer replay when the next level shows the HUD: `create()` strips `life-lost-pulse`, `gold-gain-pulse` and `cd-tick` inside `#hud-layer`.
  - (b) `#stat-wave` reads `waveMgr.waves.length`, and a data test pins `MAPS[i].waveCount` to `MAP_WAVES[i].length`.
  - Process: spec and plan self-approved (`[auto]`), 1 SDD task (Sonnet), a Sonnet task review (approved), an Opus final review (1 Important: the `create()` call itself was untested, fixed with a harness-driven test), and a Sonnet re-review.
  - Tests: helper tests, a data pin and a `create()`-level regression test. Every mutation fails its own test, including deleting the `create()` call (checked independently). Suite: 4283 tests in 269 files, exit 0.
  - Live A/B on a capture build, map 0: both pulses replayed on the restarted level before the fix, and none after. A fresh pulse still plays.

**Decisions made:**
- Strip the classes when the HUD is shown, not on `animationend`. A mid-pulse exit cancels the animation, so no `animationend` fires, and an `animationcancel` listener races `pulseClass`'s restart.
- Keep `maps.js` `waveCount`, pinned by a test, rather than deleting it: the capture harness reads it.
- The live probe must keep the HUD hidden across frames. `scene.restart()` hides and shows it in one task, so it never reproduced the replay.

**Where we left off:**
- The #40 PR is open into `visual/integration`. Merging is the user's.
- Open `[auto]` items include #39(d) (optional `featherAlpha`), #41–#42 remnants (mostly device-only checks), and #45 onward.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
