Project: "Last Light" — Phaser 3 / Vite / Vitest tower defense at
~/projects/tower-defense. Read .claude/notes.md first.

State: main is the Vercel PRODUCTION branch. 938 tests passing, build clean.
All 23 image assets (10 backdrops, 10 overworld nodes, 3 portraits) ship and
serve 200 in production. Entity sprite art is the ONLY art category still
empty — `SPRITE_MANIFEST` in src/data/sprites.js is `[]`, so every entity
currently draws itself with Phaser Graphics.

TASK — backlog #8(b): produce and register enemy sprite art for all six Veth
enemies (drone, skitter, brute, colossus, phantom, titan).

DO THIS AS A SPIKE FIRST. Generate ONE enemy (drone) end to end — art,
manifest entry, running in the browser — then STOP and show me the result
before touching the other five. Multi-frame character consistency is the
unsolved problem here, and if it does not hold for one drone it will not hold
for six. Do not batch-generate six enemies on the assumption it works.

Why this is the hard one: the 23 assets already shipping are single images,
where a re-roll that looks good is done. A `move` animation needs the SAME
creature across ~6 frames. A raw txt2img run gives six different creatures.
public/assets/sprites/PROMPTS.md documents the pipeline that solves this
(reference frame -> IP-Adapter or a per-character LoRA -> ControlNet for the
pose -> rembg for alpha -> composite the row). Read it before generating
anything; it also holds the per-enemy prompts, the shared style anchor and the
shared negative prompt, all written for SDXL, not FLUX.

Where things live:
  src/data/sprites.js            SPRITE_MANIFEST (ships empty) + getSpriteConfig
  src/systems/spriteKeys.js      pure key derivation, sprite-<category>-<type>-<state>
  src/systems/EntitySprite.js    Sprite when art is registered, else Graphics fallback
  src/scenes/BootScene.js:46-71  404-tolerant loader -> registry.spriteKeys
  src/entities/Enemy.js:37       category 'enemy', type def.type, initialState 'move'
  src/data/enemies.js            hp/speed/radius/color/flying per enemy
  public/assets/sprites/PROMPTS.md  the pipeline + every per-entity prompt
  src/assets/assetManifest.js    derives expected assets FROM the manifest
  scripts/generate-art.mjs       npm run art — Draw Things HTTP batch generator

Scope — what the code actually drives today:
  * Enemies only ever use the `move` state. Six `move` spritesheets IS the
    deliverable. Nothing calls setState('death') for an enemy.
  * `death` is a RESERVED state: GameScene._fadeOutDeadEnemy currently tweens
    alpha and destroys. If you produce death frames, wiring the destroy-delay
    so the animation can finish is a real code change and needs its own tests —
    treat it as optional and tell me before starting it, don't fold it in
    silently.
  * Do not touch the Graphics fallback. It must still work for any entity
    whose art is absent; that is the whole point of the deferred-asset pattern.

Hard constraints:
  1. Art MUST live under public/assets/sprites/enemies/. Vite copies ONLY
     public/ into dist/ — anywhere else works on the dev server and 404s in
     production. The manifest `path` stays site-root-relative
     ('assets/sprites/enemies/drone_move.png'), NOT the on-disk path.
  2. Author every sprite facing RIGHT. The renderer mirrors with flipX.
  3. Never set a texture key; it is derived. One manifest entry + the PNG is
     the entire code change per enemy.
  4. A one-shot state (attack/death) MUST have frames > 1 — a single-frame
     one-shot never fires animationcomplete and sticks. Looping states
     (idle/move) are fine at any frame count.
  5. Size each frame so the on-screen footprint matches that enemy's
     def.radius at scale 1 (drone 9, skitter 7, brute 11, colossus 16,
     phantom 9, titan 22); use `scale` to fine-tune rather than re-exporting.
  6. `npm run art` does NOT support sprites — src/assets/promptParser.js only
     parses the overworld and portrait sections. Either extend the parser and
     generator for single-frame sprite work, or drive ComfyUI manually for the
     animation pipeline. If you extend the script, that is a code change with
     tests, and say so in the PR.

Success criteria:
  1. Spike gate: drone `move` on screen in the running game, and my go-ahead,
     before the other five.
  2. All six enemies have a `move` spritesheet + a SPRITE_MANIFEST entry.
  3. `npm run assets` reports the new sprites present and correctly sized
     (it derives what it expects from the manifest, so entries make them
     appear automatically — expect 29/29).
  4. Full suite green (938+); npm run build clean.
  5. Browser-verified against the PRODUCTION build (npm run build &&
     npm run preview, NOT the dev server) on at least two maps, including one
     with phantoms so a flyer is covered. Confirm sprites face travel
     direction and the Graphics fallback still renders for towers/heroes.
  6. One PR into main. Never push to main directly — it auto-deploys.

Judgement calls that are mine, not yours: whether a sprite is on-model enough
to ship, and whether to spend the extra effort on death animations. Show me
the art and recommend; do not decide by shipping.

Gotchas worth not rediscovering (all in .claude/notes.md and the PROMPTS.md files):
  - Draw Things must run its API server in HTTP mode, not gRPC; the port is
    auto-discovered by scripts/generate-art.mjs (--port overrides).
  - SDXL settings for sprites are CFG 6-7 / 30-35 steps / DPM++ 2M Karras.
    The CFG-0 rule you may remember is a FLUX quirk and does NOT apply here.
  - Generate at 1024x1024 and downscale; keep an eye on the 24GB memory ceiling.
  - rembg installs with pip3, not pip, and the extras glob needs quoting:
    pip3 install 'rembg[cli]'.
  - Never infer the deploy target from origin/HEAD — main is production,
    verified via the deployments API.
  - FLUX liked to render the game title into artwork; check generated frames
    for stray text before compositing.
