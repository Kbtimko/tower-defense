# 2026-11-27 — World-map input and re-layout (#54 b, c, g, h)

**Accomplished:** #156 (#65c) and #157 (#69d) merged. I triaged every open `[auto]` backlog sub-item against the code (results are in notes.md, under the Prioritized Backlog heading). I shipped #54 (b, c, g, h) on `fix/54-world-map-input`, with a PR into `visual/integration`.
- `isBrowserShortcut` is now keyboard-only and includes a bare F5.
  - F5 reloads through the entry guard and the arrival.
  - A modified click mid-arrival is a skip.
  - The entry guard's matching Ctrl-click hole is closed too.
- `resize`/`orientationchange`/`loadingdone` coalesce through `_scheduleLayout`, one `_layout` per frame. `shutdown()` cancels a pending frame.
- `WorldMapRenderer.resize` and the art `onload` call `SpaceCanvas.redraw()`.
- Commits:
  - spec+plan ea0649d
  - Task 1 ad60075
  - Task 2 6b36fea
  - fix wave c754e6f
- Suite: 4322 tests in 271 files, exit 0.
- Live A/B in capture builds:
  - Ctrl-click: before, not a skip; after, a skip.
  - F5: before, prevented and counted as a skip; after, not prevented.
  - Resize burst: before, 5 sync layouts; after, 0 sync and 1 next frame.
  - Redraw: 0 → 1.
- Built the #66 comparison sheet: the tier stroke ring on art towers, today vs. dropped.

**Decisions made:**
- I fixed the helper rather than only `_skipArrival`, so the guard's matching pointer hole closed too.
- F5 is the only function key I exempted.
- The final review said Ready, with Minors. One fix wave covered three of them:
  - the arrival test now asserts the re-layout frame (t + FRAME_MS);
  - the art `onload` repaints at once (it was in #54(g)'s literal list, and my first pass missed it);
  - a misplaced doc comment.
- Accepted: one extra backdrop paint per map entry.
- The #66 and #67 design calls are with the user. I showed #66 as screenshots, not mockups.

**Where we left off:** PR open, awaiting the user's merge. Waiting on the user:
- the #66 pick (the comparison sheet is in the session scratchpad: `probe/66-compare.png`);
- #67;
- #82 trademark check;
- 6.4 publish (G5);
- G3 desktop + #30 playtest;
- the #87 ESLint decision.

Next `[auto]` options: #55(a, b) story-dialog focus/z-order, #56(a, b) results-harness proofs, and #85 perf-report hygiene.
