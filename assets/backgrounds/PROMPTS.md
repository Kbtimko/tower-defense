# Background Image Prompts

All 10 map backgrounds are AI-generated using **Midjourney v6+** (DALL-E 3 / SDXL acceptable as portable fallbacks). Every prompt opens with the locked style prefix and closes with the locked parameter block to enforce visual consistency across the 10 maps.

## Locked style prefix

> `Top-down view, painted concept art for a tower defense game, Kingdom Rush style, layered atmospheric depth, dramatic lighting, vibrant illustrated palette, high detail, no characters, no text, no UI, empty terrain ready for path overlay`

## Locked parameter block

> `--ar 4:3 --style raw --no text characters figures vehicles towers buildings platforms structures fences walls railings`

## Per-map prompts

### Map 0 — Outpost Sigma → `map_0_outpost_sigma.png`
`{STYLE}, scorched Earth military base battlefield at twilight, blast craters in dirt, sandbag berms, scattered fuel drums, war-torn ground, distant ruined city silhouette on the horizon, fallen scaffolding, dust haze, military green and ochre and burnt-orange palette, end-of-the-world atmosphere {PARAMS}`

### Map 1 — Lunar Gate → `map_1_lunar_gate.png`
`{STYLE}, cratered grey lunar surface, planet Earth glowing blue and white on the horizon, dark purple starry sky, weathered crater rims, scattered rocks, deep crisp shadows, NASA photography feel, calm and vast sci-fi atmosphere {PARAMS}`

### Map 2 — The Crater → `map_2_the_crater.png`
`{STYLE}, interior view from inside a giant deep lunar crater, towering crater walls on three sides, deep shadow pooling on the floor, golden Earthlight catching the upper rim, dust on the floor, scattered boulders, dim ice patches, claustrophobic and grand {PARAMS}`

### Map 3 — Orbital Station → `map_3_orbital_station.png`
`{STYLE}, top-down view of an orbital wheel space station interior deck, polished metal corridors with diamond-plate floor, glowing blue conduit strips along the walls, bulkhead doors flanking the corridor, status panel lights, viewports showing distant stars at the edges, clean industrial sci-fi, operational and pristine {PARAMS}`

### Map 4 — Asteroid Belt → `map_4_asteroid_belt.png`
`{STYLE}, asteroid mining field in deep space, large rocky asteroids floating with shadowed and sunlit sides, industrial mining beacons and amber warning lights, anchored cargo shuttles, scattered drill rigs, dark space background with sparse stars, blackwork and amber palette {PARAMS}`

### Map 5 — Titan's Reach → `map_5_titans_reach.png`
`{STYLE}, surface of Saturn's moon Titan, thick orange-amber methane haze atmosphere, dark methane lakes reflecting the sky, ice ridges and frozen rocks, Saturn looming huge in the orange sky with visible rings, sepia and amber tones, alien and mysterious and melancholy {PARAMS}`

### Map 6 — Deep Space Corridor → `map_6_deep_space_corridor.png`
`{STYLE}, interior of a derelict abandoned alien capital ship, top-down view of damaged corridors, collapsed bulkheads, sparking exposed conduits, hull breach in one corner showing the void of space with stars, cold blue-grey palette, dangerous and lifeless, scattered debris {PARAMS}`

### Map 7 — The Void Frontier → `map_7_the_void_frontier.png`
`{STYLE}, empty deep space scene, purple and deep blue nebula clouds drifting, dense star field with bright and dim stars, drifting space debris and dead satellites, frozen wreckage of old ships, sense of isolation and vast distance, cosmic horror atmosphere, deep midnight palette {PARAMS}`

### Map 8 — Enemy Homeworld → `map_8_enemy_homeworld.png`
`{STYLE}, alien bioluminescent jungle planet surface, glowing teal and magenta plants and glowing pools, organic alien spires twisted upward, twisted alien flora, low fog rising from glowing pools, dark purple sky with two moons, mysterious and hostile alien biology, Pandora aesthetic {PARAMS}`

### Map 9 — Last Light → `map_9_last_light.png`
`{STYLE}, final apocalyptic battlefield, burning alien fortress courtyard at night, dramatic red and orange firelight, fallen broken pillars, fire pits, alien wreckage and debris, smoke rising into a dark sky, distant explosions on the horizon, epic finale lighting, deeply dramatic, blood-red and ember-orange palette {PARAMS}`

## Generation workflow

For each map:
1. Generate 4-8 variants with the full prompt above.
2. Pick the best variant.
3. Crop to 4:3 if not native, then downscale to 800×600 (game canvas size).
4. Run `pngquant --quality=70-85 <file>` to compress. Target ~200-400 KB.
5. Save as `assets/backgrounds/<filename>.png` and commit.

If a map drifts from the established style across the batch, regenerate it — don't tweak the prefix mid-batch.
