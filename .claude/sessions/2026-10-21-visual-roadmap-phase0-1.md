# 2026-10-21 — Visual roadmap, first autonomous evening

Draw Things was off (127.0.0.1:7860 refused), so AUTO tasks only.

| Task | PR | State |
|---|---|---|
| 0.1 capture harness | #86 | done — `npm run capture` |
| 0.2 art bible | #87 | drafted, **awaiting G1** (box unticked) |
| 0.3 baseline | #88 | done — stacked on #86 |
| 1.1 asset diet | #89 | done — stacked on #86 |
| 1.2 grounding | #90 | done — stacked on #89 |

Merge order into `visual/integration`: #86 → #87 / #88 / #89 → #90.

## Things learned
- Passing `import.meta.env` into a helper defeats Vite/Rollup dead-code
  elimination; the capture hooks shipped in prod until the gate was inlined
  and the hook hoisted to a module-level function. Verify by grepping `dist/`.
- Nothing refreshed the HUD on `wave:start`: the wave counter lagged until the
  next kill in real play (fixed in #86).
- Phones: map-select PLAY is unreachable at iPhone 14 landscape (clipped panel
  + `body { overflow: hidden }`). Production-affecting; roadmap 2.2/2.3.
- Story says "Vorn", enemy data/codex say "Veth".
- A 35 % contact shadow ending at the feet is hidden by the unit's own body;
  centre it on the contact point.
- `dist/audio` is 16 MB — the next weight to cut.
