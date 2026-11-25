# 2026-11-25 — Map editor previews the real road (#39c)

**Accomplished:**
- #147 (#23 damage-number pool priority) merged into `visual/integration`.
- **Backlog #39(c):** the dev map editor now previews the game's baked road, not the legacy Graphics strip.
  - It makes the same `bakeRoad` call as `GameScene._setupRoad`, under the key `road_editor@k` at `ROAD_DEPTH`.
  - It re-bakes only when an edit settles: pointer-up, insert or delete. During a waypoint drag it shows a live `renderPath` line and hides the stale bake.
  - The process: spec and plan self-approved (`[auto]`), 1 SDD task (Sonnet), a Sonnet task review (approved), an Opus final review (1 Important, the `pointerupoutside` release), one fix wave and a Sonnet re-review (approved).
  - Tests: 9 new, and six mutations each fail their own test. Suite: 4268 tests in 267 files, exit 0.
  - Live: a production build, map 3, the real mouse. Before, during and after the drag, plus an off-canvas release.

**Decisions made:**
- Bake when the edit settles rather than per move, because a full-canvas paint per pointermove would stutter.
- Fixed the off-canvas and lost mouse-up drag in this PR, because the new hidden-road state made the existing stuck drag visible. Other editor rough edges, which predate this branch, are logged as backlog #88.
- `InputPlugin.shutdown` runs `removeAllListeners()`, so the new `pointerupoutside` listener cannot stack on a scene restart.

**Where we left off:**
- The #39(c) PR is open into `visual/integration`. Merging is the user's.
- #39(d) (optional `featherAlpha`) and #88 (editor rough edges) are open `[auto]` items.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
