# 2026-10-13 — Simulator hindsight barracks strategy (backlog #32, #28)

Branch `feat/sim-build-policy`. The kickoff prompt was `.claude/prompts/2026-10-08-build-policy-kickoff.md`.

## What shipped
- **`greedyBuildPlan` gains two parameters.**
  - `opening` takes `start`, `none` or `beforeGround`.
  - `barracksTier` sets a depth rule: barracks are upgraded first, up to that tier.
  - The defaults reproduce the old policy exactly.
- **New `src/sim/strategy.js`.** It holds 5 candidate strategies, a pure `pickBest` and `bestStrategy`. The search plays every candidate in full and keeps the best, ranked by lowest win multiplier, then lives kept, then waves survived, then candidate order.
- **`npm run balance`.** The headline now reports the best strategy in a new `strategy` column. The Blocking and Matchup tables still run the fixed default policy and are labelled so. Runtime went from 6.8s to 10.2s.
- **Tests:** 1505, up from 1472. Every new test was proven to fail by breaking the code on purpose.

## What the brainstorm measured (throwaway probes)
- **#32's premise was half wrong.** Map 9's opening barracks is dead only on wave 1. Every alternative made map 9 worse.
- **Map 6's wave 1 is ground enemies,** so a conditional opening could not fix it. Barracks depth to T3 does.
- **No single fixed rule wins everywhere.** That is why the search runs in hindsight rather than as one cleverer rule.
- **#27 changes didn't help.** Three slot-ranking variants only reshuffled which maps won and lost. The coverage proxy is the problem, so #27 is deferred.

## Results (headline, before → after)
| map | before | after | strategy |
|---|---|---|---|
| 2 | OK 85% | **TOO EASY 90%** | start/T3 |
| 4 | OK 56% | OK 67% | none |
| 5 | OK 60% | OK 80% | none |
| 6 | 1.05x, 9/15 | **OK, won 27%** | start/T3 |
| 7 | 1.3x | **1.05x** | ground/T1 |
| 8 | 1.36x | **1.08x** | none |
| 9 | 1.36x, 3/20 towers | 1.36x (unchanged) | start/T1 |

Maps 0, 1 and 3 are unchanged (start/T1).

## Process notes
- **Final review:** the Opus whole-branch review mutated `bestStrategy` to always return the first candidate, and every test still passed. The fix added a `toBe(pickBest(results))` assertion on map 6, because the mutation does not bite on map 0, where the winner IS the first candidate.
- **Task 2:** the review caught a redundant `Math.min` cap that no test could exercise, because `upgradeCost` already enforces the tier ceiling.
- **Plan defect:** one prove-it-fails step in the plan was a same-scope `const` redeclaration. That is a SyntaxError rather than a failing test, so it was replaced before dispatch.

## Open decisions for the user
- **Map 9** is under-funded under every strategy. It is a data decision.
- **Map 2** now shows TOO EASY under its best strategy. Map 2 is a frozen on-ramp map.
- **#31:** with the flat +120 gold bonus, maps 3/4/5 keep 89% / 100% / 100% of lives.
