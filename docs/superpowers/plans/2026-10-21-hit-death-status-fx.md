# Hit / Death / Status FX — Implementation Plan (roadmap 1.6)

**Spec:** roadmap task 1.6 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"Hit squash + brief hit-stop on heavy hits, death effects by size class (small pop / large burst +
debris / boss sequence), status overlays (slow = frost tint + crystals, burn, stun), life-loss
pulse. *Accept:* each effect visible in a captured sequence; no new per-frame allocations
(pooled)." Colours: `docs/art-bible.md` §2 status colour language — slow `0x7fe9ff` with frost
crystals, burn `0xff8a1f`, stun `0xffe14d` with stars.

**Builds on 1.5 (merged):** `src/data/fx.js` (effect tables), `src/systems/fxTextures.js` (six
`fx-*` textures), `src/systems/ParticleSpawner.js` (one cached shared emitter per effect key via
`_emitter(key, def)`; `spawnImpact`, `spawnMuzzleFlash`, `emitTrail`; `destroy()` on shutdown).

## Global Constraints (bind every task)

1. **Visual only.** No change to damage, HP, armour, speed, status durations/factors, targeting,
   rewards, lives or wave timing. The one sanctioned timing effect is hit-stop (constraint 4).
   All existing gameplay tests pass unchanged.
2. **Tunables in `src/data/fx.js`** (or a new `src/data/hitFx.js` if fx.js gets crowded — pick
   one and say so). No new magic numbers in entity logic.
3. **No per-frame allocation.** No `scene.add.*`, `tweens.add`, `new` objects or array/object
   literals created per frame or per hit in steady state. Particles go through ParticleSpawner's
   cached shared emitters; per-entity animation state is plain number fields updated in place.
   (A one-off object per *death* is acceptable; per *hit* or per *frame* is not.)
4. **Hit-stop** freezes the whole GameScene simulation (every entity, uniformly) for a few tens of
   ms so relative timing is unchanged; it is rate-limited by a cooldown, never triggers while the
   game is paused or over, and is skipped when the `ambientMotion` registry flag is `false`
   (the existing reduced-motion setting).
5. **Death effects fire once per killed enemy, never for a leak.** Enemies that reach the base are
   also marked `dead` and go through `GameScene._fadeOutDeadEnemy`; they must not explode.
6. **Phaser 3.90** — verify APIs in `node_modules/phaser/src`, not memory.
7. **Scene lifecycle:** create/destroy pairing; `this.events` survives shutdown — every
   `events.on` has a matching `off` in the existing `_wireSceneEvents` / `_unwireSceneEvents` pair.
8. **Tests:** Vitest + jsdom; mock Phaser where imported; pure logic gets real tests; derive
   allow-lists from the source of truth (e.g. `ENEMY_DEFS` for size classes).
9. Vanilla JS ES modules; match surrounding style; comments explain *why*.

---

### Task 1: Data and pure helpers

**Files:** data file per constraint 2; create `src/systems/hitFx.js` + `src/systems/hitFx.test.js`.

- Data:
  - `HIT_SQUASH`: `{ duration: 0.12 (s), amount: 0.18 }` — on hit the sprite briefly widens and
    flattens (scaleX 1+a, scaleY 1−a at the start, easing back to 1).
  - `HIT_STOP`: `{ duration: 0.05 (s), cooldown: 0.4 (s), heavyFraction: 0.25 }` — a hit is heavy
    when post-armour damage ≥ heavyFraction × maxHp; a kill of a `large` or `boss` class enemy
    always qualifies.
  - `DEATH_CLASS`: enemy type → `'small' | 'large' | 'boss'` (drone, skitter, phantom small;
    brute, colossus large; titan boss).
  - `DEATH_FX`: per class, a list of `{ effect, delay }` steps referencing effect keys (add new
    entries to `IMPACT_FX` as needed: `pop` (small, tinted by the enemy colour at spawn time),
    `debris` (fx-shard, dark chitin `0x2a2430`, gravity), `shockwave`). `small`: one `pop`.
    `large`: burst + debris. `boss`: a sequence of 3–4 bursts over ~0.8 s, then a big
    explosion + debris + a shock ring, plus the existing `boss-died` camera shake.
  - `STATUS_FX`: `slow: { tint: 0x7fe9ff, crystals: 4 }`, `burn: { tint: 0xff8a1f, emberRate }`,
    `stun: { color: 0xffe14d, stars: 3, spin }`, and a tint priority order (`stun` > `burn` >
    `slow`).
- Pure functions (all tested):
  - `squashScale(t, { duration, amount })` → `{ x, y }`; `{1,1}` when `t <= 0` or `t >= duration`.
  - `deathClass(type)` → class; unknown type → `'small'`.
  - `isHeavyHit({ damage, maxHp, killed, type })`.
  - `canHitStop({ sinceLast, paused, reducedMotion })`.
  - `statusTint(statusEffects)` → the tint of the highest-priority active status, or `null`.
- Tests: every `ENEMY_DEFS` type has a `DEATH_CLASS`; every `DEATH_FX` effect key exists in its
  table and every texture key is in `FX_TEXTURES`; squash curve endpoints/monotonic return to 1;
  heavy-hit thresholds; cooldown gating; tint priority.

### Task 2: Hit squash and status visuals on enemies

**Files:** `src/entities/Enemy.js`, `src/systems/EntitySprite.js`, `src/systems/ParticleSpawner.js`,
their tests.

- `EntitySprite` gains a base tint: `setBaseTint(color | null)`. `setFlash(false)` restores the
  base tint (instead of `clearTint()`), so a hit flash during a slow returns to cyan, not white.
  Also `setSquash(x, y)` that multiplies the configured `scale` (do not lose the manifest scale).
- `Enemy`: on a non-lethal hit (where `_triggerHitFlash` runs) restart a squash timer (a number
  field). In `update(dt)`, advance it and apply `squashScale` via `setSquash` — no allocation
  per frame (reuse a module-level result object if `squashScale` returns one, or return two
  numbers via fields; your call, but no per-frame object literal).
- Status visuals, redrawn when status changes (in `_redrawStatusOverlay`) plus a cheap per-frame
  update for animated parts:
  - tint: `_sprite.setBaseTint(statusTint(...))` whenever a status starts or ends;
  - slow: keep a cyan ring and add `crystals` small frost shards drawn around the body (Graphics
    shapes on the existing `_overlay`, positions computed in place);
  - stun: replace the white ring with `stars` small yellow stars orbiting above the head
    (per-frame redraw of a dedicated small Graphics child is fine — clearing and redrawing a
    Graphics allocates nothing new);
  - burn: orange tint plus embers rising from the enemy through a new
    `ParticleSpawner.emitStatus('burn', x, y, dt, enemy)` using a shared emitter and a per-enemy
    accumulator field (same pattern as `emitTrail`).
  - Status visuals hide on death (existing `playDeathAnimation` hides `_overlay`).
- The Graphics-fallback body (no sprite art) still works: tint/squash calls are no-ops when the
  sprite is inactive (EntitySprite already guards on `active`).

### Task 3: Death effects by size class, boss sequence, hit-stop

**Files:** `src/scenes/GameScene.js`, `src/systems/ParticleSpawner.js`, `src/entities/Enemy.js`
(leak flag only), tests.

- Mark leaks: where an enemy reaches the end (`enemy.waypointIndex >= path.length - 1` in
  `_updateEnemies`) set `enemy.leaked = true` before `dead = true`.
- `_fadeOutDeadEnemy(enemy)`: when `!enemy.leaked`, call `this.particleSpawner.spawnDeath(
  deathClass(enemy.def.type), enemy.x, enemy.y, enemy.def.color)`. `spawnDeath` plays the class's
  `DEATH_FX` steps through shared emitters; delayed steps use `scene.time.delayedCall` (one per
  step per death — acceptable per constraint 3). Leaks keep today's behaviour exactly.
- Hit-stop: GameScene keeps `_hitStopTimer` and `_sinceHitStop` (numbers). Trigger it from the
  existing `damage-dealt` event (heavy hits — the payload carries `target` and post-armour
  `amount`) and from large/boss kills in `_fadeOutDeadEnemy`, gated by `canHitStop`. In `update`,
  while `_hitStopTimer > 0`, decrement it by the REAL frame delta and skip the simulation step
  (enemies, towers, projectiles, waves, hero…) but keep rendering. If GameScene already listens to
  `damage-dealt`, extend that handler rather than adding a second listener; if it does not, add it
  to `_wireSceneEvents` and `_unwireSceneEvents` as a pair.

### Task 4: Life-loss pulse

**Files:** `index.html` (CSS only), `src/scenes/GameScene.js`, a small DOM helper with tests.

- When a life is lost (the leak branch that calls `economy.loseLife()`), pulse the HUD lives
  counter (`#stat-lives`'s `.hud-stat` parent) and flash a red inset glow on the game frame
  (`#game`), using CSS keyframe classes (`.life-lost-pulse`, ~450 ms). Restart the animation on
  repeated leaks (remove class, force reflow, re-add) — a tested pure-ish helper
  `pulseClass(el, cls)` in e.g. `src/ui/pulse.js`.
- Colour: art bible danger `#f07a7a`. Respect `prefers-reduced-motion` in CSS (fade only, no
  scale).
- No canvas objects, no allocation beyond the class toggle.
