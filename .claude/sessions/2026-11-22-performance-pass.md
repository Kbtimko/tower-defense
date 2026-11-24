# 2026-11-22 — Performance pass (roadmap 6.1)

**Accomplished:**
- Confirmed #138 and #139 merged into `visual/integration`; removed their six worktrees. The user picked Phase 6 and 6.1 first.
- Recon profile: the phone cost was Phaser re-triangulating static Graphics fills every frame (earcut ~47% of CPU), 348 of ~490 fill paths in `_staticLayers`. GC ~2%, no bloom in the code.
- Spec `docs/superpowers/specs/2026-11-22-performance-pass-design.md` and plan `docs/superpowers/plans/2026-11-22-performance-pass.md`, both approved by the user. Executed with subagent-driven development: 5 tasks, per-task reviews, an Opus whole-branch review, one fix wave, one scoped re-review.
- Commits on `perf/6.1-performance-pass`: fe7390e `?fps=1` meter; 1a0aa52 `npm run perf` gate; 0c3a8b8 + 3e71218 static-layer bake (RenderTexture, then Canvas2D); 7a9ea08 Graphics model + migration; 35b78e8 settings UI; 1e86e08, 53ec88f, d7f5a0e, 7e56f4c final-review fixes.
- Results at 7e56f4c: full gate 20/20 at 60 fps; map 9 phone 8x 22.6 -> 59.3 fps; gate fails at 20x (exit 1). 4173 tests green, build green, matrix PASS on all four devices in one run.

**Decisions made:**
- User: profile first and fix only what it shows; Reduce motion stays its own checkbox; no bloom, no pooling unless the profile shows a need.
- Canvas2D bake (`Graphics.generateTexture`) over RenderTexture: the RT lost MSAA and pad edges went jagged (seen in a 4x crop).
- Accepted a 0.9-1.2% k = 1 A/B difference on empty pad rims (sub-pixel anti-aliasing, invisible in the crop); k = 2 is within noise.
- Gate failure proven at 8x and 10x on the pre-bake base and at 20x after the bake (6x was not a failure on this M4).
- Rebake cost judged against a 50 ms line at 4x CPU; after dropping the full-canvas readback it is 11-13 ms.

**Where we left off:** PR open into `visual/integration`; merging is the user's. Next in Phase 6: 6.2 build & package. Still with the user: G3 desktop half (now also `?fps=1` on the phone), the #30 playtest, and `visual/integration` -> `main`. Follow-ups logged as backlog #85.
