# 2026-10-22 — Roadmap 2.1 pointer-first input model

**Accomplished:**
- The user merged #100 (2.3 mobile shell) and passed the G3 phone half on a real phone.
- Mapped the input code: one `pointerdown` priority chain over scattered booleans, hover-only tooltips, no cancel for build/aim/reposition, and inverted `gameToPageCss` (#40a).
- Wrote `docs/superpowers/plans/2026-10-22-input-model.md` and ran it with SDD: 4 tasks, one fix round each, an opus final review, and a fix wave. What shipped:
  - **Release-to-tap:** taps resolve on release.
  - **Long-press inspect (touch):** the target is hit-tested at the press, and the gesture is consumed only when it hits an enemy or the hero.
  - **Cancel:** an `✕ Cancel` in the HUD plus Escape.
  - **DOM long-press:** the tower tooltip, ability card and wave preview, including over disabled buttons. The follow-up click is swallowed.
  - **Two-step confirm (touch/pen only):** for upgrade, sell and branch picks.
  - **Keyboard-only focus shows:** focus opens a tooltip only on keyboard focus.
  - **#40a fix and panel clamp/scroll.**
- Tests went from 1980 to 2132. Build OK. Capture is clean on desktop, iphone and pixel.
- Controller probes, all with real touch on iPhone emulation:
  - a panel swipe brings Sell into reach;
  - two-tap Sell credits +36g;
  - a hold on an empty pad places the tower, which is present at (696,360) and visible.
- Housekeeping, at the user's request:
  - deleted `chore/session-log-visual` and its worktree;
  - removed the merged v01–v03, g1 and veth worktrees;
  - committed the primary checkout's stray notes onto this branch (`a538c5b`) and removed the duplicates there.

**Decisions made:**
- **Tap on release** for every pointer.
- **Long-press is touch-only;** pen is treated as mouse on the canvas.
- **Two-step confirm is touch/pen only.**
- **Escape gets an on-screen Cancel,** which lives in the HUD row. A top-centre pill covered build pads on phones.
- **Native `title=` tooltips are deferred to 3.1.**
- **Canvas slop is measured in CSS px.**
- **"Always consume a long-press" was re-ruled** after the final review: consume only when the press hit a target, so slow presses on empty ground still tap.

**Where we left off:** the PR `visual/2.1-input-model` → `visual/integration` awaits the user. After that:
- the G3 desktop half;
- the 2.1 checks on the real phone (iOS Safari specifics are in backlog #42);
- next tasks 2.2 (HUD to canvas, which also removes the compact CSS and panel-scroll stopgaps) and 2.4 (device matrix).

`SESSION_NOTES.md` (a frozen archive) is still being appended to by an auto hook; the user was told.
