# 2026-11-26 — Bad ghost at full alpha (#65a)

**Accomplished:** #153 (#89) was merged. Shipped backlog #65(a) `[auto]` on `fix/65a-bad-ghost-alpha` (PR into `visual/integration`).
- New `RALLY_FLAG.badAlpha = 1`. In `_drawRallyOverlay`, each ghost mark's alpha follows its own colour: bad marks and their halos at 1, OK marks at 0.6.
- Commits: spec+plan c9a89b9, fix 62b4118, plus a docs correction.
- Suite: 4299 tests in 270 files, exit 0. Mutations: a shared alpha fails the off-road case; a ghost-alpha move halo fails 3 tests.
- Live frozen-frame pixel A/B, map 5: the bad ring median went from (157,87,82) to (208,107,110), and the OK ring was unchanged.

**Decisions made:**
- The halo goes to full alpha with its mark, because on the desert the danger red matches the sand's luminance and the halo carries legibility.
- The palette is not changed. `#f07a7a` is itself salmon, and a deeper in-world red is the user's palette call.
- The final review caught that the spec's first contrast table blended the 0.6 mark over the bare ground instead of over its own halo. It was corrected (2.12 → 6.78 desert, 2.57 → 6.78 map 0) and matches the live pixel reading.

**Where we left off:** PR open, awaiting the user's merge. Noted, not fixed: an opaque bad halo now fully covers a neighbouring tier ellipse where it crosses one (cosmetic, only while the mode is open). Still with the user: #82, 6.4 publish (G5), G3 + #30, #87.
