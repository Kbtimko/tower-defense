Read CLAUDE.md, then .claude/notes.md and docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md as they
exist on origin/visual/integration (git fetch first). Also read .claude/notes.md and
.claude/sessions/2026-10-23-session-wrap.md from origin/chore/session-log-2026-10-23: they hold the latest state, and
this prompt is there too. Don't trust the primary checkout; it is stale.

State:
- Merged into visual/integration:
  - visual roadmap Phase 1 and Phase 2 (2.1–2.4);
  - #43 (104-px rails on fine pointers);
  - 3.1 theme module (Orbitron + Rajdhani, strict art-bible palette, CSS kit .ui-panel/.ui-btn);
  - 3.3 radial build/upgrade menus (#tower-panel gone; long-press tower inspector; HintPeek replaced title=).
- main (= Vercel production) has only the #44 barracks hotfix on top of its old state.
- 2644 tests.
- `npm run matrix` passes on desktop, iphone, pixel and ipad and is the regression gate.

Waiting on me:
- G3 Phase-2 gate:
  - desktop: the narrow rails, Safari/Firefox (never checked), the theme look, the radial;
  - real phone: rails, gestures, radial, long-press peeks.
- visual/integration → main is my call after G3.

First, ask me ONE question covering, in this order of your recommendation:
(a) backlog #52 (HIGH, live on production): Scout Vex's Mark Target (Q) throws `target.applyStatus is not a function`
    on every use. The cooldown starts but no mark is applied. Fix it on main the way #44 was done: branch off
    origin/main, write a failing test first, PR into main (which deploys), then forward-port into visual/integration.
    Or fix it only in visual/integration;
(b) what comes next after that:
    - roadmap 3.4 title & map select (AUTO; also takes #41f meta-bar restyle and #50a small text on font-only screens),
      then 3.5 story dialogs and 3.6 results + stars;
    - OR my backlog items first: #51 auto-send waves after a countdown, #48 soldiers walk to a new rally point, #49
      towers and soldiers look different as they upgrade (code half: tier pips/glow/scale, deferred-asset pattern).
Then proceed.

Workflow (what worked last session):
- Each task gets a fresh worktree:
  - visual/<task-id>-<slug> off origin/visual/integration;
  - a #52 hotfix branches fix/<slug> off origin/main.
- **PRs target visual/integration directly, never another PR branch.** Stacked bases silently merged #105/#106 into the
  wrong branch.
  - If work depends on an open PR, branch from its head but still target visual/integration.
  - After any merge, verify with `git merge-base --is-ancestor`.
- Pipeline:
  - brainstorm (ask only the real design calls);
  - spec via the spec-writer agent → docs/superpowers/specs/;
  - plan → docs/superpowers/plans/;
  - superpowers:subagent-driven-development, with opus for UI/layout/Phaser-lifecycle tasks and reviews and sonnet for
    pure modules;
  - final whole-branch review on opus;
  - one fix wave.
- **After wiring any UI, the controller runs a live smoke test on the production build** (desktop 1440×900 +
  iPhone 14) before trusting the reviews. Last session this caught a missing upgrade cost and labels clipped outside
  the circle, both of which the reviews had passed. Use a separate browser-acceptance agent for the spec's acceptance
  list.
- Browser probes:
  - real input only (page.mouse / touchscreen; CDP Input.dispatchTouchEvent for long-press);
  - wait out CSS transitions (~400 ms) before reading styles;
  - block BOTH .woff and .woff2 to test font fallback;
  - measure hover/selected against a neighbour;
  - script the worktree's own node_modules/playwright when the MCP browser is busy.
- Production builds have no ?debug= hooks; seed localStorage `lastlight_save` (v4 envelope) to reach later maps.
- Tunables go in src/data/. Pure logic is Vitest-tested and each test is proven to fail on broken code.
- Kit CSS:
  - paint only;
  - `calc(N * var(--ui-u))`;
  - rail lengths `calc(Npx * var(--hud-k))`;
  - guards railCss/themeCss/kitRollout/noNativeTitles must stay green.
- Gates: npm test, npm run build, npm run matrix, and
  `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` (zero problems). LOOK at the
  screenshots.
- Commit notes and the session file onto the feature branch before `gh pr create`; never open a notes-only PR.
  Captures go in docs/captures/<task>/ and are linked in the PR body.
- Stop after 4 tasks, at a GATE, or after the same failure twice, and summarize what waits for me.

Housekeeping:
- origin/chore/session-log-visual is stale (its content landed via #104) and can be deleted if I say so.
- Merged local branches can be swept with commit-commands:clean_gone. Check `git status` in each remaining worktree
  first.
- The primary checkout (~/projects/tower-defense) is behind origin. Run `git status` before any pull.
