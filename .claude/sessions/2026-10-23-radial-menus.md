# 2026-10-23 — Radial build/upgrade menus (3.3)

**Accomplished:**
- **Merge check.** Verified #107 and #108 are merged. Added backlog #51 (auto-send waves).
- **Roadmap 3.3, radial menus.** Built with spec, plan and SDD: 6 tasks, 7 fix rounds and a final fix wave.
  - Build: tap a free pad for a build radial.
  - Upgrade ring: tap a tower; faces show glyph + cost, the hub shows tier and stats, and names and deltas are in the item peek.
  - Removed: `#tower-panel`. Its detail moved to a long-press tower inspector.
  - Removed: native `title=`, replaced by HintPeek.
  - The device matrix drives the radial; new `radialProblems` audit.
  - Result: 2644 tests. Matrix PASS desktop 16/16 and iphone/pixel/ipad 17/17. 5-device screens clean.
  - Browser acceptance a–h + opening release: PASS on the production build, desktop and iPhone.

**Decisions made:**
- User: build both ways; ring = actions + compact stats with detail on long-press; tooltips → long-press peek / hover.
- Rulings:
  - D5: an open radial eats the next tap.
  - Item peek content lives in GameScene.
  - Faces are glyph + cost, because names at 6.7 px were unreadable.
  - The hub never previews names; the peek carries them and opens on touch press.
  - pad2 for the matrix is chosen clear of the ring footprint.

**Where we left off:**
- The 3.3 PR awaits the user's merge.
- HIGH backlog #52: Scout Vex's Q throws, and it is on production too. Fixing it on `main` is the user's call.
- Follow-ups in #53.
- Next: 3.4 title & map select.
