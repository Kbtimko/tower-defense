# Entity Sprite Art — Prompts & Pipeline

Deferred-asset pipeline for backlog #8 sub-projects (b) enemies, (c) towers,
(d) heroes/soldiers/sentries. Mirrors `assets/overworld/PROMPTS.md` and
`assets/audio/PROMPTS.md`: the rendering infrastructure (sub-project (a)) is
already wired with a Graphics fallback, so dropping a PNG + adding one manifest
entry lights an entity up with no code change.

## How to add art (per entity, per state)

1. Produce a transparent PNG. For an animation, lay frames out left-to-right in
   a single row (a spritesheet); for a static look, a single frame is fine.
2. Save it under `assets/sprites/<category>/<type>_<state>.png`, e.g.
   `assets/sprites/enemies/drone_move.png`.
3. Add an entry to `src/data/sprites.js` `SPRITE_MANIFEST`:
   ```js
   {
     category: 'enemy', type: 'drone',
     scale: 1, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
     states: {
       move:  { path: 'assets/sprites/enemies/drone_move.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 10 },
       death: { path: 'assets/sprites/enemies/drone_death.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 12 },
     },
   }
   ```
   - `frames: 1` (or omitted) → loaded as a single image (no animation).
   - Looping states: `idle`, `move`. One-shot states: `attack`, `death`.
   - **One-shot states (`attack`/`death`) MUST be multi-frame (`frames > 1`).**
     A single-frame one-shot has no `animationcomplete` event, so the renderer
     would never revert it to the looping default — it would stay stuck on that
     frame. Use a looping state for any single-frame art.
   - The texture key is derived as `sprite-<category>-<type>-<state>` — never set it.

## Texture-key / state conventions

- Categories: `enemy`, `tower`, `hero`, `soldier`, `sentry`.
- States used by the wiring today: `idle`, `move`, `attack` (and `death`,
  reserved — see "Death animations" below).
- `baseFacing` is the direction the art faces at rest (`'right'` default); the
  renderer mirrors via `flipX` to face travel/target direction.
- Recommended frame size: size art so the on-screen footprint matches the
  current `def.radius` (enemies) / ~18px disc (towers) at `scale: 1`; adjust
  `scale` to fit.

## Needed art (placeholders for follow-up cycles)

### (b) Enemies — `assets/sprites/enemies/`
`drone`, `skitter`, `brute`, `phantom`, `titan`, `colossus` — `move` (looping)
required; `death` optional. Convey the alien silhouette each currently draws
(hex drone, diamond skitter, armored brute, ghostly phantom, layered titan).

### (c) Towers — `assets/sprites/towers/`
`archer`, `mage`, `cannon`, `ice`, `sniper`, `barracks` — `idle` + `attack`.
Tier-4 branch variants can use distinct `type` keys later if desired.

### (d) Heroes / Soldiers / Sentries
- Heroes — `assets/sprites/heroes/`: `rael`, `dax`, `vex`, `mira` — `idle`,
  `move`, `attack`.
- Soldier — `assets/sprites/soldiers/default_*.png` — `idle` (+ `attack`).
- Sentry — `assets/sprites/sentry/default_*.png` — `idle`, `attack`.

## Death animations (reserved)

The `death` state is supported by the manifest + `EntitySprite.playOnce`, but
sub-project (a) does NOT delay entity destruction to play it (that is a
combat-timing change). Wire the destroy-delay in the per-entity cycle that adds
death frames.
