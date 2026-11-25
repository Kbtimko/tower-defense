# 2026-11-24 — Ground FX above the road (#39b)

**Accomplished:**
- #145 (#86 release tooling) merged into `visual/integration`. Removed its worktree.
- **Backlog #39(b):** the hero ground effects now draw above the opaque road.
  - The fire field and Immolate ring were at depth 2. The flame-wave cone and volley lines were at 5. The road is at 8.
  - All four now use `GROUND_FX_DEPTH = 8.75` in `src/data/roads.js`.
  - The process: spec and plan self-approved (`[auto]`), 1 SDD task, a Sonnet task review, an Opus final review (0 Critical/Important) and a comment-only follow-up.
  - The tests: an ordering invariant over the real constants, and a depth test per effect. All four mutations were proven by the controller, because the implementer's report left out the raw output.
  - Live: a capture build, frozen frame on map 0, depths read from the display list, and before/after screenshots. The road gap in the fire circle is gone.
  - Suite: 4253 tests in 267 files, exit 0.

**Decisions made:**
- Scope widened from the fire field to the cone and the volley lines: same defect, same fix.
- #39(a) was already done. (c), the map editor preview, needs a bake-on-pointer-up design. (d) is optional. Both stay on the backlog.
- Parked: the test hardcodes the static-layer depth of 10 (no constant exists); the volley lines are arguably shot FX.

**Where we left off:**
- The #39(b) PR is open into `visual/integration`. Merging is the user's.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
- The `release-zip` worktree still holds the zip from `main` and the media until upload.
