# 2026-10-22 — Roadmap 2.3 mobile shell (pulled ahead of G3)

**Accomplished:** The user chose to pull 2.3 forward so G3's phone half can run. Measured the landscape PLAY bug before planning. It had two causes: (1) `#featured-blurb` `flex:1` with `min-height:auto` clipped PLAY under `#map-select-layout{overflow:hidden}`; (2) in a level the 770px `#bottom-bar` plus a viewport meta with no `minimum-scale` made Chrome shrink-to-fit, and the page stayed zoomed at 1.92× after rotating (Phaser FIT was fine). Wrote `docs/superpowers/plans/2026-10-22-mobile-shell.md` and ran it with SDD (4 tasks, 2 task fix rounds, one opus final review plus a fix wave). Shipped:
- a capture layout audit that fails on phones by construction;
- the viewport/dvh/safe-area/overscroll/touch-action shell;
- a compact landscape stopgap;
- the rotate prompt and a fullscreen button;
- auto-pause on hide or portrait that never auto-resumes;
- an audio resume inside a gesture.

1980 tests (from 1915). Build OK. `npm run capture -- --screens --maps 0 --devices desktop,iphone,pixel` exits 0 with every layout audit clean (7 labels per phone). A controller real-touch probe on the built game covered tap PLAY → level → portrait (prompt + PAUSED) → landscape (still paused) → tap Resume, with scale 1 throughout and no page errors. Housekeeping: removed the merged v11–v19 worktrees (all clean). The merged clean v01–v03, g1 and veth worktrees remain.

**Decisions made:**
- Kept the compact `(max-height:500px)` CSS as an explicit stopgap for 2.2.
- Dropped the plan's `#bottom-bar{overflow-x:auto}`, because it clipped the wave-preview popover. Portrait uses flex-wrap and the compact block wraps instead.
- `overscroll-behavior` applies only on coarse pointers, so desktop is unchanged.
- A Task 4 review claimed a create-time `this.scene.pause()` is overwritten by Phaser. That was WRONG: ScenePlugin.pause is queued. The deferred check stays because it is harmless, and the comment was corrected (memory `project_phaser_scene_pause_queued`).

**Where we left off:** The PR `visual/2.3-mobile-shell` → `visual/integration` awaits the user's merge. Then G3 on a real phone and desktop. Follow-ups are in backlog #41 (2.2 canvas size, iOS-only behaviours, audit gaps).
