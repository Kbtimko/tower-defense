# Entity Sprite-Rendering Infrastructure (Backlog #8, sub-project a)

**Date:** 2026-06-24
**Backlog item:** #8 — Production-quality entity art (sub-project **(a)**: rendering infrastructure)
**Branch:** off `origin/feature/phase-3-tower-system`; PR targets `feature/phase-3-tower-system`

## Context & decomposition

Backlog #8 replaces the procedurally-drawn vector entities (towers, enemies, heroes,
soldiers, sentries, projectiles) with real sprite art. It is too large for one spec and
decomposes into four sub-projects, each its own spec → plan → implementation → PR:

- **(a) sprite-rendering infrastructure** ← *this spec.* The asset pipeline + the
  `Graphics`→`Sprite` render path, shipped behind a fallback so it works with **zero art
  committed**.
- **(b) enemies**, **(c) towers**, **(d) heroes/soldiers/sentries** ← follow-up backlog
  items. With (a) merged, each becomes "produce the art + add manifest entries + tune
  anchor/scale/animation," with no further infrastructure work.

This spec covers **(a) only**.

## Problem — two overlapping render paths

Investigation (code read + live browser probe on map 0) found entities are rendered
**twice** today:

1. **Entity Containers (the intended path).** Every entity already extends
   `Phaser.GameObjects.Container` and draws itself with an internal `Graphics`, moving via
   `x`/`y`:
   - `Tower` (depth 2) — `_bg` disc + `_icon` emoji text + `_rangeRing` (`src/entities/Tower.js`)
   - `Enemy` (depth 3) — `_body` alien shape (hex/diamond/etc.) + `_hpBar` (`src/entities/Enemy.js`)
   - `Soldier` (depth 3) — `_body` + `_hpBar` (`src/entities/Soldier.js`)
   - `Hero` (depth 4) — `_body` via `def.draw()` + `_hpBar` (`src/entities/Hero.js`)
   - `SentryTurret` (depth 3) — `_body` (`src/entities/SentryTurret.js`)
   - `Projectile` (depth 4) — `dot` (`src/entities/Projectile.js`)
2. **Immediate-mode `GameScene.gfx` (depth 30).** Every frame, `update()` also runs
   `_drawTowers`/`_drawEnemies`/`_drawProjectiles` (`src/scenes/GameScene.js:320-322`,
   methods at `:1346`,`:1357`,`:1376`), redrawing flat circles **on top of** the
   containers.

Live confirmation: one enemy's `_body` held 156 draw commands (depth 3) **and** the shared
`gfx` held 2 959 commands (depth 30) in the same frame. Because `gfx` is depth 30, its flat
circles are the layer the player actually sees for enemies/towers/projectiles; the richer
container drawings underneath are occluded (e.g. the `Tower` `🏹` icon is hidden under the
gfx disc). Heroes/soldiers/sentries render **only** via their containers (no gfx
duplicate), proving the container path is live and sufficient.

Sprites placed inside the containers (depth 2–4) would be hidden under the depth-30 gfx
circles, so consolidating to a single path is a prerequisite, not an optional cleanup.

## Goal

Ship the rendering infrastructure now, behind a fallback, so it works before any sprite
exists (mirroring the deferred-asset convention of PR #37 overworld art, PR #38 SFX, PR #40
portraits):

- A declarative **sprite manifest** + a **404-tolerant loader**.
- A **pure key resolver** (no Phaser import, fully unit-testable), shaped like
  `src/systems/sfxKeys.js` / `src/systems/portraitFallback.js`.
- A reusable **`EntitySprite` component** that shows a `Phaser.GameObjects.Sprite` when the
  entity's keys are registered, and otherwise leaves the entity's existing `Graphics`
  drawing in place (the fallback).
- **Consolidation to one render path** — remove the redundant depth-30 gfx entity draws so
  the entity Containers are the single source of truth.

When a real PNG later lands, lighting up an entity costs **one declarative manifest entry
plus the PNG** — no logic change. (Spritesheets require frame dimensions, which are
art-dependent, so a one-line data entry in `src/data/` is the irreducible minimum; this
still honors "tunables live in `src/data/`.")

### Animation model

Per decision, the infra supports **state-driven spritesheet animation** from day one:
states `idle` / `move` / `attack` / `death`. Entities call `setState(...)` at the
appropriate moments in (a) (harmless no-ops without art); animations play automatically
once art is registered.

## Design

### 1. Sprite manifest — `src/data/sprites.js`

Declarative data, no Phaser import. Starts **empty** (no art committed in this PR), with a
documented shape and a commented example removed before merge.

```js
// Each entry describes one entity category+type and its per-state art.
// A state is either a single image { path } or a spritesheet
// { path, frameWidth, frameHeight, frames, frameRate, repeat }.
// `key` is DERIVED, not stored — see spriteKeys.js (sprite-<category>-<type>-<state>).
export const SPRITE_MANIFEST = [
  // {
  //   category: 'enemy', type: 'drone',
  //   scale: 1, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
  //   states: {
  //     move:  { path: 'assets/sprites/enemies/drone_move.png',
  //              frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 10, repeat: -1 },
  //     death: { path: 'assets/sprites/enemies/drone_death.png',
  //              frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 12, repeat: 0 },
  //   },
  // },
];
```

Per-entity render tuning (`scale`, `anchor`, `baseFacing`) lives here so (b)/(c)/(d) tune
art without touching code.

### 2. Pure resolver — `src/systems/spriteKeys.js`

No Phaser import. Mirrors `sfxKeys.js`: the caller passes the set of registered texture
keys, so the module is dependency-free and unit-testable.

```js
export function spriteTextureKey(category, type, state) {
  return `sprite-${category}-${type}-${state}`;
}

// Returns the registered key for the requested state, or null (the fallback signal).
export function entitySpriteKey(category, type, state, registeredKeys) {
  const key = spriteTextureKey(category, type, state);
  return registeredKeys.includes(key) ? key : null;
}

// Convenience: which states (of a requested list) are registered for this entity.
export function registeredStates(category, type, states, registeredKeys) {
  return states.filter(st => entitySpriteKey(category, type, st, registeredKeys) !== null);
}
```

Total functions: any unknown/missing input resolves to `null` (→ Graphics fallback).

### 3. Loader + registry — `BootScene`

`BootScene.preload` already loads map backdrops 404-tolerantly ("Missing files log a 404 but
don't crash"). Extend it:

- Iterate `SPRITE_MANIFEST`; for each state, derive the key via `spriteTextureKey(...)` and
  call `this.load.spritesheet(key, path, { frameWidth, frameHeight })` (spritesheet states)
  or `this.load.image(key, path)` (single-image states). Missing files 404 harmlessly.
- In `create()`, build the **registered set**: `SPRITE_MANIFEST` states whose
  `this.textures.exists(key)` is true. Store it on the registry:
  `this.game.registry.set('spriteKeys', registeredKeys)`.

With an empty manifest the registered set is `[]` and every resolver call returns `null`.

### 4. Sprite component — `src/systems/EntitySprite.js`

A small class attached to an entity container. Thin Phaser wrapper around the pure resolver;
holds no game logic.

- **Construct** `new EntitySprite(container, scene, { category, type, manifestEntry, registeredKeys })`:
  - Resolve which states are registered. If **none** → create nothing; `active === false`;
    the entity's existing `Graphics` body stays visible (fallback). 
  - If some are registered → add a child `Phaser.GameObjects.Sprite` to the container at the
    tuned anchor/scale; register each spritesheet animation once, guarded by
    `scene.anims.exists(animKey)` (idempotent across many entities of the same type); set
    the initial state; `active === true`. The entity hides its `Graphics` body
    (`_body.setVisible(false)` / equivalent).
- **API** (all no-ops when `!active`):
  - `setState(name)` — switch looping animation / static frame; ignores unregistered states.
  - `playOnce(name, onComplete)` — for `death`; falls through to `onComplete()` immediately
    when `!active` or the state is unregistered (preserves current destroy timing).
  - `setFacing(dirX)` — `setFlipX` relative to `baseFacing`.
  - `destroy()` — tears down the sprite child.

Entities read the registered set from `scene.game.registry.get('spriteKeys') ?? []`.

### 5. Per-entity wiring + render-path consolidation

For each entity, (1) split its draw into **body** (replaceable by the sprite) vs.
**overlays** (`_hpBar`, status/range/selection rings — stay `Graphics`, drawn over sprite or
fallback alike), (2) own an `EntitySprite`, (3) call `setState`/`setFacing` at the right
moments. Then **delete the matching gfx draw** in `GameScene`.

| Entity | Body → sprite fallback | States wired in (a) | Overlays kept as Graphics |
|--------|------------------------|----------------------|----------------------------|
| `Enemy` | `_redrawBody` shape | `move` (always travelling), `death` (immediate today — see §6) | `_hpBar`, slow/stun rings (extracted to `_drawStatusOverlay`) |
| `Tower` | `_bg` + `_icon` | `idle`, `attack` (on fire) | `_rangeRing`, selection ring |
| `Hero` | `def.draw(_body)` | `idle`, `move`, `attack` | `_hpBar` |
| `Soldier` | `_drawBody` | `idle`, `attack` | `_hpBar` |
| `SentryTurret` | `_drawBody` | `idle`, `attack` | — |
| `Projectile` | `dot` | `idle` | — |

`GameScene` changes:
- Remove `_drawTowers`, `_drawEnemies`, `_drawProjectiles` methods and their calls in
  `update()` (`:320-322`).
- **Keep** `gfx` and `_drawPath`, `_drawZones`, `_drawParticles` — path, build zones, and
  particles are not entity art and remain immediate-mode.
- The status/slow/stun ring logic currently inside `Enemy._redrawBody` moves to a dedicated
  overlay graphic so it composes over either a sprite or the fallback shape.

### 6. Behavior preservation (explicitly unchanged in (a))

- **Death timing is NOT changed.** Entities still `destroy()` immediately on death with the
  existing particle burst. `EntitySprite.playOnce('death', cb)` exists in the API but, with
  no art, calls `cb()` synchronously — identical timing. Wiring a real "delay destroy until
  the death animation finishes" is a **combat-timing change** (a dead-but-onscreen enemy
  could affect targeting/blocking) and is **out of scope for (a)** — it belongs to the
  per-entity art cycle that introduces the death frames.
- **Not pixel-identical, by design.** Removing the depth-30 gfx draws makes each entity's
  own container drawing the visible fallback: towers gain their `🏹`-style icons (currently
  masked by the gfx disc) and enemies show their alien hex/diamond shapes instead of flat
  circles. These are net-positive and were the originally intended visuals; browser
  verification confirms they look correct, rather than asserting pixel parity.

### 7. Scaffolding for (b)/(c)/(d) — `assets/sprites/PROMPTS.md`

A new prompts doc (mirroring `assets/overworld/PROMPTS.md`, `assets/audio/PROMPTS.md`)
documenting: the manifest entry shape, the `sprite-<category>-<type>-<state>` key
convention, frame/state conventions (idle/move/attack/death; transparent PNG; recommended
frame size and origin), and per-category placeholder lists for enemies/towers/heroes so the
follow-up cycles are pure art-drop + tuning. A one-line pointer is added wherever asset
docs are indexed (e.g. alongside the existing PROMPTS docs).

## Testing

### Unit
- `src/systems/spriteKeys.test.js` — `spriteTextureKey` shape; `entitySpriteKey` returns the
  key when registered and `null` when not / when `registeredKeys` is empty; `registeredStates`
  filters correctly.
- `src/data/sprites.test.js` — manifest is a well-formed array; every entry (when present)
  has `category`/`type`/`states`, and each spritesheet state carries
  `frameWidth`/`frameHeight`/`frames`. (Passes trivially while empty; guards future entries.)
- `EntitySprite` behavior with a mocked scene (per `jsdom + Phaser mock` memory — `vi.mock`
  Phaser): with empty `registeredKeys` → `active === false`, creates no sprite, leaves the
  body visible, `setState`/`setFacing` are no-ops, `playOnce` calls back synchronously; with
  a registered key (faked `registeredKeys` + faked texture) → `active === true`, hides the
  body, registers an animation once.
- Entity tests (`Enemy.test.js`, etc.) updated for the body/overlay split — status-effect
  ring assertions move to the overlay path; existing combat/HP behavior unchanged.

### Suite + build
- Full `npx vitest run` green (no regressions; ~786 baseline on the deploy line).
- `npm run build` clean.

### Browser verification (project Definition of Done)
- **Fallback parity:** with the empty manifest, load map 0, build towers, run a wave.
  Confirm via the live `gfx.commandBuffer.length` probe that entity draws are gone from
  `gfx` (only path/zones/particles remain) and that towers now show their icons and enemies
  their alien shapes — i.e. single-source rendering, no double-draw, no missing entities.
- **Light-up proof:** temporarily add one throwaway manifest entry + a small test
  spritesheet PNG for a single enemy type; confirm the real animated sprite renders in place
  of the fallback with **no logic change**; then revert the throwaway entry/PNG before merge.
- Verify on 2–3 representative themed maps that the consolidated fallback looks correct
  (desert, station/space, organic).

## Out of scope (for (a))
- Producing/committing any real sprite art (that is sub-projects (b)/(c)/(d)).
- Death-animation destroy-delay / any combat-timing change (deferred to the per-entity art
  cycle that adds death frames).
- Particle, path, and build-zone rendering — these stay immediate-mode `gfx`.
- Directional (up/down) sprites beyond horizontal `flipX` facing — left as a later
  enhancement if specific art needs it.
```
