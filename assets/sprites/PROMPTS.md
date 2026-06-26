# Entity Sprite Art — Prompts & Pipeline (SDXL)

Deferred-asset pipeline for backlog #8 sub-projects (b) enemies, (c) towers,
(d) heroes/soldiers/sentries. Mirrors `assets/overworld/PROMPTS.md` and
`assets/audio/PROMPTS.md`: the rendering infrastructure (sub-project (a)) is
already wired with a Graphics fallback, so dropping a PNG + adding one manifest
entry lights an entity up with no code change.

> **Model:** these prompts target **SDXL 1.0** (OpenRAIL++ — commercial-OK),
> run locally via **Draw Things** (single frames) and **ComfyUI** (the
> consistency pipeline). SDXL wants **comma-separated weighted tags**, not
> DALL-E prose — that's why the prompts below read as tag lists. For the static
> portrait/overworld art we use FLUX.1 [schnell] instead (see those PROMPTS.md
> files); sprites stay on SDXL for its mature ControlNet / LoRA / IP-Adapter
> ecosystem, which is the only realistic way to hold a character consistent
> across animation frames.

## Recommended SDXL settings

- **Resolution:** generate at 1024×1024, downscale to the target frame size.
- **Sampler:** DPM++ 2M Karras · **Steps:** 30–35 · **CFG:** 6–7.
- **Seed:** lock a seed per character so re-rolls stay on-model.
- A **game-sprite / clean-vector LoRA** at ~0.6 weight sharpens the style; a
  per-character LoRA (below) locks identity across frames.

## Shared style anchor (paste into EVERY sprite prompt for cohesion)

```
(top-down 3/4 game sprite:1.2), sci-fi tower-defense unit, clean
vector-painterly shading, bold readable silhouette, rim light, centered,
plain flat background, no ground shadow, no text, high detail
```

## Shared negative prompt (use for ALL sprites)

```
photo, photorealistic, realistic skin, busy background, scenery, multiple
subjects, text, watermark, signature, logo, frame, border, drop shadow,
ground shadow, motion blur, blurry, lowres, jpeg artifacts, cropped, cut off,
extra limbs, deformed, side view, front portrait view
```

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
  renderer mirrors via `flipX` to face travel/target direction. **Author all
  sprites facing RIGHT** so `flipX` reads correctly.
- Recommended frame size: size art so the on-screen footprint matches the
  current `def.radius` (enemies) / ~18px disc (towers) at `scale: 1`; adjust
  `scale` to fit.

---

## Consistency pipeline (the hard part — read before doing animations)

A raw txt2img run gives you N different creatures across N frames. To hold a
character identical across an animation, build this once per character in
**ComfyUI**:

1. **Lock a reference.** Generate single frames until one is on-model; save it +
   its seed.
2. **Pin identity.** Either feed the reference through **IP-Adapter
   (reference-only)** on every frame, **or** train a tiny **per-character LoRA**
   on 8–15 crops of the reference (most reliable for a commercial bar).
3. **Drive the motion.** Use **ControlNet OpenPose / depth** to pose each frame
   (walk cycle, attack swing) while IP-Adapter/LoRA keeps the look fixed.
4. **Cut out the background.** Run each frame through `rembg` (or Draw Things'
   subject-extract) for clean alpha.
5. **Assemble the sheet.** Composite frames left-to-right at a fixed cell size
   into one PNG; the cell size is your `frameWidth`/`frameHeight`.

Static, single-frame entities (a tower `idle`) skip steps 2–3 entirely — they're
the easy wins. Do those first.

---

## Needed art — per-entity prompts

Append the **shared style anchor** + **negative prompt** to each. Colors are the
in-game tints — keep the art tonally consistent so sprites match the procedural
fallback they replace.

### (b) Enemies — `assets/sprites/enemies/`  (faction: the Veth hive — alien biomech / chitin)

`move` (looping, ~6 frames) required; `death` (one-shot, ~5 frames, dissolve/
shatter) optional. Author facing right, moving right.

- **drone** — `Veth Drone`, hp 70, ground, tint `#33ff66`:
  ```
  small alien recon drone, hexagonal chitin carapace, single glowing green
  optic, four skittering biomech legs, toxic-green emissive accents
  ```
- **skitter** — `Veth Skitter`, fast, ground, tint `#ff6600`:
  ```
  fast insectoid skirmisher, sharp diamond-shaped body, orange chitin plating,
  many thin scuttling legs, aggressive lean-forward stance, ember-orange glow
  ```
- **brute** — `Veth Brute`, armored, ground, tint `#667766`:
  ```
  heavy armored alien brute, thick grey-green plated carapace, hunched bulky
  shoulders, dense exoskeleton armor, slow heavy gait, dull metallic sheen
  ```
- **colossus** — `Veth Colossus`, big & armored, ground, tint `#880044`:
  ```
  massive armored alien beast, layered dark-magenta chitin plates, hulking
  quadruped, segmented spine ridge, crimson bio-luminescent seams, imposing
  ```
- **phantom** — `Veth Phantom`, flying, fast, tint `#9b59b6`:
  ```
  ghostly flying alien wraith, translucent violet body, trailing wisp tendrils,
  faint glowing core, ethereal semi-transparent edges, hovering, weightless
  ```
- **titan** — `Veth Titan` (boss), huge & armored, tint `#e74c3c`:
  ```
  colossal alien boss titan, towering layered red-chitin armor, multiple glowing
  red eyes, jagged crown of spines, menacing hive-overlord presence, epic scale
  ```

### (c) Towers — `assets/sprites/towers/`

`idle` (looping or static) + `attack` (one-shot, ~4–5 frames: the firing beat).
Towers are static emplacements viewed top-down 3/4 — author the muzzle/business
end facing right.

- **archer** — `#8B4513` brown: `automated crossbow / ballista turret emplacement, weathered brown metal and wood, taut bowstring, swivel mount on a base disc`
- **mage** — `#6a0dad` purple: `arcane energy spire turret, floating violet crystal orb, glowing runic rings, purple magic emissive, metal base disc`
- **cannon** — `#666666` grey: `heavy artillery cannon turret, stubby thick grey barrel, riveted armor plating, recoil mount, base disc`
- **ice** — `#4a8fa8` teal: `cryo frost turret, glowing teal ice-crystal emitter, frosted condenser coils, pale-blue vapor, base disc`
- **sniper** — `#556b2f` olive: `long-barreled railgun sniper turret, slim olive-drab rail, targeting scope, sleek precise build, base disc`
- **barracks** — `#4caf50` green: `military barracks structure, small reinforced bunker with a rally flag, green field markings, sandbag perimeter, deployment doorway` (static building, no `attack`)

### (d) Heroes / Soldiers / Sentries

Heroes are small full-body unit sprites (top-down 3/4), `idle` + `move`
(looping) + `attack` (one-shot). Match each hero's armor color so they read at a
glance; keep them clearly heroic vs. the enemy chitin.

- **rael** — `Commander Rael`, generalist bruiser — `assets/sprites/heroes/`:
  ```
  human Vanguard commander, navy-blue powered armor with cyan energy trim and
  gold accents, sidearm rifle, confident heroic stance
  ```
- **dax** — `Engineer Dax`, support/builder:
  ```
  combat engineer, brown utility armor with copper-orange trim, hexagonal
  hardhat helmet, tool-rig backpack, wrench-rifle
  ```
- **vex** — `Scout Vex`, ranged anti-air:
  ```
  agile scout-ranger, dark-green hooded cloak with bright-green trim, light
  recon armor, energy longbow, nimble crouched-ready stance
  ```
- **mira** — `Pyromancer Mira`, AoE burn:
  ```
  pyromancer soldier, dark-red armor with glowing ember trim, flamethrower
  gauntlet, small flame above shoulder, intense fiery presence
  ```
- **soldier** — `assets/sprites/soldiers/default_*.png`, `idle` (+ `attack`),
  barracks green `#4caf50`:
  ```
  small infantry trooper, green combat fatigues and helmet, compact rifle,
  guard stance
  ```
- **sentry** — `assets/sprites/sentry/default_*.png`, `idle` + `attack`,
  engineer copper `#ff9933`:
  ```
  small deployable auto-turret, copper-orange armored dome, single swivel
  blaster barrel, tripod base, blinking sensor
  ```

## Death animations (reserved)

The `death` state is supported by the manifest + `EntitySprite.playOnce`, but
sub-project (a) does NOT delay entity destruction to play it (that is a
combat-timing change). Wire the destroy-delay in the per-entity cycle that adds
death frames.
