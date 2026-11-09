# Towers and soldiers look stronger as they upgrade (backlog #49, code half)

**Branch:** `visual/49-upgrade-visuals` (off `origin/visual/integration` b0adeed). PR targets
`visual/integration`. **Build this after PR #118 (#48, rally flag) merges and the branch is rebased
onto integration.** #118 rewrites `Soldier.js` and `Barracks.js`, and this spec is written against
those versions. Line numbers below come from `origin/visual/48-soldier-walk` (b0adeed + #118),
which is the code this feature lands on. Files #118 doesn't touch have the same lines on both.

## Intent

The user's ask, verbatim (backlog #49): *"Towers and soldiers should look different as they
upgrade. Today a T2/T3 tower, a tier-4 branch and upgraded soldiers look the same as T1. Overlaps
roadmap 4.2 … and 4.5 (soldier refresh). The code half (pips, glow, scale, tint per tier/branch,
via spriteKeys.js) can ship before the art, following the deferred-asset pattern."*

In the brainstorm: *"i want the t3/t4 towers to look bigger and more powerful to reflect that they
inflict more damage"* and *"yes soldiers should be stronger as barracks upgrade"*. The second one
means they should **look** stronger. Their stats already rise.

Why: a player who spends 400 g taking an archer to Marksman sees the same sprite as a fresh 60 g
archer. The only tier signal today is a stroke ring 1.5 to 4 px wide. Upgrades are the main thing
players buy, so the board should show them.

**Fidelity calls (recorded).** The ask names four things this spec handles differently. Each is
settled; none needs further confirmation.
- *"tint per tier/branch"*, soldiers (**user-informed**): soldiers are recoloured with textures
  generated at boot, not with a Phaser tint. Tint multiplies, so it can't turn green armour gold
  (C2, R13-R16). The user has been told this.
- *"tint per tier/branch"*, towers (**controller call**): towers get no tint. The user picked
  option C, "Charged", which adds a glowing core, embers and a ring and leaves the tower art alone.
- *"via spriteKeys.js"*: only the **texture-key resolver** lives in `spriteKeys.js` (R1). The pips,
  glow and scale come from a new data table plus a render component (R5-R12). That is how
  `sfxKeys.js` splits the work too: the resolver picks a key, and other code does the drawing.
- *"pips on the pad's front rim"* (**controller call**; changes only tunables): every tower's art
  has its foot at or below the pad's front rim. The cannon's foot is at +24.1 px against a pad
  radius of 22, and the archer's is at +41.2 (`src/data/sprites.js:122,148`,
  `src/systems/PathManager.js:14`). Pips go just in front of whichever is lower, the rim or the
  art's foot (R9).
- *How the mockup ring "spins"* (**controller call**; changes only tunables): the mockup's CSS
  rotated the whole dashed ellipse in the screen plane. In game the ellipse stays fixed on the
  ground and its dashes run around it (S3).

### Today (verified)

- **Tier is drawn in one place only:** the stroke width of a ring of radius 18 in the tower's
  `def.color`, at widths `[1.5, 2, 3, 4]` (`src/entities/Tower.js:48-59`). With art active, that
  ring draws **over** the sprite. `EntitySprite` inserts the sprite and shadow at index 0
  (`src/systems/EntitySprite.js:57,67`), which puts them under `_bg`.
- Tower art is centre-anchored (`anchor 0.5,0.5`). The measured foot `ground.footY` is 23-41 px
  below the pad centre (`sprites.js:119-188`). An archer sits in a 96-px cell at a scale of 1.03
  (98.9 px) with a 37.1-px silhouette. **`getDisplaySize()` reports the cell, not the silhouette**
  (`EntitySprite.js:154-160`).
- `setSquash(x, y)` multiplies the manifest scale (`EntitySprite.js:141-148`). The upgrade pop is
  `startPop`/`updatePop` (`Tower.js:83-100`), and it ends at `setSquash(1, 1)`. The pop is skipped
  under reduced motion (`src/scenes/GameScene.js:1902-1906`).
- Upgrade path: `_upgradeSelectedTower` (`GameScene.js:1883-1898`) calls
  `placementManager.upgradeTower`, then `Tower.upgrade` (`src/systems/TowerPlacementManager.js:62-70`).
  **After that** it calls `barracks._rebuildSoldiers` (`:1893-1895`), then the pop. New soldiers
  are therefore constructed with `barracks.level`/`branch` already final (C7).
- Debug builds go through `applyDebugBuild` (`src/systems/debugCapture.js:77-96`). That places the
  tower, calls `upgradeTower` for each tier up to the target, then `onPlaced`, which spawns the
  soldiers last (`GameScene.js:142-146`). There's no pop and no tier-cap check.
- Soldiers (post-#118): everything drawn lives in `_view`, including the `EntitySprite`
  (`src/entities/Soldier.js:44-57`). Formation spacing is `0.55 × getDisplaySize().width`
  (`:186-190`). The HP bar sizes from `getDisplaySize()` (`:70-75`, `src/systems/hpBar.js:37-46`).
  The Graphics fallback body is fixed green `0x4caf50` (`:61-68`). On death, `takeDamage` hides
  the body and sprite (`:86-91`). `respawn()` reuses the same object and shows them again
  (`:97-108`).
- BootScene loads every manifest state, then in `create()` generates the FX textures and records
  `registry.spriteKeys` (`src/scenes/BootScene.js:79-105`). Textures and animations are global to
  the game, so anything generated there exists once per game. RETRY doesn't regenerate it, and
  `EntitySprite` already guards `anims.exists` (`EntitySprite.js:74`).
- FX textures `fx-glow` (64 px) and `fx-ember` (16 px) are white on transparent
  (`src/systems/fxTextures.js:74-89`). The six tower accents are already in code as
  `PROJECTILE_FX[type].color` (`src/data/fx.js:133-159`). They match the art bible
  (`docs/art-bible.md:53-56`).
- Layers: pads are on the static layer at depth 10 (`GameScene.js:318`). Pad glow is at 10.5
  (`src/data/juice.js:80`) and rally marks at 10.6 (`src/data/soldiers.js:20`). The unit band
  runs 11-15.9, Y-sorted (`src/data/grounding.js:28`). **Towers are Y-sorted** with
  `setDepth(unitDepth(y))`, set once in the constructor (`Tower.js:37`).
- The selection ring is radius 22 on `gfx` at depth 30 (`GameScene.js:2303-2314`, `juice.js:68-74`).
  Taps resolve by distance from `tower.x/y`. The range ring is a child of the tower container
  (`Tower.js:32-38`).
- Muzzle flashes and projectiles both start at `tower.x, tower.y`, the pad centre
  (`GameScene.js:1331-1339`).
- `_fxTime` is real seconds. It advances only after the hit-stop and game-over early returns, and
  it isn't scaled by 2x (`GameScene.js:750-762`). Pad glow, selection-ring pulse and reticle spin
  all run on it. Reduced motion is `registry.get('ambientMotion') === false`, read every frame
  (`:1026`, `:2235`).
- Pads are `radius: 22` (`PathManager.js:11-16`). Map tier caps: maps 0-1 are T2, maps 2-3 T3, and
  maps 4-9 T4 (`src/data/maps.js`, `maxTierAllowed`).
- The installed Phaser is **3.90.0** (`node_modules/phaser/package.json`; `^3.88.0` in
  `package.json`). Every Phaser API named below was checked in that source.

## Decisions (the user's, from the animated mockups and the follow-up round)

1. **Towers: option C, "Charged"** (`tier-looks-v2.html`). Scale per tier: T1 100%, T2 112%,
   T3 125%, T4 140% on both branches. T2 adds a glowing core in the tower's accent colour. T3 adds
   three staggered embers rising off the tower. T4 adds a "ring of power" under the tower: branch
   A's is solid and breathing, branch B's is dashed and spinning. It applies to all six towers,
   barracks included.
2. **Tier pips:** 1, 2 or 3 dots at T1, T2 or T3. Tier 4 shows a branch-letter badge, A or B. This
   was the controller's mockup choice, and the user didn't object.
3. **Soldiers: option B, "Gold armour"** (`soldier-looks.html`). Scale per barracks tier: T1 100%,
   T2 110%, T3 120%, T4 130%. The armour warms from steel/green toward the barracks gold, subtle at
   T2, stronger at T3, and full gold at 4B Rapid Response. 4A Vanguard turns ice-blue and carries a
   small shield. Mockup filters (sepia, saturate, hue-rotate, brightness): T2 (.35, 1.3, 0°, 1.05),
   T3 (.6, 1.6, −5°, 1.1), 4B (.9, 2.0, −8°, 1.15), 4A (.9, 1.4, 170°, 1.15). T1 is unfiltered.
4. **Reduced motion:** the same marks, standing still. The house rule is a steady version, never
   nothing. Mockup still state: core at full opacity, embers held at 38% of their rise at 0.8
   alpha, ring static.
5. **140% at T4 for every tower, archer included. No per-type cap.** The archer's contact-shadow
   overlaps on the tight pad pairs are accepted, and R25 pins the exact clash set.
6. **The narrow ring** (`rx` ≈ 25, about a T4 tower's base width), chosen knowing it crosses
   neighbouring rings on 7 tight T4 pairs. Those crossings are **accepted** as they are, with no
   clipping and no alpha tricks (S4, R25).

## Controller's calls (recorded as the controller's; see Resolved questions for pushback)

- **C1. Deferred asset.** The code ships now. Real per-tier/branch art (roadmap 4.2/4.5) drops in
  later through a pure key resolver in `spriteKeys.js`: the tier/branch key first, falling back to
  the base key (the `towerFireSfxKey` shape, `src/systems/sfxKeys.js:10-15`). The code-drawn
  core, embers, ring and pips **keep drawing when real tier art exists**. *Spec author:* agreed,
  and it's forced: roadmap 4.2 draws "T1-T3 share a base, branch 4A, branch 4B"
  (`docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md:105`), so T2 and T3 can only be
  told apart by the code marks.
- **C2. The soldier recolour is neither tint nor preFX/postFX.** Textures are recoloured once at
  boot by a pure colour-matrix function and registered under tier keys. Real tier art registered
  under the same key wins, because generation runs only when the key is missing.
- **C3.** The glow, embers and ring use `fx-glow`/`fx-ember` with ADD blend, or Graphics. No
  postFX. Tunables go in a new `src/data/tierLooks.js`.
- **C4.** 140% must fit the pad spacing. *Superseded by Decision 5; see the C4 result and Resolved
  question 1.*
- **C5.** The tier scale is a base multiplier. The squash pop multiplies on top of it and plays
  from the new size.
- **C6.** Tap radius and range don't change. The muzzle flash follows the drawn size. The
  selection ring may grow with it. *Spec author:* the selection ring stays at radius 22 (S6).
- **C7.** Soldiers read `barracks.level`/`branch` in the constructor. That is enough, because an
  upgrade rebuilds them, and respawn reuses the same object, so the look carries over.
- **C8.** Balance is untouched. No stat or `src/sim/` change, and `npm run balance` stays
  byte-identical.
- **C9.** Embers draw above the tower. The ring draws under the tower and above the pad.
- **C10.** A capture run builds every tower at T1 to 4B through debug build params, plus soldiers
  per tier, with frozen-frame probes.
- **C11. 4A ice-blue yields to the art bible.** If a capture reads 4A as the slow-status cyan
  `#7fe9ff`, the art-bible rule ("never reused", `art-bible.md:61-64`) wins over the mockup's 170°
  hue rotation. The mockup filter is a visual reference, not maths. `SOLDIER_RECOLOR.t4a` is
  tuned to stay in the `#6fb6ff` blue family (hue ≈ 210°, against slow cyan's ≈ 190°), and R26
  checks it in a frozen frame.
- **C12. Fidelity calls.** Three of the fidelity notes (no tower tint, pip placement, how the ring
  spins) are controller calls and change only tunables. The boot-time recolour rather than tint is
  settled and the user has been told.

### C4 result (computed from `src/data/maps.js` × 1280×720 and the sprite manifest)

**The yardstick.** `getDisplaySize()` returns the **cell**: 98.9 px for an archer, which would
"overlap" almost every neighbour already at T1. That makes it the wrong measure. Tall art
overlapping vertically is ordinary Y-sorting and happens at T1 today. Two towers that look like
they stand **on each other** have overlapping ground footprints. A footprint is the contact-shadow
ellipse the game already draws (`src/systems/grounding.js:9-20`): width `ground.width × s`, height
`0.35 ×` that width, centred at the foot `(3, footY + 1)`. With the foot pivot (R6), the foot
doesn't move as the tier scale changes. All footprints share one aspect ratio, so two of them
overlap exactly when
`(dx / ((W_a+W_b)/2 · s))² + (dy' / (0.35 · (W_a+W_b)/2 · s))² < 1`, where
`dy' = dy + footY_lower − footY_upper`.

Every pad pair on every map was checked at that map's tier cap, using the worst tower pairing
(footY runs from 23.0 for the sniper to 41.2 for the archer). `s_max` is the largest scale that
still clears:

| Map (cap) | Tightest pair (upper / lower slot) | Pad offset dx, dy (px) | Worst pairing | s_max | Overlap at the cap |
|---|---|---|---|---|---|
| 0, 1 (T2) | — | — | — | ≥ 2 | none |
| 2 (T3) | 0 / 8 | 64.0, 16.6 | archer over ice | 1.79 | none |
| 3 (T3) | 0 / 7 | 37.1, 26.6 | archer over sniper | **1.238** | 0.3 px at 1.25 |
| 4, 6, 7 (T4) | — | — | — | ≥ 1.6 | none |
| 5 (T4) | 6 / 10 | 10.2, 31.7 | archer over sniper | **1.115** | 3.7 px (and 0.1 px already at T2) |
| 5 (T4) | 8 / 13 | 48.6, 20.9 | archer over cannon | 1.376 | 1.2 px |
| 5 (T4) | 12 / 2 (same row) | 53.8, 0 | archer and archer | 1.447 | none |
| 8 (T4) | 14 / 11 | 37.1, 26.6 | archer over sniper | **1.238** | 3.3 px |
| 8 (T4) | 12 / 5 | 21.8, 32.4 | archer over sniper | 1.288 | 1.6 px |
| 8 (T4) | 4 / 6 | 42.2, 26.6 | archer over sniper | 1.360 | 1.0 px |
| 9 (T4) | 9 / 2 and 19 / 8 | 20.5, 31.7 | archer over sniper | **1.22** | 2.5 px |

**Every overlap has the archer on the upper pad of a near-vertical pair.** The archer's foot sits
41.2 px below its pad centre, about 19 px past the pad edge, so it reaches down into the pad
below. With no archer on the upper pad, every pair clears at its map's cap. The closest of the
rest is two archers side by side on map 5's 2/12 row, with `s_max` 1.447. No footprint overlaps at
T1 on any map.

**Decided (Decision 5): keep 140% for every tower.** To clear every pair, T4 would have to drop to
1.115, which is below T2. Leaving out map 5's 6/10 pair (whose pads are 33.3 px apart, so the pads
themselves overlap), it would still have to drop to 1.22, below T3. The overlaps are at most
3.7 px of contact shadow, and the lower tower already draws in front of the upper one. R25 pins
this table as a test, so a new pad or new art can't add a clash without anyone noticing.

**Road overlap** (the brief's question): T1 art already covers road behind path-hugging pads. An
archer spans from about −40 to +41 px around its pad centre (81-px art, `art-bible.md:209`). The
foot pivot keeps the base on the pad, and the art grows **upward**. A T4 archer's top reaches
about −72 px. More of the road behind a tall tower is hidden (Risk R-2), the same way it is
today, only taller.

## Spec-author calls (made here so the plan needs no further questions; vetoable)

- **S1. Foot pivot.** The tier scale grows the art from its ground contact point (`ground.footY`)
  rather than its centre: `sprite.y = (1 − s) · footY`. The mockup did the same
  (`transform-origin: 50% 85%`). A centre pivot would push an archer's base 16.5 px further off its
  pad at T4. The squash pop keeps its current centre pivot (C5), so its feel and tests don't
  change.
- **S2. Key chain = exact, then base.** A `t4a` key that isn't registered falls back to the base
  key, never to `t3`. That fits roadmap 4.2's base + 4A + 4B art, and it's the `towerFireSfxKey`
  shape.
- **S3. The ring is a ground ellipse with travelling dashes** (C12). Branch A: solid, breathing.
  Branch B: 12 dashes running round the ellipse once every 3 s.
- **S4. Narrow ring, centred on the foot** (Decision 6). `rx 25`, `ry 12`, breathing to ×1.07,
  about the width of a T4 tower's base. It clears every **same-row** T4 pair. The tightest is
  map 5's slots 2/12, 53.8 px apart at the same y, against a peak width of 2·25·1.07 = 53.5. It
  does **not** clear every pair. Each ring sits on its own tower's foot, and the archer's foot is
  about 18 px lower than the sniper's. So on the 7 tight vertical T4 pairs, an archer above a
  sniper crosses rings even at rest. The worst is map 8 12/5, with a builder-measured overlap
  score of 0.47. Those crossings are accepted, with no clipping or alpha tricks, and pinned by R25.
  For comparison, the mockup-size ring (`rx` 33) crosses on 17 pairs.
- **S5. The ring lives on one scene-level Graphics layer at depth 10.55**, between pad glow
  (10.5) and the rally route (10.6). Inside the tower container it would Y-sort with the tower and
  paint over a unit standing just behind it. The core, embers, pips and badge are **children of
  the tower container**. They move and sort with it, and they're destroyed with it on sale.
- **S6. What scales and what doesn't** (C6):

  | Thing | Changes with tier? |
  |---|---|
  | Sprite and contact shadow (width) | yes, tier scale, foot pivot |
  | Core, embers, pips, badge position | follow the drawn art (R7-R10) |
  | Muzzle flash **and projectile launch point** | yes: the drawn centre `(x, y + pivotOffsetY)`, up to 16.5 px higher (archer T4) |
  | Tap radius, range, range ring, targeting distance | no (gameplay) |
  | Selection ring (radius 22, depth 30) | no: it marks the pad and always draws on top |
  | Radial ring position and hub text | no |
  | The existing tier stroke ring (`Tower._redraw`) | no: kept as is, pips are added, not swapped |
  | Fallback (no-art) disc and icon | no scale; the marks still draw |

  *Cost if wrong:* moving the projectile launch point changes the time a live shot takes to land
  by at most about 16 px of flight. The sim has its own projectiles (`src/sim/simulate.js:394-431`)
  and doesn't import any of this, so `npm run balance` is unaffected.
- **S7. The animation clock is `_fxTime` (real time).** It's decoration, like pad glow and the
  selection ring. At 2x speed the towers don't speed up, and pause, hit-stop and game over freeze
  them, because `update()` returns before `_fxTime` advances.
- **S8. Soldier variants are generated in `BootScene.create()`** right after the FX textures. They
  are generated once per game, before any scene starts, so the debug and capture entry points have
  them too. The textures are made with `CanvasTexture` methods. Its context is created with
  `willReadFrequently: true` (`node_modules/phaser/src/textures/CanvasTexture.js:86`). Repeated
  readbacks on a plain canvas make Chrome log a console warning, and `watchProblems` counts
  warnings as problems (`scripts/capture.mjs:219`).
- **S9. The 4A shield is code-drawn** (a Graphics kite shape, the mockup's polygon, blue
  `#cfe8ff` to `#6fb6ff` with a `PALETTE.panel` outline). It draws only while the soldier manifest
  declares **no** `variants.t4a`. Real Vanguard art is expected to carry its own shield. The
  shield mirrors with the soldier's facing, and it hides and shows with the soldier (R16b).
- **S10. Fallback soldier body (no sheet):** the Graphics body takes a per-variant colour from data
  and the tier scale (foot pivot). The 4A shield draws in the fallback too. So the tier still
  reads when the soldier sheet fails to load.

## Goals (testable requirements)

**Key resolution: `src/systems/spriteKeys.js`**
- R1. Pure additions, with no Phaser import:
  ```js
  export function tierVariant(level, branch)          // 1→'t1', 2→'t2', 3→'t3', 4+'A'→'t4a', 4+'B'→'t4b'; 4 with no branch → 't3'
  export function variantTextureKey(category, type, state, variant)  // `${spriteTextureKey(...)}-${variant}`
  export function resolveSpriteKey(category, type, state, variant, registeredKeys)
    // variant key if registered, else base key if registered, else null (S2)
  ```
  `registeredStates` gains an optional `variant`: a state counts if `resolveSpriteKey` is
  non-null. With no variant it behaves exactly as today. No `-t1` key is ever registered, so `t1`
  always resolves to the base key.
- R2. **Manifest variants (the drop-in path, C1).** A `SPRITE_MANIFEST` entry may declare
  `variants: { t4a: { scale?, anchor?, ground?, states: { idle: { path, ... } } } }`. BootScene
  loads each declared variant state under `variantTextureKey` (`BootScene.js:79-88`) and records
  the ones that loaded in `spriteKeys` (`:98-105`). **None are declared in this PR**, so there is
  no boot 404. A capture counts a missing file as a problem (#48 C11). Adding real art later means
  a PNG plus one manifest entry, and no code change. The header comment at `sprites.js:1-32`
  documents the `variants` shape.

**EntitySprite: `src/systems/EntitySprite.js`**
- R3. The constructor takes `variant` (default `'t1'`). It resolves one key per state through
  `resolveSpriteKey`, stores them, and uses the stored key for textures, animation keys,
  `setState` and `playOnce`. Animations are created per resolved key and stay idempotent
  (`anims.exists`). A variant manifest entry's `scale`/`anchor`/`ground` override the base
  entry's.
- R4. New methods:
  ```js
  setVariant(variant)    // re-resolve keys, create any missing anims, re-apply the current state; no-op when unchanged
  setTierScale(s)        // sprite scale = config.scale × s × squash; sprite.y = (1 − s)·footY (S1); shadow width/height × s, y unchanged
  pivotOffsetY()         // (1 − s)·footY, 0 when inactive or there's no ground data
  groundSpec()           // { footY, width: ground.width × s } at the current tier, or null when inactive
  resolvedKey(state)     // the stored resolved key (used by __capture.looks, R19)
  ```
  `setSquash` multiplies on top of the tier scale (C5). `getDisplaySize()` keeps its meaning,
  unsquashed and **including** the tier scale, so soldier formation spacing and HP-bar placement
  grow with the soldier.

**Tower look: `src/systems/TowerTierLook.js` (new render component, no Phaser import, like EntitySprite)**
- R5. `Tower` (`Tower.js`) owns a `TowerTierLook` built after the `EntitySprite`.
  `Tower.upgrade()` (`:66-79`) calls a new `_applyTier()`, which does
  `_sprite.setVariant(v)`, `_sprite.setTierScale(TIER_SCALE.tower[v])` and
  `_look.setTier(level, branch)`. The constructor also calls `_applyTier()`, so a T1 tower gets
  pips. The pop (`startPop`/`updatePop`) doesn't change. Because `upgrade()` runs before
  `_playTowerPop` (`GameScene.js:1889,1896`), the pop plays from the new size.
- R6. Geometry comes from `_sprite.groundSpec()`, or `TIER_FALLBACK_GROUND = { footY: 18, width: 36 }`
  (the r=18 disc) when there's no art. The drawn centre is `(0, _sprite.pivotOffsetY())`. The
  **foot** `(0, footY)` from that same source anchors both the pips (R9) and the ring (R11), with
  or without art. `Tower.footY()` exposes it to the scene.
- R7. **Core (T2 and up):** an `fx-glow` image tinted with the accent, plus a smaller white
  `fx-ember` "hot" dot, both ADD blend, at the drawn centre. Size is
  `TIER_CORE.sizeFrac × groundSpec.width`. Alpha pulses between `TIER_CORE.alpha` over
  `TIER_CORE.periodS` (mockup: 1.1 s, 0.65 to 1). Under reduced motion it holds `stillAlpha` (1).
- R8. **Embers (T3 and up):** `TIER_EMBERS.count` (3) `fx-ember` images tinted with the accent, ADD
  blend, drawn above the sprite. A pure `emberPose(tSec, i, cfg, ground)` returns `{dx, dy, alpha}`.
  Phase is `tSec/periodS + i/count` (1.8 s period, evenly staggered). Each ember starts just above
  the foot at an x offset `xFrac[i] × width`, eases up by `riseFrac × (drawn height)`, and fades in
  over the first 15% and out to 0 at the top. Under reduced motion each ember holds at
  `stillRiseFrac` (0.38) with `stillAlpha` (0.8).
- R9. **Pips (all tiers):** one Graphics child above the sprite, redrawn only by `setTier`.
  T1/T2/T3 draw 1/2/3 accent dots (radius `TIER_PIPS.radius`) with a `PALETTE.panel` outline,
  centred on x = 0 at `y = max(TIER_PIPS.minY, footY) + TIER_PIPS.gapBelowFootPx` (`minY` = 22,
  the pad radius), with `footY` from R6. That puts them just in front of the pad rim or the foot,
  whichever is lower. At T4 the dots are replaced by an accent badge with the branch letter in
  `PALETTE.panel` (`FONTS.body`, bold, `TIER_PIPS.badge.fontPx` ≥ 11 world px). The pips stay
  inside their own ring's front arc (ring `ry` > pip offset), so a tower's pips and ring never
  overlap.
- R10. `setTier(level, branch)` creates or destroys exactly the marks that tier needs: T1 pips
  only; T2 core + pips; T3 core + embers + pips; T4 core + embers + badge. It's idempotent.
  `updateLook(tSec, reducedMotion)` sets the core alpha and ember poses only, with no allocation
  per frame. `destroy()` isn't needed separately, because they're container children and are
  destroyed with the tower.

**Ring layer: `GameScene`**
- R11. `create()` adds `this._tierRingGfx` at `TIER_RING.depth` (10.55) next to `_padGlow`
  (`GameScene.js:334`). `shutdown()` destroys it next to `_padGlow` (`:712-713`).
  `_drawTierRings()` clears it, then for every tower with `level === 4` draws an ellipse centred on
  the tower's foot, `(t.x, t.y + t.footY())` (R6). Without art that is the fallback foot, the same
  point the pips use. The ellipse is in the accent colour:
  - branch A: `strokeEllipse` at `rx·k, ry·k` with `k` and alpha from a pure
    `ringBreath(tSec, cfg)` (1.4 s, ×1.00 to ×1.07, alpha 0.85 to 0.5);
  - branch B: dashes from a pure `ellipseDashes({ rx, ry, dashes, duty, phase })` (a list of point
    arrays), each stroked with `strokePoints`. `phase = tSec / spin.periodS`.
  - Under reduced motion: A at `k = 1`, alpha 0.85; B at phase 0.
  - Rings of neighbouring towers may cross (S4, Decision 6). They are drawn as they fall, with no
    clipping or alpha adjustment.
  (`Graphics.strokeEllipse` takes full width and height, and `strokePoints` exists:
  `node_modules/phaser/src/gameobjects/graphics/Graphics.js:1075,1186`.)
- R12. `update()` calls `_updateTowerLooks()` (every tower's `updateLook(this._fxTime, reducedMotion)`)
  and `_drawTierRings()` in the draw block (`:787-794`). That covers towers with no `fireRate`, the
  barracks. `_upgradeSelectedTower` and `_placeAt` also call `_drawTierRings()`, and
  `_sellSelectedTower` and `_repositionTo` redraw the layer too, so a change made under a user
  pause (the radial stays clickable while paused, #48) shows at once. Paused scenes still render.
  The muzzle flash and projectile spawn use `tower.muzzlePoint()` → `{ x, y: y + pivotOffsetY }`
  (S6, `:1331-1339`).

**Soldier recolour**
- R13. **Pure colour maths: `src/systems/colorMatrix.js` (new).** It holds the CSS Filter Effects
  matrices (W3C Filter Effects Level 1, §"filter functions": `sepia`, `saturate`, `hue-rotate`,
  `brightness`, all in sRGB):
  ```js
  export function filterStages({ sepia = 0, saturate = 1, hueRotate = 0, brightness = 1 })  // -> 3×3 matrices, CSS order
  export function applyColorStages(rgba /* Uint8ClampedArray */, stages)                    // in place; clamps 0..255 after EACH stage (browser behaviour); alpha untouched; alpha-0 pixels skipped
  ```
  It needs no canvas, so it tests under Vitest.
- R14. **Generation: `src/systems/soldierTierTextures.js` (new; touches only the passed scene).**
  `generateSoldierTierTextures(scene, registeredKeys)` returns the keys it added. For each variant
  in `SOLDIER_RECOLOR` (`t2`, `t3`, `t4a`, `t4b`) and each soldier state whose base key is
  registered, it skips when `scene.textures.exists(variantKey)` (real art wins, C2). Otherwise it
  does:
  `src = textures.get(base).getSourceImage()` → `ct = textures.createCanvas(key, src.width, src.height)`
  → `ct.draw(0, 0, src)` → `img = ct.getData(0, 0, w, h)` → `applyColorStages(img.data, stages)` →
  `ct.putData(img, 0, 0)` → `ct.refresh()` →
  `textures.addSpriteSheet('', ct, { frameWidth, frameHeight })`. The empty key with a Texture
  argument adds the frames to the existing texture (3.60+, `TextureManager.js:1092-1123`), named
  `0..n-1`, which is what `generateFrameNumbers` expects (`AnimationManager.js:736-791`). The
  `'__BASE'` frame already exists, and `Texture.add` returns null for it harmlessly
  (`Texture.js:155-160`). Any throw (for example a tainted canvas) is caught. The variant is then
  skipped, the soldier keeps the base art and still shows its tier through scale and shield, and
  the failure logs nothing. A console warning would fail every capture, so the builder makes the
  failure visible some other way, such as through `__capture`.
- R15. `BootScene.create()` calls it right after `generateFxTextures` and the `spriteKeys` scan
  (`BootScene.js:93-105`), and appends the returned keys to `registry.spriteKeys`. Once per game,
  so it survives RETRY.
- R16. `Soldier` (post-#118) builds its `EntitySprite` with
  `variant: tierVariant(barracks.level, barracks.branch)`, calls
  `setTierScale(TIER_SCALE.soldier[v])`, colours and scales the fallback body (S10), and adds the
  4A shield (S9) in `_view` above the sprite and below the HP bar. The shield's `scaleX` follows
  the last non-zero facing sign from `_layout` (`Soldier.js:178-181`). Respawn changes none of
  this (C7).
- R16b. **The shield lives and dies with its soldier.** The death branch of `takeDamage`
  (`Soldier.js:86-91`) hides the shield along with the body and sprite. `respawn()` (`:97-108`)
  shows it again, with or without sprite art. A dead 4A soldier draws nothing.

**Tunables: `src/data/tierLooks.js` (new, frozen)**
- R17.
  ```js
  export const TIER_SCALE  = { tower:   { t1: 1, t2: 1.12, t3: 1.25, t4a: 1.4, t4b: 1.4 },
                               soldier: { t1: 1, t2: 1.10, t3: 1.20, t4a: 1.3, t4b: 1.3 } };
  export const TIER_CORE   = { fromTier: 2, sizeFrac: 0.5, hotFrac: 0.4, periodS: 1.1, alpha: [0.65, 1], stillAlpha: 1 };
  export const TIER_EMBERS = { fromTier: 3, count: 3, periodS: 1.8, xFrac: [-0.34, 0.08, 0.38], riseFrac: 0.85,
                               sizePx: 4, fadeInFrac: 0.15, stillRiseFrac: 0.38, stillAlpha: 0.8 };
  export const TIER_RING   = { rx: 25, ry: 12, lineWidth: 2, alpha: 0.85, depth: 10.55,
                               breathe: { periodS: 1.4, scale: 1.07, alphaLow: 0.5 },
                               spin: { periodS: 3, dashes: 12, duty: 0.55 } };
  export const TIER_PIPS   = { radius: 2.5, gapPx: 2, outlinePx: 1.5, outline: PALETTE.panel, minY: 22, gapBelowFootPx: 4,
                               badge: { fontPx: 11, padX: 2, padY: 1, ink: PALETTE.panel } };
  export const TIER_FALLBACK_GROUND = { footY: 18, width: 36 };
  export const SOLDIER_RECOLOR = {
    t2:  { sepia: 0.35, saturate: 1.3, hueRotate:   0, brightness: 1.05 },
    t3:  { sepia: 0.60, saturate: 1.6, hueRotate:  -5, brightness: 1.10 },
    t4a: { sepia: 0.90, saturate: 1.4, hueRotate: 170, brightness: 1.15 },  // starting point; tune toward the #6fb6ff family (C11, R26)
    t4b: { sepia: 0.90, saturate: 2.0, hueRotate:  -8, brightness: 1.15 } };
  export const SOLDIER_4A_HUE = { target: '#6fb6ff', avoid: PALETTE.slow, minAvoidDeg: 12, maxTargetDeg: 15 };  // R26
  export const SOLDIER_FALLBACK_BODY = { t1: 0x4caf50, t2: /* 35% to gold */, t3: /* 60% */, t4a: 0x6fb6ff, t4b: 0xffd34d };
  export const SOLDIER_SHIELD = { variant: 't4a', w: 6.5, h: 7.5, dx: 3.6, footLiftPx: 2.4, top: '#cfe8ff', bottom: '#6fb6ff', outline: PALETTE.panel };
  export function towerAccent(type)  // PROJECTILE_FX[type].color: derived, not a second table
  ```
  The mockup numbers are the reference, not mandated maths (brief, C11). The builder tunes the
  `*Frac`/`*Px` values and `SOLDIER_RECOLOR.t4a` in captures, within these ballparks. Every colour
  is a data value; scene and entity code contain no hex literals for this feature.

**Balance and harness**
- R18. Balance: no diff under `src/sim/`, and no change to any module the sim imports
  (`simulate.js:48-63`; none of the files in the table below is one of them). Capture the
  `npm run balance` SHA-256 at b0adeed+#118 first. The PR records both, and they must be
  identical.
- R19. The debug block (`GameScene.js:737-746`) writes `window.__capture.looks`:
  `towers: [{ type, level, branch, scale, footDriftPx, core, embers, emberDy: [...], ring: 'solid'|'dashed'|null, ringPhase, pips: n|'A'|'B' }]`
  and `soldiers: [{ level, branch, key, keyExists, scale, shield, dead }]`. `key` is the sprite's
  resolved idle key (`resolvedKey('idle')`). `footDriftPx` is the live
  `sprite.y + footY·scale − footY·1`. It must be 0, which proves S1 on real objects.
- R20. New `--screens` run **`tier-looks`** on all five devices. Map 9 (20 slots, cap T4). Three
  page loads, each with two tower types at T1, T2, T3, 4A and 4B (10 towers) through
  `build=type@slot:tier`, and **no `wave`**, so the board stays quiet. The builder picks slots in
  Node from `MAPS` so the shot towers don't overlap. Barracks are in one of the batches, so the
  squads at every tier are in the shots. Each load asserts:
  - (a) every `looks.towers[i]` equals `expectedTowerLook(level, branch)`, a pure function over
    `tierLooks.js`, and `footDriftPx === 0`;
  - (b) one ring per T4 tower: `solid` for A, `dashed` for B;
  - (c) every soldier's `key` equals
    `resolveSpriteKey('soldier', 'default', 'idle', tierVariant(level, branch), registry.spriteKeys)`,
    the **resolved** key. For T1 that is the base key, because no `-t1` key exists. For T2 to 4B it
    is the generated variant key. `keyExists` is true. Scale matches `TIER_SCALE.soldier`. `shield`
    is true only for live 4A soldiers;
  - (d) motion: two `looks` snapshots taken about 300 ms apart (real time) differ in `emberDy` and
    `ringPhase`.
  It shoots `tiers-<a>-<b>.png` (the board) and, on desktop1440, per-tower crops through
  `page.screenshot({ clip })` (the `capture.mjs:1972` pattern).
  **Prove it fails:** stub `setTier` to a no-op, and (a) must fail. Drop the foot pivot, and
  `footDriftPx` must fail. Skip `generateSoldierTierTextures`: T2 to 4B then resolve to the base
  key, and (c) must fail on the key mismatch.
- R21. **`tier-looks-still`** on `REDUCED_MOTION_DEVICES` (desktop1440, iphone;
  `capture.mjs:87`) with `contextOptions: { reducedMotion: 'reduce' }`. The same build. (d) is
  inverted: the snapshots are **identical**, and every mark is still present, the same as (a)-(c).
  **Prove it fails:** ignore `reducedMotion` in `updateLook`, and the identical check must fail.
  The moving run's (d) is that check's counterpart, so a vacuous wait can't pass both (memory:
  harness waits can be vacuous).
- R22. Both runs are wired into the per-device run list (`capture.mjs:597-613`), one at a time
  like the rest. Captures are committed as JPEG q90 under `docs/captures/49-upgrade-visuals/`.

**Guards (pure tests)**
- R23. `tierLooks` data test: the scales are monotonic (`t1 < t2 < t3 ≤ t4a = t4b`) for towers and
  soldiers. `towerAccent` covers all six `TOWER_DEFS` types, derived from `Object.keys(TOWER_DEFS)`,
  not a hand-written list (memory: derive test allow-lists). `stillRiseFrac`, alphas and `duty` are
  in [0, 1].
- R24. **Size hierarchy:** for every soldier tier, the scaled soldier
  (`ground.width × TIER_SCALE.soldier`) stays narrower than the narrowest hero `ground.width`, and
  the scaled soldier cell stays shorter than the shortest hero cell (soldier < hero,
  `art-bible.md:214-215`). At T4: 14.95 < 23.4 wide and 22.5 < 48.6 cell. Derived from the
  manifest.
- R25. **Pad fit** (Decisions 5 and 6). There are two pure checks in `tierLookMath.js`, and each
  walks every map's pad pairs at that map's cap with every tower pairing (`SPRITE_MANIFEST` tower
  entries, not a hand-written list):
  - **Footprint clash set.** `footprintClash(a, b, s)`, with the test asserting that the set of
    clashing (map, upper, lower, upperType) entries **equals** the C4 table's list: map 3 0/7;
    map 5 6/10 and 8/13; map 8 14/11, 12/5 and 4/6; map 9 9/2 and 19/8. The upper tower is always
    the archer.
  - **Ring crossing set.** `ringCrossing(a, b, ring)` uses ellipses centred on each tower's foot,
    `rx·k` by `ry·k` with `k = breathe.scale`. On T4-cap maps, the test asserts that the set of
    crossing pairs **equals** the 7 accepted pairs: map 5 6/10 and 8/13; map 8 4/6, 12/5 and
    14/11; map 9 9/2 and 19/8. The worst pairing on each is an archer above a sniper, and they
    cross even at `k = 1`. A companion assertion pins that no same-row pair crosses:
    `2 · rx · breathe.scale ≤` the tightest same-row gap, derived from `MAPS` (today 53.8 px,
    map 5 2/12). The builder's scripts `/private/tmp/claude-501/c4/c4.mjs` and `ring.mjs` produced
    these sets. Port that logic into the test rather than importing the scripts. At `rx` 33 the
    same script reports 17 pairs, which is the record of why the narrow ring was chosen.

  Both tests fail on any new clash or crossing, and also if a listed one goes away, so the pinned
  sets stay true when pads, art or tunables change.
- R26. **4A is blue, not slow-cyan** (C11).
  - **Pure check:** `applyColorStages` with `SOLDIER_RECOLOR.t4a` turns a representative steel
    pixel (`#5b6b7a`, `art-bible.md:31`) into a hue within `maxTargetDeg` (15°) of `#6fb6ff`
    (≈ 210°) and at least `minAvoidDeg` (12°) from `PALETTE.slow` `#7fe9ff` (≈ 190°).
  - **Capture check, in `tier-looks` on desktop1440:** pause with `sys.pause()`, read the live 4A
    soldier's generated texture pixels through `textures.getPixel` or the `CanvasTexture` data,
    and take the mean hue over opaque pixels with saturation > 0.2. Assert the same two bounds.
  - **Prove it fails:** set `t4a.hueRotate` to 150, which pushes the hue toward cyan; the capture
    check must fail.

## Non-goals

- No change to stats, costs, range, fire rate or the sim (C8).
- No new art. No manifest `variants` entries are added (R2). The art arrives with roadmap 4.2/4.5.
- No change to the existing tier stroke ring, the selection ring, tap radii or the radial.
- No pop rework. The squash keeps its centre pivot (S1).
- No clipping, masking or alpha adjustment where T4 rings cross (Decision 6).
- The ring and pips don't animate a transition between tiers. The upgrade pop is the transition.
- The sentry turret and heroes don't get tier looks.
- No fix for the pre-existing **stale depth after a barracks Move**: `_repositionTo` calls
  `setPosition` (`GameScene.js:1509`), but tower depth is set only in the constructor
  (`Tower.js:37`). It goes in the backlog. Taller art makes a wrong sort easier to see (Risk R-7).

## Anti-goals (must not happen)

- **Balance drift**: any byte of `npm run balance` changes (R18).
- **Boot or console noise**: a 404 from an undeclared variant, `generateFrameNumbers` "frame not
  found" warnings, or Chrome's canvas readback warning (S8). All of these fail captures.
- **Per-frame allocation or per-sprite postFX**: `updateLook` and the ring redraw only move and
  alpha existing objects. The ember and dash maths are pure and allocation-light.
- **Leaks across levels**: no new `this.events` listeners. The ring Graphics is destroyed in
  `shutdown()`. The look objects die with their tower.
- **A tier that reads as nothing under reduced motion** (Decision 4).
- **A shield floating over a dead soldier** (R16b).

## Edge cases

| # | Case | Required behaviour | Test |
|---|---|---|---|
| E1 | T1 tower | scale 1, one pip, no core, embers or ring | pure + entity |
| E2 | T2 / T3 | 1.12 / 1.25; core / core + 3 embers; 2 / 3 pips | entity |
| E3 | T4 A vs B | 1.4; core, embers, badge `A`/`B`; solid breathing vs dashed spinning ring | entity + scene |
| E4 | `tierVariant(4, null)` (can't happen: `upgrade(4, null)` returns early, `Tower.js:67-69`) | `'t3'`, no throw | pure |
| E5 | Sell a T4 tower | the container and its marks are destroyed; no ring next frame | scene |
| E6 | Sell, then rebuild on the same pad | fresh T1 look | scene |
| E7 | Upgrade during a pop | `upgrade` sets the new tier scale, `startPop` restarts from t=0, and the squash multiplies on top (C5) | entity |
| E8 | Pop ends | `setSquash(1, 1)` lands on the tier scale, not 1.0 | entity |
| E9 | Upgrade under reduced motion | no pop; the new scale and marks apply at once | scene |
| E10 | Debug-built T4 at load | final look after `applyDebugBuild`; ring on the first frame; soldiers spawned after the final tier, so they carry the 4A/4B look | capture |
| E11 | RETRY / leave and re-enter | textures not regenerated (exist guard), anims not duplicated, no warnings | liveScene + capture |
| E12 | Soldier base sheet missing (404) | no variants generated for it; Graphics body in the tier colour and scale; 4A shield drawn | entity |
| E13 | Only one soldier state missing | variants made for the states that loaded; the others fall back (EntitySprite already handles state subsets) | pure + entity |
| E14 | Real `t4a` art declared and loaded | generation skipped for that key; real art used; no code shield (S9); core, embers and ring still draw (C1) | pure + BootScene |
| E15 | Variant declared but its file 404s | Boot logs the 404 (a capture problem, as intended); the generated texture fills the key | note |
| E16 | Upgrade mid-march (#48 E14e) | rebuilt soldiers carry the new look; formation spacing grows with the new display width (the `_layoutKey` includes spacing) | entity |
| E17 | Soldier dies and respawns | same object, same look, same scale (C7) | entity |
| E18 | 4B squad of 4 | all four gold, scale 1.3 | entity |
| E19 | 4A soldier turns to face left | the shield mirrors to the new front | entity |
| E20 | Soldier with no art turns | the fallback shield mirrors too (facing sign kept by Soldier) | entity |
| E21 | Reduced motion toggled mid-level | read every frame; embers snap to the still pose, ring stops, core steady next frame | scene |
| E22 | 2x speed | the look animates at the same real-time rate (S7) | scene |
| E23 | User pause / hit-stop / game over | frozen (update returns before `_fxTime` advances); marks stay visible (render continues) | scene |
| E24 | Upgrade or sell while paused | marks and ring layer update at once (R12) | scene |
| E25 | Barracks Moved | pips, core and embers follow the container; the ring follows `x/y` on the next draw | scene |
| E26 | Barracks tower (idle only, no `fireRate`) at every tier | same treatment, gold accent; looks updated outside the `fireRate` loop (R12) | scene |
| E27 | Tower facing flips on fire | the marks don't flip; the core stays on the drawn centre | note |
| E28 | Tower with no art (fallback disc) at T4 | no scale; marks from `TIER_FALLBACK_GROUND`; ring centred on the fallback foot `(x, y + 18)`, the same foot the pips measure from (R6, R11) | entity + scene |
| E29 | Canvas renderer (no WebGL) | tint ignored, so the core and embers draw white; ring and pips (Graphics) keep the accent | note (Risk R-3) |
| E30 | Archer over a low-foot tower on the C4 pairs | ≤ 3.7 px contact-shadow overlap; the lower tower draws in front | pure (R25) + capture |
| E31 | T4 rings on tight pairs | they cross on exactly the 7 pinned pairs (archer over sniper, even at rest), and that is accepted (Decision 6); they never cross on a same-row pair (map 5 2/12 clears at peak breath); no clipping | pure (R25) + live check |
| E32 | Hero or enemy passing behind a tall T4 | hidden behind it by the Y-sort, as today, only more | live check (Risk R-2) |
| E33 | Soldier T4 next to a hero | still smaller (R24) | pure |
| E34 | Muzzle flash and projectile at T4 | leave the drawn centre (S6); targeting still from `x/y` | scene |
| E35 | `applyColorStages` with identity params | output byte-identical to input | pure |
| E36 | Alpha-0 and partially transparent pixels | alpha unchanged; alpha-0 RGB untouched | pure |
| E37 | Channel overflow (white under sepia 1) | clamps per stage, e.g. (255,255,255) → (255,255,239) | pure |
| E38 | Ring dash phase wraps | `ellipseDashes` is periodic in `phase`: phase p and p+1 give the same dashes | pure |
| E39 | Ember phase wraps | continuous alpha at the loop seam (0 at both ends) | pure |
| E40 | Matrix flow (archer T2 on map 0) | still green; T2 archer at 1.12 with a core | capture (`npm run matrix`) |
| E41 | 4A soldier dies, then respawns (with art, and in the fallback) | the shield hides with the body on death and shows again on respawn; `looks.soldiers[i].shield` is false while `dead` | entity + capture |
| E42 | T1 soldier key | resolves to the base key (no `-t1` key exists); the R20(c) check compares against the resolved key | pure + capture |
| E43 | 4A hue near slow cyan | `t4a` stays ≥ 12° from `#7fe9ff` and within 15° of `#6fb6ff` (C11) | pure + capture (R26) |

## Design

### Pure modules

```js
// src/systems/spriteKeys.js (R1)
tierVariant(level, branch); variantTextureKey(category, type, state, variant);
resolveSpriteKey(category, type, state, variant, registeredKeys); registeredStates(..., variant?)

// src/systems/colorMatrix.js (R13)
filterStages(params) -> Matrix3[]; applyColorStages(rgba, stages) -> rgba; meanHue(rgba, minSat)  // R26

// src/systems/tierLookMath.js (new)
expectedTowerLook(level, branch)            // { scale, core, embers, ring, pips }, from tierLooks.js (also used by the harness, R20)
emberPose(tSec, i, cfg, ground, reduced)    // { dx, dy, alpha }
corePulse(tSec, cfg, reduced)               // alpha
ringBreath(tSec, cfg, reduced)              // { k, alpha }
ellipseDashes({ rx, ry, dashes, duty, phase, segPerDash })  // [[{x,y}...], ...]
pivotOffsetY(footY, s)                      // (1 - s) * footY
footprintClash(a, b, s)                     // R25; a/b = { x, y, footY, width }
ringCrossing(a, b, ring)                    // R25; foot-centred ellipses at rx·k, ry·k
```

### Render components and entities

- `EntitySprite` (R3-R4): variant-aware keys, tier scale with the foot pivot, `pivotOffsetY`,
  `groundSpec`, `resolvedKey`.
- `TowerTierLook` (R5-R10): owns the core, ember and pip/badge children. `setTier`, `updateLook`.
- `Tower`: `_applyTier()` from the constructor and `upgrade()`; `updateLook(t, reduced)` delegates;
  `footY()` (R6); `muzzlePoint()`.
- `Barracks`: no change. `_rebuildSoldiers` already runs after the upgrade (C7).
- `Soldier`: variant and tier scale on its `EntitySprite`; fallback body colour and scale; 4A shield
  (R16) that hides on death and shows on respawn (R16b).
- `BootScene`: loads manifest variants (R2), generates soldier variants (R15).
- `GameScene`: the ring layer (R11), `_updateTowerLooks`/`_drawTierRings` (R12), muzzle and
  projectile from `muzzlePoint()`, `__capture.looks` (R19).

### Tradeoffs considered

- **Foot pivot vs centre pivot** (S1). The centre pivot is one line of code, but it drops tall
  towers off their pads (archer T4: +16.5 px). The foot pivot matches the mockup and keeps the base
  seated. Its cost is that the drawn centre moves, so the core, muzzle and embers read
  `pivotOffsetY()`.
- **Ring per tower vs one scene layer** (S5). Per-tower Graphics inside the container would
  Y-sort the ring over units just behind the tower and break C9. One layer at 10.55 sits under
  every unit and costs one redraw per frame of at most 20 ellipses.
- **Rotating a ring texture vs dashes along an ellipse** (S3). A rotated image is cheaper, but on
  the ground plane it reads as a tilting ellipse, and `fx-ring` is a circle anyway. Dashes along a
  fixed ellipse read as spin.
- **Narrow vs mockup-size ring** (Decision 6). The narrow ring crosses on 7 pairs, the mockup size
  on 17. The user chose narrow.
- **Recolour at boot vs lazily on first need** (C2, S8). Lazy saves about 8 small canvases when no
  barracks is ever built, but it puts the work mid-level and needs a texture-ready check per
  soldier. Boot is once per game and already where generated textures live.
- **Whole-sprite recolour vs armour-only** (Risk R-5). An armour mask would need per-frame mask art
  that doesn't exist. The whole-sprite filter is exactly what the user picked in the mockup. Real
  4.5 art replaces it.
- **Shrinking T4 to clear the pad pairs vs keeping 140%**: kept (Decision 5).

## Files that change

| File | Change |
|---|---|
| `src/data/tierLooks.js` (+ test) | new: R17, R23 |
| `src/systems/spriteKeys.js` (+ test) | R1 |
| `src/systems/colorMatrix.js` (+ test) | new: R13, `meanHue` (R26) |
| `src/systems/tierLookMath.js` (+ test) | new: pure maths, `footprintClash`, `ringCrossing` (R25) |
| `src/systems/soldierTierTextures.js` (+ test, scene stub) | new: R14 |
| `src/systems/TowerTierLook.js` (+ test) | new: R5-R10 |
| `src/systems/EntitySprite.js` (+ test) | R3-R4 |
| `src/data/sprites.js` | header comment documents `variants` (R2); no entries |
| `src/scenes/BootScene.js` (+ `BootScene.test.js`) | R2, R15 |
| `src/entities/Tower.js` (+ `Tower.test.js`) | R5, R6 `footY`, `muzzlePoint` |
| `src/entities/Soldier.js` (+ `Soldier.test.js`) | R16, R16b |
| `src/scenes/GameScene.js` (+ `towerFx` / frame tests) | R11, R12, muzzle and projectile, R19 |
| `scripts/capture.mjs` | `captureTierLooks`, `captureTierLooksStill` (R20-R22, R26) |
| `docs/captures/49-upgrade-visuals/*.jpg` | captures |

The test mocks need extending. `Tower.test.js` and `Soldier.test.js` scene stubs have no
`textures`, `add.image` or sprite `y`/`setY`. Frame-test tower stubs (`GameScene.towerFx.test.js:77-78`,
`GameScene.towerFacing.test.js:22`) need `updateLook`, `footY` and `muzzlePoint`. Update the stubs.
Don't optional-chain production calls to suit them. Any test that imports an entity needs the
Phaser `vi.mock` (memory: jsdom + Phaser mock).

## Test strategy

Every new test is first run against deliberately broken code and must fail for the specific
reason (memory: prove the test fails). The last column is the planned sabotage.

| Test | Asserts | Break it by |
|---|---|---|
| spriteKeys | R1 table: variant names, exact → base → null, `t1` → base (E42), `registeredStates` with variant | fall back `t4a` → `t3`; return the variant key unregistered |
| colorMatrix | spec matrices vs hand values; E35-E37; CSS order (sepia → saturate → hue → brightness); R26 pure hue bounds (E43) | swap stage order; clamp once at the end; `t4a.hueRotate` 150 |
| tierLookMath | `emberPose` period, stagger, alpha envelope, still pose (E39); `ringBreath`; `ellipseDashes` count, duty, periodicity (E38); `pivotOffsetY` | drop the stagger; phase in degrees |
| tierLooks data | R23 | make `t3 > t4a` |
| hierarchy | R24 | set soldier `t4b` to 2.2 |
| pad fit | R25 footprint clash set and ring crossing set equal the pinned lists; same-row ring bound | set tower `t4a` to 1.2 (the clash set shrinks); `rx` 33 (the crossing set grows to 17); centre rings on the pad, not the foot (the crossing set changes) |
| EntitySprite | `setTierScale` scale and foot pivot (`y = (1-s)·footY`), shadow width × s; squash multiplies on top; `getDisplaySize` includes the tier; `setVariant` swaps texture and anim keys; `resolvedKey`; idempotent anims | centre pivot; `setSquash` resetting the tier |
| TowerTierLook | E1-E3 children per tier; `setTier` idempotent; pips at `max(minY, footY) + gap`; badge letter; reduced-motion poses | create embers at T2; pips at `footY` only |
| Tower | `upgrade` applies variant, scale and marks; E7-E8 against the real `setSquash` multiply; `footY()` with and without art (E28); `muzzlePoint` | apply scale after the pop restore; return 0 for `footY` without art |
| soldierTierTextures | skips existing keys (E14); adds 4 variants × loaded states; `addSpriteSheet('', tex, cfg)` called; a throw is swallowed, base kept | generate even when the key exists |
| BootScene | variants loaded only when declared (R2); generated keys appended to `spriteKeys` | push generated keys before the scan |
| Soldier | variant key from `barracks.level`/`branch`; scale; fallback colour (E12); shield 4A only and mirroring (E19-E20); shield hides on death and shows on respawn, with and without art (E41); respawn keeps the look (E17) | read the level at update time; leave the shield out of the death branch |
| GameScene frame (liveScene/frameScene) | ring layer per T4 tower, centred on `footY()` including the fallback (E28); redraw on upgrade/sell under pause (E24); reduced motion live (E21); 2x unaffected (E22); muzzle/projectile at `muzzlePoint` (E34) | draw the ring only in `update`; centre the fallback ring on `y` |
| sim | balance SHA identical (R18); legacy golden green | — |
| capture `tier-looks` / `-still` | R20-R21 and R26 with their prove-it-fails | as listed in R20, R21 and R26 |

Report the full suite count in the PR.

## Gates

`npm test`, `npm run build`, `npm run balance` (SHA-256 identical to the pre-change capture),
`npm run matrix` (unchanged, green), and
`npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` with **zero
problems**. The one exception is the known desktop1440 #56(a). Captures are committed as JPEG q90 in
`docs/captures/49-upgrade-visuals/`. The guards stay green: themeCss, kitRollout, noNativeTitles,
railCss, typeFloor, storyDialogCss, resultsCss. No CSS is expected.

## Live verification (before PR)

Run `npm run build && npm run preview` (memory: verify the production build). Use real input at
**desktop 1440×900** and on an **iPhone 14**:
- Build and upgrade one tower of each type through T1 → T2 → T3 → 4A and 4B on map 9 (seed
  `lastlight_save`; production has no `?debug=`, memory: browser-verify without MCP). Each step
  grows the tower from its base, the pop plays from the new size, and the pips, core, embers, badge
  and ring appear at the right tiers.
- A barracks at every tier: soldiers grow and warm toward gold, 4B is a gold squad of four, and 4A
  is blue with a shield that flips with facing, vanishes when the soldier dies and returns on
  respawn. The 4A blue must read as armour, not as the slow status (C11, R26).
- Reduced motion (Ambient motion OFF, toggled mid-level): every mark stays visible and stops
  moving. 2x: the looks don't speed up. Pause: frozen. Upgrade under pause: the ring shows at once.
- Map 5 slots 6/10 and map 9 slots 9/2 with a T4 archer above a T4 sniper. Check that the
  contact-shadow overlap and the ring crossing (both accepted) look as expected on the dark board.
- A hero walking behind a T4 archer (Risk R-2).
- Frozen-frame probes (memory): `sys.pause()` (immediate, not the queued `scene.pause()`), then
  read the live sprite y against footY, ember poses, ring dash geometry and the 4A pixel hue.
  Judge legibility on the dark board (memory: sprite pipeline), especially pips and the badge on
  iPhone.

## Left to the builder

- Exact ember x offsets, rise, core size and hot-dot ratio, pip spacing, badge padding, and the
  shield shape and offset, within the R17 ballparks, confirmed in desktop and iPhone captures.
- The final `SOLDIER_RECOLOR.t4a` numbers, within the R26 bounds (C11).
- The slot picks for the `tier-looks` batches (R20), chosen in Node so shot towers don't overlap.
- Whether `TowerTierLook` keeps one pip Graphics or a Graphics plus a Text for the badge.
- How a swallowed generation failure (R14) is surfaced without a console warning.
- After shipping: update the backlog in `.claude/notes.md`. Log the stale-depth-after-Move bug and,
  if the user asks, an armour-mask recolour.

## Risks

- **R-1. Archer-over-low-foot overlaps, accepted** (Decisions 5 and 6):
  - **Contact shadows:** ≤ 3.7 px at T4 on maps 5, 8 and 9, 0.3 px at T3 on map 3, and map 5's
    6/10 pair from T2.
  - **T4 rings:** they cross on the same 7 tight T4 pairs, with the worst overlap score 0.47 on
    map 8 12/5.
  - Both are pinned by R25.
- **R-2. Tall towers hide what walks behind them.** A T4 archer's art reaches about 72 px above its
  pad centre (T1: about 40). Enemies, their HP bars and the hero pass behind it on path-hugging
  pads. Y-sorting already does this at T1. Judge it in the live check on maps 7-9 (`art-bible.md:220`
  already warns about crowding there).
- **R-3. Canvas renderer drops tints**, so the core and embers go white. The game is `Phaser.AUTO`
  (`src/main.js:18`), and WebGL is the norm. The existing tinted particles have the same limit.
  Accepted.
- **R-4. 4A blue drifting toward the reserved slow cyan.** Mitigated by C11 and R26, which bound
  the hue in pure and capture checks.
- **R-5. The recolour tints the whole soldier** (skin, outline), not just the armour. That's
  faithful to the mockup. Real 4.5 art replaces it with no code change (C2).
- **R-6. Badge and pip legibility on phones.** About 0.55× canvas scale on iPhone puts the 11-px
  badge letter at about 6 CSS px. Captures decide. The font floor is a data value.
- **R-7. Existing captures change**: every upgraded tower and squad looks different. That's
  expected. Along with the pre-existing stale depth after a barracks Move, bigger art makes a wrong
  Y-sort more visible (Non-goals).

## Resolved questions

1. **C4, "reduce T4 only enough to clear" (controller call, changed; user confirmed).** The brief's
   yardstick (`getDisplaySize`) measures the cell, which overlaps at T1. On real footprints,
   clearing every pair needs T4 ≤ 1.115, or ≤ 1.22 without map 5's overlapping pads. Both are below
   T3. **User:** 140% at T4 for every tower, archer included, with no per-type cap. The archer
   shadow overlaps are accepted, and R25 pins the exact clash set (Decision 5).
2. **Ring width (user).** The user chose the narrow ring (`rx` ≈ 25). The builder check corrected
   the earlier claim that it clears every T4 pair. Rings sit on each tower's foot, and the
   archer's foot is about 18 px below the sniper's, so on 7 tight pairs an archer above a sniper
   crosses rings even at rest (worst: map 8 12/5, overlap score 0.47). The mockup size crosses on
   17. The user chose narrow knowing this. The crossings are accepted with no clipping or alpha
   tricks, and R25's second check and E31 pin the crossing set (Decision 6, S4).
3. **4A ice-blue vs slow cyan (controller call C11).** The art-bible rule wins over the mockup's
   170° rotation if they conflict. `t4a` stays in the `#6fb6ff` family, checked by R26.
4. **Fidelity notes (controller call C12).** The boot-time recolour stands (tint can't produce gold,
   and the user has been told). No tower tint, pip placement and ring spin are controller calls
   that change only tunables.
5. **Builder corrections, applied:**
   - R20(c) expects the **resolved** soldier key, because no `-t1` key is ever registered (E42).
   - A tower without art centres its ring on the fallback foot, the same point the pips use
     (R6, R11, E28).
   - The 4A shield hides on death and shows on respawn (R16b, E41).
6. **C6, "muzzle flash follows the drawn size": extended.** The projectile launch point moves with
   it (S6). A flash at the drawn centre with the shot leaving 16 px lower reads as a bug. The cost
   is ≤ 16.5 px of flight in the live game. The sim is untouched.
7. **C6, "selection ring may grow": not taken.** It marks the pad, draws on top at depth 30, and
   growing it would make it collide with the T4 ring and the pips (S6).
8. **C9, "ring under the tower": refined.** It goes on a scene layer at 10.55, not in the tower
   container. Inside the container it would paint over units just behind the tower (S5).
9. **C1, "fall back to the base key": confirmed, made strict.** Exact, then base, with no hop from
   `t4a` to `t3` (S2). The marks always draw (C1). Real art declares its size with a manifest
   `scale`, so a "bigger art" case is a data edit, and the tier multiplier still applies on top.
10. **C2: confirmed, with an API note.** The brief said Phaser 3.88. 3.90.0 is installed, and the
    path (`createCanvas` → `draw`/`getData`/`putData`/`refresh` → `addSpriteSheet('', texture, cfg)`)
    exists there. Each part has an `@since` of 3.60 or earlier. Use `CanvasTexture`, not a raw
    canvas, because of the Chrome warning (S8).

## Open questions

None. Every question is resolved above.
