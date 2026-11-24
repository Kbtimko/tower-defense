# 2026-11-23 — Portfolio README (roadmap 6.3)

**Accomplished:**
- #142 (#81) was merged by the user; removed its worktree. Started 6.3 in `.claude/worktrees/readme-63`.
- Spec `docs/superpowers/specs/2026-11-23-portfolio-readme-design.md` and plan `docs/superpowers/plans/2026-11-23-portfolio-readme.md`, both user-approved. Executed with subagent-driven development: 3 tasks, per-task reviews, an Opus final review, one fix wave and a scoped re-review.
- **Gallery:** 7 before/after pairs plus a full-board hero in `docs/readme/` (96166ba, e96a9a1).
- **Facts sheet** (workspace-only):
  - every number measured with a recorded command;
  - 7 incidents checked against commits; 6 kept after merging the two UIScene entries;
  - commit authorship measured.
- **`README.md`** plus the link-guard test `src/assets/readmeLinks.test.js` (1f5b5df, then c8f9960 and the final-review fix wave 2d9fd7d..17b8aeb).

**Decisions made:**
- User:
  - the reader is engineers only, with no game pitch;
  - Claude Code's role is front and centre;
  - one README as the case study (approach A);
  - the early commits without the co-author trailer were "Claude Code from day one".
- The README states the live-site status date-anchored. On 2026-11-23 the site served `main`, 535 commits behind `visual/integration`.
- The jagged-pads incident is told as the A/B flagging it and a 4x crop confirming it. The controller's 3-of-4 and 0.5% figures are not in the repo, so they aren't quoted.

**Where we left off:**
- PR open into `visual/integration`; merging is the user's.
- GitHub's front page shows `main`, which has no README, so the README appears there only after `visual/integration` → `main`.
- Next: 6.4 publish (G5, the user's gate). Before it:
  - the #82 trademark check;
  - rebuild `npm run package:itch` and `npm run release:media` (the outputs were removed with the 6.2 worktree, and the zip must now carry the notices).
- An iPhone `--screens` harness audit failed under self-induced load (a reduced-motion tap-timing check). Judged a load flake, the backlog #61 class.
- Still with the user: the G3 desktop half, the #30 playtest, and `visual/integration` → `main`.
