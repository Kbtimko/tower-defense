# 2026-10-22 — Visual roadmap Phase 2 wrap-up

**Accomplished:** In one long session, the user picked "pull 2.3 forward" for G3. Three Phase 2 PRs then shipped into `visual/integration`, and the user merged all three:
- **#100 (2.3 mobile shell):** fixed the landscape PLAY bug. The cause was a non-shrinking flex item plus page zoom from a 770-px bar.
- **#101 (2.1 pointer-first input):** release-to-tap, long-press inspect, ✕ Cancel, touch two-tap confirm, and the #40a fix.
- **#102 (2.2 side-rail HUD as DOM in game space):** a 1632×720 canvas with the map in a camera viewport.

The user then passed the G3 phone half on a real phone. Each PR has its own journal (`2026-10-22-mobile-shell-2.3.md`, `-input-model-2.1.md`, `-hud-rails-2.2.md`).

Housekeeping done:
- deleted the old `chore/session-log-visual` and all merged visual worktrees;
- committed the primary checkout's stray notes (#101);
- recreated this branch off `visual/integration` (after #102) for the wrap-up notes and the next kickoff prompt (`.claude/prompts/2026-10-22-next-session-kickoff.md`). There is no PR for it.

**Decisions made:**
- **2.3 before G3:** 2.3 was pulled ahead of G3, and 2.2 was kept out of that.
- **2.1 input rules:**
  - taps resolve on release;
  - long-press is touch-only and consumed only on a target;
  - two-tap confirm is touch/pen only;
  - Cancel lives in the HUD;
  - `title=` tooltips are deferred to 3.1.
- **2.2 layout:** side rails (user), DOM in game space (user), and 176-px two-column rails.
- **Memories saved:** the Phaser facts (`this.scene.pause()` is queued; the stale canvas after orientationchange; camera postFX is measured over the whole canvas; `pointer.camera` is undefined off the viewport), plus the warning that frozen probes hide timing bugs.

**Where we left off:** nothing is in flight.

Waiting on the user:
- **Backlog #44:** HIGH, a production crash with the tier-3 barracks panel on a tier-4 map. Needs a PR to `main`; ask first.
- **Backlog #43:** the desktop map is 10–17 % smaller at common window sizes.
- **G3 desktop half.**

Next roadmap task: 2.4 (device matrix).
