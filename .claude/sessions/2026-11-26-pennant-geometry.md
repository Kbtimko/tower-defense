# 2026-11-26 — Pennant geometry module (#65b)

**Accomplished:** #154 (#65a) was merged. Shipped backlog #65(b) `[auto]` on `refactor/65b-pennant-geometry` (PR into `visual/integration`).
- `pennantCorners` and `growTriangle` moved out of `GameScene.js` into the new pure module `src/systems/pennantGeometry.js`. `pennantCorners` now takes the pennant size as its third argument, and GameScene passes `RALLY_FLAG.pennant`.
- New unit tests: every grown edge sits exactly d outside the original, plus d = 0 and the corner layout. The scene tests are unchanged. 3 mutations each fail their own test.
- Suite: 4305 tests in 271 files, exit 0.
- Live frozen-frame A/B (map 5, bad rally flag): pole, pennant and halo are pixel-identical.
- Commits: spec+plan 8dd8244, refactor 83f2ff6.

**Decisions made:**
- The size is passed in, not imported. That keeps the module data-free, like `rallyTarget.js`.
- No degenerate-triangle guard: the only input is the frozen pennant.
- I amended the implementer's commit trailer to the required Opus line. The haiku implementer had written its own model's name.
- The final review found the spec overclaimed what the scene tests prove: `expectFlagOnHalo` checks a margin of at least `haloPx`, not exact pixels. I reworded the spec. Identical output is shown by the verbatim move and the pixel A/B.

**Where we left off:** PR open, awaiting the user's merge. Still with the user: #82 trademark check, 6.4 publish (G5), G3 desktop + #30 playtest, the #87 ESLint decision. Next `[auto]` candidates: #65(c) capture walk-budget slack, #65(d) drone disengage retune (G3-dependent), #69(d) `fadeInFrac` NaN.
