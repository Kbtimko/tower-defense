# 2026-11-21 — Roadmap 4.1b: 2x sprite sheets

**Accomplished:** Roadmap 4.1b on `visual/4.1b-2x-sprite-rebake`, a PR into `visual/integration` stacked on 4.1a (#133).
- Pipeline:
  - brainstorm (with measurements: byte-identical reproducibility, and a GPU-sampling simulation of 1x vs 2x at both k);
  - spec `2026-11-21-sprite-2x-rebake-design.md` with a builder check;
  - plan `2026-11-21-sprite-2x-rebake.md`, then review-plan;
  - 4 Sonnet tasks, each with its own review: the `--scale 2` tooling, generating the 162 `@2x` PNGs plus `sprite2x.js`, the call-time resolver, and the asset check plus `art:apply`.
- The Opus final review returned "with fixes". The fix wave F1–F7 was re-reviewed on Opus.
- Result: 4110 tests and 52 Python art tests; build, assets and the flow matrix pass.

**Decisions made (the user said "move forward", so these are Claude's calls):**
- Two sheet sets chosen by k, not a straight replacement: WebGL1 has no mipmaps for non-power-of-two sheets, so 2x sheets at k = 1 speckle.
- 2x coverage is all-or-nothing per entity (base plus every variant). The drone is the only entity pinned to 1x.
- Both `assets-src` and `public` `@2x` sets are committed.
- Ground tolerance at 2x is width ≤ 1.5 (outline) and footY ≤ max(0.75, 1x scale). The first 0.5 gate tripped on outline rasterisation (max 1.4/0.6). A re-measure found no misalignment.
- `art:apply` restores `sprite2x.js` on failure. Normalize leaves the real `sprite2x.js` alone for scratch out-roots.

**Where we left off:**
- Both PRs are open: #133 (4.1a), then 4.1b. Merge #133 first.
- Roadmap 4.1 is marked done.
- Next options from notes: 4.6 (the licence ledger) or backlog #78/#79.
- Waiting on the user:
  - a real-phone check of 4.1a/4.1b (G3);
  - the G3 desktop half;
  - the #30 playtest;
  - merging `visual/integration` into `main`.
