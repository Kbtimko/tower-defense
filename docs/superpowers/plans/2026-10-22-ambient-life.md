# Ambient Life — Implementation Plan (roadmap 1.9)

**Spec:** roadmap task 1.9 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"Extend `AmbientBackgroundLayer`/`ambientFxFamilies.js`: biome-specific drifting dust/embers/stars
with 2-layer parallax; blinking beacons on pads. *Accept:* motion visible in a 10 s capture;
negligible CPU."

**Today:** `src/systems/AmbientBackgroundLayer.js` owns ONE Graphics at depth 5 and runs one family
from `src/systems/ambientFxFamilies.js` (`FX_FAMILIES`: dust, embers, stars, electrical, bio-pulse —
each pure: `init(rng, w, h)`, `step(state, dtMs)`, `draw(gfx, state)`, optional `blendMode`;
`MAX_ELEMENTS = 90`). Each map picks `ambientFx: { family, seed }` in `src/data/maps.js`. The layer
clears itself when the `ambientMotion` registry flag is false. Since 1.7 the road sits at depth 8;
since 1.8 GameScene draws a per-frame pad-glow Graphics (`this._padGlow`, `PAD_GLOW.depth` 10.5)
in `_drawZones` for empty pads when not building.

## Global Constraints (bind every task)

1. **Visual only**; no gameplay change.
2. **Tunables in `src/data/ambient.js`** (new): layer list, per-layer speed/size/alpha/depth,
   beacon look. No magic numbers in the layer/scene logic.
3. **Never overlaps gameplay readability:** the far layer stays at depth 5 (under the road); the
   near layer sits at depth 8.5 (above the road at 8, below pads/static layers at 10 and units at
   11+). Near motes are faint (layer alpha ≤ 0.6).
4. **Negligible CPU / no per-frame allocation:** element state created once at init and mutated in
   place; total live elements across both layers stay ≤ `MAX_ELEMENTS` × 2; no `scene.add.*` or
   literals per frame.
5. **Deterministic:** every layer seeded from the map seed (far = seed, near = seed + a constant).
6. **Reduced motion:** `ambientMotion === false` → both layers clear (as today); beacons steady,
   no blink.
7. **Lifecycle:** every Graphics created in construction/create is destroyed in destroy/shutdown.
8. Phaser 3.90 — verify APIs in `node_modules/phaser/src`. Vitest + jsdom, Phaser mocked; pure
   logic tested; derive allow-lists from `FX_FAMILIES` / `MAPS`. Vanilla JS; match style.

---

### Task 1: Two-layer parallax ambient

**Files:** create `src/data/ambient.js`; modify `src/systems/AmbientBackgroundLayer.js`,
`src/systems/ambientFxFamilies.js`, their tests.

- `AMBIENT_LAYERS` = `[{ name: 'far', depth: 5, speed: 1, size: 1, alpha: 1, seedOffset: 0 },
  { name: 'near', depth: 8.5, speed: 1.8, size: 1.6, alpha: 0.55, seedOffset: 1013 }]`
  (first-pass values; near must satisfy constraint 3).
- `AmbientBackgroundLayer` builds one Graphics + one family state per layer: each layer's state from
  `family.init(new SeededRandom(seed + layer.seedOffset), w, h)`, Graphics at `layer.depth`, family
  blend mode, Graphics alpha = `layer.alpha`. `update(dtMs)` steps each layer with
  `dtMs * layer.speed` and draws with `{ sizeMult: layer.size }`.
- Every family's `draw(gfx, s, opts)` accepts an optional `opts.sizeMult` (default 1) and multiplies
  element radii/lengths by it — positions unchanged. Families stay pure.
- `destroy()` destroys every layer's Graphics. Reduced motion clears every layer.
- Tests: two Graphics at the data depths with the data alphas; each layer seeded differently
  (different element positions); near layer advances faster for the same dt; sizeMult scales radii in
  every family in `FX_FAMILIES` (derived list); reduced motion clears both; destroy destroys both;
  element counts per layer ≤ `MAX_ELEMENTS`.

### Task 2: Blinking pad beacons

**Files:** `src/data/ambient.js` (`PAD_BEACON`), create `src/systems/padBeacon.js` (pure) + test,
modify `src/scenes/GameScene.js` (+ test).

- `PAD_BEACON = { color: 0xffb000 (art-bible human amber), radius: 2, offset: { x, y } (position on
  the pad rim relative to the slot centre, upper-left per the art bible light), period: 2.4 (s),
  onFraction: 0.18, alpha: [0.15, 0.95], slotPhase: 0.37 }`.
- `beaconAlpha(timeS, slotIndex, beacon)` (pure): a short blink — `alpha[1]` for the first
  `onFraction` of each `period` (offset by `slotIndex * slotPhase` cycles), `alpha[0]` otherwise,
  with a brief smooth ramp so it doesn't strobe. Tested: periodic, phase-shifted per slot, bounded,
  duty cycle ≈ onFraction.
- GameScene: in the same per-frame pass that draws the pad idle glow on `this._padGlow` (empty pads,
  not building), draw each empty pad's beacon dot with `beaconAlpha`; reduced motion → steady
  `alpha[0]` dot (no blink). Occupied pads get no beacon. Build mode unchanged.
- Test via `Object.create(GameScene.prototype)` stubs: beacon drawn only on empty pads when not
  building; alpha follows `beaconAlpha`; reduced motion steady.
