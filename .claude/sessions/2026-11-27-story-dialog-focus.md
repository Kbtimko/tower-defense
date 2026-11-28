# 2026-11-27 — Story dialog focus and stacking (#55 a, b)

**Accomplished:**
- #159 (#66) merged. Backlog #55 (a, b) built.
- Spec: `docs/superpowers/specs/2026-11-27-story-dialog-focus-stacking-design.md`. Plan: `docs/superpowers/plans/2026-11-27-story-dialog-focus-stacking.md`.
- Commits:
  - 3780eeb: docs
  - 66777cb: (a) focus the opener before a replay
  - 9af18f5: (b) dialog z 18 → 55, plus the derived stacking test
  - 6c5658a: fix wave (unparsed z-index fails loudly; comment)
- **Live A/B** (capture builds):
  - Focus after a replay moved from `<body>` to `#open-story-log` on both the mouse and the keyboard path.
  - With a mouse there is no focus ring.
  - All five floaters went from painting over the dialog to being covered by it.
- Suite: 4330 tests in 272 files, exit 0.

**Decisions made:**
- I raised the dialog's z-index rather than hiding floaters at victory. That one value covers every play, including the briefing, the world map and Story Log replays.
- z 55: above the highest floater (50), under the title (60) and rotate (1000).
- The backlog's wave-preview claim was closed as wrong: it's inside `#hud-layer`.
- Accepted: PAUSED now shows after the briefing closes rather than over it. The debug FPS meter is covered during dialogs.
- The final review's "Ready" held. One fix wave hardened the guard test and restored a comment.
- Haiku implementers twice wrote a Haiku trailer despite the brief. I amended both to the Opus line.

**Where we left off:**
- PR open into `visual/integration`.
- With the user: #67, #82, 6.4/G5, G3/#30, #87.
- Next `[auto]`: #56(a, b), #85, #71(a, g, h), #73(b, f).
