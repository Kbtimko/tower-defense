# Entity Sprite Art — Prompts & Pipeline (SDXL)

Deferred-asset pipeline for backlog #8 sub-projects (b) enemies, (c) towers,
(d) heroes/soldiers/sentries. Mirrors `public/assets/overworld/PROMPTS.md` and
`public/assets/audio/PROMPTS.md`: the rendering infrastructure (sub-project (a)) is
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
2. Save it under `public/assets/sprites/<category>/<type>_<state>.png`, e.g.
   `public/assets/sprites/enemies/drone_move.png`. **It must live under `public/`**
   or Vite will not copy it into the production build (see the note at the end).
   The `path` in the manifest stays the site-root-relative URL
   (`assets/sprites/...`), not the on-disk path.
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

A raw txt2img run gives you N different creatures across N frames. Two ways to
stop that; **this repo uses the second.**

### What we actually do (implemented, reproducible)

Never have more than one creature. Generate a single on-model reference per
entity, then derive every frame from it by transform, so identity drift is
impossible **by construction** rather than merely constrained.

```
npm run art -- --kind sprite                  # 1 reference per entity -> .art-cache/
python3 scripts/build-sprite-sheets.py --all  # cutout -> mirror -> move + death sheets
npm run assets                                # confirm sizes match the manifest
```

1. **Reference.** `--kind sprite` reads the per-entity prompts below and writes
   one 1024×1024 frame per entity into a gitignored `.art-cache/sprites/`.
   Re-roll with `--seed` until one is on-model; only the reference is judged.
2. **Cut alpha.** `rembg` with **`isnet-general-use`** — that model excludes the
   ground shadow the generator draws despite being told not to. `u2net` keeps
   it as a translucent grey blob welded to the feet.
3. **Mirror.** The generator renders these creatures facing **left** whatever
   the prompt says, so the compositor flips to face right by default.
4. **Derive frames.** `move` is a squash-and-stretch bob with a counter-phased
   rock (flyers hover, no rock). `death` collapses — sink, flatten, tip — then
   crumbles under an eased coherent value-noise dissolve with a burning rim in
   the entity's emissive tint.
5. **Register.** One `SPRITE_MANIFEST` entry per entity; the texture key is
   derived, never set.

**The trade, stated plainly: limbs do not articulate.** At the footprint these
sprites occupy (drone 27px, titan 66px) a leg is 1–2px and a walk cycle is
sub-pixel noise, while frame-to-frame identity drift reads as obvious flicker.
Bob and dissolve are what carry at that size. If these ever render much larger,
revisit this.

### The IP-Adapter / ControlNet route (not used here)

The textbook answer is a reference → **IP-Adapter** or a per-character **LoRA**
→ **ControlNet** for the pose, in ComfyUI. We did not take it, for two reasons:

- **Nothing for it is installed.** Draw Things has only FLUX.1 [schnell]; there
  is no SDXL checkpoint, no ControlNet, no IP-Adapter and no ComfyUI. That is
  ~15GB of downloads plus an install.
- **ControlNet-OpenPose is trained on human skeletons** and is meaningless for
  a four-legged chitin drone or a hovering wraith. The motion-driving step of
  that pipeline does not apply to these creatures; depth ControlNet would need
  a per-frame depth source we do not have.

If entity art ever needs true articulation, this is the route — but budget the
downloads and expect to hand-author poses rather than lean on OpenPose.

### Model settings

The prompts below are written as SDXL-style comma-separated weighted tags. The
**installed** model is FLUX.1 [schnell], which is what `npm run art` drives:
4 steps, CFG 0, Euler a, 1024×1024. FLUX ignores `negative_prompt` at CFG 0, so
the shared negative prompt is advisory here — fold exclusions into the positive
prose instead. The SDXL settings above (DPM++ 2M Karras, 30–35 steps, CFG 6–7)
apply only if an SDXL checkpoint is installed later.

Check every generated frame for stray lettering before compositing; the
generator has a habit of rendering the game title into artwork.

---

## Needed art — per-entity prompts

Append the **shared style anchor** + **negative prompt** to each. Colors are the
in-game tints — keep the art tonally consistent so sprites match the procedural
fallback they replace.

### (b) Enemies — `public/assets/sprites/enemies/`  (faction: the Veth hive — alien biomech / chitin)

`move` (looping, ~6 frames) required; `death` (one-shot, ~5 frames, dissolve/
shatter) optional. Author facing right, moving right.

- **drone** — `Veth Drone`, hp 70, ground, tint `#33ff66`:
  ```
  small alien recon drone, hexagonal chitin carapace, single glowing green
  optic, four skittering biomech legs, toxic-green emissive accents
  ```
- **skitter** — `Veth Skitter`, fast, ground, tint `#ff6600`:
  ```
  one single living insectoid alien creature, lean wedge-shaped body of orange
  chitin plating, six thin scuttling spider legs, low forward charging stance,
  ember-orange emissive glow, an organic bug, not a turret or a machine
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
  one single ghostly flying alien creature, translucent violet organic body with
  long trailing wisp tendrils, faint glowing core, ethereal semi-transparent
  edges, airborne in mid-air with nothing touching the ground, a floating
  living wraith, not a monolith, not a tower, not a structure
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

- **archer** — `#8B4513` brown: `automated crossbow ballista turret emplacement, tall upright swivel mount, dark weathered iron and deep brown wood, taut bowstring, high contrast against pale ground, compact dark base disc`
- **mage** — `#6a0dad` purple: `arcane energy spire turret, floating violet crystal orb, glowing runic rings, purple magic emissive, metal base disc`
- **cannon** — `#666666` grey: `heavy artillery cannon turret, stubby thick grey barrel, riveted armor plating, recoil mount, base disc`
- **ice** — `#4a8fa8` teal: `cryo frost turret, glowing teal ice-crystal emitter, frosted condenser coils, pale-blue vapor, base disc`
- **sniper** — `#556b2f` olive: `long-barreled railgun sniper turret, slim olive-drab rail, targeting scope, sleek precise build, base disc`
- **barracks** — `#4caf50` green: `military barracks bunker, small reinforced green-walled structure with a rally flag on top, sandbag perimeter, deployment doorway, blank unmarked walls, no signage and no lettering anywhere, compact footprint on a round base disc` (static building, no `attack`)

### (d) Heroes / Soldiers / Sentries

Heroes are small full-body unit sprites (top-down 3/4), `idle` + `move`
(looping) + `attack` (one-shot). Match each hero's armor color so they read at a
glance; keep them clearly heroic vs. the enemy chitin.

- **rael** — `Commander Rael`, generalist bruiser — `assets/sprites/heroes/`:
  ```
  human Vanguard commander, navy-blue powered armor with cyan energy trim and
  gold accents, sidearm rifle, confident heroic stance, one single standing human character, full body, not a turret, not a building, not an emplacement
  ```
- **engineer** — `Engineer Dax`, support/builder:
  ```
  combat engineer, brown utility armor with copper-orange trim, hexagonal
  hardhat helmet, tool-rig backpack, wrench-rifle, one single standing human character, full body, not a turret, not a building, not an emplacement
  ```
- **scout** — `Scout Vex`, ranged anti-air:
  ```
  agile scout-ranger, dark-green hooded cloak with bright-green trim, light
  recon armor, energy longbow, nimble crouched-ready stance, one single standing human character, full body, not a turret, not a building, not an emplacement
  ```
- **pyro** — `Pyromancer Mira`, AoE burn:
  ```
  pyromancer soldier, dark-red armor with glowing ember trim, flamethrower
  gauntlet, intense fiery presence, one single standing human character, full body, standing on plain empty ground with nothing beneath him, no platform, no pedestal, no floating objects above the head, not a turret, not a building, not an emplacement
  ```
- **soldier** — `assets/sprites/soldiers/default_*.png`, `idle` (+ `attack`),
  barracks green `#4caf50`:
  ```
  small infantry trooper, green combat fatigues and helmet, compact rifle,
  guard stance, one single standing human character, full body, standing on plain empty ground with nothing beneath him, no platform, no pedestal, no bunker, not a turret, not a building, not an emplacement
  ```
- **sentry** — `assets/sprites/sentry/default_*.png`, `idle` + `attack`,
  engineer copper `#ff9933`:
  ```
  small deployable auto-turret, copper-orange armored dome, single swivel
  blaster barrel, tripod base, blinking sensor
  ```

## Death animations

**Wired.** `GameScene._fadeOutDeadEnemy` checks `enemy.hasDeathAnimation()`: an
entity with registered `death` art plays the one-shot and is destroyed on
`animationcomplete`; everything else keeps the 300ms alpha fade. So dropping
death frames in is still just art plus a manifest entry.

Two rules that bite:

- A one-shot **must** have `frames > 1`. A single-frame one-shot never fires
  `animationcomplete`, so the entity would never be destroyed.
- Make the **last frame fully dissolved**. The sprite is visible until the
  animation ends, so a final frame with pixels left in it pops out of existence.

## Why these live under `public/`

Vite copies **only** `publicDir` (`public/`) into the production build. Art kept in a
repo-root `assets/` directory is served by the dev server but is silently **absent from
`dist/`**, so it 404s on the deployed site while working perfectly on localhost. That is
exactly what happened to the map backdrops between 2026-06 and 2026-08. Save real asset
files under `public/assets/...`; the URLs the code requests (`assets/...` /
`/assets/...`) are unchanged.
