# 2026-11-26 — Rally capture checks march speed (#65c)

**Accomplished:** #155 (#65b) was merged. Shipped backlog #65(c) `[auto]` on `chore/65c-walk-budget` (PR into `visual/integration`). It's a harness-only change.
- `captureRally` times the squad's march with an in-page rAF recorder (`window.__marchRec`), and the new `marchTimeProblem` in `scripts/captureCore.mjs` checks it. The tolerance is 2 × the largest frame seen during the march.
- Commits:
  - spec and plan 0876fee
  - first implementation aacac67
  - fix wave 044d682
- Suite: 4308 tests in 271 files, exit 0.
- Live A/B on rally-only desktop runs:
  - the normal run passes: 2533 against 2484 ms;
  - a 0.7× march fails under the new harness (3580 ms) and passes under the old one;
  - with a 1.2 s screenshot delay, the fixed harness passes and the pre-fix harness falsely fails (2843 ms).

**Decisions made:**
- The distance comes from the progress actually walked (`|Δprogress| × pathLength`), not from the planned tap point.
- The final review was Not ready. Both ends had been sampled by Node polls that start after round trips, and the arrival poll came after the mid-walk screenshot. I fixed this in one wave by moving both samples in-page. The write-before-update offset and the last frame's overshoot bound the error to (−max, +2·max), which gives the 2-frame tolerance. I corrected the spec to match.
- The re-review left two Minors, both accepted:
  - the recorder keeps running after a `(d)` failure;
  - a stalled screenshot frame widens the tolerance to at most 400 ms, which still catches 0.7×.
- Parked: the tolerance prints unrounded in the failure message.

**Where we left off:** PR open, awaiting the user's merge. Still with the user: #82 trademark check, 6.4 publish (G5), G3 desktop + #30 playtest, the #87 ESLint decision. Next `[auto]`: #69(d) `fadeInFrac` NaN; #65(d) waits on G3.
