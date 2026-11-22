# 2026-11-21: Roadmap 4.5, soldier legibility, engineer re-gen, portraits deferred

**Accomplished:** branch `visual/4.5-units-portraits`, PR into `visual/integration`.
- Soldier ×1.5 (scale 0.54, ground re-measured, 4A shield scaled).
- New engineer art with no baked shadow, held at its old drawn height (scale 0.75).
- Art-pipeline fixes:
  - gap refills use their own seeds;
  - `post()` uses node:http with a 30 min timeout, and the legacy generator uses it too.
- Art-bible §7 "Consistency".
- Final-review fix wave: the seed passthrough test, the HP-bar test derived from the manifest, accurate art-bible wording, and the spec/plan outcome notes.
- 4126 tests pass; the flow matrix passes on 4 devices.

**Decisions made:**
- **User decisions:**
  - Portraits at 512 deferred ("improve the instructions, move on, come back later"). Re-rendering gave the same faces with different brushwork (means 7.1 and 10.5 out of 255).
  - "Go with your suggested" picks: engineer #6.
- **Controller rulings:**
  - The engineer holds its drawn height, not its foot width, because the new pick stands wider. Its contact shadow is about 28% wider.
  - No formation change for the larger soldiers. They stand where they did before, and the slight extra pad-rim overlap is acceptable.
  - The two residual art-bible lines were fixed by the controller (no second fix wave).
- **Generation run:**
  - Chrome stayed open by the user's choice. Renders took 2.5–30 min each.
  - Five renders were lost to fetch's 300 s cap before the fix.
  - Draw Things build 26.1020.0, model `flux_1_schnell_q8p.ckpt`; app-side settings were not recorded.

**Where we left off:**
- The 4.5 PR is open.
- The 4.3 enemy refresh (`visual/4.3-enemy-refresh`) is in its final-review fix wave. Its PR follows and edits the same `notes.md` sections, so rebase it after whichever merges first.
- Backlog #83: portraits at 512 via img2img.
- Merged worktrees to sweep: `rebake-41`, `rebake-41b`, `licence-46`, `base-a62`. `base-a62` is a detached A/B checkout at a62347a.
- Still with the user: G3 desktop half, the #30 playtest, and merging integration into main.
