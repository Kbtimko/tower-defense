# 2026-11-25 — Move mode ghosts the destination (#63)

**Accomplished:**
- #151 (#41e fullscreen single call) merged into `visual/integration`.
- **Triage (no code):**
  - #42 has nothing actionable left.
  - #45(c) closed after measuring: 2 px of overlap over a non-interactive bar.
  - #46 was resolved by #144.
  - #47(e)'s "/4" is a design call.
- **Backlog #63:** barracks move mode now draws a rally-style ghost range ring on `_rallyOverlayGfx`, at the free pad a tap would land on. It uses the same snap call as the commit, and shows red at the cursor when no free pad is in reach. This replaces the cyan ring and road dots around the current pad.
  - The ring is drawn as soon as move mode is entered, and cleared on commit, cancel, and switching to a tower or aim.
  - Process: spec and plan self-approved (`[auto]`), 1 SDD task (Sonnet), Sonnet task review (approved), Opus final review (1 Important: `_leaveBarracksModes` left the ghost under pause; 2 comment Minors), one fix wave, Sonnet re-review (approved).
  - Tests: 6 harness tests on real map 0 pads, with preconditions asserted. Every mutation fails its own test. Suite: 4292 tests in 270 files, exit 0.
  - Live check on a capture build: before/after A/B with the real mouse over a free pad, over empty ground and on commit; plus the paused move → Archer switch.

**Decisions made:**
- For "match the rally look or drop it", I chose match, because the player needs the range preview while choosing a pad.
- New backlog #89: tapping the barracks in move mode moves it to a neighbouring pad within 60 px instead of cancelling (26 of 139 pads).

**Where we left off:**
- The #63 PR is open into `visual/integration`. Merging is the user's.
- Noticed, not changed: the mode toast stays up while paused after leaving move mode. This predates the change; toasts run on game time.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
