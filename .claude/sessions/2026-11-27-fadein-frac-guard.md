# 2026-11-27 — Ember fade-in edge values (#69d)

**Accomplished:** I picked up backlog #69(d) `[auto]` on `fix/69d-fadein-frac`. The PR goes into `visual/integration`. **It is not a bug.**
- `emberPose`'s envelope divides by `fadeInFrac` only when `phase < fadeInFrac`, and by `1 − fadeInFrac` only otherwise, so neither 0 nor 1 can divide by zero.
- Measured against the real module: 300,003 samples per value, 0 non-finite. The Opus final review re-derived the result independently with 12M samples. A NaN needs `phase === 1`, which needs a negative clock, and Phaser's `TimeStep` clamps every delta with `Math.max(0, …)`.
- Shipped: one regression test, "stays finite and in [0, 1] at fadeInFrac 0 and 1". A `Math.min` rewrite of the envelope fails only this test.
- Suite: 4306 tests in 271 files, exit 0.
- Commits: spec+plan 09098ff, test c920b4b.

**Decisions made:**
- Closed as not a bug, with no clamp, because the input is unreachable.
- No failing-first test, since there's no bug to reproduce. The mutation shows the test's strength.
- No live browser check: nothing changes at runtime.
- **The user said #156 was merged, but GitHub still showed it OPEN** (checked twice, `mergedAt` null). This PR therefore touches only the #69 backlog line in `notes.md`, plus this journal. The Current Status and In Progress blocks are left for the next branch, so the two PRs don't conflict on `notes.md`.

**Where we left off:** PR open. #156 (#65c) is still open; it needs the user's merge. Still with the user: #82 trademark check, 6.4 publish (G5), G3 desktop + #30 playtest, the #87 ESLint decision. Next `[auto]`: #66/#67 (each needs a design pick from the user), #65(d) (waits on G3), and older follow-up bundles (#41, #45, #47, #50, #53–#56, #58, #60, #61, #71, #79, #83, #85).
