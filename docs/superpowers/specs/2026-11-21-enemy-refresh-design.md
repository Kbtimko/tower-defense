# Roadmap 4.3: enemy refresh (short design)

Status: design · 2026-11-21 · branch `visual/4.3-enemy-refresh`

**Intent.** Roadmap 4.3: "only regenerate enemies that still look off after 1.3 … add a
hurt-pose variant per enemy … where it pays off." User picks (2026-11-21): regenerate
**drone, phantom, titan**; **skip hurt poses** (hit flash + damage numbers already sell a hit).

**Why each (contact sheet at 2x game scale, dark and sand grounds):**
- drone: reads fine, but is `NOT_REPRODUCIBLE` (no cached reference rebuilds its shipped
  sheets), so it has no 2x sheet and cannot go through `art:apply` cleanly. A new reference
  makes it reproducible and gives it 2x art.
- phantom: thin wings read as a bird and almost vanish on dark maps.
- titan: an upright, front-facing totem; every other unit is top-down 3/4 and its walking
  direction is unreadable.

**Goals.** New references for the three, picked by the user at G2 from 8 candidates each,
installed through `art:apply` (1x + 2x sheets, normalize, ground), drone removed from
`NOT_REPRODUCIBLE`, the k = 2 pinned 1x set becomes empty.

**Non-goals.** Hurt poses; skitter/brute/colossus; resizing enemies to the art-bible
Appendix A targets (applying them to 3 of 6 would break the size hierarchy — a roster-wide
question, logged for later); gameplay numbers (radius, hp, speed).

**Anti-goals.** An enemy that changes on-screen size noticeably; a pick that breaks the
art-bible checklist (one subject, faces right, no lettering, no baked shadow, reads at
32 px, Veth palette: dark chitin `#1c1a22`–`#3a3442` + the `enemies.js` emissive).

**Approaches.** (a) **Rewritten prompts, txt2img, one batch of 3 × 8 (chosen)** — the
pipeline's normal path; phantom/titan need new silhouettes, not touch-ups. (b) Extend the
pipeline so a base can be img2img'd from its own reference — new code, and the fixes needed
are silhouette/pose, which useful img2img strengths change anyway. (c) Hand-edit the
existing references — not reproducible, no generator provenance.

**Design (Claude's calls).**
- `public/assets/sprites/PROMPTS.md` enemy bullets (the `{subject}` slot under the
  art-bible §7 anchor):
  - drone (keep the design, add the camera): "small alien recon drone seen from a high
    angle, walking to the right, compact rounded hexagonal chitin carapace in dark
    charcoal, one large glowing toxic-green optic on the front, four short biomech legs,
    green emissive seams"
  - phantom: "one single flying alien creature seen from above at a high angle, gliding to
    the right, broad solid manta-ray wing membrane of dark violet chitin with a thick
    central body, a bright glowing violet core and glowing violet wing edges, short
    trailing tendrils, airborne with nothing touching the ground, wide bold silhouette"
  - titan: "colossal four-legged alien boss beast seen from above at a high angle, walking
    to the right, long broad body of layered dark chitin armor plates with glowing red
    seams, a jagged crown of spines along its back, a heavy head pointing right with
    several glowing red eyes, low wide stance, hive overlord"
- Job `scripts/art/jobs/enemies-refresh.json`: `enemy_drone`, `enemy_phantom`,
  `enemy_titan`, 8 candidates, default seed (88001).
- Size: hold today's on-screen footprint. After apply, set each entry's `scale` so the
  measured `ground.width` matches today's (drone 32.2, phantom 30.2); the titan's longest
  side holds today's ~104–112 px (it turns from upright to horizontal, so match its longest
  dimension to the Appendix A target 104). Hover/flying, facing and frame counts unchanged.
- Code after picks: remove `enemy_drone` from `NOT_REPRODUCIBLE`
  (`scripts/build-sprite-sheets.py`) and its README mention; the pinned "exactly
  enemy:drone stays 1x" test becomes "no entity stays 1x at k = 2"; `tierLookPadFit` and
  other footprint tests stay green.
- Generation preconditions: Chrome quit, Draw Things HTTP on 7860 with FLUX.1 [schnell];
  ~24 images × ~2.2 min ≈ 55 min.

**Verification.** Picks pass the art-bible checklist on the review page (dark + light);
`art:apply` green (assets strict + npm test); full suite; live capture build at k = 1 and
k = 2: the three enemies render from art, same footprint as base (frozen-frame crops),
phantom visible on map 9 (dark), titan reads as walking right; flow matrix green.
