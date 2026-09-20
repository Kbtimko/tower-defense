# Tower + Hero/Soldier/Sentry Sprite Art — Design

Backlog **#8(c)** (towers) and **#8(d)** (heroes/soldiers/sentries), the last two
sub-projects of "Production-quality entity art". Sub-project (a) shipped the
rendering infrastructure (PR #42) and (b) shipped all six enemies (PR #56); this
finishes the remaining 12 entities.

Base: `origin/main` @ `1ae069a` (merge of PR #56).

## Goal

Every entity in the game renders as real sprite art rather than a Graphics
primitive. After this item the Graphics fallback is dead in practice for all 18
entities, though it stays in the code as the deferred-asset safety net.

## Scope

12 generated references producing **27 sheets**:

| Category | Entities | States | Sheets |
|---|---|---|---|
| `tower` | archer, mage, cannon, ice, sniper, barracks | `idle` (static) + `attack` (barracks: idle only) | 6 + 5 = 11 |
| `hero` | rael, engineer, scout, pyro | `idle` + `move` + `attack` | 12 |
| `soldier` | default | `idle` + `attack` | 2 |
| `sentry` | default | `idle` + `attack` | 2 |

**Out of scope:** `death` art for heroes/soldiers/sentries. The reserved
death-state destroy-delay wiring stays untouched. Soldiers die and respawn
continuously, so a per-death dissolve would clutter the board for no gain, and
the hero's death already reads through its respawn timer.

## Decisions taken

Three forks were put to the maintainer and settled before this spec:

1. **Tower facing — `flipX` toward the target.** Towers reuse the same
   left/right mirror the enemies and hero already use. Rotation was rejected:
   the art is authored top-down 3/4 with a base disc, and rotating it tilts the
   base out of perspective.
2. **Tower tier — keep `_bg` as a tier-only ring.** Tier is currently encoded
   *only* in the `_bg` stroke width, and `_bg` is hidden once sprite art is
   active, so the art drop would otherwise make tier invisible on the board.
3. **State coverage — core states, no death art.** As tabled above.

## Two ID mismatches that must be fixed first

`getSpriteConfig(category, type)` matches on the entity's runtime `type`. Three
hero bullets and both unit bullets in `PROMPTS.md` use names that are **not**
the runtime ids, so art generated under those names would parse, composite,
register — and never render, silently falling back to Graphics.

| `PROMPTS.md` bullet | Runtime `type` | Source |
|---|---|---|
| `dax` | `engineer` | `HEROES` keys in `src/data/heroes.js` |
| `vex` | `scout` | ″ |
| `mira` | `pyro` | ″ |
| `soldier` | `default` | `Soldier.js:33` |
| `sentry` | `default` | `SentryTurret.js:26` |

`rael` and all six tower ids already match.

**Fix:**

- Rename the three hero bullets to `engineer` / `scout` / `pyro`. The bullet
  name *is* the type the parser emits, so renaming makes the reference filename,
  the manifest `type` and the texture key agree end to end. Keep the character
  names (Engineer Dax, Scout Vex, Pyromancer Mira) in the prose — the art brief
  is unchanged, only the key.
- Change `parseSpritePrompts`' existing soldier/sentry special case to emit
  `type: 'default'` while keeping `category: 'soldier'` / `'sentry'`. Chosen over
  renaming the entities' `type` because it touches one branch in the parser
  instead of two entities and their tests.

Both are covered by regression tests asserting that every type
`parseSpritePrompts` emits is a type some entity actually constructs.

## Prompt phrasing

The shared style anchor says "sci-fi tower-defense **unit**", which biases the
generator toward emplacements. For enemies that was the bug — skitter came back
a turret, phantom a monolith — and the fix was saying "living creature"
explicitly.

For **towers the bias is correct** and the anchor is left alone.

For **heroes and the soldier the bias is wrong** in the same way it was for the
creatures, and the prompts get the same treatment: each says "a single standing
human soldier / full-body character, not a turret, not a building, not an
emplacement". The **sentry** is a deployable auto-turret, so it keeps the
emplacement bias like the towers.

## Compositor changes (`scripts/build-sprite-sheets.py`)

The script is currently enemy-only in three places — it globs `enemy_*.png`,
hardcodes `OUT_DIR` to `sprites/enemies`, and its `TINTS` table only covers the
six enemies — and it only knows how to build `move` and `death`. It becomes
category-aware and gains two transforms.

**Routing.** Glob `*_*.png` and split the stem into `category_type`. Output
directory per category, exactly as `PROMPTS.md` documents: `towers/`, `heroes/`,
`soldiers/`, `sentry/`, `enemies/`. Which states get built is a per-category
table, so rebuilding the enemies produces byte-identical `move`/`death` sheets.

**`build_idle_static`** (towers) — one cell, centred, no animation. Emplacements
do not breathe, and `frames: 1` is handled by `EntitySprite.setState` via
`setTexture`. A static state is a legal default to revert to after a one-shot.

**`build_idle_breathe`** (hero/soldier/sentry) — a small squash-and-stretch with
no rock and no bob. This is `build_move` with the rock and bob near zero; it
shares the same code path rather than duplicating it.

**`build_attack`** (towers/hero/soldier/sentry) — a 5-frame recoil beat: kick
back on frame 1, lunge forward on frame 2 with a brightness flash in the
entity's tint, settle over frames 3–5. **The last frame must equal the rest
pose** so the automatic revert to `idle` does not visibly jump.

**`build_move`** (heroes only, of the new entities) — unchanged; heroes walk the
path, so the existing bob-and-rock gait is right.

`TINTS` gains the six `TOWER_DEFS[].color` values and the four hero
`strokeColor`s, so the attack flash matches each entity's established colour.

**Mirroring.** Enemies always came back facing left, so the compositor mirrors by
default. Whether that holds for turrets and humans is not knowable in advance —
each reference is inspected and `--no-mirror` passed where it already faces
right. All output is authored facing right, as `flipX` requires.

## Code changes

Four small changes, each with a failing test first.

1. **`Tower._redraw`** — when `this._sprite.active`, draw the tier stroke without
   the dark fill circle, and stop hiding `_bg`. The sprite is added at index 0 by
   `EntitySprite`, so it already renders above the ring. `_icon` stays hidden.
   Tier stroke widths `[1.5, 2, 3, 4]` are unchanged.
2. **`GameScene._updateTowers`** — call `tower._sprite?.setFacing(best.x - tower.x)`
   immediately before the existing `setState('attack')` at the fire site.
   No deadzone: a tower's target jumps between discrete enemies rather than
   tracking a continuous path, so the enemy-path backtrack problem that made
   `facing.js` necessary does not arise here.
3. **`Soldier`** — call `setState('attack')` where the soldier deals damage.
   Sentries and heroes already do this; the soldier is the only entity whose
   attack state is wired to nothing.
4. **`SPRITE_MANIFEST`** — 12 new entries. `scale` is set from the measured
   silhouette width against the footprint the entity's Graphics body occupies
   (tower disc r=18, sentry r=7, soldier ~14px tall, heroes per `def.draw`), not
   chosen by eye — the rule that came out of the titan sitting 24px wide inside
   a 64px cell.

## Cell sizes

Per the hard-won rule that the cell scales with the subject, not the other way
round: towers and heroes at **64px**, soldier and sentry at **48px** (both are
markedly smaller than any enemy). Set `scale` from the measured silhouette.

## Testing

- **Parser:** every `(category, type)` pair `parseSpritePrompts` emits resolves to
  an entity type the game constructs — the regression test for the `dax`/`engineer`
  class of bug. Plus the existing no-baked-text assertions.
- **Compositor:** category → output-directory and category → state-set routing;
  the rebuilt enemy sheets are byte-identical to the committed ones.
- **`Tower`:** tier ring visible and stroke width tracks level when sprite art is
  active; `_icon` hidden.
- **`GameScene`:** the fire site calls `setFacing` with the sign of the target
  delta before `setState('attack')`.
- **`Soldier`:** attacking enters the `attack` state.
- **Manifest:** `npm run assets` — every declared path exists at the declared
  frame size, and every `attack` state has `frames > 1`.
- **Full suite** green (968 tests today).

## Verification

A green suite is not the definition of done here; the last three art items all
had failures a test could not see.

- `npm run build && npm run preview` — the **production** build, never the dev
  server. Art outside `public/` is silently dropped from `dist/`.
- In the browser: place each of the six towers and confirm the sprite renders,
  the tier ring is visible and thickens on upgrade, the tower mirrors toward a
  target on the far side, and the attack beat returns cleanly to idle.
- Confirm each of the four heroes renders and plays idle / move / attack, a
  barracks soldier renders and plays its attack, and an engineer sentry renders.
- Confirm no entity is stuck on an attack frame — the failure mode a
  single-frame one-shot produces.

## Risks

- **Machine limits.** FLUX-schnell q8p is 12.3 GB resident on a 24 GB machine;
  generating with Chrome open exhausted swap and wedged Draw Things twice.
  Generate in small batches with the browser closed.
- **References are gitignored.** `.art-cache/sprites/` is not committed, and
  re-running generation yields *different* subjects. The committed PNGs are the
  source of truth; only regenerate an entity being replaced wholesale.
- **Humans are harder than creatures.** Diffusion models mangle faces and hands
  at small sizes far more visibly than they mangle chitin. At a 64px cell this
  mostly disappears, but expect more re-rolls per hero than per enemy.

## Not doing

- Articulated limbs. Every frame is the same reference pixels under a transform,
  so identity drift is impossible by construction and articulation is impossible
  for the same reason. At these footprints a limb is 1–2px; drift would read as
  flicker, a missing walk cycle does not.
- Tower rotation, per decision 1.
- Death art or death wiring for heroes/soldiers/sentries.
- Retuning `maps.js`. The map-7 difficulty cliff is accepted as intentional
  (backlog #12); nothing here touches balance.
