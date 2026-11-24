# 2026-10-26 — Results screen + stars (roadmap 3.6)

**Accomplished:**
- **Idle matrix (2026-10-24, load 2.4):** desktop 17/17, iphone/pixel/ipad 18/18 on `visual/integration` after 3.5. The 3.5 iPhone/iPad timeouts were host load. The 3.5 open gate is closed.
- **Hotfix #114 → `main` (live, bundle-verified) + forward-port #115:**
  - **Bug:** `SaveManager` instances wrote stale whole snapshots. Muting or toggling ambient motion after a win wiped that win's stars on reload.
  - **Fix:** every mutator now `_refresh()`es from storage first.
  - **Proof:** browser A/B on both lines (stars 3 → 0 before the fix, 3 kept after).
- **Roadmap 3.6, the action-comic results screen** (PR into `visual/integration`):
  - Process: user picked mockup B. Spec, then builder check, then plan, then review-plan. 8 SDD tasks with an opus review each, an opus final review, one fix wave, scoped re-reviews.
  - Save v5 records, RETRY, the NEXT MISSION hand-off with LAUNCH focused, the same-frame defeat-wins fix, and a capture harness with 4 proving runs, each proven to fail with its feature disabled.
  - Tests 3055 → 3298.

**Decisions made:**
- **User:**
  - Option B (action comic).
  - Star rule unchanged at 80/50 %.
  - NEXT MISSION flies via the world map.
  - Per-map best record with a NEW BEST stamp.
  - Command speaks on a win, the Veth taunt on a loss.
  - Records store fewest lives lost, and the chip shows the honest n/run-start count.
  - Hotfix the stale-save bug to `main` first.
- **Claude's calls:** spec §3 (30 calls) plus the SDD ledger rulings, listed in the PR body.
- **Process lessons:**
  - **Container queries measure the CONTENT box.** `.rs-stage`'s padding put desktop1440 (697 → 670) in the wrong tier.
  - **Reviewers misjudge screenshots.** A fix report and its re-review both said desktop1440 "stays tall" while the committed shot showed the short tier. Only the controller's own look at the live build caught it. The controller views the captures itself.
  - **The new layout audit paid for itself immediately:** it caught a real 720p/iPad clip.
  - **A load-flaky probe is not automatically a regression.** An interleaved A/B (20 rounds each) showed the 200-ms fade finishing at a median of about 340 ms on both base and fix. The probe's 300-ms bound is miscalibrated; that's backlog #56(a), the user's call.

**Where we left off:**
- The 3.6 PR is open into `visual/integration` and still needs merging. Phase 3 is complete when it merges.
- **Waiting on the user:**
  - Merge the 3.6 PR.
  - G3 on a real phone + desktop, which now also covers the results screen.
  - `visual/integration` → `main` after G3.
  - The #56(a) probe fix.
  - Housekeeping: stale remote branches and merged worktrees, including `.claude/worktrees/{stale-save, stale-save-fwd}`.
- **Next, the user's order:** backlog #51 (auto-send waves), #48 (soldiers walk to the rally point), #49 (upgrade visuals).
