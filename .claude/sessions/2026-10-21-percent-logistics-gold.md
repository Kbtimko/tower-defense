# 2026-10-21 — Percent-based logistics starting gold (backlog #31)

Branch `balance/percent-logistics-gold`. PR #84 had merged since the last session; notes.md still called it open, which is corrected here.

## Decisions (user)
- **Shape:** percentage of each map's `startGold` (over a later star gate, or accepting the bonus and tightening maps 3-5).
- **Size:** Supply Cache **+15%**, Deep Reserves **+25%** (40% combined). Map 9 keeps exactly its +120; every earlier map gets less.
- **Scope:** #31 only. Map 2 TOO EASY and map 9 under-funding stay separate (now #36 / #37).

## What shipped
- `startGoldPct` on the two nodes in `src/data/upgrades.js`, effect text `'+15% starting gold'` / `'+25% starting gold'`, and a test that the text matches the number.
- `UpgradeManager.getModifiers` returns `startGoldPct`, summed from owned nodes' data. The hardcoded +40/+80 lines are gone. The old key `startGoldBonus` was renamed, not reused, so a stale reader can't add 0.4 gold.
- Pure `startingGold(baseGold, pct)`, which rounds the bonus, not the total (130 × 0.15 = 19.5 → 150). It is wired at the single call site, `GameScene.create`.
- **Tests:** 1514, up from 1505. Deliberate breaks were confirmed to fail the specific tests: floor instead of round, ignoring Deep Reserves, and reverting the effect text.

## Measured (best-of-5, lives kept: no bonus / flat +120 / +40%)
| map | no bonus | flat +120 | +40% |
|---|---|---|---|
| 3 | 61% | 89% | 78% |
| 4 | 67% | 100% | 89% |
| 5 | 80% | 100% | 100% |
| 8 | L1.08x | 8% | L1.05x |
| 9 | L1.36x | L1.16x | L1.16x |

Full table in the spec. **Map 5 stays at 93-100% at every bonus size swept**, so it is a map-5 problem, now logged as #35. The sim is noisy at this resolution (map 4: +20% kept 94%, +30% kept 78%).

## Verification
- Production build (`npm run build` + `vite preview`), real UI clicks, with a sentinel planted in `#stat-gold` before each level:
  - map 3: 180 none / 207 Supply Cache / 252 both
  - map 0: 150 Supply Cache
  - map 9: 300 none / 420 both
  - The Upgrades screen shows the new text.
  - Console: only the pre-existing favicon 404 and the AudioContext autoplay warning.
- Per-task reviews were clean. The final review (Opus) found no code defects; its one Important finding was this notes update.

## Known trade
Players who already own both nodes get less gold on maps 0-8, with no in-game notice. Their purchases carry over unchanged, since the node IDs are the same.
