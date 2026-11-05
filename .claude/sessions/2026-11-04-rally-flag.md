# 2026-10-29 → 11-04 — Backlog #48: barracks Rally flag, soldiers walk to it

**Accomplished:**
- Found that the backlog's premise was off: soldiers never moved at all. `repositionSoldiers` had no caller, and Move moved only the building.
- Brainstorm with animated mockups. User picked look B: a range ring with a ghost flag snapped to the road (red out of range), a dotted route, a cluster formation, and a flag that fades after arrival.
- Spec `docs/superpowers/specs/2026-10-29-rally-flag-soldier-walk-design.md` (spec-writer + builder check). Plan `docs/superpowers/plans/2026-10-29-rally-flag-soldier-walk.md`, review-plan PASS.
- Subagent-driven: 7 tasks (sonnet for the four pure-module tasks, opus for entity, scene and harness). Every review was opus. Then a final whole-branch review, one fix wave, and a scoped re-review.
- 3452 → 3607 tests. `npm run balance` SHA-256 `b803a0c6…0467` is byte-identical before and after; there is no diff under `src/sim/`.
- Gates:
  - `npm test` exit 0 and `npm run build` exit 0.
  - `npm run matrix`: desktop 17/17, iphone/pixel/ipad 18/18.
  - `npm run capture -- --screens` on 5 devices: 0 problems except the known desktop1440 #56(a) probe.
- Live check, production build, real input at desktop 1440×900 and iPhone 14 landscape: all 12 checklist items pass, 0 console errors.

**Decisions made (user):**
1. Rally is a new ring item; the building stays put. Move still moves the building, and the squad walks to the new pad's road point.
2. Soldiers fight on contact while marching.
3. They respawn at the rally point.
4. They walk along the road.
5. The flag can only go on road inside the barracks' range; elsewhere you get a toast.
6. Look B (see above).
7. An order disengages a squad that is fighting.
8. 60 px/s for both Rally and Move.

**Rulings I made (ledger `.superpowers/sdd/2026-10-29-rally-flag-soldier-walk/progress.md`; cost if wrong in brackets):**
1. The balance baseline went in the plan workspace. [none]
2. Engagement is tested with a probe object, later `isEngaged` via `Object.create`. [style]
3. `MELEE_RANGE` stays only in `soldierCombat.js`. [none]
4. A 4th soldier stands behind, on alternating sides. [cosmetic]
5. "Arrived" plus "halted" counts as arrived. [none]
6. Very short routes get evenly stretched dots. [cosmetic]
7. Targets come pre-clamped from `getNearestPathProgress`. [none]
8. Facing uses `travelDir.x × substepPx` against the 8-px deadzone. [facing flips late on diagonals]
9. The formation turn eases over `turnMs` 120 and snaps under reduced motion. [cosmetic]
10. An upgrade keeps each soldier's disengage window. [one field]
11. The route starts at the farthest live soldier. [a few px]
12. Strokes use `RALLY_FLAG.lineWidth`. [trivial]
13. Ghost legibility is judged from captures, which led to ruling 15. [none]
14. Rally mode cancels on the next frame if its barracks is gone. [one more cancel path]
15. A `PALETTE.panel` halo goes under the ring, ghost, flag and dots, and the ring turns red out of range. [trivial]
16. Arming a tower or a hero aim exits rally mode (newest intent wins). Reposition mode is unchanged and goes to the backlog. [one more cancel path]

**Notable catches:**
- **Task 3:** float drift could leave a squad "marching" forever when it was blocked on its landing point (231/2000 probe runs). The fix is an exact landing.
- **Task 3:** the test path had equal-length legs, so an index-space stepper would have passed.
- **Task 6:** the fade is clocked off the frame time, not `_runMs`, so it also works before wave 1.
- **Final review:** pressing a HUD tower button while in rally mode showed a build ring that could not build, and on one pad sent the squad off instead (Ruling 16).
- **Captures:** the red ghost was nearly invisible on map 0's red ground (Ruling 15).

**Numbers worth keeping:**
- Worst-case Move walk at 1x (pad-to-pad road span ÷ 60 px/s): m0 23.6 s, m1 19.9, m2 22.7, m3 23.8, m4 19.4, m5 19.3, **m6 32.6**, m7 26.4, m8 23.7, m9 24.1. The squad blocks on the way, but the new spot is unguarded until it arrives.
- Live: T1 soldiers (15 hp) die about 1.25 s into a drone fight. Soldiers outpace drones by only 10 px/s, so a following drone can re-engage once the 60-px disengage window runs out.

**Where we left off:** PR into `visual/integration`. Follow-ups are in the backlog (#62–#65). Next is #49 (upgrade visuals, code half).
