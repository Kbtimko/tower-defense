Ship the simulator build-policy cluster from the backlog: items #32, #27 and #28, with #29 folded in.

Context:
- Read .claude/notes.md on origin/main first (my local checkout is stale; branch off origin/main in a fresh worktree).
- All four items are in the Prioritized Backlog; the code is src/sim/buildPolicy.js (rankSlots, greedyBuildPlan, DEFAULT_BARRACKS_TARGET) plus src/sim/simulate.js and scripts/balance.mjs (`npm run balance`).
- Check the auto-memory notes on the balance simulator first ("Balance simulator + difficulty cliff"). The model is pessimistic by construction, and cheapestFullBoardCost cannot see tier 4.

What's wrong, in priority order:
1. #32: the opening barracks is bought before any firing tower, even when the early waves fly. Map 9's wave 1 is 12 phantoms, and tier-1 soldiers can't block flyers. That 100g is provably wasted, and it makes map 6's headline 1.05x misleading: at barracksTarget 0, map 6 is won 15/15. Map 9 is also still underfunded (3 of 20 towers built, survives 1 of 18 waves).
2. #27: rankSlots scores path coverage at a hard-coded range of 120. The sniper reaches 200 and ice 115, so the model buys the right tower and then puts it in a slot scored for a different weapon.
3. #28: the upgrade pass values every barracks upgrade at 0 DPS, so it can never choose one. This needs an explicit rule in the spirit of barracksTarget, not a damage metric. It's a real design decision.
4. #29: split the "Matchup sensitivity" A/B column into tower choice vs upgrade ordering. Only do it if it stays cheap.

How to run it:
- This is architectural. Use the full pipeline: brainstorm, then a spec in docs/superpowers/specs/, then a plan in docs/superpowers/plans/, review-plan, subagent-driven development (Sonnet implementers), a final whole-branch review, then the PR.
- In brainstorming, settle the #28 rule and whether #27 is worth the coupled problem (best slot depends on which tower goes in it). Recommend whether to split this into more than one PR.
- Verification here is measured, not clicked: run `npm run balance` before and after and report per-map deltas. Prove each new test fails by breaking the code on purpose. Re-check the guards in src/data/mapsEconomy.test.js.
- Don't retune map data (startGold/rewardMult) in this work. Report what the corrected policy implies for maps 6 and 9 and for backlog #31 (the +120 gold logistics upgrade), and let me decide.
