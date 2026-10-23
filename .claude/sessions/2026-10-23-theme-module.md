# 2026-10-23 — Landing PR, backlog, theme module (3.1)

**Accomplished:**
- **Merge check.** Verified the merges against the remote.
  - #103 is live on production: the bundle hash equals a local build of `main`.
  - #105 and #106 had merged into their stacked bases, not into `visual/integration`. I opened PR #107 to land them; my merge was blocked as unreviewed, so it's the user's.
  - Saved a memory: target dependent PRs at the integration branch.
- **Backlog.** Added #48 (soldiers walk to a new rally point) and #49 (upgrade visuals for towers and soldiers; overlaps roadmap 4.2/4.5).
- **Roadmap 3.1, the theme module.**
  - Built with spec, plan and SDD: 5 tasks, 3 fix rounds and a final fix wave.
  - What it adds: tokens, bundled Orbitron/Rajdhani, a CSS kit (`.ui-panel`/`.ui-btn`) adopted by the HUD and in-level overlays, Phaser fonts, a late-webfont refit, and art-bible docs.
  - Result: 2330 tests; matrix and 5-device screens clean.
  - Browser-verified on the production build and on a `--base=./` sub-path build, plus a run with fonts blocked.

**Decisions made:**
- User: Orbitron + Rajdhani, no serif, strict art-bible palette.
- Rulings:
  - Bevels offset to 2u, because the spec's 1u bevels were hidden under the ring.
  - Selected/active get their own accent state, because the spec's "pressed" look left the armed tower 3/255 distinct.
  - Hover lifts the ring, because the spec's face step was 1/255.
  - `--panel-drop` is switchable; rails and story banner opt out.
  - Phaser Georgia was allowed temporarily, then removed.
  - #42(a) tooltips re-targeted to 3.3.

**Where we left off:**
- PR #107 and the 3.1 PR await the user's merge, #107 first.
- Next: 3.3 radial menus (it also takes #42a), then 3.4–3.6.
- The G3 Phase-2 gate is the user's.
