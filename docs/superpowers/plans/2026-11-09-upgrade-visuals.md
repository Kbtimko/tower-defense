# Upgrade Visuals (#49, code half) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Towers grow (100/112/125/140%) and gain a core, embers, a ring of power and tier pips as they upgrade; barracks soldiers grow (100/110/120/130%) and warm toward gold (4B) or ice-blue with a shield (4A) — all code-drawn, with real tier art able to drop in later through the sprite-key resolver.

**Architecture:** Pure maths and keys in `src/systems/` (`spriteKeys`, `colorMatrix`, `tierLookMath`), tunables in `src/data/tierLooks.js`. `EntitySprite` gains a variant key and a foot-pivot tier scale. A new `TowerTierLook` render component owns the per-tower marks; one scene Graphics layer at depth 10.55 draws the T4 rings. Soldier tier textures are recoloured once at boot (`CanvasTexture` + `addSpriteSheet('', tex, cfg)`), never with tint or postFX.

**Tech Stack:** Phaser 3.90.0, Vite 5, Vitest 2 + jsdom, vanilla ES modules, Playwright capture harness (`scripts/capture.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-08-upgrade-visuals-design.md` (R1–R26, E1–E43, S1–S10, C1–C12). Executors read the spec section each task cites; the spec wins any conflict.

## Global Constraints

- **Base:** build only after PR #118 merges into `visual/integration` and this branch is rebased onto `origin/visual/integration`. Code references below are to that post-#118 code (Soldier draws in `_view`; `_rebuildSoldiers(scene, pathPoints)`).
- Vanilla JS, ES modules, no TypeScript. Pure modules in `src/systems/` import no Phaser. Every tunable lives in `src/data/tierLooks.js`; scene/entity code holds **no hex literals** for this feature (spec R17).
- Colours in `PALETTE` are `'#rrggbb'` strings; convert for Graphics with `hexToInt` from `src/ui/theme.js` (as GameScene already does for `RALLY_FLAG`).
- Tower accents come from `PROJECTILE_FX[type].color` (`src/data/fx.js`) through `towerAccent(type)` — never a second table.
- No postFX/preFX, no Phaser `tint` for the soldier recolour (C2, C3). Core/embers use `fx-glow`/`fx-ember` with `Phaser.BlendModes.ADD` — in modules with no Phaser import use the numeric value `1` via a named const `BLEND_ADD = 1` with a comment.
- Animation clock is `this._fxTime` (real seconds) — never speed-scaled `dt` (S7). Reduced motion = `this.game.registry.get('ambientMotion') === false`, read every frame; reduced motion shows a **still** version, never nothing (Decision 4).
- No change under `src/sim/` or any module the sim imports; `npm run balance` SHA-256 must be byte-identical to the pre-change capture (R18, C8).
- No new `this.events` listeners. The ring Graphics is destroyed in `shutdown()` (anti-goal: leaks).
- No console warnings from any new code path — `watchProblems` counts warnings as capture problems (S8, R14).
- Tests that import any entity must `vi.mock('phaser', …)` (memory: jsdom + Phaser mock). Extend test stubs; never optional-chain production calls to suit a stub (spec "Files that change").
- Every new test is first run against the "Break it by" sabotage listed in its task and must fail for that specific reason (memory: prove the test fails). Record the sabotage result in the task report.
- Conventional Commits; stage explicit paths only (never `git add -A` / `git add .`). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Plan-level rulings (spec gaps settled here)

- **P1. Drawn height.** The spec's ember rise is `riseFrac × drawn height` but `groundSpec()` only returns `{ footY, width }`. `groundSpec()` also returns `height = 2 · s · footY` (centre-anchored art spans about ±footY: archer −40…+41, spec C4). `TIER_FALLBACK_GROUND` gains `height: 36`. Cost if wrong: ember rise tuned in captures anyway.
- **P2. Ember start.** Embers start at `footY − TIER_EMBERS.startFrac × height` (new tunable `startFrac: 0.25`, builder-tunable like the other `*Frac`s).
- **P3. Fallback soldier colours** are `{ fill, stroke }` pairs (spec gave fills only; a green outline round a gold body reads wrong). Values are the fill lerp `#4caf50 → #ffd34d` at 0.35/0.60 and the stroke lerp `#81c784 → #ffe9a0` at the same fractions (table in Task 1).
- **P4. Fallback soldier foot** is `FALLBACK_FOOT_Y = 4` (the bottom of the drawn rect at y −4…+4), a module const in `Soldier.js` beside `FALLBACK_BAR_RADIUS`, matching that file's style.
- **P5. Pair labels.** Both R25 sets use `upper/lower` slot order: upper = smaller pad y (ties: smaller x). This matches the spec's C4 table labels (e.g. map 8 `12/5`).

## Review Focus

1. **Upgrade or sell while the user has paused** (E24): the radial is clickable under pause; the ring layer and marks must change on the click, not on resume. → Task 11 tests `_upgradeSelectedTower` / `_sellSelectedTower` / `_repositionTo` / `_placeAt` each call `_drawTierRings`.
2. **RETRY / re-entering a level** (E11): generation must not run twice or log; anims must not be re-created. → Task 9 test: a second `generateSoldierTierTextures` call on the same scene returns `[]` and calls `createCanvas` zero times.
3. **Reduced motion toggled mid-level** (E21): marks must snap still next frame and stay visible. → Task 7 test: `updateLook(t, false)` then `updateLook(t, true)` sets the still poses and leaves every child visible.
4. **Tier jumps** (E10, debug builds and future load paths): `setTier(4,'B')` straight from T1 must produce exactly the T4 set, and calling it twice must not duplicate children. → Task 7 test.
5. **Per-frame allocation** (anti-goal): `updateLook` and `_drawTierRings` must not create game objects. → Task 7 test asserts `scene.add.image`/`graphics` call counts unchanged across 100 `updateLook` calls; Task 11 test asserts `_drawTierRings` uses only the one `_tierRingGfx`.

---

## Setup (controller, before Task 1)

- [ ] Confirm #118 is merged: `gh pr view 118 --json state,mergedAt` → `MERGED`. If not, stop and ask the user.
- [ ] `git fetch --all --prune && git rebase origin/visual/integration` in `.claude/worktrees/upgrade-visuals-49`; `git log --oneline -3` shows the spec commit on top of the #118 merge.
- [ ] `npm ci && npm test` green; record the count.
- [ ] Balance baseline: `npm run balance > /tmp/…/balance-before.txt; echo $?` then `shasum -a 256` it. Record the SHA in the ledger (R18).

---

### Task 1: Tunables `src/data/tierLooks.js` (sonnet)

**Files:**
- Create: `src/data/tierLooks.js`
- Test: `src/data/tierLooks.test.js`

**Interfaces:**
- Produces (all `Object.freeze`d, nested objects frozen too): `TIER_SCALE`, `TIER_CORE`, `TIER_EMBERS`, `TIER_RING`, `TIER_PIPS`, `TIER_FALLBACK_GROUND`, `SOLDIER_RECOLOR`, `SOLDIER_4A_HUE`, `SOLDIER_FALLBACK_BODY`, `SOLDIER_SHIELD`, `towerAccent(type) -> number`.

Values are the spec R17 block verbatim, with these plan rulings applied:
- `TIER_EMBERS` adds `startFrac: 0.25` (P2).
- `TIER_FALLBACK_GROUND = { footY: 18, width: 36, height: 36 }` (P1).
- `SOLDIER_FALLBACK_BODY` (P3):
  `t1 {fill 0x4caf50, stroke 0x81c784}`, `t2 {0x8bbc4f, 0xadd38e}`, `t3 {0xb7c54e, 0xcddb95}`, `t4a {0x6fb6ff, 0xcfe8ff}`, `t4b {0xffd34d, 0xffe9a0}`.
- `towerAccent(type)` returns `PROJECTILE_FX[type].color` (base colour, ignoring `branches`).
- Header comment: why these live here (deferred-asset look; tuned in captures; mockup numbers are reference, not maths — spec R17, C11).

- [ ] **Step 1: Write the failing tests** (`tierLooks.test.js`)

```js
import { TOWER_DEFS } from './towers.js';
import { SPRITE_MANIFEST } from './sprites.js';
// R23
it('tower and soldier scales rise t1 < t2 < t3 <= t4a === t4b', () => { for (const k of ['tower','soldier']) { const s = TIER_SCALE[k]; expect(s.t1).toBe(1); expect(s.t1 < s.t2 && s.t2 < s.t3 && s.t3 <= s.t4a).toBe(true); expect(s.t4a).toBe(s.t4b); } });
it('towerAccent covers every TOWER_DEFS type with a number', () => { for (const t of Object.keys(TOWER_DEFS)) expect(typeof towerAccent(t)).toBe('number'); });
it('fractions and alphas lie in [0,1]', () => { /* TIER_EMBERS.stillRiseFrac, stillAlpha, fadeInFrac, startFrac; TIER_CORE.alpha[0..1], stillAlpha; TIER_RING.alpha, breathe.alphaLow, spin.duty */ });
it('the pips sit inside their own ring front arc (R9)', () => { expect(TIER_RING.ry).toBeGreaterThan(TIER_PIPS.gapBelowFootPx + TIER_PIPS.radius); });
it('has a fallback body for every recolour variant plus t1', () => { expect(Object.keys(SOLDIER_FALLBACK_BODY).sort()).toEqual(['t1', ...Object.keys(SOLDIER_RECOLOR)].sort()); });
// R24 — derived from the manifest, not literals
it('a soldier at every tier stays narrower and shorter than the smallest hero', () => {
  const sol = SPRITE_MANIFEST.find(e => e.category === 'soldier' && e.type === 'default');
  const heroes = SPRITE_MANIFEST.filter(e => e.category === 'hero');
  const minHeroW = Math.min(...heroes.map(h => h.ground.width));
  const minHeroCell = Math.min(...heroes.map(h => h.states.idle.frameHeight * h.scale));
  for (const s of Object.values(TIER_SCALE.soldier)) {
    expect(sol.ground.width * s).toBeLessThan(minHeroW);
    expect(sol.states.idle.frameHeight * sol.scale * s).toBeLessThan(minHeroCell);
  }
});
```

- [ ] **Step 2:** `npx vitest run src/data/tierLooks.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/data/tierLooks.js`.
- [ ] **Step 4:** Run → PASS. **Break it by:** `TIER_SCALE.tower.t3 = 1.5` (monotonic test fails); `TIER_SCALE.soldier.t4b = 2.2` (hierarchy fails). Restore.
- [ ] **Step 5:** Commit `feat(tier-looks): tier look tunables and size-hierarchy guard`.

---

### Task 2: Variant key resolver in `spriteKeys.js` (sonnet)

**Files:** Modify `src/systems/spriteKeys.js`; Test `src/systems/spriteKeys.test.js` (extend).

**Interfaces — Produces:**
- `tierVariant(level, branch) -> 't1'|'t2'|'t3'|'t4a'|'t4b'` (4 with no branch → `'t3'`, E4)
- `variantTextureKey(category, type, state, variant) -> string` = `` `${spriteTextureKey(category, type, state)}-${variant}` ``
- `resolveSpriteKey(category, type, state, variant, registeredKeys) -> string|null` — variant key if registered, else base key if registered, else `null`. Never hops `t4a → t3` (S2).
- `registeredStates(category, type, states, registeredKeys, variant = undefined)` — with a variant, a state counts when `resolveSpriteKey` is non-null; without, unchanged.

- [ ] **Step 1: Failing tests**

```js
expect([[1,null],[2,null],[3,null],[4,'A'],[4,'B'],[4,null]].map(([l,b]) => tierVariant(l,b))).toEqual(['t1','t2','t3','t4a','t4b','t3']);
expect(variantTextureKey('soldier','default','idle','t2')).toBe('sprite-soldier-default-idle-t2');
const base = 'sprite-soldier-default-idle', t3 = base + '-t3', t4a = base + '-t4a';
expect(resolveSpriteKey('soldier','default','idle','t4a',[base, t4a])).toBe(t4a);
expect(resolveSpriteKey('soldier','default','idle','t4a',[base, t3])).toBe(base);   // no t4a→t3 hop
expect(resolveSpriteKey('soldier','default','idle','t1',[base])).toBe(base);        // E42
expect(resolveSpriteKey('soldier','default','idle','t2',[])).toBeNull();
expect(registeredStates('soldier','default',['idle','attack'],[t4a],'t4a')).toEqual(['idle']);
expect(registeredStates('soldier','default',['idle','attack'],[base])).toEqual(['idle']); // unchanged without variant
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (pure, no imports beyond the file). **Step 4:** PASS. **Break it by:** resolve `t4a` to `t3` when `t4a` missing; return the variant key without checking registration. Both must fail specific assertions.
- [ ] **Step 5:** Commit `feat(sprite-keys): tier variant key resolution with base fallback`.

---

### Task 3: Colour matrix `src/systems/colorMatrix.js` (sonnet)

**Files:** Create `src/systems/colorMatrix.js`; Test `src/systems/colorMatrix.test.js`.

**Interfaces — Produces:**
- `filterStages({ sepia = 0, saturate = 1, hueRotate = 0, brightness = 1 }) -> number[][][]` — list of 3×3 matrices in CSS order sepia → saturate → hue-rotate → brightness, using the W3C Filter Effects Level 1 matrices (sepia amount clamped to [0,1]; hue in degrees). Identity params may return `[]` or identity matrices — either way the output must be byte-identical (E35).
- `applyColorStages(rgba: Uint8ClampedArray, stages) -> rgba` — in place; for each pixel with alpha > 0, apply each stage then **round and clamp to 0..255 after every stage** (browser behaviour); alpha untouched; alpha-0 pixels untouched (E36).
- `rgbToHue(r, g, b) -> degrees [0,360)` and `meanHue(rgba, minSat = 0.2) -> degrees|null` — circular mean hue over pixels with alpha > 0 and HSL saturation > `minSat` (R26).
- `hueDistance(a, b) -> degrees [0,180]`.

- [ ] **Step 1: Failing tests**

```js
const px = (...v) => new Uint8ClampedArray(v);
it('identity params leave pixels byte-identical (E35)', () => { const a = px(12,200,99,255, 1,2,3,128); expect(applyColorStages(a.slice(), filterStages({}))).toEqual(a); });
it('alpha is untouched and alpha-0 rgb is skipped (E36)', () => { const a = applyColorStages(px(10,20,30,0, 10,20,30,77), filterStages({ sepia: 1 })); expect([...a.slice(0,4)]).toEqual([10,20,30,0]); expect(a[7]).toBe(77); });
it('clamps per stage: white under sepia 1 -> (255,255,239) (E37)', () => { expect([...applyColorStages(px(255,255,255,255), filterStages({ sepia: 1 })).slice(0,3)]).toEqual([255,255,239]); });
// CSS order is sepia THEN hue-rotate: blue -> sepia tone (hue ~40°) -> rotated 180° (~220°).
// The swapped order would end on the sepia tone (~40°).
it('applies stages in CSS order', () => { const a = applyColorStages(px(0,0,255,255), filterStages({ sepia: 1, hueRotate: 180 })); const h = rgbToHue(a[0],a[1],a[2]); expect(hueDistance(h, 220)).toBeLessThan(25); expect(hueDistance(h, 40)).toBeGreaterThan(90); });
it('hue-rotate 120 maps pure red near pure green hue', () => { const a = applyColorStages(px(255,0,0,255), filterStages({ hueRotate: 120 })); expect(hueDistance(rgbToHue(a[0],a[1],a[2]), 120)).toBeLessThan(20); });
it('meanHue ignores transparent and grey pixels', () => { expect(meanHue(px(255,0,0,255, 0,0,255,0, 128,128,128,255))).toBeCloseTo(0, 0); });
// R26 pure check (E43)
it('t4a turns art-bible steel #5b6b7a into the #6fb6ff family, clear of slow cyan', () => {
  const a = applyColorStages(px(0x5b,0x6b,0x7a,255), filterStages(SOLDIER_RECOLOR.t4a));
  const h = rgbToHue(a[0],a[1],a[2]);
  expect(hueDistance(h, hexHue(SOLDIER_4A_HUE.target))).toBeLessThanOrEqual(SOLDIER_4A_HUE.maxTargetDeg);
  expect(hueDistance(h, hexHue(SOLDIER_4A_HUE.avoid))).toBeGreaterThanOrEqual(SOLDIER_4A_HUE.minAvoidDeg);
});
```
(`hexHue` is a local test helper over `rgbToHue`.)

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. If the R26 test fails with the spec's starting `t4a` params, **tune `SOLDIER_RECOLOR.t4a` in `tierLooks.js`** (C11 makes this the builder's call) until it passes, keeping `sepia`/`saturate`/`brightness` in the mockup's ballpark; report the final numbers.
- [ ] **Step 4:** PASS. **Break it by:** swap stage order (CSS-order test fails); clamp once at the end (E37 fails); `t4a.hueRotate = 150` (R26 fails).
- [ ] **Step 5:** Commit `feat(color): CSS-filter colour matrices for soldier tier recolour`.

---

### Task 4: Look maths `src/systems/tierLookMath.js` (sonnet)

**Files:** Create `src/systems/tierLookMath.js`; Test `src/systems/tierLookMath.test.js`.

**Interfaces — Consumes:** Task 1 tables; Task 2 `tierVariant`. **Produces:**
- `expectedTowerLook(level, branch) -> { scale, core: bool, embers: number, ring: 'solid'|'dashed'|null, pips: 1|2|3|'A'|'B' }` (from `TIER_SCALE.tower`, `TIER_CORE.fromTier`, `TIER_EMBERS`; ring `solid` for A, `dashed` for B at level 4; pips = level for 1–3, branch letter at 4).
- `pivotOffsetY(footY, s) -> (1 - s) * footY`
- `corePulse(tSec, cfg, reduced) -> alpha` — sinusoid between `cfg.alpha[0..1]` over `cfg.periodS`; `cfg.stillAlpha` when reduced.
- `emberPose(tSec, i, cfg, ground, reduced) -> { dx, dy, alpha }` — `ground = { footY, width, height }`; phase `frac(tSec / cfg.periodS + i / cfg.count)`; `dx = cfg.xFrac[i] * width`; `dy = footY - cfg.startFrac*height - ease(phase) * cfg.riseFrac * height` (ease-out); alpha ramps 0→1 over `fadeInFrac`, then down to 0 at phase 1. Reduced: phase fixed at `stillRiseFrac`, alpha `stillAlpha`.
- `ringBreath(tSec, cfg, reduced) -> { k, alpha }` — `cfg` is `TIER_RING`; `k` 1 → `breathe.scale` → 1 over `breathe.periodS`, alpha `cfg.alpha` → `breathe.alphaLow` in step; reduced → `{ k: 1, alpha: cfg.alpha }`.
- `ellipseDashes({ cx = 0, cy = 0, rx, ry, dashes, duty, phase, segPerDash = 4 }) -> Array<Array<{x,y}>>` — `dashes` arcs, each spanning `duty / dashes` of a turn, starting at angle `2π (j + phase) / dashes`; points on `(cx + rx cos θ, cy + ry sin θ)`.

- [ ] **Step 1: Failing tests** — `expectedTowerLook` table for (1,null) (2,null) (3,null) (4,'A') (4,'B') equals the E1–E3 rows; `pivotOffsetY(41.2, 1.4) ≈ -16.48`; `emberPose`: periodic (t and t+periodS equal), stagger (i=0 vs i=1 at same t differ by phase 1/3), alpha 0 at phase 0 and →0 at phase 1 (E39 seam continuity: `|alpha(0+ε) - alpha(1-ε)| < 0.05`), reduced pose equals `stillRiseFrac`/`stillAlpha` regardless of t; `ringBreath` reduced = `{k:1, alpha:TIER_RING.alpha}`, unreduced k within [1, 1.07]; `ellipseDashes` returns 12 arrays, each of `segPerDash+1` points on the ellipse (`(x/rx)²+(y/ry)² ≈ 1`), phase p and p+1 deep-equal (E38), phase 0.5/12 shifts the first point's angle by half a dash slot.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (no allocation beyond the returned arrays). **Step 4:** PASS. **Break it by:** drop the `i / count` stagger; treat phase as degrees.
- [ ] **Step 5:** Commit `feat(tier-looks): pure ember, core, ring and dash maths`.

---

### Task 5: Pad-fit guards (R25) (sonnet)

**Files:** Modify `src/systems/tierLookMath.js`; Test `src/systems/tierLookPadFit.test.js`.

**Interfaces — Produces:**
- `footprintClash(a, b, s) -> boolean` — `a`, `b` = `{ x, y, footY, width }` (pad centre + manifest ground). True when the two contact-shadow ellipses overlap at tier scale `s`: `W = (a.width + b.width)/2 · s · SHADOW.widthRatio`, `dy = (b.y + b.footY) - (a.y + a.footY)`, clash iff `(dx/W)² + (dy/(SHADOW.heightRatio·W))² < 1`. Import `SHADOW` from `src/data/grounding.js`.
- `ringCrossing(a, b, ring) -> boolean` — rings centred on each foot `(x, y + footY)`, semi-axes `rx·k`, `ry·k` with `k = ring.breathe.scale`; cross iff `(dx/(2·rx·k))² + (dy/(2·ry·k))² < 1`.

Port of `/private/tmp/claude-501/c4/c4.mjs` and `ring.mjs` (read them; don't import them). Pads: `MAPS[m].towerSlots` × (1280, 720). Tower pairings: every `SPRITE_MANIFEST` entry with `category === 'tower'` (6), for both a and b. Scale at the map cap: `TIER_SCALE.tower[{1:'t1',2:'t2',3:'t3',4:'t4a'}[cap]]`. Pair label = `upper/lower` per P5.

- [ ] **Step 1: Failing tests**

```js
it('footprint clashes at each map cap are exactly the accepted C4 set, always archer on the upper pad', () => {
  // compute Set of `m${map} ${upper}/${lower}` over all pairings; collect upper types per hit
  expect([...clashes].sort()).toEqual(['m3 0/7','m5 6/10','m5 8/13','m8 14/11','m8 12/5','m8 4/6','m9 9/2','m9 19/8'].sort());
  expect([...upperTypes]).toEqual(['archer']);
});
it('T4 rings cross on exactly the 7 accepted pairs (Decision 6)', () => {
  expect([...crossings].sort()).toEqual(['m5 6/10','m5 8/13','m8 4/6','m8 12/5','m8 14/11','m9 9/2','m9 19/8'].sort());
});
it('no same-row pair crosses at peak breath', () => {
  const minRow = /* min |dx| over every same-y pad pair on T4-cap maps, derived from MAPS */;
  expect(2 * TIER_RING.rx * TIER_RING.breathe.scale).toBeLessThanOrEqual(minRow);
});
```

- [ ] **Step 2:** FAIL (functions missing). **Step 3:** Implement. **If the computed sets differ from the pinned lists in anything but label order, STOP and report DONE_WITH_CONCERNS with the computed sets — do not edit the lists** (they are the user-accepted record).
- [ ] **Step 4:** PASS. **Break it by:** `TIER_SCALE.tower.t4a = 1.2` (clash set shrinks); `TIER_RING.rx = 33` (crossing set grows to 17); centre rings on the pad instead of the foot (set changes). Restore each.
- [ ] **Step 5:** Commit `test(tier-looks): pin accepted pad-fit clashes and ring crossings`.

---

### Task 6: `EntitySprite` variants and tier scale (opus)

**Files:** Modify `src/systems/EntitySprite.js`; Test `src/systems/EntitySprite.test.js` (extend; reuse its scene stub, add `sprite.y`/`setY`/`setPosition` and `image.setDisplaySize` recording if missing).

**Interfaces — Consumes:** Task 2 (`resolveSpriteKey`, `registeredStates` with variant, `variantTextureKey`), Task 4 `pivotOffsetY`. **Produces:**
- constructor option `variant = 't1'`. Effective config = base entry with `entry.variants?.[variant]`'s `scale`/`anchor`/`ground` overriding (state defs from `variants[v].states[st]` override base `states[st]`). One resolved key per state stored in `this._keys`; textures, anim keys, `setState`, `playOnce` use `this._keys[st]`. Anims created per resolved key, guarded by `anims.exists`.
- `setVariant(variant)` — no-op when unchanged or inactive; else re-resolve, create missing anims, re-apply the last `setState` name.
- `setTierScale(s)` — always stores `_tierScale` (so `tierScale()` reports the requested tier even without art); when active: `sprite.setScale(cfgScale·s·squashX, cfgScale·s·squashY)`; `sprite.y = pivotOffsetY(footY, s)` (0 if no `ground`); shadow display width/height = base shadow size × s, shadow position unchanged. No-op when inactive.
- `setSquash(x, y)` — multiplies on top of `_tierScale` (C5).
- `pivotOffsetY() -> number` (0 when inactive or no ground); `groundSpec() -> { footY, width: ground.width·s, height: 2·s·footY } | null` (null when inactive or no ground; P1); `resolvedKey(state) -> string|null`; `tierScale() -> number`.
- `getDisplaySize()` unchanged formula — it now includes the tier scale because `displayWidth` does.

- [ ] **Step 1: Failing tests** (manifest mocked like `Tower.test.js` does, with `ground: { footY: 40, width: 36 }`):
  - `setTierScale(1.4)`: `sprite.scaleX === cfg.scale·1.4`, `sprite.y ≈ (1-1.4)·40`, shadow display width = base × 1.4, shadow y unchanged; `sprite.y + 40·1.4 - 40 === 0` (foot drift, S1).
  - `setTierScale(1.4); setSquash(1.2, 0.8)` → scale `(cfg·1.4·1.2, cfg·1.4·0.8)`; `setSquash(1,1)` lands on `cfg·1.4` (E8).
  - `getDisplaySize()` after `setTierScale(1.25)` equals 1.25× the T1 size while squashed.
  - `variant: 't4a'` with registry `[base, base+'-t4a']` → `resolvedKey('idle') === base+'-t4a'`, `play` called with that key, `anims.create` called with that key once across two instances.
  - `setVariant('t4a')` from `'t1'` switches the texture/anim key; calling it again does not call `play` again.
  - inactive sprite (no registered keys): `groundSpec() === null`, `pivotOffsetY() === 0`, `setTierScale(1.4)` touches nothing but `tierScale() === 1.4`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + full `npx vitest run src/systems src/entities` green (Hero/Enemy/Soldier still construct). **Break it by:** centre pivot (`sprite.y` stays 0 → drift test fails); `setSquash` ignoring `_tierScale` (E8 fails).
- [ ] **Step 5:** Commit `feat(entity-sprite): tier variant keys and foot-pivot tier scale`.

---

### Task 7: `TowerTierLook` render component (opus)

**Files:** Create `src/systems/TowerTierLook.js`; Test `src/systems/TowerTierLook.test.js`.

**Interfaces — Consumes:** Task 1 tables + `towerAccent`; Task 4 `corePulse`, `emberPose`. **Produces:**

```js
export class TowerTierLook {
  constructor(container, scene, { type, sprite })  // sprite = the tower's EntitySprite (may be inactive)
  setTier(level, branch)        // idempotent; creates/destroys exactly the marks for the tier (R10)
  updateLook(tSec, reduced)     // alpha/position only; no allocation
  ground()                      // sprite.groundSpec() ?? TIER_FALLBACK_GROUND
  centreY()                     // sprite.pivotOffsetY() (0 without art)
  snapshot()                    // { core: bool, embers: number, emberDy: number[], pips: 1|2|3|'A'|'B' } for __capture.looks
}
```

Rules (spec R6–R10):
- Core (level ≥ `TIER_CORE.fromTier`): `fx-glow` image tinted `towerAccent(type)` + `fx-ember` hot dot (white), both ADD blend, at `(0, centreY())`, display size `sizeFrac·width` and `hotFrac·` that.
- Embers (level ≥ `TIER_EMBERS.fromTier`): `count` `fx-ember` images, tinted, ADD, display size `sizePx`; positioned by `emberPose`.
- Pips/badge: **one** Graphics (plus one Text for the badge letter — builder's choice in spec "Left to the builder"; pick Graphics + Text) redrawn only in `setTier`. Dots: `level` dots of `radius`, `gapPx` apart, centred on x=0, at `y = max(TIER_PIPS.minY, ground().footY) + gapBelowFootPx`, fill accent, outline `hexToInt(TIER_PIPS.outline)` at `outlinePx`. Level 4: rounded accent badge with the branch letter in `TIER_PIPS.badge.ink`, `FONTS.body` bold, `fontPx`.
- All marks are added to the container **after** the sprite (on top). They die with the container; no `destroy()` needed beyond what `setTier` removes.
- `ground()` is re-read in `setTier` (the scale changes on upgrade, so call order in Tower is: sprite variant + tier scale first, then `setTier`).

- [ ] **Step 1: Failing tests** (scene stub with `add.image` returning a recording object with `setTint`, `setBlendMode`, `setDisplaySize`, `setPosition`, `setAlpha`, `setVisible`, `destroy`; `add.graphics` via the Graphics recorder pattern; `add.text`):
  - E1: `setTier(1)` → 0 images, pips Graphics drew 1 `fillCircle`; `snapshot()` `{ core:false, embers:0, pips:1 }`.
  - E2: `setTier(2)` → 2 images (core + hot); `setTier(3)` → 2 + 3 images; pips 2 / 3 dots.
  - E3: `setTier(4,'B')` → badge text `'B'`, no dots, core + embers present.
  - Review Focus 4: `setTier(4,'A')` straight from T1 equals the T4 set; calling `setTier(4,'A')` twice leaves image count unchanged.
  - Pip y: fallback (inactive sprite) → `22 + 4`; sprite `groundSpec` footY 41.2 → `45.2`. (Break it by: `y = footY + gap` only.)
  - Review Focus 3/5: 100 × `updateLook(t, false)` adds no images/graphics; then `updateLook(t, true)` → core alpha `stillAlpha`, every ember alpha `stillAlpha` and `dy` equal to the still pose; all children visible.
  - Core sits at `(0, sprite.pivotOffsetY())`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Break it by:** create embers at T2 (E2 count fails); pips at `footY` only (pip-y fails).
- [ ] **Step 5:** Commit `feat(tier-looks): TowerTierLook core, embers, pips and badge`.

---

### Task 8: `Tower` integration (opus)

**Files:** Modify `src/entities/Tower.js`; Test `src/entities/Tower.test.js` (extend stubs: `add.image`, sprite `y`/`setY`, `textures`).

**Interfaces — Consumes:** Task 6 `setVariant`/`setTierScale`/`pivotOffsetY`/`groundSpec`; Task 7 `TowerTierLook`; Task 2 `tierVariant`. **Produces:**
- `_applyTier()` — `v = tierVariant(level, branch)`; `_sprite.setVariant(v)`; `_sprite.setTierScale(TIER_SCALE.tower[v])`; `_look.setTier(level, branch)`. Called at the end of the constructor (after the sprite and `_look` exist) and at the end of `upgrade()` (after `_redraw()`).
- `updateLook(tSec, reduced)` → `_look.updateLook(...)`.
- `footY() -> number` — `_look.ground().footY` (fallback 18 without art, E28).
- `muzzlePoint() -> { x, y }` — `{ x: this.x, y: this.y + _sprite.pivotOffsetY() }` (S6).
- `lookSnapshot()` → `{ type, level, branch, ..._look.snapshot(), scale: _sprite.tierScale(), footDriftPx }` where `footDriftPx = _sprite.sprite.y + footY·s − footY` with art active, 0 without. Used by Task 11's `__capture.looks`.
- `startPop`/`updatePop` unchanged — they already end on `setSquash(1,1)`, which now lands on the tier scale.

- [ ] **Step 1: Failing tests**:
  - archer with art: `upgrade(2)` → sprite scale `0.6·1.12`, `_look` has a core; `upgrade(4,'B')` → scale `0.6·1.4`, `footY()` = manifest footY, `muzzlePoint().y === y + (1-1.4)·footY`.
  - E7/E8 against the real `setSquash`: `upgrade(3); startPop(UPGRADE_POP); updatePop(0.05)` → scale = `0.6·1.25·popScale(...)`; then `updatePop(1)` → `0.6·1.25`.
  - E28: tower with no art at T4: `footY() === 18`, `muzzlePoint()` equals `{x, y}`, marks present.
  - existing tier stroke-ring tests still pass unchanged (S6: kept as is).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Break it by:** apply tier scale after the pop restore so `updatePop` end returns to `0.6` (E8 fails); `footY()` returning 0 without art (E28 fails).
- [ ] **Step 5:** Commit `feat(tower): tier scale, marks, footY and muzzle point per upgrade`.

---

### Task 9: Soldier tier textures + BootScene (opus)

**Files:** Create `src/systems/soldierTierTextures.js`; Test `src/systems/soldierTierTextures.test.js`; Modify `src/scenes/BootScene.js`, `src/scenes/BootScene.test.js`, `src/data/sprites.js` (header comment only).

**Interfaces — Consumes:** Task 1 `SOLDIER_RECOLOR`; Task 2 keys; Task 3 `filterStages`, `applyColorStages`. **Produces:**
- `generateSoldierTierTextures(scene, registeredKeys) -> { added: string[], failed: string[] }` — for each `v` in `SOLDIER_RECOLOR` and each soldier (`category 'soldier'`, type `'default'`) state whose base key is in `registeredKeys`: skip if `scene.textures.exists(variantKey)` (real art wins, E14); else the spec R14 pipeline (`getSourceImage` → `createCanvas` → `draw` → `getData` → `applyColorStages` → `putData` → `refresh` → `addSpriteSheet('', ct, { frameWidth, frameHeight })`). Any throw: remove a half-made texture if one was created (`scene.textures.remove(key)`), push the key to `failed`, log nothing.
- BootScene `preload`: also loads each `entry.variants?.[v].states` under `variantTextureKey` (R2). `create`: the registered-key scan includes declared variant keys; then `const gen = generateSoldierTierTextures(this, registeredSpriteKeys)`; `registry.set('spriteKeys', [...registeredSpriteKeys, ...gen.added])`; `registry.set('soldierTierFailed', gen.failed)` (the visible-without-a-warning failure surface, spec "Left to the builder").
- `sprites.js` header documents the `variants: { t4a: { scale?, anchor?, ground?, states: { idle: {...} } } }` shape and that generated soldier variants fill missing keys. No entries added.

- [ ] **Step 1: Failing tests** (scene stub: `textures.exists/get/createCanvas/addSpriteSheet/remove`; `createCanvas` returns `{ draw, getData: () => ({ data: new Uint8ClampedArray(w*h*4) }), putData, refresh }`):
  - with base `idle` and `attack` registered: `added` has 8 keys (4 variants × 2 states), `addSpriteSheet` called with `''`, the canvas texture and the manifest frame size.
  - E13: only `idle` registered → 4 keys.
  - E14: `textures.exists('…-idle-t4a')` true → that key skipped, not in `added`.
  - Review Focus 2: a second call returns `added: []` and `createCanvas` is not called again.
  - a throwing `getData` → key in `failed`, `remove` called, `console.warn`/`console.error` spies not called, other variants still added.
  - BootScene test: generated keys are appended **after** the scan (registry array = scanned keys then generated); no variant `load.*` call when the manifest declares none.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Break it by:** generate even when the key exists (E14 fails); push generated keys before the scan (order test fails).
- [ ] **Step 5:** Commit `feat(boot): recolour soldier tier textures once at boot`.

---

### Task 10: `Soldier` tier look and 4A shield (opus)

**Files:** Modify `src/entities/Soldier.js`; Test `src/entities/Soldier.test.js` (extend stubs: `add.graphics` with `fillGradientStyle`/`fillPoints`/`strokePoints`/`setScale`/`setPosition`/`setVisible`; sprite stub with `y`, `setScale`, `setFlipX`; registry with sprite keys for the art cases).

**Interfaces — Consumes:** Task 6 (`variant` option, `setTierScale`, `groundSpec`), Task 1 (`TIER_SCALE.soldier`, `SOLDIER_FALLBACK_BODY`, `SOLDIER_SHIELD`), Task 2 `tierVariant`. **Produces** (on Soldier): `_variant`, `_tierScale`, `_shield` (Graphics or null), `_faceSign` (±1, default 1), `lookSnapshot() -> { level, branch, key, scale, shield: bool, dead }` (`key` = `_sprite.resolvedKey('idle')`, `shield` = shield exists and visible).

Rules (spec R16, R16b, S9, S10):
- Constructor: `v = tierVariant(barracks.level, barracks.branch)`; EntitySprite built with `variant: v`; `setTierScale(TIER_SCALE.soldier[v])`.
- Fallback body: `_drawBody()` fills `SOLDIER_FALLBACK_BODY[v].fill`, strokes `.stroke`; body `setScale(s)` and `y = (1 - s) · FALLBACK_FOOT_Y` (P4).
- Shield: only when `v === SOLDIER_SHIELD.variant` **and** the soldier manifest has no `variants.t4a`. A Graphics kite (mockup polygon `50% 0, 100% 18%, 92% 70%, 50% 100%, 8% 70%, 0 18%` over `w × h`), gradient `top → bottom` (`hexToInt`), outline `hexToInt(outline)`. Added to `_view` after the sprite and **before** `_hpBar` (use `_view.addAt` with the hp bar's index). Positioned at `x = dx · _faceSign`, bottom at `foot − footLiftPx` where `foot` is `groundSpec().footY` with art or `FALLBACK_FOOT_Y` without; scaled by the tier scale; `scaleX = s · _faceSign`.
- `_layout`: compute `face = facingDirX(dir.x * SOLDIER_MARCH.substepPx)` once; `if (face !== 0) _faceSign = Math.sign(face)`; pass `face` to `setFacing` as today; update the shield's x and scaleX from `_faceSign` (E19, E20). (Assumes `baseFacing: 'right'`; if the manifest says left, invert — read `getSpriteConfig('soldier','default').baseFacing`.)
- `takeDamage` death branch also hides `_shield`; `respawn()` shows it again whether or not art is active (R16b, E41).

- [ ] **Step 1: Failing tests**:
  - `barracks {level:3}` with art registered incl. `…-idle-t3` → `resolvedKey('idle')` ends `-t3`, sprite scale `0.36·1.2`.
  - E12: no art, `{level:4, branch:'B'}` → body filled `0xffd34d`, body scale 1.3, `y = (1-1.3)·4`.
  - S9: `{4,'A'}` → shield exists; `{4,'B'}` and `{3}` → none; manifest mock with `variants.t4a` → none.
  - E19/E20: march left (`pathPoints` running right-to-left) → shield `scaleX < 0` and `x < 0`, with and without art; a deadzone frame (`face === 0`) keeps the previous sign.
  - E41: `takeDamage(999)` → shield invisible, `lookSnapshot().shield === false`, `dead === true`; `respawn()` → visible again; both with and without art.
  - E17: after die + respawn, `_variant`, scale and key unchanged.
  - E16: `_targetLayout` spacing at T4 = `spacingFrac · 1.3 ·` the T1 display width.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + all existing Soldier/rally tests green. **Break it by:** read the level in `update` instead of the constructor (E17 key changes after a barracks mutation); leave the shield out of the death branch (E41 fails).
- [ ] **Step 5:** Commit `feat(soldier): tier recolour, scale and 4A shield`.

---

### Task 11: GameScene ring layer, look updates, muzzle point, `__capture.looks` (opus)

**Files:** Modify `src/scenes/GameScene.js`; Tests: new `src/scenes/GameScene.tierLooks.test.js`; update stubs in `GameScene.towerFx.test.js`, `GameScene.towerFacing.test.js`, and any other `_upgradeSelectedTower`/`_sellSelectedTower`/`_placeAt`/`_repositionTo`/`_updateTowers` ctx stubs that break (add `_drawTierRings: vi.fn()`, `muzzlePoint`, `updateLook`, `footY`).

**Interfaces — Consumes:** Task 8 (`updateLook`, `footY`, `muzzlePoint`, `lookSnapshot`), Task 10 `lookSnapshot`, Task 4 (`ringBreath`, `ellipseDashes`), Task 1 (`TIER_RING`, `towerAccent`). **Produces:**
- `create()`: `this._tierRingGfx = this.add.graphics().setDepth(TIER_RING.depth)` beside `_padGlow`. `shutdown()`: destroy + null beside `_padGlow`.
- `_drawTierRings()`: clear; for each tower with `level === 4`: centre `(t.x, t.y + t.footY())`; accent `towerAccent(t.type)`; `lineStyle(TIER_RING.lineWidth, accent, alpha)`; A → `strokeEllipse(cx, cy, 2·rx·k, 2·ry·k)` with `{k, alpha} = ringBreath(this._fxTime, TIER_RING, reduced)`; B → for each array from `ellipseDashes({ cx, cy, rx, ry, dashes: spin.dashes, duty: spin.duty, phase: reduced ? 0 : this._fxTime / spin.periodS })`, `strokePoints(points, false)`.
- `_updateTowerLooks()`: `reduced` from the registry; `t.updateLook(this._fxTime, reduced)` for every tower.
- `update()` draw block: call `_updateTowerLooks()` and `_drawTierRings()` after `_drawRallyRoutes`.
- `_upgradeSelectedTower`, `_placeAt`, `_sellSelectedTower`, `_repositionTo`: call `_drawTierRings()` after the state change (E24, E25, E5).
- `_updateTowers` firing branch: `const m = tower.muzzlePoint()`; muzzle flash and projectile `x/y` from `m`; targeting distance still from `tower.x/y` (S6, E34).
- Debug block: `window.__capture.looks = { towers: towers.map(t => ({ type, level, branch, ...t.lookSnapshot(), ring, ringPhase })), soldiers: barracks.flatMap(b => b.soldiers.map(s => { const l = s.lookSnapshot(); return { ...l, keyExists: l.key != null && this.textures.exists(l.key) }; })) }` — `ring` = `'solid'|'dashed'|null` by level/branch, `ringPhase` = the B phase or the A breath `k` (whichever that ring animates), so a still frame repeats it exactly (R19, R21).

- [ ] **Step 1: Failing tests** (proto `.call` with ctx stubs, the house pattern):
  - `_drawTierRings` with towers `[T4A archer at (100,100) footY 41.2, T4B mage, T3 cannon]` → one `strokeEllipse` centred `(100, 141.2)`, dashed `strokePoints` calls = 12 for the mage, nothing for the cannon; uses only `ctx._tierRingGfx` (Review Focus 5).
  - E28: fallback tower `footY() → 18` → ellipse centre `y + 18`.
  - E21/E22: registry `ambientMotion false` → A at full `rx·2`, alpha 0.85; B phase 0; with `this.speed = 2` the phase depends only on `_fxTime`.
  - Review Focus 1 / E24/E25/E5: `_upgradeSelectedTower`, `_placeAt`, `_sellSelectedTower`, `_repositionTo` each call `_drawTierRings` once.
  - E34: a firing tower with `muzzlePoint → {x:5, y:-11}` → `spawnMuzzleFlash(5, -11, …)` and projectile `{x:5, y:-11}`; targeting uses `tower.x/y`.
  - shutdown destroys `_tierRingGfx`.
  - E26: `_updateTowerLooks` calls `updateLook(_fxTime, reduced)` on a barracks stub with `fireRate: 0` as well as on a firing tower.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + full `npm test` green. **Break it by:** draw rings only in `update` (Review Focus 1 test fails); centre the fallback ring on `y` (E28 fails).
- [ ] **Step 5:** Commit `feat(game): T4 ring layer, tower look updates, muzzle from drawn centre`.

---

### Task 12: Capture runs `tier-looks` and `tier-looks-still` (opus)

**Files:** Modify `scripts/capture.mjs`.

**Interfaces — Consumes:** Task 11 `__capture.looks`; Task 4 `expectedTowerLook`; Task 2 `resolveSpriteKey`, `tierVariant`; Task 1 `TIER_SCALE`, `SOLDIER_4A_HUE`; Task 3 `meanHue`, `hueDistance`, `rgbToHue`; Task 5 `footprintClash`. **Produces:** `captureTierLooks(browser, base, deviceName, dir)` and `captureTierLooksStill(...)`, wired into the per-device `runs` list (tier-looks for every device; tier-looks-still inside the `REDUCED_MOTION_DEVICES` branch), one at a time.

Rules (spec R20–R22, R26):
- `tierLooksPlan()` in Node: map 9; batches `[['archer','mage'], ['cannon','ice'], ['sniper','barracks']]`; each batch places its two types at `1, 2, 3, 4a, 4b` (10 towers) on slots picked greedily from `MAPS[9].towerSlots` so no two picked pads `footprintClash` at 1.4 for any tower pairing. Throw if fewer than 10 fit. `build=type@slot:tier` (`4a`/`4b` suffix); `debug=1`, `map=9`, **no `wave`**.
- Per batch load: wait for `__capture.looks`; assert `game.registry.get('soldierTierFailed')` is an empty array (R14's silent-failure surface); then (a) each tower look deep-equals `expectedTowerLook(level, branch)` on `scale/core/embers/ring/pips` and `footDriftPx === 0` (|x| < 1e-6); (b) ring count = T4 count, `solid` for A, `dashed` for B; (c) for each soldier, read `registry.spriteKeys` in-page and assert `key === resolveSpriteKey('soldier','default','idle', tierVariant(level, branch), spriteKeys)`, `keyExists === true`, `scale === TIER_SCALE.soldier[v]`, `shield === (v === 't4a' && !dead)`; (d) two snapshots ≥ 300 ms real time apart differ in some `emberDy` and some `ringPhase`.
- Shoot `tiers-<a>-<b>.png`; on desktop1440 also per-tower crops with `page.screenshot({ clip })` around each tower (the existing clip pattern in capture.mjs). R26 on desktop1440 in the barracks batch: pause with `scene.sys.pause()`, read the 4A soldier's resolved idle texture pixels in-page (draw `getSourceImage()` frame 0 to a canvas created with `willReadFrequently: true`), compute `meanHue` with `minSat 0.2`, assert within `maxTargetDeg` of `#6fb6ff` and ≥ `minAvoidDeg` from `#7fe9ff`.
- `tier-looks-still`: same plan, `screensRun(…, 'tier-looks-still', { contextOptions: { reducedMotion: 'reduce' } }, …)` as `captureReducedMotion` does. With no saved setting, `resolveAmbientMotion` turns that into `ambientMotion === false`; assert it in-page (`game.registry.get('ambientMotion') === false`) before the snapshots so the run can't pass vacuously. (a)–(c) as above; (d) inverted: snapshots ≥ 300 ms apart are **identical**, and every mark is present.
- Throw descriptive errors (the house `until`/`label` style); no new console output.

- [ ] **Step 1:** Implement the plan helper and runs.
- [ ] **Step 2:** `npm run capture -- --screens --devices desktop1440,iphone` (the script builds in `capture` mode and serves it itself) → tier-looks and tier-looks-still pass, zero problems. Later reruns may add `--no-build` when only `scripts/` changed.
- [ ] **Step 3: Prove it fails** (each on a throwaway edit, restored after): `TowerTierLook.setTier` no-op → (a) fails; drop the foot pivot in `setTierScale` → `footDriftPx` fails; skip `generateSoldierTierTextures` in BootScene → (c) fails on the key; ignore `reduced` in `updateLook` → still-run (d) fails; `SOLDIER_RECOLOR.t4a.hueRotate = 150` → R26 capture check fails. Record each failure message in the report.
- [ ] **Step 4:** Commit `test(capture): tier-looks and tier-looks-still screens with frozen-frame checks`.

---

### Task 13: Gates, captures, live check, ship (controller)

- [ ] `npm test` (record count), `npm run build`, `npm run balance` → SHA identical to the Setup baseline (R18).
- [ ] `npm run matrix` green (E40). Check `uptime` load < 6 before timing-sensitive runs (memory: matrix load flakes).
- [ ] `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` → zero problems (known desktop1440 #56(a) exception only).
- [ ] Convert captures to JPEG q90 into `docs/captures/49-upgrade-visuals/`; view them myself, especially the 4A blue vs slow cyan, pips/badge on iPhone, and the accepted map 5/9 overlaps.
- [ ] Tune within the spec ballparks if captures demand it (ember offsets, core size, pip spacing, shield offset, `t4a` numbers); re-run the affected tests and captures.
- [ ] Final opus whole-branch review → ONE fix wave → scoped re-review.
- [ ] Live verification on `npm run build && npm run preview` at desktop 1440×900 and iPhone 14 with real input, per spec "Live verification" (seed `lastlight_save` for map 9; frozen-frame probes via `sys.pause()`).
- [ ] Update `.claude/notes.md` (mark #49 code half done; backlog: stale depth after barracks Move; armour-mask recolour only if the user asks), write `.claude/sessions/2026-11-09-upgrade-visuals.md`, commit both, push, `gh pr create --base visual/integration`. PR body: summary, test count, balance SHA before/after, capture list.
- [ ] Stop the brainstorm server (`scripts/stop-server.sh` with the session dir).
