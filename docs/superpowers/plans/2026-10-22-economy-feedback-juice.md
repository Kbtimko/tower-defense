# Economy & Feedback Juice — Implementation Plan (roadmap 1.8)

**Spec:** roadmap task 1.8 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"Gold pop on kills with arcing coin to the HUD counter, build/upgrade/sell animations (scale-pop +
ring burst), wave-incoming banner, boss warning, ability cooldown rings and target reticles,
selection ring, pad idle glow. *Accept:* checklist in the PR with a capture per item."
Colours: `docs/art-bible.md` §2 (currency `#ffd700`, accent `#4fc3f7`, danger `#f07a7a`).

**Builds on (merged or stacked):** `src/systems/ParticleSpawner.js` (cached shared emitters,
`spawnImpact(key, x, y)`), `src/data/fx.js` (`IMPACT_FX` etc.), `src/systems/fxTextures.js` (the six
`fx-*` textures — that list is a tested contract: do NOT add texture keys), `src/ui/pulse.js`
(`pulseClass(el, cls)` restarts a CSS animation), `src/systems/viewport.js` (`gameToPageCss`).

## Global Constraints (bind every task)

1. **Visual only.** No change to gold amounts, costs, refunds, rewards, cooldown durations, wave
   timing or any gameplay value. Effects read existing values; they never write them.
2. **Tunables in `src/data/juice.js`** (durations, sizes, colours, counts, caps). No new magic
   numbers in scene/entity logic.
3. **No per-frame allocation**: no `scene.add.*`, `tweens.add`, new objects or literals per frame.
   Per-EVENT work (a kill, a build, a wave start) may reuse pooled objects; pools are created once
   per scene and capped (constraint 2 sets the caps).
4. **DOM vs canvas:** the HUD (gold, lives, ability buttons) is DOM — animate it with CSS classes
   and CSS custom properties; in-world effects are canvas.
5. **Reduced motion:** honour the existing `ambientMotion === false` registry flag for in-canvas
   motion-heavy effects (coin arcs, pops) by shortening/skipping them, and
   `@media (prefers-reduced-motion: reduce)` for CSS.
6. **Scene lifecycle:** pools/listeners created in `GameScene.create` are destroyed in shutdown;
   every `events.on` has an `off` in `_wireSceneEvents` / `_unwireSceneEvents`; `this.events`
   survives shutdown.
7. **Phaser 3.90** — verify APIs in `node_modules/phaser/src`. Tests: Vitest + jsdom, Phaser
   mocked; pure logic gets real tests; GameScene tests via `Object.create(GameScene.prototype)`.
8. Vanilla JS ES modules; match surrounding style; comments explain *why*.

---

### Task 1: Data and pure helpers

**Files:** create `src/data/juice.js`, `src/systems/juiceMath.js`, `src/systems/juiceMath.test.js`.

- `src/data/juice.js`: `COIN_FLY` (`duration` s, `arcHeight` px, `maxLive` coins, `perKill` count,
  `color` 0xffd700, `size`), `GOLD_POP` (floating "+N" text: `rise` px, `duration`, `maxLive`,
  font size, colour `#ffd700`), `BUILD_POP` (`duration`, `peak` scale, ring-burst effect key),
  `UPGRADE_POP`, `SELL_FX`, `WAVE_BANNER` (`duration` ms), `BOSS_WARNING` (`duration` ms, which
  enemy types count as bosses — derive from `DEATH_CLASS` 'boss' in src/data/fx.js rather than
  listing types), `SELECTION_RING` (`color` 0x4fc3f7, `pulse` Hz, width), `PAD_GLOW` (`period` s,
  `alpha: [min, max]`, colour), `RETICLE` (colour, line width, spin).
- `src/systems/juiceMath.js` (pure, allocation-free where called per frame):
  - `arcPoint(t, from, to, height, out)` — quadratic arc from `from` to `to` peaking `height` px
    above the straight line at t=0.5; writes into and returns `out` (caller-owned object).
  - `popScale(t, duration, peak)` — 1 → peak → 1 ease-out-back style; exactly 1 outside [0, duration].
  - `padGlowAlpha(timeS, phase, { period, alpha })` — smooth pulse in [min, max].
  - `cooldownFraction(remaining, max)` — clamp(remaining / max, 0, 1); 0 when max ≤ 0.
  - `waveBannerText(waveNum, waveCount)` and `bossWarning(waveGroups)` → boss type or null (a wave
    is an array of `{ type, count }` groups as in src/data/waves.js).
- Tests for every helper, with allow-lists derived from `DEATH_CLASS` / `MAP_WAVES` (e.g. the boss
  helper finds the titan in a real wave that has one and returns null for one that doesn't).

### Task 2: Gold pop and arcing coins

**Files:** create `src/systems/CoinFx.js` + test; modify `src/scenes/GameScene.js`, `index.html` (CSS).

- `CoinFx(scene)` owns two pools created once: coin Images (`fx-glow` tinted gold, small) and
  "+N" Text objects. `spawn(x, y, amount)` takes a free coin (`COIN_FLY.perKill`, capped by
  `maxLive` — when the pool is exhausted skip the coin, still show the text) and a free text.
  `update(dt)` advances each live coin along `arcPoint` from the kill point to the HUD gold counter
  and the text upward with fade; on a coin's arrival call `pulseClass` on the HUD gold stat
  (`#stat-gold`'s `.hud-stat` parent) with a new `gold-gain-pulse` CSS class.
- The HUD target in game coordinates: convert `#stat-gold`'s bounding rect centre from page px to
  game px through the canvas bounding rect (the inverse of `gameToPageCss`; add a pure tested
  helper if none exists). The counter may sit outside the canvas (above it) — coins fly to the
  canvas edge point nearest the counter and the pulse finishes the read.
- Hook: every place a kill reward is earned (`_dealDamage` ~line 1053, the hero kill loop ~line
  701 — grep `_killReward(` for all) calls `this._coinFx.spawn(enemy.x, enemy.y, reward)` with the
  reward that was actually earned. Wave-clear and early-send bonuses do not spawn coins (they
  already toast).
- Reduced motion: no arc — text only, plus the HUD pulse.

### Task 3: Build, upgrade and sell animations

**Files:** `src/entities/Tower.js` (+ test), `src/data/fx.js` (one new `ringBurst` IMPACT_FX
entry using `fx-ring`, growing and fading), `src/scenes/GameScene.js`.

- Tower gets a pop timer (number field) and `startPop(kind)` ('build' | 'upgrade'); `update`/a
  per-frame hook applies `popScale` to the tower's display container scale (or its sprite via the
  existing EntitySprite scale API — do not lose the manifest scale; reuse `setSquash` if it fits).
  Tower update: towers don't have an update method today — GameScene `_updateTowers` loops every
  tower each frame; advance the pop there.
- On place (`_onPointerDown` after a successful `placeTower`), on upgrade (`_upgradeSelectedTower`
  after success) and on sell (`_sellSelectedTower`, before the tower is destroyed): spawn the ring
  burst via `particleSpawner.spawnImpact('ringBurst', x, y)` (upgrade tinted gold, sell grey
  smoke + coins from Task 2's `CoinFx.spawn` with the refund amount).
- Sell stays immediate (the tower is still removed in the same frame) — only effects play.

### Task 4: Wave-incoming banner and boss warning

**Files:** `index.html` (markup + CSS), create `src/ui/WaveBanner.js` + test, `src/scenes/GameScene.js`.

- `WaveBanner` (DOM): one banner element created in index.html, shown via a CSS class for
  `WAVE_BANNER.duration` with text from `waveBannerText`; when `bossWarning(groups)` returns a type,
  a second red warning line ("⚠ Titan inbound" — name from ENEMY_DEFS) plus a red edge pulse on the
  game frame (reuse the 1.6 `life-lost-frame` styling pattern with its own class). Hidden by
  default; `pointer-events: none`; never blocks input; does not cover the HUD.
- Trigger on the existing `wave:start` scene event (WaveManager emits `{ waveNum }`; the groups are
  `this.waveMgr.waves[waveNum - 1]`). Register/unregister in the wired pair.

### Task 5: Cooldown rings, target reticle, selection ring, pad idle glow

**Files:** `src/scenes/UIScene.js` (+ test), `index.html` (CSS), `src/scenes/GameScene.js` (+ test).

- **Cooldown ring (DOM):** in `UIScene._setAbilityCd`, track each slot's max (the first non-zero
  value after being ready) and set a CSS custom property `--cd` = `cooldownFraction(remaining,
  max)` on the ability button; CSS draws a conic-gradient sweep overlay from it. Clears at 0.
- **Target reticle (canvas):** while `this.aimMode`, draw a reticle on `this.gfx` at the pointer
  (rotating ticks + circle sized to the aimed ability's radius if the data has one, else
  `RETICLE` default) — redrawn each frame on the existing per-frame Graphics, no new objects.
- **Selection ring (canvas):** while `this.selectedTower` is set, a pulsing `SELECTION_RING` circle
  at the tower's base on `this.gfx`.
- **Pad idle glow (canvas):** in `_drawZones`, when NOT building (`!this.selectedType`), empty
  pads get a soft pulsing fill using `padGlowAlpha` with a per-slot phase (slot index × constant);
  keep today's build-mode affordability colours unchanged.
