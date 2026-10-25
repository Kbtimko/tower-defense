Read CLAUDE.md, then `.claude/notes.md` and `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md` as they exist on `origin/visual/integration` (`git fetch` first). Also read `.claude/sessions/2026-10-24-session-wrap.md` from `origin/chore/session-log-2026-10-24`; it holds the latest state, and this prompt is there too. The primary checkout is stale, so don't trust it.

State:
- Merged into `visual/integration`:
  - roadmap Phase 1 and Phase 2 (2.1–2.4)
  - #43 (desktop rails)
  - 3.1 theme module
  - 3.3 radial menus
  - 3.4 title screen + story world map (#112)
  - 3.5 action-comic story dialogs (#113)
- Phase 3 has only **3.6 results screen + stars** left.
- `main` (= Vercel production) has only two hotfixes on its old state: #44 (barracks) and #52 (Scout Mark, #110).
- 3049 tests.
- `npm run matrix` is the regression gate. After 3.5, desktop 17/17 and pixel 18/18 passed. **iPhone and iPad were not confirmed:** under host load (load average 6–19) they hit `page.screenshot`/locator 30-s timeouts at varying steps, and the untouched pre-3.5 base fails the same way.

Waiting on me:
- An idle-machine `npm run matrix`.
- The G3 gate:
  - desktop: the narrow rails, Safari/Firefox, the theme look, the radial;
  - real phone: rails, gestures, radial, long-press peeks, title + world map, story dialogs.
- `visual/integration` → `main` after G3.

First, run `npm run matrix` once from a fresh worktree off `origin/visual/integration`, with full output. Check the load average and report it. If iPhone/iPad still fail only on timeouts while the machine is busy, say so and move on. Do not loosen timeouts.

Then ask me ONE question, with your recommendation first:
(a) **Roadmap 3.6, results screen + stars.**
  - Victory/defeat screens with stats.
  - A 3-star rating whose lives-remaining thresholds live in `src/data/`; it currently lives in `GameScene._onVictory` as 0.8 / 0.5.
  - `SaveManager` extended, with tests.
  - It closes Phase 3. It replaces today's `#game-msg` overlay, which 3.4 left for 3.6: "↩ World Map" and the `{ from }` return.
  - Ask only the real design calls: what the screens should show, star rules, and the replay / next-mission buttons.
(b) **Or my backlog first:**
  - #51 auto-send waves after a countdown
  - #48 soldiers walk to a new rally point
  - #49 towers and soldiers look different as they upgrade (the code half: tier pips, glow, scale, using the deferred-asset pattern)

Then proceed.

Workflow (what worked these sessions):
- Each task gets a fresh worktree: `visual/<task-id>-<slug>` off `origin/visual/integration`, or `fix/<slug>` off `origin/main` for a production hotfix.
- **PRs target `visual/integration` directly, never another PR branch.** After any merge, verify with `git merge-base --is-ancestor`.
- Pipeline:
  1. Brainstorm with the visual companion. I like picking from 2–3 animated mockups. Ask only the real design calls.
  2. Spec via the spec-writer agent → `docs/superpowers/specs/`. Then a builder-check subagent, and bring me only the "theirs" pile.
  3. Plan → `docs/superpowers/plans/`, then the `review-plan` skill.
  4. `superpowers:subagent-driven-development`: sonnet for pure modules, opus for UI, layout, Phaser lifecycle, harness work and all reviews. Keep a ledger with every ruling.
  5. Final whole-branch review on opus, then ONE fix wave and one scoped re-review.
- **The controller runs its own live check on the production build after every UI task** (desktop 1440×900 + iPhone 14), with real input, before trusting the reviews. Look at the screenshots against the mockup. In 3.4 and 3.5 this caught every visual bug the tests and reviews passed.
- Browser probes:
  - Real input only: `page.mouse` / `touchscreen`; CDP for long-press.
  - Scroll into view before coordinate taps.
  - Wait out CSS transitions.
  - Block BOTH `.woff` and `.woff2` to test font fallback.
  - The MCP browser is often locked. Use `playwright-core` from the scratchpad with `executablePath` pointing at the cached `chromium-1248`.
- Production builds have no `?debug=` hooks. Seed localStorage `lastlight_save` (v4 envelope) to reach later maps or story beats.
- Harness lessons:
  - Bound an "expect" tighter than the natural animation, so a no-op action fails.
  - Do the proving action first in a step.
  - Prove every harness check fails with the feature disabled.
- Tunables go in `src/data/`. Pure logic is Vitest-tested, and each test is proven to fail on broken code.
- Kit CSS:
  - paint only, using `var(--ui-*)` tokens;
  - lengths as `calc(N * var(--ui-u))`;
  - no hex in new UI CSS.
  
  These guards must stay green: themeCss, kitRollout, noNativeTitles, railCss, typeFloor, storyDialogCss.
- Gates:
  - `npm test` and `npm run build`
  - `npm run matrix`
  - `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` (zero problems)
  
  Commit captures as JPEG q90 in `docs/captures/<task>/`.
- Commit notes and the session file onto the feature branch before `gh pr create`; never open a notes-only PR. If the PR is already merged, use a fresh `chore/session-log-<date>` branch.
- Stop after 4 tasks, at a GATE, or after the same failure twice, and summarize what waits for me.

Housekeeping (my call):
- Delete these stale remote branches: `chore/session-log-visual`, `chore/session-log-2026-10-23` (content landed via #104 / #111) and `chore/session-log`.
- Merged worktrees to sweep with `commit-commands:clean_gone`: `.claude/worktrees/{scout-mark, scout-mark-fwd, session-wrap, title-world-map, story-dialogs, session-wrap-1024}`, plus older ones listed in `notes.md` "Loose ends". Check `git status` in each first.
- The primary checkout (`~/projects/tower-defense`) is behind origin and has an uncommitted deletion of `.claude/session-wrapped`. Run `git status` before any pull.
