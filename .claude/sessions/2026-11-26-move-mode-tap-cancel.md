# 2026-11-26 — Move-mode tap-to-cancel (#89)

**Accomplished:** #152 (#63) was merged. Shipped backlog #89 `[auto]` on `fix/89-move-mode-tap-cancel` (PR into `visual/integration`).
- In barracks move mode, a tap within `TAP_TOWER_RADIUS` of the moving barracks now cancels via `_cancelMode()`, mirroring `_rallyTo`. Before, on the 26 of 139 pads that have a free neighbour within the 60 px snap, it relocated the barracks.
- The #63 ghost applies the same check first, so it shows the red cancel ring on the barracks.
- Commits: spec+plan 91fd4d6, fix 3fd8061, review fix 58a78c9.
- 6 new tests; 3 mutations each fail their own test. Suite: 4298 tests in 270 files, exit 0.
- Live A/B on map 5, pads 6/10, capture builds: mouse click and touch tap on the barracks went to pad 10 before the fix and stay on pad 6 after. A click on pad 10 and a press-drag-release still move it.

**Decisions made:**
- The cancel ring is centred on the barracks, not the cursor, so it reads as "stays here".
- Rejected teaching `resolveTap` a cancel action, because `_tapHits.tower` matches any tower.
- Rejected shrinking the snap radius.
- The task review's Minor (no sold-barracks guard in `_repositionTo`) is unreachable today. Selling needs the radial; move mode closes it, and taps route to reposition first. Not backlogged.
- The final review's Important finding (the #63 no-slot test went vacuous once its cursor-on-barracks fell into the cancel branch) was fixed in one round with a proven mutation.

**Where we left off:** PR open, awaiting the user's merge. The red ghost still reads pink on the desert map at `ghostAlpha` (already #65(a)). Still with the user: #82 trademark check, 6.4 publish (G5), G3 desktop + #30 playtest, the #87 ESLint decision (the implementer hit eslint crashing with no config again).
