# FX Foundation — Implementation Plan (roadmap 1.5)

**Spec:** roadmap task 1.5 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`
("Generate particle textures in code (soft glow, ring, spark, smoke puff, shard, ember) at boot;
new `src/data/fx.js` declares per-tower/tier projectile shape, trail, muzzle flash and impact
burst; `Projectile.js` + `ParticleSpawner.js` read it. Object-pool projectiles/particles.
*Accept:* archer arrows, cannon arcing shells with shadow, mage bolts, ice shards, sniper tracer,
soldier muzzle flashes all distinct; unit tests for the fx data contract.") and `docs/art-bible.md`
§2 (tower accent emissives, status colours).

**Goal:** every tower's shot looks like what it is, at no per-shot allocation cost.

## Global Constraints (bind every task)

1. **Visual only.** Do not change projectile speed (280 px/s), the hit test (`dist < 10` in
   `GameScene._updateProjectiles`), damage, splash, slow, targeting, cooldowns or any timing. A
   projectile's `x`/`y` remain its true ground position; anything drawn above the ground (the
   cannon arc) is a *child offset*, never a change to `x`/`y`. All existing gameplay tests must
   pass unchanged.
2. **Tunables live in `src/data/fx.js`** (shapes, sizes, colours, trail/muzzle/impact choices,
   arc heights). No new magic numbers in entity logic.
3. **Tower accent colours (art bible §2):** archer `0xffb000`, mage `0xdd00ff`, cannon
   `0xff7a2f`, ice `0x00eeff`, sniper `0xff3355`, barracks `0xffd34d`. Sentry shots use the
   sentry's existing `COLOR` constant from `src/entities/SentryTurret.js`.
4. **Particle textures are drawn in code at boot** — no new image files. The six keys are exactly
   `fx-glow`, `fx-ring`, `fx-spark`, `fx-smoke`, `fx-shard`, `fx-ember`. Keep the existing `spark`
   image load in BootScene (hero ability VFX use it).
5. **No per-shot allocation in steady state:** no `scene.add.particles`, `scene.add.graphics`,
   `scene.add.image` or `new Projectile` per shot once warm. Use one shared emitter per effect per
   scene, and a projectile pool.
6. **Phaser 3.90** (`node_modules/phaser`). Verify every Phaser API you call against
   `node_modules/phaser/src` — do not rely on memory of older versions. Particles are the 3.60+
   API: `scene.add.particles(x, y, texture, config)` returns a `ParticleEmitter` with
   `explode(count, x, y)` and `emitParticleAt(x, y, count)`; `emitting: false` keeps it idle.
7. **Scene lifecycle:** anything created in `GameScene.create` is destroyed in its shutdown path.
   `this.events` survives shutdown — never add an un-removed listener (see `_wireSceneEvents`).
8. **Tests:** Vitest + jsdom. Any test importing code that imports Phaser must `vi.mock('phaser',
   …)` (see existing `*.test.js` for the pattern). Pure logic gets real tests; derive allow-lists
   from the source of truth (`TOWER_DEFS`, `FX_TEXTURES`), never hardcode them in the test.
9. Plain ES modules, vanilla JS, match surrounding style; comments explain *why*.
10. Hero ability VFX (`spawnHeroAbilityVFX`, rings) are out of scope — leave them working as is.

---

### Task 1: Code-drawn particle textures

**Files:** create `src/systems/fxTextures.js`, `src/systems/fxTextures.test.js`; modify
`src/scenes/BootScene.js` (call it in `create()` before the scene starts the next scene; keep
the BootScene tests green — mock the new module there if needed).

- Export `FX_TEXTURES`: an array of `{ key, size, draw }` for the six keys in constraint 4.
  `draw(ctx, size)` paints on a 2D canvas context, white on transparent (tinted at emit time):
  - `fx-glow` 64px radial gradient, alpha 1 → 0 (soft dot).
  - `fx-ring` 64px stroked circle, line width 4, slightly soft (shadowBlur or a second faint stroke).
  - `fx-spark` 16px elongated diamond / short streak, bright centre.
  - `fx-smoke` 64px soft blob, alpha ~0.6 centre fading to 0, slightly irregular edge (2–3 offset gradients).
  - `fx-shard` 32px thin kite / triangle (ice shard), crisp.
  - `fx-ember` 16px small radial dot, hot centre.
- Export `generateFxTextures(scene)`: for each spec, skip if `scene.textures.exists(key)`;
  otherwise `scene.textures.createCanvas(key, size, size)`, call `draw(tex.getContext(), size)`,
  then `tex.refresh()`. Idempotent.
- Tests: keys are unique and exactly the six in constraint 4 (this list may be literal — it is the
  spec); `generateFxTextures` with a stub scene calls `createCanvas` once per key, calls each
  `draw`, calls `refresh`, and skips keys that already exist; each `draw` runs against a stub 2D
  context without throwing.

### Task 2: FX data contract and resolver

**Files:** create `src/data/fx.js`, `src/systems/fxResolve.js`, `src/systems/fxResolve.test.js`.

- `src/data/fx.js` exports:
  - `PROJECTILE_FX`: one entry per tower type in `TOWER_DEFS` plus `sentry`. Each entry:
    `{ shape, color, size, trail, muzzle, impact }` and, for cannon only, `arc` (peak height px)
    and `shadow: true`. Optional `tiers: { 2: {...}, 3: {...} }` and `branches: { A: {...}, B: {...} }`
    partial overrides (merged shallowly over the base; branch applies only at tier 4).
    Shapes: archer `arrow`, cannon `shell`, mage `bolt`, ice `shard`, sniper `tracer`,
    barracks `bolt` (barracks towers don't fire projectiles today; give it an entry anyway so the
    contract covers every type), sentry `bolt`.
    Suggested sizes (px, design space): arrow length 12 / width 2; shell radius 4, arc 36;
    bolt radius 4; shard length 10; tracer length 26 / width 2.
    Use at least one real override so the merge path is exercised by data: e.g. cannon tier-4
    branch `A` (Artillery) `{ size: 5, arc: 48 }`, mage branch `A` (Archmage) a brighter colour.
  - `TRAIL_FX`, `MUZZLE_FX`, `IMPACT_FX`: keyed effect definitions (texture key from
    `FX_TEXTURES`, tint, lifespan ms, quantity, speed range, scale start/end, alpha start/end,
    blendMode). Needed keys: trails `none`, `streak`, `smoke`, `sparkle`, `frost`; muzzles
    `small`, `big`, `soldier`; impacts `spark`, `explosion`, `burst`, `frost`, `pierce`.
    Cannon impact `explosion` must read big (fx-smoke + fx-ember, more particles); `frost` uses
    fx-shard with the slow colour `0x7fe9ff` (art bible status colour).
  - `SOLDIER_MUZZLE = 'soldier'` (the muzzle key soldiers use).
- `src/systems/fxResolve.js` exports pure functions:
  - `projectileFx(towerType, tier = 1, branch = null)` → merged definition (base ← tiers[2..tier]
    in ascending order ← branches[branch] when tier === 4). Unknown type → the `sentry`/default
    entry rather than throwing.
  - `arcOffset(progress, peak)` → `4 * peak * p * (1 - p)` with `p` clamped to [0, 1]; returns a
    non-negative height (the caller subtracts it from y).
- Tests (`fxResolve.test.js`), allow-lists derived from `TOWER_DEFS` / `FX_TEXTURES`:
  every tower type has an entry; every `trail`/`muzzle`/`impact` key referenced by any entry or
  override exists in its table; every effect's texture key is in `FX_TEXTURES`; every shape is in
  the allowed set; colours are integers 0..0xffffff; tier/branch merge order is correct (tier 3
  overrides tier 2, branch applies only at tier 4, base untouched); cannon resolves `arc > 0` and
  `shadow === true`; `arcOffset` is 0 at p=0 and p=1, `peak` at p=0.5, clamps outside [0,1].
  Projectile/branch keys: `TOWER_DEFS` uses `tier4A` / `tier4B`, and towers store `branch` as
  `'A'` / `'B'`.

### Task 3: Shaped, pooled projectiles

**Files:** modify `src/entities/Projectile.js`, `src/scenes/GameScene.js`,
`src/entities/SentryTurret.js`; create `src/systems/ProjectilePool.js` +
`src/systems/ProjectilePool.test.js`; add/extend a Projectile test.

- `ProjectilePool` (pure, factory-injected): `constructor(factory)`, `acquire(opts)` reuses a
  released instance (calling its `reset(opts)`) or creates one via `factory(opts)`;
  `release(p)` hides/deactivates it and returns it to the free list; `destroyAll()`.
  Tests: reuse after release, `reset` called with new opts, no double-release duplicates,
  `destroyAll` destroys free and live instances.
- `Projectile`: constructor builds its display children once (a `body` Graphics redrawn in
  `reset` per shape, plus a shadow ellipse child for `shadow: true`); `reset(opts)` re-initialises
  every field the constructor sets today (target, targetX/Y, damage, splashRadius, pierce,
  slowFactor, color, towerType, tier, branch, dead=false, speed=280) plus `fx =
  projectileFx(towerType, tier, branch)`, `startDist` (distance to target at fire time, min 1),
  and makes it visible/active. Shapes, drawn in local space pointing +x and rotated toward travel
  each frame: `arrow` (line with head), `shell` (filled circle, dark rim), `bolt` (bright core +
  additive `fx-glow` image child), `shard` (thin kite), `tracer` (long thin streak trailing
  behind the head). Colour from `fx.color`.
  Add `updateVisual()` (called by GameScene after moving the projectile): rotation toward
  target; for `arc > 0`, offset the body child's y by `-arcOffset(progress, fx.arc)` where
  progress = `1 - remainingDist / startDist`, and keep the shadow child at local (0,0) scaled down
  slightly as height rises. The container's own x/y stay the true ground position (constraint 1).
  `towerType`, `tier`, `branch`, `color` must stay readable by `_onProjectileHit` as today.
- GameScene: create `this._projectilePool` in `create()` (factory → `new Projectile(this, opts)`),
  use `acquire` where it does `new Projectile` today, call `proj.updateVisual()` after each move in
  `_updateProjectiles`, and in `_destroyDeadProjectile` release to the pool instead of
  destroying. `destroyAll()` in the shutdown path. Projectile no longer creates its own particle
  emitter — remove `_trail`/`destroyTrail` usage *only if* Task 4's shared trail replaces it in the
  same branch; for this task, keep calling the existing `spawnProjectileTrail` path unchanged so
  trails still work, and leave a `// Task 4` marker comment.
- Projectile opts gain an optional `fxType` used ONLY to pick visuals:
  `fx = projectileFx(fxType ?? towerType, tier, branch)`. `towerType` is gameplay — it becomes
  the damage `source.type` in `_onProjectileHit`, which matchup/armour logic reads — so it must
  not change for any shooter (constraint 1).
- SentryTurret: fire through `scene._projectilePool.acquire({... towerType: 'archer', fxType:
  'sentry' ...})` (fall back to `new Projectile` if the pool is absent, for its unit tests). Its
  `towerType` stays `'archer'` exactly as today; keep `COLOR`.
- Keep `setDepth(16)` for projectiles.

### Task 4: Shared emitters — trails, muzzle flashes, impacts

**Files:** modify `src/systems/ParticleSpawner.js`, `src/systems/ParticleSpawner.test.js`,
`src/entities/Projectile.js`, `src/scenes/GameScene.js`.

- `ParticleSpawner` keeps one emitter per effect key, created lazily on first use with
  `emitting: false` from `TRAIL_FX` / `MUZZLE_FX` / `IMPACT_FX` (Task 2), at depth 17 (just
  above projectiles). `destroy()` destroys them all; GameScene calls it on shutdown.
- `emitTrail(projectile, dt)`: emit along the projectile using the shared trail emitter for its
  `fx.trail` at the trail's rate (accumulate dt; `emitParticleAt(x, y, n)`); `none` emits nothing.
  Emit at the *drawn* position (ground y minus arc offset) so cannon smoke follows the shell.
- `spawnMuzzleFlash(x, y, towerType, tier, branch)` → shared muzzle emitter for
  `projectileFx(...).muzzle`, `explode(quantity, x, y)`. Keep the old signature working.
- `spawnImpact(impactKey, x, y)` → shared impact emitter `explode`. GameScene `_onProjectileHit`
  calls it with `proj.fx.impact` at the hit point (in addition to the existing `_addParticle`
  circles, which stay).
- Soldier muzzle flash: in GameScene where a blocking soldier attacks (`blocker.attackTimer <= 0`
  branch, ~line 527) call `spawnMuzzleFlash` with the `SOLDIER_MUZZLE` key at the soldier's x/y.
- Remove the per-projectile emitter: `Projectile` no longer calls `spawnProjectileTrail`;
  `_updateProjectiles` calls `this.particleSpawner.emitTrail(proj, dt)` for live projectiles;
  delete `destroyTrail`/`_trail` and the old `spawnProjectileTrail` + `TRAIL_CONFIG` if nothing
  else uses them (grep first). Old `MUZZLE_TINTS` may go if unused.
- Tests: emitters are created once per key and reused across calls (no growth in
  `scene.add.particles` calls after warm-up); `spawnImpact`/`spawnMuzzleFlash` call `explode` on
  the right shared emitter with the configured quantity; `emitTrail` with `trail: 'none'` emits
  nothing, otherwise `emitParticleAt` at the drawn position; `destroy()` destroys all; hero-ability
  tests still pass.
