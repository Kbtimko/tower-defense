# Background Image Prompts

All 10 map backgrounds are AI-generated. Primary tool: **ChatGPT Plus (DALL-E 3)**. Midjourney v6+ acceptable as a portable alternative. The style prefix and per-map content below are tool-agnostic; only the per-tool parameters differ.

---

## Locked style prefix

Use this as the opening of every prompt to enforce visual consistency across the 10 maps.

> `Top-down view, painted concept art for a tower defense game, Kingdom Rush style, layered atmospheric depth, dramatic lighting, vibrant illustrated palette, high detail, empty terrain ready for path overlay. Do NOT include any characters, figures, vehicles, towers, buildings, platforms, structures, fences, walls, railings, or text — only the natural / environmental scenery.`

> **Why this phrasing:** DALL-E 3 doesn't honor negative prompts like Midjourney's `--no` block. Instead it follows positive exclusions phrased in plain English ("Do NOT include..."). Phrasing the same constraint positively works better with both DALL-E and Midjourney.

---

## Per-map content

The style prefix above + each block below = a complete prompt.

### Map 0 — Outpost Sigma → `map_0_outpost_sigma.png`
> Scorched Earth military base battlefield at twilight. Blast craters in dirt, sandbag berms, scattered fuel drums, war-torn ground, distant ruined city silhouette on the horizon, fallen scaffolding, dust haze. Military green and ochre and burnt-orange palette, end-of-the-world atmosphere.

### Map 1 — Lunar Gate → `map_1_lunar_gate.png`
> Cratered grey lunar surface. Planet Earth glowing blue and white on the horizon, dark purple starry sky, weathered crater rims, scattered rocks, deep crisp shadows. NASA-photography feel, calm and vast sci-fi atmosphere.

### Map 2 — The Crater → `map_2_the_crater.png`
> Interior view from inside a giant deep lunar crater. Towering crater walls on three sides, deep shadow pooling on the floor, golden Earthlight catching the upper rim, dust on the floor, scattered boulders, dim ice patches. Claustrophobic and grand.

### Map 3 — Orbital Station → `map_3_orbital_station.png`
> Top-down view of an orbital wheel space station interior deck. Polished metal corridors with diamond-plate floor, glowing blue conduit strips along the walls, bulkhead doors flanking the corridor, status panel lights, viewports showing distant stars at the edges. Clean industrial sci-fi, operational and pristine.

### Map 4 — Asteroid Belt → `map_4_asteroid_belt.png`
> Asteroid mining field in deep space. Large rocky asteroids floating with shadowed and sunlit sides, industrial mining beacons and amber warning lights, anchored cargo shuttles, scattered drill rigs, dark space background with sparse stars. Blackwork-and-amber palette.

### Map 5 — Titan's Reach → `map_5_titans_reach.png`
> Surface of Saturn's moon Titan. Thick orange-amber methane haze atmosphere, dark methane lakes reflecting the sky, ice ridges and frozen rocks, Saturn looming huge in the orange sky with visible rings. Sepia and amber tones, alien and mysterious and melancholy.

### Map 6 — Deep Space Corridor → `map_6_deep_space_corridor.png`
> Interior of a derelict abandoned alien capital ship. Top-down view of damaged corridors, collapsed bulkheads, sparking exposed conduits, a hull breach in one corner showing the void of space with stars, scattered debris. Cold blue-grey palette, dangerous and lifeless.

### Map 7 — The Void Frontier → `map_7_the_void_frontier.png`
> Empty deep space scene. Purple and deep blue nebula clouds drifting, dense star field with bright and dim stars, drifting space debris and dead satellites, frozen wreckage of old ships. Sense of isolation and vast distance, cosmic horror atmosphere, deep midnight palette.

### Map 8 — Enemy Homeworld → `map_8_enemy_homeworld.png`
> Alien bioluminescent jungle planet surface. Glowing teal and magenta plants and glowing pools, organic alien spires twisted upward, twisted alien flora, low fog rising from glowing pools, dark purple sky with two moons. Mysterious and hostile alien biology, Pandora aesthetic.

### Map 9 — Last Light → `map_9_last_light.png`
> Final apocalyptic battlefield. Burning alien fortress courtyard at night, dramatic red and orange firelight, fallen broken pillars, fire pits, alien wreckage and debris, smoke rising into a dark sky, distant explosions on the horizon. Epic finale lighting, deeply dramatic, blood-red and ember-orange palette.

---

## Workflow — ChatGPT Plus (DALL-E 3) [PRIMARY]

DALL-E 3 supports three image sizes: `1024×1024` (square), `1792×1024` (landscape), `1024×1792` (portrait). The game canvas is `800×600` (4:3). The closest native size is `1792×1024` (16:9); we crop top/bottom to reach 4:3.

### One-time setup (per chat session)

Open a fresh ChatGPT chat and paste the **style brief** (this gets DALL-E into a consistent mode before any image generation):

```
I'm going to generate 10 background images for a tower defense game. Every image must follow this style brief:

[paste the LOCKED STYLE PREFIX from above]

For every image I request, please:
- Use the size 1792x1024 (landscape).
- Stay strictly within the style brief above.
- Generate ONE image per request (not 4 variants — just one focused image).
- Do NOT add any characters, figures, vehicles, towers, buildings, structures, walls, fences, railings, or text — environmental scenery only.

Confirm you understand. I'll send the per-map prompts one at a time.
```

Wait for ChatGPT to confirm. Then proceed.

### Per-map generation

For each map (1 to 10), send a message in this exact form:

```
Map N — <Name>:
[paste the per-map content block from above]
```

Example for Map 0:

```
Map 0 — Outpost Sigma:
Scorched Earth military base battlefield at twilight. Blast craters in dirt, sandbag berms, scattered fuel drums, war-torn ground, distant ruined city silhouette on the horizon, fallen scaffolding, dust haze. Military green and ochre and burnt-orange palette, end-of-the-world atmosphere.
```

If the result drifts from the style (e.g. suddenly stylized vs painterly), reply with "Try again, staying closer to the painted Kingdom Rush style brief" — ChatGPT will regenerate. Do NOT re-explain the style on every prompt; keep them tight.

### Download, crop, resize, optimize (per image)

In the terminal (macOS — `sips` is built-in):

```bash
# Starting from a downloaded 1792x1024 DALL-E output named dl.png:

# 1. Crop center to 4:3 (1792x1344 would be 4:3 — but image is only 1024 tall.
#    Instead crop to 1365x1024, which is closest to 4:3 from the 1792x1024 source):
sips -c 1024 1365 dl.png --out cropped.png

# 2. Resize down to game canvas 800x600:
sips -z 600 800 cropped.png --out resized.png

# 3. Optimize for bundle size (install once: brew install pngquant):
pngquant --quality=70-85 --force --output map_N_slug.png resized.png

# 4. Confirm size — should be roughly 200-400 KB:
ls -lh map_N_slug.png
```

Filename must match exactly the heading above (e.g. `map_0_outpost_sigma.png`).

### Commit

Once you have all 10 (or any subset), commit them:

```bash
git add assets/backgrounds/*.png
git commit -m "feat(assets): add N AI-generated map background PNGs"
git push
```

The game picks them up automatically the next time `BootScene` loads (or just refresh the dev server).

---

## Workflow — Midjourney v6+ [alternative]

If you'd rather use Midjourney later, the prompts above still work. Convert each per-map block to MJ syntax by:

1. Prepending the style prefix (with the "Do NOT include..." line dropped — MJ uses `--no` instead).
2. Appending: `--ar 4:3 --style raw --no text characters figures vehicles towers buildings platforms structures fences walls railings`

Example for Map 0 (Midjourney form):

```
Top-down view, painted concept art for a tower defense game, Kingdom Rush style, layered atmospheric depth, dramatic lighting, vibrant illustrated palette, high detail, empty terrain ready for path overlay, scorched Earth military base battlefield at twilight, blast craters in dirt, sandbag berms, scattered fuel drums, war-torn ground, distant ruined city silhouette on the horizon, fallen scaffolding, dust haze, military green and ochre and burnt-orange palette, end-of-the-world atmosphere --ar 4:3 --style raw --no text characters figures vehicles towers buildings platforms structures fences walls railings
```

Midjourney returns 4 variants natively; pick the best. Crop / resize / pngquant as in the DALL-E workflow.

---

## Style consistency tips

- **One chat session, all 10 maps.** Don't restart the chat between maps — the model loses style context.
- **Don't ask for "more dramatic" / "more sci-fi" / etc. mid-batch.** That drifts the style. Iterate by saying "regenerate, closer to the style brief."
- **First 2-3 maps are calibration.** If maps 0-2 look great, the rest will likely follow. If they drift, reset the brief and try again.
- **Final maps should feel weightier.** Map 9 (Last Light) is the campaign finale — give it more aggressive prompting if the default result feels too gentle.

---

# Terrain-only regeneration (2026-06) — CURRENT DIRECTION

The prompts above produced the original backdrops, which often baked in a road/path,
a horizon/vista, or large foreground structures. The current pipeline draws the
**path procedurally as the road** and the **tower pads procedurally**, so backdrops
must be **terrain-only** (no painted road) and **flat top-down** so the route + pads
sit right. The gameplay route is **computed from the image** (it threads the open
clearings and dodges obstacle clusters), so the art needs clustered obstacles with
open clearings spanning the whole frame. Map 0 was regenerated this way first; these
blocks regenerate maps 1–9 to match.

## Universal rules — prepend/include in EVERY map prompt below

> Directly **top-down / straight overhead, flat** view. **No horizon, no sky, no
> perspective/vista, no large foreground structures** — the entire frame is the
> surface (for space maps: the field seen from directly above). Arrange the theme's
> obstacles into **distinct clusters separated by broad meandering clearings of open
> ground that wind across the whole frame, top to bottom**, so a route can snake the
> full height — no wall-to-wall coverage. **Do NOT include** any road, path, trail,
> track, lane, walkway, line, or any constructed/painted route; no characters,
> vehicles, towers, or text. Even readable mid-tones; no large pure-black or
> blown-out regions in the central play area. **Aspect: 16:9 landscape (1792×1024).**

## Per-map theme blocks (universal rules + the block = full prompt)

### Map 1 — Lunar Gate → `map_1_lunar_gate.png`
> Grey lunar regolith battlefield. Clusters: impact craters, boulder fields, scattered rubble and broken equipment. Clearings: smooth open grey dust. Cold neutral grey palette with subtle blue-grey shadows.

### Map 2 — The Crater → `map_2_the_crater.png`
> Flat floor of a vast lunar crater. Clusters: jagged rock spires, smaller craters, rockslides. Clearings: flat pale-grey crater floor. Stark grey palette, hard crisp shadows.

### Map 3 — Orbital Station → `map_3_orbital_station.png`
> Top-down view of a space-station hangar deck — a FLAT floor, NOT a view out into space. Clusters: machinery banks, cargo containers, reactor housings, bulkhead segments. Clearings: open riveted metal deck plating. Gunmetal / steel-blue palette with cyan accent lights.

### Map 4 — Asteroid Belt → `map_4_asteroid_belt.png`
> Top-down view of a dense asteroid field seen from directly above. Clusters: groups of grey-brown asteroids and rubble. Clearings: open dark starfield void between the asteroid groups. Dark space backdrop with faint distant stars; rock clusters lit from one side.

### Map 5 — Titan's Reach → `map_5_titans_reach.png`
> Top-down frozen-methane surface of Titan — flat overhead, no atmosphere/horizon. Clusters: cryo-ice ridges, frozen craters, hydrocarbon sludge mounds. Clearings: open amber-tan icy flats. Hazy orange/amber palette with pale icy highlights.

### Map 6 — Deep Space Corridor → `map_6_deep_space_corridor.png`
> Top-down view of a derelict starship deck — a FLAT floor, no windows/space/horizon. Clusters: collapsed machinery, conduits, debris, hull-breach wreckage. Clearings: open metal grating / deck floor. Dim industrial blue-grey palette with sparse amber warning lights.

### Map 7 — The Void Frontier → `map_7_the_void_frontier.png`
> Top-down deep-space frontier seen from directly above. Clusters: shattered asteroids, derelict ship debris, wreckage fields. Clearings: open void with faint blue/purple nebula glow and distant stars. Dark palette, cool nebula tints, debris rim-lit.

### Map 8 — Enemy Homeworld → `map_8_enemy_homeworld.png`
> Top-down alien organic terrain. Clusters: chitinous growths, fleshy mounds, bioluminescent teal pools, egg-sac nests. Clearings: open dark veined organic ground. Deep teal/green palette with glowing cyan-magenta bio-light. **Keep the glow in clustered pools, NOT continuous glowing channels** (channels read as a path).

### Map 9 — Last Light → `map_9_last_light.png`
> Top-down volcanic surface. Clusters: cooled black basalt outcrops, magma pools, lava-filled craters, slag heaps. Clearings: open cracked dark-basalt ground with faint ember glow. Charcoal/black palette with molten orange-red cracks. **Keep magma in clustered pools — no continuous lava river** (a river reads as a path).

## Workflow for the rollout

1. Generate one map (or a batch) per the block above; save to the exact filename shown.
2. Tell Claude which map landed → Claude computes the route, re-fits the `6 + id`
   tower slots onto clear pads, and adds that theme's road style + pad style, then
   browser-verifies.
3. Planet maps (1, 2, 5) reuse `planet-road` + sandbag-emplacement pads; the station,
   space, organic, and lava themes each get their own road + pad style, tuned to the
   actual art.
