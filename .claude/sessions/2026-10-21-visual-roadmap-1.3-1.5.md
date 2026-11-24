# 2026-10-21 (evening 2) — G1 sign-off, Veth, roadmap 1.3-1.5

| Item | PR | State |
|---|---|---|
| G1 art-bible sign-off (+ brute emissive bronze) | #91 | merged |
| Enemy name -> "Veth" everywhere | #92 | open (independent) |
| 1.3 sprite normalization | #93 | open |
| 1.4 map grading + vignette | #94 | open, stacked on #93 |
| 1.5 FX foundation (SDD: 4 tasks + final review + fix wave) | #95 | open, stacked on #94 |

Merge order: #92 any time; #93 -> #94 -> #95.

## Things learned
- Draw Things "running" != API server on: check `lsof -p <pid> -iTCP -sTCP:LISTEN`.
- normalize.py stats must exclude the outline ring (navy skews luminance/saturation).
- Phaser camera postFX doesn't populate `postFX.list`; check `camera.postPipelines`.
- Headless software-GL FPS A/B is noise-dominated; report "no measurable cost", not a speed-up.
- Cannon arc must land at the hit radius (10), not at distance 0, or shells vanish mid-air.
- Pooled projectiles: sentry `towerType` is a gameplay damage source — use a separate visual `fxType`.
- Trail particles stacked at one point look like a solid blob — test gallery shapes without trails.
