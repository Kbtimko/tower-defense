Read CLAUDE.md, then `.claude/notes.md` and `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md` as they exist on `origin/visual/integration` (`git fetch --all --prune` first). Also read `.claude/sessions/2026-10-27-session-wrap.md` from `origin/chore/session-log-2026-10-27`, which also holds this prompt. Don't trust the primary checkout: it is behind origin and has an uncommitted deletion of `.claude/session-wrapped`. Run `git status` before any pull.

State:
- Roadmap Phases 1–3 (all AUTO tasks) are merged into `visual/integration`.
  - The latest merge is #116, 3.6 results screen + stars (`e74371f`).
  - Only 3.2 (icon set, LOCAL via Draw Things) is left in Phase 3.
- `main` (Vercel production) is the old state plus hotfixes #44, #52 and #114 (stale-save writes).
- Tests: 3298.
- `npm run matrix` passed on all four devices on an idle machine. Under load, iPhone/iPad hit 30-s timeouts and desktop1440's reduced-motion probe flakes (#56a). Check `uptime` before you read a failure, and compare against the base.

Waiting on me (don't block on these):
- G3: real phone + desktop playtest, including the results screen.
- `visual/integration` → `main` after G3.
- #56(a): the reduced-motion probe fix.
- Housekeeping: listed in notes "Loose ends".

Task: backlog **#51, waves send automatically after a countdown**. After it come #48 (soldiers walk to a new rally point) and #49 (upgrade visuals, code half via the deferred-asset pattern), in that order.

For #51, read before the brainstorm:
- `GameScene._startWave`
- `_computeEarlyBonus` and `waveMgr.isEarlyEligible`
- how `src/sim/` schedules waves, since auto-send may change balance

Then ask me only the real design calls:
- countdown length, and whether it varies per map or per wave
- behaviour before wave 1 (likely no auto-start), while paused, and during a story dialog
- whether the early bonus keeps working as it does today
- how the countdown shows on the Send Wave rail button
- whether there's a setting to turn auto-send off

Show 2–3 animated mockups of the button countdown.

Watch out:
- The capture harness and matrix drive Send Wave and assume waves never start on their own. Auto-send could start waves in the middle of a capture. Keep the harness deterministic, and prove its checks still fail with the feature disabled.
- Results-screen time is sim time from Send Wave 1. Keep that true.

Workflow:
- Each task gets a fresh worktree: `visual/<id>-<slug>` (e.g. `visual/51-auto-send`) off `origin/visual/integration`, or `fix/<slug>` off `origin/main` for a production hotfix.
- **PRs target `visual/integration` directly.** After any merge, verify with `git merge-base --is-ancestor`.
- Pipeline:
  1. Brainstorm with the visual companion, using 2–3 animated mockups.
  2. Spec via the spec-writer agent. Then a builder-check subagent, and bring me only the "theirs" pile.
  3. Plan, then the `review-plan` skill.
  4. `superpowers:subagent-driven-development`: sonnet for pure modules, opus for UI, Phaser lifecycle, harness work and every review. Keep a ledger with every ruling.
  5. Final opus review, ONE fix wave, then a scoped re-review.
- **Live check:** run it yourself on the production build after every UI task, at desktop 1440×900 and iPhone 14, with real input (`page.mouse` / `touchscreen`). Look at the captures yourself. Reviewers' "matches the mockup" has been wrong twice.
  - The MCP browser is often locked. Use `playwright-core` from the scratchpad with the cached `chromium-1248`.
  - Production builds have no `?debug=`. Seed `lastlight_save` (the **v5** envelope now, with `records`) to reach later maps.
- Rules:
  - Tunables go in `src/data/`.
  - Pure logic is Vitest-tested, and each new test is proven to fail on broken code.
  - Kit CSS uses `var(--ui-*)` tokens and `calc(N * var(--ui-u))` lengths, with no hex. These guards stay green: themeCss, kitRollout, noNativeTitles, railCss, typeFloor, storyDialogCss, resultsCss.
- Gates:
  - `npm test` and `npm run build`
  - `npm run matrix`
  - `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` with zero problems
  
  Commit captures as JPEG q90 in `docs/captures/<task>/`.
- Don't loosen timeouts.
- Commit notes and the session file onto the feature branch before `gh pr create`. If the PR is already merged, use a fresh `chore/session-log-<date>` branch.
- Stop after 4 tasks, at a GATE, or after the same failure twice, and summarize what waits for me.
