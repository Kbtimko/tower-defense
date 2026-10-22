# 2026-10-21/22 — Veth, roadmap 1.6–1.9 (Phase 1 code complete)

| Item | PR | Base |
|---|---|---|
| 1.6 hit/death/status FX | #96 | visual/integration |
| 1.7 procedural road | #97 | stacked on #96 |
| 1.8 economy & feedback juice | #98 | stacked on #97 |
| 1.9 ambient life | #99 | stacked on #98 |

Every task ran subagent-driven (plan → per-task implementer + spec/quality review → fix rounds → whole-branch review → one fix wave → scoped re-review) plus controller browser verification on real Chromium captures.

## Things learned
- Browser verification caught a real defect in EVERY task that green tests and clean reviews missed: additive pop washing to white (1.6), roads too faint on 3 maps + leftover IN/OUT dots burying the portal (1.7), 8 px invisible coins flying into a corner (1.8), beacons drawn on a stud ring (1.9).
- Several "defects" were plan defects (beacon on the stud ring, IN/OUT dots not named in the plan, sell smoke that didn't exist) — check renderer geometry/data before writing placement into a plan.
- `gameToPageCss` inverts Phaser's displayScale (backlog #40); `pageToGame` is correct.
- A corpse reaching the base in the same frame still costs a life (backlog #38).
- Unquoted heredocs execute backticks — quote ledger heredocs ('EOF').
- macOS has no `timeout`; long capture runs should be batched and run in the background.
