# 2026-11-24 — Damage-number pool priority (#23)

**Accomplished:**
- #146 (#39b ground FX depth) merged into `visual/integration`. Removed its worktree and local branch.
- **Backlog #23:** absorbed (`🛡`) damage numbers now yield their pool slot.
  - When the 24-slot pool is full, a big or AoE number evicts the oldest in-flight absorbed number. An absorbed number never evicts.
  - The process: spec and plan self-approved (`[auto]`), 1 SDD task (Sonnet), a Sonnet task review (approved, 3 Minor), an Opus final review (0 Critical/Important, ready to merge).
  - Tests: 6 new. RED was 3 failures, and the four mutations each fail their own test. Suite: 4259 tests in 267 files, exit 0.
  - Live: a capture build on map 0, `damage-dealt` driven in the real engine, plus a frozen-frame screenshot. The big and AoE numbers replaced 🛡1 and 🛡2, the 25th 🛡 was dropped, and the pool returned to 24 unique texts.

**Decisions made:**
- Eviction of the oldest absorbed number, over a capped absorbed share or a bigger pool. The pool stays fully used in quiet moments, and a big hit always wins while any 🛡 is showing.
- Parked: no unit test fires a killed tween's `onComplete`, because Phaser 3.90's `destroy()` never dispatches. Re-check after a Phaser upgrade.
- The worktree needs a real `npm ci`. The symlinked `node_modules` was stale (59 files failed at import).

**Where we left off:**
- The #23 PR is open into `visual/integration`. Merging is the user's.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
- The `release-zip` worktree still holds the zip from `main` and the media until upload.
