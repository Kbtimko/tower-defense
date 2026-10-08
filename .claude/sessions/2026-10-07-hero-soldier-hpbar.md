# 2026-10-07: Hero and soldier HP bars (backlog #24)

**Picked:** #24, at your request, after PR #80 merged. I classified it as bounded and you approved the in-chat design ("yes go"), including the style change (outline, 3px, minimum visible loss).

**Root cause:** the hero and soldier bars were hard-coded pixel boxes left over from the Graphics fallback bodies. PR #68 moved enemies onto `hpBarGeometry`, but these two were scoped out. The backlog said they "size from `def.radius`". They don't; neither entity reads `def.radius` at all.

**Reproduced live before the fix:**
- The hero's 16x2 bar sat across its head.
- The soldier's 14x2 green bar was invisible over green art.

**Fix:**
- New `drawUnitHpBar` in `hpBar.js`, shared by Hero and Soldier: enemy geometry, a 0.55-alpha black outline, `hpBarFillWidth`, 3px tall.
- Fallback radii 14 and 9 keep the no-art bar's top edge in place.

**Verification:**
- `npx vitest run`: 103 files, 1456 tests, exit 0.
- New file `src/entities/heroSoldierHpBar.test.js` (12 tests). Five mutations each fail the expected test: ignore the sprite size, use the raw fill width, drop the outline, change the hero's fallback radius, and drop the outline alpha to 0.01.
- `npm run build` exits 0.
- Before/after close-ups in the browser (dev server, map 1, real sprites). The hero bar now clears its head and the soldier bar is readable.
- Code review: no correctness bugs. Two small points (outline alpha untested, a comment overstating "exactly where it sat") were fixed in f40dad1.
