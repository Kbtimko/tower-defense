# Entity scale + build-pad polish

Maintainer report: "towers are not placed perfectly in their circles; when they are
placed the circle should disappear so I only see the tower; heroes and bad guys should
also have graphics — Rael should look like an actual person, not a circle."

## What the investigation actually found (measured live, map 0)

**Towers are already perfectly centred.** `dx = 0, dy = 0` for all seven placed towers;
sprite local offset `[0,0]`, origin `[0.5,0.5]`. There is no alignment bug. What reads as
misalignment is that sprite size vs the 44px pad diameter is wildly inconsistent — archer
99px (2.25x the pad), mage 83px (1.88x), everything else 52–56px (1.19–1.28x).

**Rael is already a person, rendered at 24.3px.** The hero sprite is live and animating
(`sprite-hero-rael-idle`), it is simply drawn at scale 0.38 on a 64px frame. At 24px a
human figure is an indistinct blob. Measured sizes across the whole board:

```
soldier 17.3  skitter 23.7  RAEL 24.3  drone 26.9  sentry 27.8  phantom 37.1
brute 51.2  sniper 52.5  colossus 53.8  cannon 55.0  ice 56.3  barracks 55.0
mage 82.6  archer 98.9  titan 138.2
```

The protagonist is the third-smallest object in the game.

**The pad is a static one-time layer.** `PlatformRenderer.renderPlatforms` is called from
`GameScene._renderStaticLayers`, which runs once at scene create, before any slot is
occupied. Every slot therefore gets its full pad *and* its `+` build marker baked into the
static layer, and nothing ever redraws it. (The separate dynamic ring in
`GameScene._drawZones` already does `if (zone.occupied) continue;` — that part is correct
and must not be changed.)

## Maintainer decisions

- **Entity scale:** hero ~2x; small enemies a modest bump; big enemies unchanged so the
  threat ladder (drone < brute < titan) is preserved.
- **Pad on build:** keep a drop shadow and a faint rim; drop the stud ring and the build
  marker. The tower must still read as seated on something, not floating on bare terrain.

## Task 1 — occupied pads lose their studs and marker

`src/systems/PlatformRenderer.js`

`drawEmplacementPad` currently always draws: drop shadow, cleared platform disc, platform
edge stroke, an 11-stud rim ring, and a `+` marker gated on `!slot.occupied`.

Give it an occupied variant:

- **occupied:** drop shadow + cleared platform disc + a *faint* edge stroke. No stud ring,
  no `+` marker.
- **empty:** unchanged from today.

Keep it a pure drawing function — same signature, same palette lookup, branch on
`slot.occupied`. Do not change `renderPlatforms`'s signature.

`src/scenes/GameScene.js`

The static layer must be repainted whenever slot occupancy changes, or the pad will not
update until the scene restarts. Find the existing method that paints the static layer
(the one containing the `renderPlatforms(g, this.pathMgr.buildZones, map.id)` call) and
re-run it after:

- a tower is placed,
- a tower is sold,
- a barracks finishes repositioning (it frees one slot and occupies another).

Verify each of those call sites exists before wiring it — grep, do not assume a method
name. Prefer one small private helper over repeating the call three times.

**Tests:** `PlatformRenderer` is pure and already has the Graphics proxy-mock pattern
available in the repo. Assert that an occupied slot issues no stud-ring or marker draw
calls and still issues a shadow + disc, and that an empty slot is unchanged. Note the
known gotcha: a `Proxy` get-trap mock must check `prop in target` first or named members
like `_calls` get intercepted and renderer tests silently pass.

## Task 2 — scale bumps

`src/data/sprites.js` only. Change the `scale` field; touch nothing else.

| entity | scale now | scale new | px now | px new |
|---|---|---|---|---|
| hero rael | 0.38 | **0.76** | 24.3 | 48.6 |
| hero engineer | 0.39 | **0.78** | 25.0 | 49.9 |
| hero scout | 0.38 | **0.76** | 24.3 | 48.6 |
| hero pyro | 0.39 | **0.78** | 25.0 | 49.9 |
| enemy drone | 0.42 | **0.59** | 26.9 | 37.8 |
| enemy skitter | 0.37 | **0.52** | 23.7 | 33.3 |
| enemy brute | 0.80 | **0.91** | 51.2 | 58.2 |

**Do not change** phantom (0.58), colossus (0.56) or titan (1.08). Phantom's 0.58 is a
deliberate prior decision — it renders large relative to its hitbox because its bounding
box is mostly translucent wisp, and it is the plurality enemy on maps 7–9 where a fast
flyer must stay readable. Do not "fix" it to 0.43.

**Do not change** tower scales. Archer's 1.03 at a 96px cell came from a deliberate
re-roll for contrast and was set from a measured silhouette.

**Do not change** soldier (0.36) or sentry (0.58) — out of the maintainer's stated scope,
flagged separately.

If a test asserts specific scale values, update it to the new numbers rather than
weakening the assertion.

## Out of scope, flagged for the maintainer

- The hero spawns at path progress 0, which on map 0 is `x = 0` — half the sprite is off
  the left edge of the 1280px canvas, and doubling its size makes that more obvious.
- Soldier at 17.3px is the smallest figure in the game and is also a human.
- Archer (99px) and mage (83px) remain roughly 1.6x every other tower.

## Definition of done

- `npm run test` fully green; report the real count.
- `npm run build` clean.
- Browser-verified in the running game, not just tests: place towers of several types and
  confirm occupied pads show shadow + rim with no studs or `+`, empty pads are unchanged,
  a sold tower restores its full empty pad, and the hero renders at ~48px as a legible
  human figure.
