# Drop the core glow over tower art (backlog #73a) — short design

## Intent
The user, on 2026-11-19, said: "drop the dots for 73a".

Background:
- #49 added a pulsing accent-coloured core over the middle of every T2+ tower. At that time all tiers shared one picture, so the core was what marked a tier.
- Since roadmap 4.2, each tier has its own art (orb, crystal, barrels).
- The core, half the tower's footprint wide, now covers that detail.

The choice offered was option 3: drop the core when real art is loaded, and keep it for the plain shapes drawn when art is missing.

## Scope
- In scope: the core only (`fx-glow` and `fx-ember` "hot" pair, `TIER_CORE`). "The dots" means the core.
- Unchanged: embers (T3+), tier pips and the A/B badge, the T4 ring, and the #66 stroke circle (#66 stays its own backlog item).

## Design
- `TowerTierLook.setTier` turns the core on only when `level >= TIER_CORE.fromTier` AND the sprite has no art (`!this.sprite.active`). A tower whose art failed to load keeps the core, so a missing sheet still shows its tier.
- `expectedTowerLook(level, branch, { art = false } = {})`: `core` is `marked && !art`. The capture's tier-look check passes `{ art: true }`, because every tower type declares art. A tower that quietly lost its art then fails the check: it would show a core where none is expected.
- Comments in `TowerTierLook.js` and `tierLooks.js` say the core marks the tier only for art-less towers.

## Approaches
- **A (picked): skip the core when art is active.** Tiny change, and the fallback path keeps its marking.
- B: delete the core everywhere. Rejected: the no-art fallback would lose its T2 marking, leaving T1 and T2 told apart only by scale and pips.
- C: shrink or dim it. Not chosen; the user picked dropping it.

## Verification
- RED tests: an active-sprite T2 has no core; an inactive-sprite T2 still has one; `expectedTowerLook(2, null, { art: true }).core === false`.
- Full suite green.
- The capture `--screens` tier-looks run passes on desktop1440.
- A frozen-frame probe on the capture build: no `fx-glow` child on an art-backed T2–T4 tower; embers still present at T3.
