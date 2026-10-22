Read CLAUDE.md, then .claude/notes.md and docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md as they
exist on origin/visual/integration (git fetch first; the primary checkout is ~80 commits stale). Also merge in
.claude/notes.md and .claude/sessions/2026-10-22-visual-phase2-wrap.md from origin/chore/session-log-visual; they
hold the latest state, and this prompt is there too.

State: visual roadmap Phase 1 (1.1–1.9) plus Phase 2 tasks 2.3 mobile shell (#100), 2.1 pointer-first input (#101)
and 2.2 side-rail HUD (#102) are merged into visual/integration. main (= Vercel production) is untouched. 2229 tests.
The G3 phone half PASSED on a real phone (after #100). Still open: the G3 desktop half, a real-phone look at the 2.2
rails and the 2.1 gestures (long-press inspect, two-tap Upgrade/Sell, ✕ Cancel; iOS-Safari specifics in backlog #42),
and roadmap 2.4 (device matrix).

Two items need me:
- backlog #44 (HIGH, live on production): tapping a tier-3 barracks on a tier-4 map throws in
  GameScene._setUpgradeButton, so the panel never opens and the barracks can't be sold or moved. It's pre-existing and
  also on main.
- backlog #43: since 2.2 the desktop map is 10–17 % smaller at 1440×900 and 1920×1080. The 1632×720 canvas letterboxes
  on 16:9/16:10. The cheapest fix is narrower rails on (pointer: fine).

First, ask me ONE question covering, in this order of your recommendation:
(a) fix #44 on main now: branch off origin/main, failing test first, PR into main (which deploys), and the same fix
    forward-ported into visual/integration;
(b) #43 desktop rails: accept, narrow on fine pointers, or flexible rails;
(c) go straight to 2.4.
Then proceed.

Workflow (same as last session):
- Branch visual/<task-id>-<slug> off origin/visual/integration in a fresh worktree. A #44 hotfix branches fix/<slug> off
  origin/main instead.
- Write a plan in docs/superpowers/plans/ and execute it with superpowers:subagent-driven-development. Use opus
  implementers and reviewers for coordinate, layout or Phaser-lifecycle work.
- Tunables go in src/data/; pure logic is Vitest-tested and mutation-checked.
- Run npm test, npm run build, and
  npm run capture -- --screens --maps 0 --devices desktop,phone844,phone932,iphone,pixel. It must exit 0 with zero
  LAYOUT lines. LOOK at the screenshots.
- Browser-verify as the controller with REAL input (Playwright mouse/touchscreen, CDP touch for holds). Freeze frames
  to probe live objects, but ALSO probe at normal speed for anything timing- or gesture-related; freezing hid a real
  long-press bug in 2.1.
- Verify every Phaser timing or scale claim against node_modules/phaser/src before acting on it. Two reviewer claims
  were wrong this session: this.scene.pause() is queued, and orientationchange refresh() uses a stale parentSize.
- PRs go into visual/integration, never main. The only exception is the #44 hotfix, and only if I pick (a).
- Commit the notes/session file onto the feature branch before gh pr create. Don't open a notes-only PR.
- Stop after 4 tasks, at a GATE, or after the same failure twice, and summarize what waits for me.

Also available: the Draw Things API on http://127.0.0.1:7860 for LOCAL art tasks.

Housekeeping:
- The primary checkout (~/projects/tower-defense) is on visual/integration, behind origin. Its only local change is a
  deleted .claude/session-wrapped hook marker, so it's safe to `git pull` after a `git status`.
- An auto hook still appends to the frozen SESSION_NOTES.md archive. Tell me if it fires again.
- Merged local branches (visual/0.x–2.x, chore/*, old feat/*) can be swept with commit-commands:clean_gone. Check
  `git status` in each remaining worktree first.
