# Roadmap 4.5: soldier legibility, engineer re-gen, portraits at 512 (short design)

Status: design · 2026-11-21 · branch `visual/4.5-units-portraits`

**Outcome (2026-11-21).** Shipped: the soldier x1.5 (scale 0.54) and the shadow-free engineer.
The engineer holds its drawn height (scale 0.75), not its ground width, because the new pick
has a wider stance. Portraits at 512 were deferred by the user after the sameness gate
failed (see `docs/art-bible.md` §7, "Consistency: what a prompt can and cannot hold"); the
portraits stay at 256.

**Intent.** Roadmap 4.5 lists "spawn portal, base beacon, hero & soldier refresh,
portraits". User picks (2026-11-21), from contact sheets at 2x game scale:
- **Portraits at 512 px**: the 3 speaker portraits are 256 px, so the ~240 CSS px dialog
  frame upsamples them on 2x screens.
- **Soldier legibility**: the soldier draws at 17 design px against the art-bible target
  of 36 ("barely visible").
- **Engineer re-gen**: the engineer's art still carries a baked ground blob, which the art
  bible forbids (the game draws every shadow).
Skipped by the user: portal & beacon art (code-animated rings from 1.7 read fine); the other
three heroes read well.

**Goals / design (Claude's calls).**
1. **Portraits.** Raise the portrait `expected` size in `src/assets/assetManifest.js` from
   256 to 512 and regenerate with the legacy generator (`npm run art -- --kind portrait`,
   seed `LEGACY_SEED` 77021, FLUX renders at 1024 and `sips` downscales). FLUX is
   deterministic, so this re-makes the same art at twice the resolution. Proof of sameness:
   the new 512 PNG downscaled to 256 matches the shipped 256 within resampling noise (report
   the mean/max channel diff). If it does not match (prompt drift since 2026-08-19), stop and
   report rather than ship different faces. Dialog CSS stays as is (it already sizes the
   frame; a 512 source simply has more pixels).
2. **Soldier.** `soldier` entry `scale` 0.36 → 0.54 (×1.5, ≈ 26 design px; keeps
   soldier < hero ≈ 48 < tower, smaller than the pads). `ground` re-measured by
   `normalize.py` (1x and `--scale 2`), tier scales (`TIER_SCALE.soldier`) unchanged,
   formation spacing already derives from the drawn width. The 4A shield and tier recolour
   follow the sprite. Check crowding on a narrow road (map 8 bends) in a frozen-frame
   capture; if soldiers overlap the road edge badly, step back to ×1.35 and record it.
3. **Engineer.** Job `scripts/art/jobs/hero-engineer.json` (`hero_engineer`, 8 candidates,
   default seed 88001), same prompt; the user picks a candidate without a ground blob at G2;
   `art:apply` installs it (1x + 2x, ground). Hold today's on-screen size (match the
   measured ground width).

**Non-goals.** Portal/beacon art; rael/scout/pyro; soldier gameplay (blocking radius,
counts); enemy or tower sizes.

**Anti-goals.** Portraits that come back as different faces; a soldier so large it covers
the road or reads like a hero; an engineer that changes size.

**Verification.** Unit: asset check requires 512 portraits; soldier display-size test updated
from data (not hardcoded). Full suite, `assets --strict`, build. Live (capture build, k = 1
and k = 2): story dialog shows the 512 portraits (no 404, sharper at 2x); barracks squads at
every tier legible and not overlapping pads (frozen-frame crops vs base); engineer with no
baked shadow; flow matrix green.
