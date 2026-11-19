# 2026-11-19: backlog #37, funding for maps 9 and 8

Branch `balance/37-map9-funding` → PR into `visual/integration`. This is roadmap gate G4's map 9 decision.

## What the user asked
- "reveiw next backlog item and start work". #129 (#76 + #77) had merged, and no item after #77 was open. I picked #37: it continues the balance thread, it's the roadmap's G4 decision, and #75–#77 had just changed late-game strength.
- After a measured sweep the user chose **"Start gold 690"** for map 9 and **"Fix 8, leave 7"** (map 8 → 405).

## Found
- **On current integration, map 9 died on wave 1.** It built 3 of 20 towers and needed 1.36x.
- **The waves aren't the lever.** With 10–40% fewer enemies it still needed 1.36–1.52x, because fewer kills means less gold.
- **The kill reward alone isn't the lever either.** Reward 0.36 or 0.41 still needed 1.36x.
- **Starting gold is**, which matches #16's "timing, not total". 690 keeps 60% of lives with or without the +40% logistics perk. The rejected mix (start 510 + reward 0.38) reached 100% with the perk.
- **Map 8 is noisy.** 390 / 405 / 420 gives 25% / 33% / a loss at 1.03x.

## Shipped
- `src/data/maps.js`: map 9 `startGold` 690 and map 8 405, as recorded overrides. `rewardMult` stays solved at the derived start (300 / 270) and is deliberately not re-solved.
- `src/data/mapsEconomy.test.js`: a pin test, plus the depth-spread guard evaluates map 9 at its derived start, so its kill income is still guarded.
- Fixtures: the `legacyGolden.json` `8:*`/`9:*` entries are re-baselined, and so is the map 8 entry of the #75 tiers 1–3 snapshot.

## Rulings (Claude's calls)
- **Golden re-baseline: merge and prune, not a full regeneration.** The committed fixture predates newer sim output fields, so regenerating would rewrite all 50 keys. Only the 10 map 8/9 entries were replaced, each pruned to the old field set.
- **The first worktree's `node_modules` symlink pointed at the primary checkout's stale install**, which has no `@fontsource`. That made test files fail to load. I repointed it to the up-to-date install; the code was not the cause.
- **Final-review fixes:**
  - The `rewardMult` comments were false after the override.
  - Excluding map 9 from the spread test had left its kill income unguarded (verified: a drop to 0.20 passed every remaining guard). It now stays in the test at its derived start.

## Verification
- `npm test`: 4021 tests in 241 files, exit 0. The pin test failed first, and the spread test fails with map 9's `rewardMult` sabotaged to 0.29.
- `npm run balance`: only rows 8 and 9 move. Map 8 is OK at 33% and map 9 OK at 60%, so the unwinnable count goes from 3 to 1 (map 7, 1.05x). Auto-send "harder than before" stays 0.
- `--t4`: only maps 8 and 9 move. Every tier-4 line now wins at 1x, and some single-tower probes on map 9 keep 90–100% of lives.
- Live: a capture build reads 240 / 405 / 690 gold on maps 7 / 8 / 9 in Chromium, with 0 page errors. The production build exits 0.

## Follow-up in the same session: the rest of G4
- The user asked what the calls for maps 2 and 5 were. I re-measured both:
  - map 2: 90% today, 95% with the perk, 40% at start 150, 15% at reward 0.36;
  - map 5: 80% without the perk and 93% with it, still 93% with the perk at reward 0.47 or 0.44.
- I recommended keeping map 2 as it is and accepting map 5. The user: "i agree with th erecommendation".
- Shipped: the PROVISIONAL comment on map 2 is replaced with the decision (comment only, no value change), #35 and #36 are closed, and roadmap 5.4 is ticked.

## Next
- G4 is closed.
- Map 7 still needs 1.05x without the perk, which the user accepted.
