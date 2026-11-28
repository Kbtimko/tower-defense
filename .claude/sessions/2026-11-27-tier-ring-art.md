# 2026-11-27 — Drop the tier ring on art towers (#66)

**Accomplished:**
- #158 (#54 b, c, g, h) merged.
- Backlog #66 was built on the user's call, "drop the ring for 66".
- `Tower._redraw` now strokes the r=18 tier ring only inside its art-less fallback branch, alongside the dark disc. Barracks inherits the change.
- Spec: `docs/superpowers/specs/2026-11-27-tier-ring-art-design.md`. Plan: `docs/superpowers/plans/2026-11-27-tier-ring-art.md`.
- Commits:
  - c81365c: docs
  - 0ac49f6: the fix and tests
  - aba0820: fix wave (corrected comment, barracks test)
- **Live A/B** (capture builds on map 9):
  - With art, the `_bg` command count went from 14 to 0 for all six towers.
  - With tower sprites blocked, the fallback stays at 27.
  - The range ring stays at 14.
  - No page errors.
- Suite: 4324 tests in 271 files, exit 0.

**Decisions made:**
- The fallback keeps its ring, as in the sheet's bottom row.
- The final review found that the spec's stated reason was wrong. Fallback towers do get the pips, badge and T4 ring. The comment, spec and plan are corrected: the fallback ring is kept by choice.
- The `upgrade(4, 'a')` key in the plan was caught at review-plan; TOWER_DEFS uses `tier4A`.

**Where we left off:**
- PR open into `visual/integration`.
- With the user: #67 badge occlusion, #82, 6.4/G5, G3/#30, #87.
- Next `[auto]`: #55(a, b), #56(a, b), #85.
