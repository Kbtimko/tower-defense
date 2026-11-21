# 2026-11-21 — Roadmap 4.1a: high-DPI canvas

**Accomplished:** Roadmap 4.1a, the canvas renders at screen resolution, on `visual/4.1-2x-rebake` (PR into `visual/integration`). The full pipeline ran: brainstorm, spec `2026-11-21-hidpi-canvas-design.md` (with a builder check), plan `2026-11-21-hidpi-canvas.md`, review-plan, then 4 Sonnet-implemented tasks, each with a task review:
- render-scale decision and boot wiring;
- world cameras and the DOM↔world mapping, plus a shake k² fix the controller found against the Phaser source;
- canvas text at resolution k;
- the road baked at k, `__capture.renderScale`, and a `desktop1440x2` preset.

After the tasks:
- **Opus final review:** "With fixes". The fix wave F1–F6 was re-reviewed on Opus as ADDRESSED.
- **Follow-up found in live verification:** a portrait-booted phone stayed at k = 1, fixed by sizing k from the landscape-normalised `screen`.
- **Result:** 4091 tests in 246 files, exit 0; `npm run build` exit 0.

**Decisions made:**
- **4.1 split in two (user):** canvas first (4.1a), re-bake second (4.1b, backlog #80). This followed a measurement: the fixed 1488×720 backing store is stretched 1.6–1.9x by the browser.
- **The user said "move forward", so Claude made these calls:**
  - k is an integer (1 or 2), picked once at boot from `#game`, or from `screen` on coarse pointers, landscape-normalised.
  - k = 2 needs dpr ≥ 1.5 and ≥ 1.25x the canvas width in device px.
  - `?res=` overrides k in dev/capture builds only.
  - Text, the road and shake are k-aware; the soft generated textures stay at 1x.
  - A non-enumerable `pipeline.frameInc` stops Phaser pre-allocating ~57 MB (1x) to ~420 MB (2x) of PreFX render targets; the backdrop grade already used the full-size ones.
  - Road textures for other maps are evicted.
  - Review minor 9 (the Canvas-renderer fallback) is parked.

**Where we left off:**
- The PR into `visual/integration` is open.
- Live verification (capture builds):
  - backing sizes are correct per device;
  - k = 1 matches base within noise;
  - 2x crops are visibly sharper;
  - the flow matrix passes on all 5 devices, with k = 2 on the phones and `desktop1440x2`;
  - real-GPU frame time is the same at both k;
  - 0 page errors.
- `--screens` on iphone was not green on base or head on this host. The load was 3–7, the network changed and the Mac slept, so the runs are tainted. Head has more timing misses because the harness renders with SwiftShader (backlog #79).
- **Next:** 4.1b, the 2x re-bake. Copy the references from `.claude/worktrees/tower-art-42/.art-cache/sprites`.
- **Waiting on the user:**
  - a real-phone check of 4.1a, added to G3;
  - the G3 desktop half;
  - the #30 playtest;
  - merging `visual/integration` into `main`.
- **Temp worktree:** the probe checkout under the session scratchpad was removed at wrap.
