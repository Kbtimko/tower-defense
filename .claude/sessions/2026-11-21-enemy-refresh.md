# 2026-11-21: Roadmap 4.3, enemy refresh (and 4.4 superseded)

**Accomplished:** branch `visual/4.3-enemy-refresh`, PR into `visual/integration`. It contains #138 (4.5), so merge #138 first.
- New drone, phantom and titan art, installed at 1x and 2x. The drone is now reproducible, so no entity stays 1x at k = 2.
- Footprints held:
  - drone and phantom at their old scale;
  - titan at 0.99, holding its longest side at 104.
- The 2x ground-width gate allows one 1x source pixel per edge.
- Art-pipeline fixes, shared with 4.5:
  - gap refills use their own seeds;
  - `post()` uses node:http with a 30 min timeout.
- Final-review fix wave:
  - the seed passthrough test;
  - `art:apply`'s 2x hint;
  - a sharp-based footprint test held to 5%;
  - the titan comment;
  - a pinned default timeout.
- Roadmap: 4.3 and 4.5 ticked, 4.4 marked superseded.
- 4130 tests pass.

**Decisions made:**
- **User decisions:**
  - regenerate drone, phantom and titan;
  - skip hurt poses;
  - generate with Chrome open;
  - mark 4.4 superseded;
  - "go with your suggested" picks.
- **Controller rulings:**
  - Titan pick #6 instead of the suggested #8, because #8 has a faint baked shadow beside its legs.
  - The width tolerance is `max(outline, 2 × scale + 0.1)`.
  - The titan stays at scale 0.99. The "turns horizontal" premise in the spec was false: it draws 93 × 104, still taller than wide. Backlog #84 has the user eyeball 0.99 vs 1.08.
  - The drone move-frame top nick is accepted because it isn't visible live.
  - Merge 4.5 into 4.3 rather than rebasing. Both carry the pipeline fix as cherry-picks; the add/add conflict resolved to 4.3's superset.
- **Generation run:**
  - 4 of 24 candidates were first lost to fetch's 300 s cap and refilled after the fix.
  - Review prep needs `PATH=/usr/bin:$PATH`, because rembg is only in the system Python.
  - Draw Things build 26.1020.0, `flux_1_schnell_q8p.ckpt`; app-side settings were not recorded.

**Where we left off:**
- The PRs wait on the user: merge #138 first, then 4.3.
- Backlog #84 covers roster-wide enemy sizes against Appendix A.
- Worktrees to sweep after merge: `rebake-41`, `licence-46`, `base-a62`, `units-45` and `enemy-43`. `rebake-41b` goes last: the others symlink `node_modules` to it.
- Still with the user: G3 desktop half, the #30 playtest, and merging integration into main.
