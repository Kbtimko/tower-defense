# 2026-11-25 — Fullscreen toggle calls one API (#41e)

**Accomplished:**
- #150 (#40 HUD consistency) merged into `visual/integration`.
- **Backlog #41(e):** `toggleFullscreen` now selects the standard or webkit method and calls it once with its receiver (`(a ?? b)?.call(x)`), instead of `a?.() ?? b?.()`. The old form also called webkit whenever the standard method returned `undefined`.
  - Process: spec and plan self-approved (`[auto]`), 1 SDD task (Haiku), a Sonnet task review (approved), and an Opus final review (ready to merge, 2 optional Minors parked).
  - Tests: 3 new; three mutations each fail their own test. Suite: 4286 tests in 269 files, exit 0.
  - Live A/B on a production build, with an init-script engine emulation and real clicks on MapSelect's fullscreen button: before, 4 calls (request, webkitRequest, exit, webkitExit); after, 2 calls (request, exit).

**Decisions made:**
- Took only #41(e). (b) needs an iOS device, and (c)/(d) are harness audits.
- Amended the implementer's commit trailer to the project's Opus attribution line before pushing.

**Where we left off:**
- The #41(e) PR is open into `visual/integration`. Merging is the user's.
- Parked: a test for a synchronous throw becoming a rejection (pre-existing gap), and splitting the receiver test.
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
