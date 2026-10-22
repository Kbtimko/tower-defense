# Backlog #14 follow-up — settle the map-7 cliff before PR #58 merges

## Context you must read first
- `.claude/notes.md` → backlog **#12** (the cliff decision) and **#14** (the colossus waves).
- PR **#58** (`feat/colossus-waves`) is finished, MERGEABLE, 966 tests green — and blocked on
  exactly one open question. Nothing else in it is in doubt.

## The conflict
Backlog **#12** decided, explicitly, on 2026-08-21: **the map-7 difficulty cliff STAYS.**
It is a deliberate four-dial step (HP +30%, lives −20%, `rewardMult` 0.30→0.25, phantoms
becoming the plurality enemy), it survived every model variant, and `maps.js` was
deliberately NOT retuned.

Backlog **#14** then swapped 1 titan → 2 colossus on maps 5–9 as an HP-neutral change. It is
HP-neutral (verified 0 HP delta) but it is **not difficulty-neutral**, because colossus armour
15 < titan armour 20 and 2×55 reward > 1×80 reward (+30 gold per swap). Measured:

| | no-barracks map 7 | map6→map7 step |
|---|---|---|
| before #58 | 3.63x | +1.67 |
| after #58 | 3.35x | +1.34 (~20% smaller) |

So #14 silently moved a number #12 had decided to freeze. That is the whole question.

## Your job
Settle it with measurements, not opinion, then leave PR #58 mergeable.

**The lever is one line.** On `feat/colossus-waves`, `src/data/waves.js:122` (map 7's wave):
```js
// today (PR #58)
[{ type: 'titan', count: 2, interval: 4000 }, { type: 'colossus', count: 2, interval: 3500 }, { type: 'brute', count: 8, interval: 950 }],
// revert-to-baseline
[{ type: 'titan', count: 3, interval: 4000 }, { type: 'brute',    count: 8, interval: 950 }],
```
Maps 4, 5, 6, 8 and 9 are NOT in question — leave them alone whichever way this lands.

## Success criteria
1. `git checkout feat/colossus-waves`; confirm it is still based on `origin/main` and rebase
   onto current `origin/main` if it is not (PR #56 has merged since it was branched).
2. Run `npm run balance` and capture the **full** table (no `| tail`, no `| head` — check `$?`).
   Record both the no-barracks and bought-barracks `findWinMultiplier` columns for maps 6, 7, 8.
3. Produce the same table with map 7's line reverted. You now have an A/B on one line.
4. Answer, with those numbers: **does reverting map 7 restore the 3.63x / +1.67 step exactly?**
   The notes claim it does — verify, don't assume. If it does not, say what else moved and why.
5. Recommend one of:
   - **(a) Revert map 7's substitution.** Keeps #12's decision intact; costs the colossus its
     appearance on one of five maps. Say what that does to the colossus's campaign presence.
   - **(b) Keep it and formally reverse #12** for map 7, recording that the cliff is now +1.34
     and that this was a decision, not a drift.
   Give a recommendation, not a menu — but make the trade legible enough for the maintainer to
   overrule you in one line.
6. Whichever lands: `npm run test` fully green (report the real count), `npm run build` clean,
   and `.claude/notes.md` #12 and #14 both updated so they no longer contradict each other.
7. Push the branch so PR #58 is updated. **Do NOT merge** — `main` is the Vercel production
   branch and merging publishes. Merging is the maintainer's call.

## Edge cases to enumerate out loud before you touch anything
- Map 7 is the only map where the swap is `titan 3 → titan 2 + colossus 2`; maps 5, 6 and 8
  are `titan 2 → titan 1 + colossus 2` and map 9 is its own shape. Confirm this — the "one
  uniform swap" framing in the notes is not quite true and may change the reasoning.
- `waves.test.js` derives `VALID_TYPES` from `ENEMY_DEFS` and asserts **every declared enemy
  reaches some wave table** (added in #14). If you revert map 7, colossus must still appear
  elsewhere or that test correctly fails. Check it, don't be surprised by it.
- The balance sim excludes abilities and meta-upgrades. Say so when quoting a multiplier.
- Does the map-4 debut (+2000 HP, 1.55x → 1.66x) interact with this at all, or is it
  genuinely independent? State which.

## Ground rules
- TDD per the project's Verification Standard: any code change lands with a failing test first.
- Do not retune `maps.js`. #12 settled that; this is about one wave line, not the dials.
- Use `superpowers:subagent-driven-development` if this grows past the one-line A/B.
