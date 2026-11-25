# 2026-11-25 — Map editor rough edges (#88)

**Accomplished:**
- #148 (#39c editor road preview) merged into `visual/integration`.
- **Backlog #88:** the dev map editor's older rough edges.
  - (a) The HUD slot target is the map's shipped `towerSlots.length`, not `6 + map.id`.
  - (b) A press during a drag is ignored.
  - (c) Drags convert through `cameras.main.getWorldPoint`, so a handle pins to the edge over a HUD rail.
  - (d) A release ends a drag only on a left release, or when no button is left held.
  - (e) `?edit=1` opens the editor only in DEV or capture builds.
  - (f) Closed without code.
  - Process: spec and plan self-approved (`[auto]`), 1 SDD task (Sonnet), a Sonnet task review (approved), an Opus final review (0 Critical or Important, two Minors fixed in one wave), and a Sonnet re-review (approved).
  - Tests: 9 new or strengthened; seven mutations each fail their own test. Suite: 4278 tests in 267 files, exit 0.
  - Live: a capture build on map 3 with the real mouse; an A/B of the middle release and the lost mouse-up (via a CDP no-button move); a production build showing the title for `?edit=1`.

**Decisions made:**
- Skipped #39(d) (optional `featherAlpha`): nothing needs it yet.
- Closed (f): `MapEditorScene` has no shutdown path.
- Corrected #39c: `!pointer.isDown` never fires on a lost mouse-up, because Phaser 3.90's `Pointer.move` refreshes `buttons` but not `isDown`. The guard now also checks `noButtonDown()`.

**Where we left off:**
- The #88 PR is open into `visual/integration`. Merging is the user's.
- The only remaining open `[auto]` item in the editor/road area is #39(d).
- Still with the user: 6.4 publish (G5), the #82 trademark check, G3 desktop and the #30 playtest, and the #87 ESLint decision.
