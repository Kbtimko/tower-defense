# 2026-10-01 — Tier-4 branch-card armour (backlog #20 + #21)

**Picked:** #20 + #21, the highest-ranked open, unblocked items. The remaining ones are #9 (the iOS port, large) and #30 (a human playtest). Classified as bounded: the design was approved in chat, so there is no spec or plan doc.

**Shipped (branch `feat/branch-card-armour`):**
- Branch cards render `🛡 <enemy> <absorbed%>` rows through the same `armourRowLabel` + `appendArmourRows` the tower panel now uses.
- The pierce rule mirrors `Tower.upgrade`: the branch's own setting wins, otherwise the base tower's.
- Damage is scaled by the selected tower's `_damageMult`. Review found this: with `ars_overcharge` (1.06), Permafrost hits for 30, not 28.
- The armour band sweep now covers tier 4, plus a non-vacuous membership assertion.

**Findings:**
- Only Ice T4A Permafrost triggers the line (Colossus 54%, Titan 71%). Every other tier-4 branch pierces or clears all armour.
- `UIScene._renderBranchPicker` is dead code because nothing emits `tower:panel-open`. Logged as #33.
- I miscalculated a test expectation myself: absorbed is armour/damage (20/30 = 67%), not (damage-armour)/damage. The test failed on the code's correct output, and I caught it before committing.

**Verification:**
- `npx vitest run`: 102 files, 1444 tests, exit 0.
- Mutation checks:
  - Ignoring branch pierce fails the pierce test.
  - Dropping `_damageMult` fails the multiplier test.
  - Deleting the tier-4 sweep loop fails the sweep-membership test.
  - The sniper test does not prove pierce, and its comment now says so.
- `npm run build` exits 0, and the bundle contains `branch-armour`.
- In the browser (dev server, map 5, real clicks): the Permafrost card shows an amber `🛡 Colossus 54% · Titan 71%`, Shatter shows no line, and the panel line is unchanged.
