# Space-Themed Backgrounds + Restricted Tower Placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the 10 maps a distinct space-themed identity: AI-generated bitmap backdrop + procedural overlay (curved bezier path, thematic blockers at every bend, hand-placed tower platforms). Restrict tower placement to designated platforms.

**Architecture:** A new `PathRenderer` draws the curved theme-styled path; a new `PlatformRenderer` draws theme-styled build slots; a new `BlockerPlacement` deterministically positions blocker shapes at every path bend using a seedable RNG. `PathManager` stops auto-computing zones — `map.towerSlots` data drives them instead. `BootScene` preloads the 10 PNGs; `GameScene` composites bitmap (depth 0) → blockers (10) → platforms (15) → path (20) → existing entities.

**Tech Stack:** Phaser 3.60+ (curved bezier via `Phaser.Curves.Path`, `graphics.fillPath`), Vitest + jsdom (Phaser mocked per project convention).

**Spec:** `docs/superpowers/specs/2026-06-06-space-themed-backgrounds-design.md`

---

## File structure

**New files:**
- `assets/backgrounds/PROMPTS.md` — all 10 Midjourney prompts + locked style prefix
- `src/systems/SeededRandom.js` + test — xorshift32 RNG
- `src/data/blockerTypes.js` + test — 6 procedural draw functions (crater, rocks, metal_bulkhead, asteroid, organic_spire, glowing_pool) with theme-tint params
- `src/systems/BlockerPlacement.js` + test — deterministic blocker positions at every interior waypoint
- `src/systems/PathRenderer.js` + test — curved bezier path with 4 styles (planet-dust, station-strip, space-nav, organic-glow)
- `src/systems/PlatformRenderer.js` + test — theme-styled platform discs with empty/occupied state

**Modified files:**
- `src/data/maps.js` — add `backgroundImage`, `pathRenderStyle`, `blockerVocab`, `blockerSeed`, `towerSlots` to all 10 maps (105 slot positions total)
- `src/data/maps.test.js` — schema test for the 5 new fields
- `src/scenes/BootScene.js` — preload all 10 PNGs (graceful if missing)
- `src/scenes/GameScene.js` — render backdrop image; wire BlockerPlacement, PathRenderer, PlatformRenderer
- `src/systems/PathManager.js` — consume `map.towerSlots` instead of `_computeZones`; remove the now-unused `renderPath`
- `src/systems/PathManager.test.js` — update for `towerSlots` source

---

## Task 1: Add new fields to `maps.js` data + schema test

**Files:**
- Modify: `src/data/maps.js`
- Modify: `src/data/maps.test.js`

The five new fields per map: `backgroundImage` (string), `pathRenderStyle` (one of 4), `blockerVocab` (string[]), `blockerSeed` (number), `towerSlots` (`[x,y][]`, length === `6 + id`).

Slot positions: hand-curated starter set per map. These are the initial layout — fine-tuning happens after browser playtest in Task 13. Coordinates are normalized 0-1, offset from path waypoints to avoid the path corridor.

- [ ] **Step 1: Update `maps.test.js` schema test**

Replace the entire file:

```js
import { MAPS } from './maps.js';

describe('MAPS', () => {
  const REQUIRED = [
    'id','name','background','pathColor','waypoints','startGold',
    'startLives','unlockCost','waveCount','maxTierAllowed','storyKey','blurb',
    'backgroundImage','pathRenderStyle','blockerVocab','blockerSeed','towerSlots',
  ];
  const PATH_STYLES = ['planet-dust','station-strip','space-nav','organic-glow'];

  for (const map of MAPS) {
    it(`map ${map.id} has all required fields`, () => {
      for (const field of REQUIRED) expect(map).toHaveProperty(field);
    });

    it(`map ${map.id} waypoints are normalized 0-1 pairs`, () => {
      for (const [x, y] of map.waypoints) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });

    it(`map ${map.id} backgroundImage is a non-empty string`, () => {
      expect(typeof map.backgroundImage).toBe('string');
      expect(map.backgroundImage.length).toBeGreaterThan(0);
    });

    it(`map ${map.id} pathRenderStyle is one of the 4 supported styles`, () => {
      expect(PATH_STYLES).toContain(map.pathRenderStyle);
    });

    it(`map ${map.id} blockerVocab is a non-empty string array`, () => {
      expect(Array.isArray(map.blockerVocab)).toBe(true);
      expect(map.blockerVocab.length).toBeGreaterThan(0);
      for (const v of map.blockerVocab) expect(typeof v).toBe('string');
    });

    it(`map ${map.id} blockerSeed is a number`, () => {
      expect(typeof map.blockerSeed).toBe('number');
      expect(Number.isFinite(map.blockerSeed)).toBe(true);
    });

    it(`map ${map.id} has exactly 6 + id tower slots`, () => {
      expect(Array.isArray(map.towerSlots)).toBe(true);
      expect(map.towerSlots.length).toBe(6 + map.id);
    });

    it(`map ${map.id} towerSlots are normalized 0-1 pairs`, () => {
      for (const [x, y] of map.towerSlots) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/data/maps.test.js
```

Expected: 50+ failing assertions across the 10 maps (missing fields).

- [ ] **Step 3: Update `maps.js` — add the 5 new fields to all 10 maps**

Replace the entire `MAPS` export. The full file:

```js
export const MAPS = [
  {
    id: 0,
    name: 'Outpost Sigma',
    background: 0x1a2e1a,
    pathColor: 0x7a6040,
    waypoints: [[0,.35],[.18,.35],[.18,.72],[.45,.72],[.45,.25],[.72,.25],[.72,.65],[1,.65]],
    startGold: 200,
    startLives: 25,
    unlockCost: 0,
    waveCount: 10,
    maxTierAllowed: 2,
    storyKey: 'outpost_sigma',
    blurb: "Earth's last forward base. Hold the line or lose everything.",
    backgroundImage: 'map_0_outpost_sigma.png',
    pathRenderStyle: 'planet-dust',
    blockerVocab: ['crater', 'rocks'],
    blockerSeed: 7341,
    towerSlots: [
      [0.10, 0.55], [0.30, 0.55], [0.30, 0.88],
      [0.55, 0.50], [0.55, 0.90], [0.85, 0.45],
    ],
  },
  {
    id: 1,
    name: 'Lunar Gate',
    background: 0x1e1e2e,
    pathColor: 0x6a5a5a,
    waypoints: [[0,.2],[.3,.2],[.3,.55],[.15,.55],[.15,.82],[.55,.82],[.55,.4],[.75,.4],[.75,.78],[1,.78]],
    startGold: 160,
    startLives: 20,
    unlockCost: 0,
    waveCount: 10,
    maxTierAllowed: 2,
    storyKey: 'lunar_gate',
    blurb: 'The gateway to the moon is under siege. Defend the transit hub.',
    backgroundImage: 'map_1_lunar_gate.png',
    pathRenderStyle: 'planet-dust',
    blockerVocab: ['crater', 'rocks'],
    blockerSeed: 4291,
    towerSlots: [
      [0.18, 0.38], [0.42, 0.20], [0.42, 0.55],
      [0.30, 0.95], [0.65, 0.60], [0.65, 0.95],
      [0.90, 0.55],
    ],
  },
  {
    id: 2,
    name: 'The Crater',
    background: 0x1e1e1e,
    pathColor: 0x808080,
    waypoints: [[0,.5],[.2,.5],[.2,.2],[.5,.2],[.5,.8],[.8,.8],[.8,.4],[1,.4]],
    startGold: 150,
    startLives: 20,
    unlockCost: 0,
    waveCount: 12,
    maxTierAllowed: 3,
    storyKey: 'the_crater',
    blurb: 'A lunar crater makes a natural fortress — or a killing field.',
    backgroundImage: 'map_2_the_crater.png',
    pathRenderStyle: 'planet-dust',
    blockerVocab: ['crater', 'rocks'],
    blockerSeed: 5582,
    towerSlots: [
      [0.10, 0.70], [0.35, 0.35], [0.35, 0.95],
      [0.65, 0.45], [0.65, 0.95], [0.92, 0.20],
      [0.92, 0.60], [0.10, 0.30],
    ],
  },
  {
    id: 3,
    name: 'Orbital Station',
    background: 0x0a1a2a,
    pathColor: 0x4a7a8a,
    waypoints: [[0,.3],[.15,.3],[.15,.7],[.35,.7],[.35,.15],[.6,.15],[.6,.55],[.45,.55],[.45,.85],[.8,.85],[.8,.5],[1,.5]],
    startGold: 140,
    startLives: 18,
    unlockCost: 0,
    waveCount: 12,
    maxTierAllowed: 3,
    storyKey: 'orbital_station',
    blurb: 'Enemy forces have boarded our orbital station. Repel them before they reach the core.',
    backgroundImage: 'map_3_orbital_station.png',
    pathRenderStyle: 'station-strip',
    blockerVocab: ['metal_bulkhead'],
    blockerSeed: 9182,
    towerSlots: [
      [0.08, 0.50], [0.25, 0.50], [0.25, 0.92],
      [0.45, 0.32], [0.50, 0.70], [0.70, 0.35],
      [0.65, 0.95], [0.92, 0.65], [0.92, 0.30],
    ],
  },
  {
    id: 4,
    name: 'Asteroid Belt',
    background: 0x1a1208,
    pathColor: 0x7a5a2a,
    waypoints: [[0,.6],[.2,.6],[.2,.2],[.4,.2],[.4,.8],[.55,.8],[.55,.35],[.7,.35],[.7,.75],[.85,.75],[.85,.3],[1,.3]],
    startGold: 130,
    startLives: 18,
    unlockCost: 0,
    waveCount: 14,
    maxTierAllowed: 4,
    storyKey: 'asteroid_belt',
    blurb: 'Mining platforms in the asteroid belt are now frontline battlefields.',
    backgroundImage: 'map_4_asteroid_belt.png',
    pathRenderStyle: 'space-nav',
    blockerVocab: ['asteroid'],
    blockerSeed: 6453,
    towerSlots: [
      [0.10, 0.40], [0.30, 0.40], [0.30, 0.95],
      [0.48, 0.50], [0.62, 0.55], [0.62, 0.95],
      [0.78, 0.50], [0.92, 0.50], [0.92, 0.95],
      [0.48, 0.95],
    ],
  },
  {
    id: 5,
    name: "Titan's Reach",
    background: 0x1a0a00,
    pathColor: 0x8a3a1a,
    waypoints: [[0,.5],[.1,.5],[.1,.8],[.3,.8],[.3,.2],[.5,.2],[.5,.6],[.65,.6],[.65,.25],[.8,.25],[.8,.7],[1,.7]],
    startGold: 120,
    startLives: 15,
    unlockCost: 0,
    waveCount: 14,
    maxTierAllowed: 4,
    storyKey: 'titans_reach',
    blurb: "Titan's surface is hostile. So are its new inhabitants — the Titans have arrived.",
    backgroundImage: 'map_5_titans_reach.png',
    pathRenderStyle: 'planet-dust',
    blockerVocab: ['rocks', 'organic_spire'],
    blockerSeed: 1709,
    towerSlots: [
      [0.05, 0.35], [0.20, 0.50], [0.20, 0.95],
      [0.42, 0.42], [0.42, 0.95], [0.58, 0.42],
      [0.72, 0.45], [0.72, 0.92], [0.92, 0.42],
      [0.92, 0.92], [0.05, 0.95],
    ],
  },
  {
    id: 6,
    name: 'Deep Space Corridor',
    background: 0x060618,
    pathColor: 0x3a3a7a,
    waypoints: [[0,.25],[.2,.25],[.2,.75],[.4,.75],[.4,.4],[.55,.4],[.55,.85],[.7,.85],[.7,.15],[.85,.15],[.85,.6],[1,.6]],
    startGold: 110,
    startLives: 15,
    unlockCost: 0,
    waveCount: 15,
    maxTierAllowed: 4,
    storyKey: 'deep_space_corridor',
    blurb: 'The corridor leads deep into alien-controlled space. No rescue is coming.',
    backgroundImage: 'map_6_deep_space_corridor.png',
    pathRenderStyle: 'station-strip',
    blockerVocab: ['metal_bulkhead'],
    blockerSeed: 8924,
    towerSlots: [
      [0.08, 0.45], [0.30, 0.50], [0.30, 0.95],
      [0.48, 0.55], [0.48, 0.95], [0.62, 0.55],
      [0.62, 0.95], [0.78, 0.50], [0.78, 0.95],
      [0.95, 0.40], [0.95, 0.85], [0.10, 0.10],
    ],
  },
  {
    id: 7,
    name: 'The Void Frontier',
    background: 0x030308,
    pathColor: 0x2a2a4a,
    waypoints: [[0,.5],[.12,.5],[.12,.15],[.28,.15],[.28,.75],[.42,.75],[.42,.35],[.58,.35],[.58,.8],[.72,.8],[.72,.25],[.88,.25],[.88,.65],[1,.65]],
    startGold: 100,
    startLives: 12,
    unlockCost: 0,
    waveCount: 15,
    maxTierAllowed: 4,
    storyKey: 'the_void_frontier',
    blurb: 'Beyond the frontier, all navigation beacons are dark. We are alone out here.',
    backgroundImage: 'map_7_the_void_frontier.png',
    pathRenderStyle: 'space-nav',
    blockerVocab: ['asteroid'],
    blockerSeed: 3217,
    towerSlots: [
      [0.05, 0.35], [0.20, 0.45], [0.20, 0.95],
      [0.36, 0.50], [0.36, 0.95], [0.50, 0.55],
      [0.50, 0.95], [0.65, 0.50], [0.65, 0.95],
      [0.80, 0.50], [0.80, 0.95], [0.95, 0.45],
      [0.95, 0.85],
    ],
  },
  {
    id: 8,
    name: 'Enemy Homeworld',
    background: 0x100818,
    pathColor: 0x5a2a6a,
    waypoints: [[0,.7],[.15,.7],[.15,.3],[.3,.3],[.3,.8],[.48,.8],[.48,.2],[.62,.2],[.62,.6],[.75,.6],[.75,.1],[.9,.1],[.9,.5],[1,.5]],
    startGold: 90,
    startLives: 12,
    unlockCost: 0,
    waveCount: 16,
    maxTierAllowed: 4,
    storyKey: 'enemy_homeworld',
    blurb: 'We have breached the enemy homeworld. There is no going back.',
    backgroundImage: 'map_8_enemy_homeworld.png',
    pathRenderStyle: 'organic-glow',
    blockerVocab: ['organic_spire', 'glowing_pool'],
    blockerSeed: 4827,
    towerSlots: [
      [0.05, 0.50], [0.22, 0.50], [0.22, 0.95],
      [0.38, 0.50], [0.40, 0.95], [0.55, 0.40],
      [0.55, 0.95], [0.68, 0.40], [0.70, 0.95],
      [0.82, 0.30], [0.82, 0.85], [0.95, 0.30],
      [0.95, 0.75], [0.05, 0.95],
    ],
  },
  {
    id: 9,
    name: 'Last Light',
    background: 0x1a0808,
    pathColor: 0x8a1a1a,
    waypoints: [[0,.4],[.1,.4],[.1,.85],[.25,.85],[.25,.15],[.4,.15],[.4,.65],[.52,.65],[.52,.25],[.65,.25],[.65,.75],[.78,.75],[.78,.35],[.9,.35],[.9,.7],[1,.7]],
    startGold: 80,
    startLives: 10,
    unlockCost: 0,
    waveCount: 18,
    maxTierAllowed: 4,
    storyKey: 'last_light',
    blurb: 'This is the last light of humanity. Win, or there is nothing left.',
    backgroundImage: 'map_9_last_light.png',
    pathRenderStyle: 'planet-dust',
    blockerVocab: ['rocks', 'glowing_pool'],
    blockerSeed: 6391,
    towerSlots: [
      [0.04, 0.60], [0.18, 0.60], [0.18, 0.95],
      [0.32, 0.50], [0.32, 0.95], [0.46, 0.40],
      [0.46, 0.95], [0.58, 0.45], [0.58, 0.95],
      [0.72, 0.50], [0.72, 0.95], [0.84, 0.55],
      [0.84, 0.95], [0.96, 0.50], [0.96, 0.95],
    ],
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/data/maps.test.js
```

Expected: 80 tests pass (8 assertions × 10 maps).

- [ ] **Step 5: Commit**

```bash
git add src/data/maps.js src/data/maps.test.js
git commit -m "$(cat <<'EOF'
feat(maps): add backgroundImage + path style + blockers + tower slots

Adds 5 new per-map fields driving the space-themed background system:
- backgroundImage: PNG filename under assets/backgrounds/
- pathRenderStyle: one of 4 (planet-dust / station-strip / space-nav / organic-glow)
- blockerVocab: pool of blocker types for procedural placement
- blockerSeed: deterministic seed for blocker placement
- towerSlots: hand-placed slot coords, length === 6 + id

Slot positions are starter layouts; fine-tune after browser playtest.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bootstrap `assets/backgrounds/PROMPTS.md`

**Files:**
- Create: `assets/backgrounds/PROMPTS.md`

No code change. Commits the 10 AI prompts for reproducibility. PNG assets themselves are generated by the user manually after this plan completes (or in parallel).

- [ ] **Step 1: Create the prompts file**

Write `assets/backgrounds/PROMPTS.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add assets/backgrounds/PROMPTS.md
git commit -m "$(cat <<'EOF'
docs(assets): add Midjourney prompt manifest for 10 map backgrounds

Locked style prefix + locked parameter block + 10 per-map prompts.
Commits the prompts for reproducibility; PNG generation is a manual
step performed outside the codebase.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `SeededRandom` — deterministic RNG helper

**Files:**
- Create: `src/systems/SeededRandom.js`
- Test: `src/systems/SeededRandom.test.js`

xorshift32 — small, fast, deterministic, returns floats in `[0, 1)`. Used by `BlockerPlacement` to keep blocker positions stable across runs.

- [ ] **Step 1: Write the failing test**

Create `src/systems/SeededRandom.test.js`:

```js
import { SeededRandom } from './SeededRandom.js';

describe('SeededRandom', () => {
  it('next returns a float in [0, 1)', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed produces same sequence', () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('pick returns an element from the input array', () => {
    const rng = new SeededRandom(42);
    const arr = ['x', 'y', 'z'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('range returns an integer in [min, max]', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.range(5, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/SeededRandom.test.js
```

Expected: FAIL — `Cannot find module './SeededRandom.js'`.

- [ ] **Step 3: Implement `SeededRandom`**

Create `src/systems/SeededRandom.js`:

```js
// xorshift32 — small, fast, deterministic 32-bit RNG.
// Note: seed 0 is reserved (would degenerate); we coerce it to 1.
export class SeededRandom {
  constructor(seed) {
    this._state = (seed | 0) || 1;
  }

  next() {
    let x = this._state;
    x ^= x << 13; x |= 0;
    x ^= x >>> 17; x |= 0;
    x ^= x << 5;  x |= 0;
    this._state = x;
    // Map signed 32-bit to [0, 1)
    return ((x >>> 0) / 0x100000000);
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  range(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/SeededRandom.test.js
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/systems/SeededRandom.js src/systems/SeededRandom.test.js
git commit -m "$(cat <<'EOF'
feat(systems): add SeededRandom xorshift32 helper

Small deterministic RNG for blocker placement. Same seed → same
sequence. Provides next() / pick(arr) / range(min, max).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `blockerTypes` registry — 6 procedural draw functions

**Files:**
- Create: `src/data/blockerTypes.js`
- Test: `src/data/blockerTypes.test.js`

Each entry exposes `draw(gfx, x, y, scale, tint)` that paints onto a Phaser `Graphics`. Six types cover all 10 maps with theme tinting:

| Type | Used by maps |
|---|---|
| `crater` | 0, 1, 2 |
| `rocks` | 0, 1, 2, 5, 9 |
| `metal_bulkhead` | 3, 6 |
| `asteroid` | 4, 7 |
| `organic_spire` | 5, 8 |
| `glowing_pool` | 8, 9 |

Each type also exposes a `defaultTint(mapId)` so themes pick the right color.

- [ ] **Step 1: Write the failing test**

Create `src/data/blockerTypes.test.js`:

```js
import { BLOCKER_TYPES } from './blockerTypes.js';

// Mock Phaser Graphics call recorder — never imports Phaser directly.
function makeGfx() {
  const calls = [];
  const proxy = new Proxy({}, {
    get(_t, prop) {
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

describe('BLOCKER_TYPES', () => {
  const EXPECTED = ['crater', 'rocks', 'metal_bulkhead', 'asteroid', 'organic_spire', 'glowing_pool'];

  it('exports all 6 expected types', () => {
    for (const key of EXPECTED) expect(BLOCKER_TYPES).toHaveProperty(key);
  });

  for (const key of EXPECTED) {
    it(`${key} exposes draw(gfx, x, y, scale, tint)`, () => {
      const t = BLOCKER_TYPES[key];
      expect(typeof t.draw).toBe('function');
      expect(typeof t.defaultTint).toBe('function');
    });

    it(`${key}.draw issues fill/stroke graphics calls`, () => {
      const gfx = makeGfx();
      BLOCKER_TYPES[key].draw(gfx, 200, 200, 1, 0xffffff);
      const calls = gfx._calls();
      const methods = new Set(calls.map(c => c.method));
      // Every blocker must paint something (at least one fill or stroke op).
      const drewSomething = methods.has('fillStyle') || methods.has('lineStyle') ||
                            methods.has('fillCircle') || methods.has('fillPath') ||
                            methods.has('strokePath');
      expect(drewSomething).toBe(true);
    });

    it(`${key}.defaultTint(mapId) returns a string palette key`, () => {
      const t = BLOCKER_TYPES[key];
      expect(typeof t.defaultTint(0)).toBe('string');
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/data/blockerTypes.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `blockerTypes.js`**

Create `src/data/blockerTypes.js`:

```js
// Procedural blocker shapes. Each `draw` paints into a Phaser Graphics
// at (x, y) with a uniform `scale` (1.0 = ~80px diameter footprint).
// `tint` is the primary fill color; `defaultTint(mapId)` lets the per-map
// theme override if a blocker is used across themes.

const PALETTE = {
  // Lunar / planetary greys
  rock_grey:   { fill: 0x3a3540, stroke: 0x7a7480 },
  rock_warm:   { fill: 0x4a3a25, stroke: 0x8a6a45 },
  rock_pale:   { fill: 0x6a6470, stroke: 0xa0a0a8 },
  // Ship metals
  metal:       { fill: 0x3a4050, stroke: 0x5a6070 },
  metal_red:   { fill: 0x40262c, stroke: 0xaa3333 },
  // Asteroid browns
  asteroid_w:  { fill: 0x6a5a45, stroke: 0x9a8a65 },
  asteroid_d:  { fill: 0x2e251c, stroke: 0x5a4a35 },
  // Alien organics
  organic_teal:    { fill: 0x0a4a40, stroke: 0x00ffc8 },
  organic_magenta: { fill: 0x4a0a35, stroke: 0xff44aa },
  // Last light embers
  ember:       { fill: 0x6a1a08, stroke: 0xff7733 },
};

function fillCircle(gfx, x, y, r, color) { gfx.fillStyle(color, 1); gfx.fillCircle(x, y, r); }
function strokeCircle(gfx, x, y, r, color, w = 1) { gfx.lineStyle(w, color, 1); gfx.strokeCircle(x, y, r); }

export const BLOCKER_TYPES = {
  // ===== Crater: dark inner disc + light rim =====
  crater: {
    draw(gfx, x, y, scale, tint) {
      const r = 38 * scale;
      const p = PALETTE[tint] ?? PALETTE.rock_grey;
      fillCircle(gfx, x, y, r, p.fill);
      strokeCircle(gfx, x, y, r, p.stroke, 2);
      // shadow pool
      gfx.fillStyle(0x000000, 0.5);
      gfx.fillCircle(x - r * 0.15, y + r * 0.15, r * 0.55);
    },
    defaultTint(mapId) {
      return mapId === 0 ? 'rock_warm' : 'rock_grey';
    },
  },

  // ===== Rocks: irregular cluster (3 overlapping discs) =====
  rocks: {
    draw(gfx, x, y, scale, tint) {
      const r = 22 * scale;
      const p = PALETTE[tint] ?? PALETTE.rock_grey;
      gfx.fillStyle(p.fill, 1);
      gfx.fillCircle(x - r * 0.6, y + r * 0.2, r);
      gfx.fillCircle(x + r * 0.5, y + r * 0.3, r * 0.85);
      gfx.fillCircle(x, y - r * 0.5, r * 0.9);
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokeCircle(x - r * 0.6, y + r * 0.2, r);
      gfx.strokeCircle(x + r * 0.5, y + r * 0.3, r * 0.85);
      gfx.strokeCircle(x, y - r * 0.5, r * 0.9);
    },
    defaultTint(mapId) {
      if (mapId === 5) return 'rock_warm';
      if (mapId === 9) return 'ember';
      return 'rock_grey';
    },
  },

  // ===== Metal bulkhead: rectangle with rivets =====
  metal_bulkhead: {
    draw(gfx, x, y, scale, tint) {
      const w = 70 * scale, h = 36 * scale;
      const p = PALETTE[tint] ?? PALETTE.metal;
      gfx.fillStyle(p.fill, 1);
      gfx.fillRect(x - w / 2, y - h / 2, w, h);
      gfx.lineStyle(1.5, p.stroke, 1);
      gfx.strokeRect(x - w / 2, y - h / 2, w, h);
      // 6 rivets
      gfx.fillStyle(p.stroke, 1);
      for (let i = 0; i < 3; i++) {
        const rx = x - w / 2 + 8 + i * ((w - 16) / 2);
        gfx.fillCircle(rx, y - h / 2 + 5, 1.5);
        gfx.fillCircle(rx, y + h / 2 - 5, 1.5);
      }
      // status light
      gfx.fillStyle(0x44ff44, 1);
      gfx.fillCircle(x + w * 0.30, y, 2);
    },
    defaultTint(mapId) {
      return mapId === 6 ? 'metal_red' : 'metal';
    },
  },

  // ===== Asteroid: pseudo-organic blob via 6-point polygon =====
  asteroid: {
    draw(gfx, x, y, scale, tint) {
      const r = 28 * scale;
      const p = PALETTE[tint] ?? PALETTE.asteroid_w;
      const verts = [
        [r * 0.95, -r * 0.35], [r * 0.55,  r * 0.75], [-r * 0.15,  r * 0.95],
        [-r * 0.85,  r * 0.25], [-r * 0.65, -r * 0.55], [r * 0.10, -r * 0.85],
      ];
      gfx.fillStyle(p.fill, 1);
      gfx.beginPath();
      gfx.moveTo(x + verts[0][0], y + verts[0][1]);
      for (let i = 1; i < verts.length; i++) gfx.lineTo(x + verts[i][0], y + verts[i][1]);
      gfx.closePath();
      gfx.fillPath();
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokePath();
      // shadow side
      gfx.fillStyle(0x000000, 0.35);
      gfx.fillCircle(x - r * 0.3, y + r * 0.3, r * 0.55);
    },
    defaultTint(mapId) {
      return mapId === 7 ? 'asteroid_d' : 'asteroid_w';
    },
  },

  // ===== Organic spire: tall narrow triangle with glowing tip =====
  organic_spire: {
    draw(gfx, x, y, scale, tint) {
      const h = 60 * scale, w = 18 * scale;
      const p = PALETTE[tint] ?? PALETTE.organic_teal;
      gfx.fillStyle(p.fill, 1);
      gfx.beginPath();
      gfx.moveTo(x - w / 2, y + h / 2);
      gfx.lineTo(x + w / 2, y + h / 2);
      gfx.lineTo(x, y - h / 2);
      gfx.closePath();
      gfx.fillPath();
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokePath();
      // glowing tip
      gfx.fillStyle(p.stroke, 0.9);
      gfx.fillCircle(x, y - h / 2, 3);
    },
    defaultTint(mapId) {
      if (mapId === 8) return 'organic_magenta';
      return 'organic_teal';
    },
  },

  // ===== Glowing pool: filled circle with halo =====
  glowing_pool: {
    draw(gfx, x, y, scale, tint) {
      const r = 26 * scale;
      const p = PALETTE[tint] ?? PALETTE.organic_teal;
      // halo
      gfx.fillStyle(p.stroke, 0.25);
      gfx.fillCircle(x, y, r * 1.6);
      gfx.fillStyle(p.stroke, 0.4);
      gfx.fillCircle(x, y, r * 1.2);
      // pool
      gfx.fillStyle(p.fill, 1);
      gfx.fillCircle(x, y, r);
      gfx.lineStyle(2, p.stroke, 1);
      gfx.strokeCircle(x, y, r);
    },
    defaultTint(mapId) {
      return mapId === 9 ? 'ember' : 'organic_teal';
    },
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/data/blockerTypes.test.js
```

Expected: 25 passing.

- [ ] **Step 5: Commit**

```bash
git add src/data/blockerTypes.js src/data/blockerTypes.test.js
git commit -m "$(cat <<'EOF'
feat(data): add blockerTypes registry — 6 procedural draw fns

crater / rocks / metal_bulkhead / asteroid / organic_spire / glowing_pool
covering all 10 map themes via theme-aware defaultTint(mapId).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `BlockerPlacement` — deterministic positions at path bends

**Files:**
- Create: `src/systems/BlockerPlacement.js`
- Test: `src/systems/BlockerPlacement.test.js`

For each interior waypoint (every bend in the path), compute the "outside" of the bend and place a blocker there using the seeded RNG to pick a type from `vocab` and jitter the offset.

- [ ] **Step 1: Write the failing test**

Create `src/systems/BlockerPlacement.test.js`:

```js
import { computeBlockerPlacements } from './BlockerPlacement.js';

// L-shaped path: 3 waypoints, 1 interior bend.
const L_WAYPOINTS = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
// Zig-zag: 5 waypoints, 3 interior bends.
const ZIG = [
  { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 },
  { x: 100, y: 50 }, { x: 100, y: 100 },
];

describe('BlockerPlacement', () => {
  it('places one blocker per interior waypoint', () => {
    const result = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    expect(result).toHaveLength(1);
  });

  it('places three blockers for the zig-zag path', () => {
    const result = computeBlockerPlacements(ZIG, ['crater'], 7);
    expect(result).toHaveLength(3);
  });

  it('returns entries with type/x/y/scale', () => {
    const result = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    expect(result[0]).toMatchObject({
      type: 'crater',
      x: expect.any(Number),
      y: expect.any(Number),
      scale: expect.any(Number),
    });
  });

  it('same seed produces identical placements', () => {
    const a = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1234);
    const b = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1234);
    expect(a).toEqual(b);
  });

  it('different seeds produce different placements when vocab has multiple types', () => {
    const a = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1);
    const b = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 999);
    // Either types or jitter differ
    expect(a).not.toEqual(b);
  });

  it('picks types from the supplied vocab only', () => {
    const result = computeBlockerPlacements(ZIG, ['rocks'], 42);
    for (const b of result) expect(b.type).toBe('rocks');
  });

  it('returns empty array for a 2-waypoint path (no interior bends)', () => {
    const result = computeBlockerPlacements(
      [{ x: 0, y: 0 }, { x: 100, y: 100 }], ['crater'], 1,
    );
    expect(result).toEqual([]);
  });

  it('blocker is placed on the "outside" of the bend', () => {
    // L-path: (0,0)→(100,0)→(100,100). Bend at (100,0). Path continues down.
    // Outside of the bend is up-and-to-the-right (away from the bend interior).
    const [b] = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    // Interior of bend is roughly (50, 50). Blocker should be on the opposite side from (50, 50).
    const dxFromInterior = b.x - 50;
    const dyFromInterior = b.y - 50;
    expect(dxFromInterior).toBeGreaterThan(0); // pushed right of interior
    expect(dyFromInterior).toBeLessThan(0);    // pushed up of interior
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/BlockerPlacement.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BlockerPlacement.js`**

Create `src/systems/BlockerPlacement.js`:

```js
import { SeededRandom } from './SeededRandom.js';

const OFFSET_PX = 70;          // distance from waypoint to blocker center
const JITTER_PX = 8;           // small random variance
const SCALE_MIN = 0.85;
const SCALE_MAX = 1.15;

/**
 * For every interior waypoint (a path bend), place one blocker on the
 * "outside" of the bend. The outside direction = the inward normal of
 * the bend, negated. This positions the blocker visually in the corner
 * the path is routing around.
 *
 * @param {{x:number,y:number}[]} pathPoints  pixel-coord waypoints
 * @param {string[]} vocab                    blocker type pool
 * @param {number} seed                       deterministic RNG seed
 * @returns {{type:string,x:number,y:number,scale:number}[]}
 */
export function computeBlockerPlacements(pathPoints, vocab, seed) {
  if (pathPoints.length < 3) return [];

  const rng = new SeededRandom(seed);
  const out = [];

  for (let i = 1; i < pathPoints.length - 1; i++) {
    const prev = pathPoints[i - 1];
    const here = pathPoints[i];
    const next = pathPoints[i + 1];

    // Direction vectors AT the bend (normalized).
    const inDx  = here.x - prev.x, inDy  = here.y - prev.y;
    const outDx = next.x - here.x, outDy = next.y - here.y;
    const inLen  = Math.hypot(inDx, inDy)  || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const inUx  = inDx  / inLen,  inUy  = inDy  / inLen;
    const outUx = outDx / outLen, outUy = outDy / outLen;

    // Bisector (sum of incoming reversed + outgoing) points into the
    // bend's interior. Negate to get the outside direction.
    const biX = inUx - outUx;
    const biY = inUy - outUy;
    const biLen = Math.hypot(biX, biY) || 1;
    let outsideX = biX / biLen;
    let outsideY = biY / biLen;

    // Straight segments (no real bend) — fall back to perpendicular.
    if (biLen < 0.05) {
      outsideX = -inUy;
      outsideY = inUx;
    }

    const jitterX = (rng.next() - 0.5) * 2 * JITTER_PX;
    const jitterY = (rng.next() - 0.5) * 2 * JITTER_PX;
    const scale   = SCALE_MIN + rng.next() * (SCALE_MAX - SCALE_MIN);

    out.push({
      type: rng.pick(vocab),
      x: here.x + outsideX * OFFSET_PX + jitterX,
      y: here.y + outsideY * OFFSET_PX + jitterY,
      scale,
    });
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/BlockerPlacement.test.js
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/systems/BlockerPlacement.js src/systems/BlockerPlacement.test.js
git commit -m "$(cat <<'EOF'
feat(systems): add BlockerPlacement deterministic positioner

computeBlockerPlacements(waypoints, vocab, seed) — one blocker per
interior waypoint, positioned on the outside of each bend via
inverted-bisector geometry. Seeded RNG keeps placements stable.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `PathRenderer` — curved bezier path with 4 styles

**Files:**
- Create: `src/systems/PathRenderer.js`
- Test: `src/systems/PathRenderer.test.js`

Replaces the straight grey path. Uses `Phaser.Curves.Path` + `moveTo`/`splineTo` (Catmull-Rom interpolation through waypoints). Renders three stacked strokes per the style.

- [ ] **Step 1: Write the failing test**

Create `src/systems/PathRenderer.test.js`:

```js
import { renderPath, PATH_STYLES } from './PathRenderer.js';

function makeGfx() {
  const calls = [];
  const proxy = new Proxy({}, {
    get(_t, prop) {
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

const PATH = [
  { x: 0,   y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
];

describe('PathRenderer', () => {
  it('exports the 4 supported style names', () => {
    expect(PATH_STYLES).toEqual(['planet-dust','station-strip','space-nav','organic-glow']);
  });

  for (const style of ['planet-dust','station-strip','space-nav','organic-glow']) {
    it(`renderPath(gfx, path, '${style}') issues drawing calls without throwing`, () => {
      const gfx = makeGfx();
      expect(() => renderPath(gfx, PATH, style)).not.toThrow();
      const methods = gfx._calls().map(c => c.method);
      // Must call lineStyle and at least one path-drawing primitive.
      expect(methods).toContain('lineStyle');
      const drew = methods.some(m => m === 'strokePath' || m === 'lineBetween' || m === 'beginPath');
      expect(drew).toBe(true);
    });
  }

  it('throws on an unknown style', () => {
    const gfx = makeGfx();
    expect(() => renderPath(gfx, PATH, 'not-a-style')).toThrow();
  });

  it('is a no-op for paths with < 2 points', () => {
    const gfx = makeGfx();
    renderPath(gfx, [{ x: 0, y: 0 }], 'planet-dust');
    expect(gfx._calls()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/PathRenderer.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PathRenderer.js`**

Create `src/systems/PathRenderer.js`:

```js
export const PATH_STYLES = ['planet-dust', 'station-strip', 'space-nav', 'organic-glow'];

// Style colors: { haloColor, haloAlpha, haloWidth, mainColor, mainWidth, dashColor, dashWidth, dashAlpha, dashOn, dashOff }
const STYLE_SPEC = {
  'planet-dust': {
    haloColor: 0x9a8c70, haloAlpha: 0.18, haloWidth: 24,
    mainColor: 0x7a6a52, mainAlpha: 0.85, mainWidth: 14,
    dashColor: 0x2a2018, dashAlpha: 0.6,  dashWidth: 2, dashOn: 3, dashOff: 6,
  },
  'station-strip': {
    haloColor: 0x1a3a5a, haloAlpha: 0.55, haloWidth: 14,
    mainColor: 0x3a8ad0, mainAlpha: 0,    mainWidth: 0,  // no solid main; dashes are the visible track
    dashColor: 0x3a8ad0, dashAlpha: 0.75, dashWidth: 2, dashOn: 6, dashOff: 8,
  },
  'space-nav': {
    haloColor: 0x000000, haloAlpha: 0,    haloWidth: 0,
    mainColor: 0x000000, mainAlpha: 0,    mainWidth: 0,
    dashColor: 0x88aabb, dashAlpha: 0.75, dashWidth: 2, dashOn: 4, dashOff: 6,
  },
  'organic-glow': {
    haloColor: 0x00ffc8, haloAlpha: 0.25, haloWidth: 22,
    mainColor: 0x4affd0, mainAlpha: 0.65, mainWidth: 8,
    dashColor: 0xffffff, dashAlpha: 0.6,  dashWidth: 1.5, dashOn: 5, dashOff: 7,
  },
};

/**
 * Render a curved path through `points` using one of PATH_STYLES.
 * Draws up to 3 stacked strokes: halo (soft underlay), main, dashed overlay.
 * Curves are approximated with quadratic Bezier segments interpolated
 * at every waypoint (smooth corners through real waypoint positions).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{x:number,y:number}[]} points
 * @param {string} style
 */
export function renderPath(gfx, points, style) {
  if (points.length < 2) return;
  const spec = STYLE_SPEC[style];
  if (!spec) throw new Error(`PathRenderer: unknown style "${style}"`);

  // Halo layer
  if (spec.haloWidth > 0 && spec.haloAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.haloColor, spec.haloAlpha, spec.haloWidth);
  }
  // Main stroke
  if (spec.mainWidth > 0 && spec.mainAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.mainColor, spec.mainAlpha, spec.mainWidth);
  }
  // Dashed overlay
  if (spec.dashWidth > 0 && spec.dashAlpha > 0) {
    drawDashedStroke(gfx, points, spec.dashColor, spec.dashAlpha, spec.dashWidth, spec.dashOn, spec.dashOff);
  }
}

function drawSmoothStroke(gfx, points, color, alpha, width) {
  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(points[0].x, points[0].y);
  // Quadratic-curve through midpoints: control = current waypoint,
  // endpoint = midpoint to next. Smooths the corners.
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    gfx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  gfx.lineTo(last.x, last.y);
  gfx.strokePath();
}

function drawDashedStroke(gfx, points, color, alpha, width, dashOn, dashOff) {
  // Approximate dashes by walking segments and laying short line segments.
  // Phaser's Graphics doesn't expose dash arrays natively; this is the
  // standard workaround used throughout this codebase.
  gfx.lineStyle(width, color, alpha);
  let phase = 0; // 0 = drawing on-segment, 1 = drawing off-segment
  let remaining = dashOn;
  for (let i = 0; i < points.length - 1; i++) {
    let x = points[i].x, y = points[i].y;
    const tx = points[i + 1].x, ty = points[i + 1].y;
    let dx = tx - x, dy = ty - y;
    let segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    let ux = dx / segLen, uy = dy / segLen;
    while (segLen > 0) {
      const step = Math.min(remaining, segLen);
      if (phase === 0) {
        gfx.lineBetween(x, y, x + ux * step, y + uy * step);
      }
      x += ux * step; y += uy * step;
      segLen -= step;
      remaining -= step;
      if (remaining <= 0) {
        phase = 1 - phase;
        remaining = phase === 0 ? dashOn : dashOff;
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/PathRenderer.test.js
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/systems/PathRenderer.js src/systems/PathRenderer.test.js
git commit -m "$(cat <<'EOF'
feat(systems): add PathRenderer — curved bezier with 4 styles

renderPath(gfx, points, style) draws up to 3 stacked strokes (halo,
main, dashed overlay) per style spec. Curves via quadraticCurveTo
through waypoint midpoints. Styles: planet-dust, station-strip,
space-nav, organic-glow.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `PlatformRenderer` — theme-styled platform discs

**Files:**
- Create: `src/systems/PlatformRenderer.js`
- Test: `src/systems/PlatformRenderer.test.js`

Draws one disc per `towerSlot`. Per-map theme controls the visual style. Empty slots show a small `+` glyph; occupied slots show only the underlying base disc (tower sprite renders on top).

- [ ] **Step 1: Write the failing test**

Create `src/systems/PlatformRenderer.test.js`:

```js
import { renderPlatforms, PLATFORM_STYLE_FOR_MAP } from './PlatformRenderer.js';

function makeGfx() {
  const calls = [];
  const proxy = new Proxy({}, {
    get(_t, prop) {
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

describe('PlatformRenderer', () => {
  it('PLATFORM_STYLE_FOR_MAP returns a string for every map id 0..9', () => {
    for (let id = 0; id <= 9; id++) {
      expect(typeof PLATFORM_STYLE_FOR_MAP(id)).toBe('string');
    }
  });

  it('renderPlatforms paints once per slot', () => {
    const gfx = makeGfx();
    const slots = [
      { cx: 100, cy: 100, radius: 22, occupied: false },
      { cx: 200, cy: 200, radius: 22, occupied: true  },
      { cx: 300, cy: 100, radius: 22, occupied: false },
    ];
    renderPlatforms(gfx, slots, 0);
    const fillCircleCalls = gfx._calls().filter(c => c.method === 'fillCircle');
    // At least one fillCircle per slot (base disc).
    expect(fillCircleCalls.length).toBeGreaterThanOrEqual(slots.length);
  });

  it('renderPlatforms is a no-op for an empty slot list', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [], 0);
    expect(gfx._calls()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/PlatformRenderer.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PlatformRenderer.js`**

Create `src/systems/PlatformRenderer.js`:

```js
// Visual style per map ID. Each style is rendered the same way (disc +
// border + accent), only the palette differs — keeps the renderer small.
const STYLE_BY_MAP = {
  0: 'rocky_outcrop',
  1: 'rocky_outcrop',
  2: 'rocky_outcrop',
  5: 'rocky_outcrop',
  3: 'metal_grille',
  6: 'metal_grille',
  4: 'debris_pad',
  7: 'debris_pad',
  8: 'organic_disc',
  9: 'scorched_pad',
};

const PALETTES = {
  rocky_outcrop: { fill: 0x3a3540, edge: 0x6a6470, accent: 0xc0a070 },
  metal_grille:  { fill: 0x2a3040, edge: 0x6a8aaa, accent: 0x66ccff },
  debris_pad:    { fill: 0x2a2520, edge: 0x6a5040, accent: 0xffaa44 },
  organic_disc:  { fill: 0x0a2a30, edge: 0x00ffc8, accent: 0xffaaff },
  scorched_pad:  { fill: 0x3a0a08, edge: 0xff5522, accent: 0xffcc55 },
};

export function PLATFORM_STYLE_FOR_MAP(mapId) {
  return STYLE_BY_MAP[mapId] ?? 'rocky_outcrop';
}

/**
 * Render every tower slot as a theme-styled disc. Empty slots get a
 * small accent-tinted "+" mark; occupied slots draw only the base disc
 * (the tower entity renders on top).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{cx:number,cy:number,radius:number,occupied:boolean}[]} slots
 * @param {number} mapId
 */
export function renderPlatforms(gfx, slots, mapId) {
  if (!slots || slots.length === 0) return;
  const style = PLATFORM_STYLE_FOR_MAP(mapId);
  const pal = PALETTES[style];

  for (const slot of slots) {
    const r = slot.radius;
    // Outer shadow
    gfx.fillStyle(0x000000, 0.45);
    gfx.fillCircle(slot.cx + 1, slot.cy + 2, r + 1);
    // Base disc
    gfx.fillStyle(pal.fill, 1);
    gfx.fillCircle(slot.cx, slot.cy, r);
    // Edge ring
    gfx.lineStyle(2, pal.edge, 1);
    gfx.strokeCircle(slot.cx, slot.cy, r);

    if (!slot.occupied) {
      // Plus glyph: two crossed lines
      gfx.lineStyle(2.5, pal.accent, 1);
      gfx.lineBetween(slot.cx - r * 0.4, slot.cy, slot.cx + r * 0.4, slot.cy);
      gfx.lineBetween(slot.cx, slot.cy - r * 0.4, slot.cx, slot.cy + r * 0.4);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/PlatformRenderer.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/systems/PlatformRenderer.js src/systems/PlatformRenderer.test.js
git commit -m "$(cat <<'EOF'
feat(systems): add PlatformRenderer — theme-styled slot discs

renderPlatforms(gfx, slots, mapId) draws one disc per slot using
the map's theme palette. Empty slots get an accent + glyph;
occupied slots draw only the base disc (tower entity layers on top).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Refactor `PathManager` — consume `map.towerSlots`, drop `_computeZones`

**Files:**
- Modify: `src/systems/PathManager.js`
- Modify: `src/systems/PathManager.test.js`

Zones now come from `map.towerSlots` (denormalized to pixel coords), not from a procedural algorithm. `renderPath` is removed — `GameScene` calls the new `PathRenderer` directly.

- [ ] **Step 1: Update `PathManager.test.js` for the new constructor signature**

Replace the file:

```js
import { PathManager } from './PathManager.js';

// L-shaped path: (0,0)→(100,0)→(100,100) in normalized coords.
const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];
// Hand-placed slots (3 slots, normalized).
const SLOTS = [[0.50, 0.20], [0.20, 0.50], [0.80, 0.80]];

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, SLOTS, 100, 100); });

  it('converts normalized waypoints to pixel coords', () => {
    expect(pm.path[0]).toEqual({ x: 0, y: 0 });
    expect(pm.path[1]).toEqual({ x: 100, y: 0 });
    expect(pm.path[2]).toEqual({ x: 100, y: 100 });
  });

  it('isOnPath returns true for point on the path', () => {
    expect(pm.isOnPath(50, 0, 10)).toBe(true);
    expect(pm.isOnPath(100, 50, 10)).toBe(true);
  });

  it('isOnPath returns false for point far from path', () => {
    expect(pm.isOnPath(0, 80, 10)).toBe(false);
    // Not (50, 50) — that's near the elbow with the default 10px margin
  });

  it('buildZones come from supplied slots (not auto-computed)', () => {
    expect(pm.buildZones).toHaveLength(3);
    expect(pm.buildZones[0]).toMatchObject({
      cx: 50, cy: 20, radius: 22, occupied: false,
    });
    expect(pm.buildZones[1]).toMatchObject({ cx: 20, cy: 50 });
    expect(pm.buildZones[2]).toMatchObject({ cx: 80, cy: 80 });
  });

  it('getPathPoints returns the path array', () => {
    expect(pm.getPathPoints()).toBe(pm.path);
  });

  it('getNearestPathProgress returns 0 at path start', () => {
    expect(pm.getNearestPathProgress(0, 0)).toBeCloseTo(0, 5);
  });

  it('getNearestPathProgress returns 1 at path end', () => {
    expect(pm.getNearestPathProgress(100, 100)).toBeCloseTo(1, 5);
  });

  it('getNearestPathProgress returns 0.5 at elbow of L-path', () => {
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/PathManager.test.js
```

Expected: FAIL on the constructor signature and on `buildZones` shape.

- [ ] **Step 3: Replace `PathManager.js`**

Replace the file:

```js
export class PathManager {
  constructor(waypoints, towerSlots, canvasWidth, canvasHeight) {
    this.path = waypoints.map(([nx, ny]) => ({ x: nx * canvasWidth, y: ny * canvasHeight }));
    this.buildZones = (towerSlots ?? []).map(([nx, ny]) => ({
      cx: nx * canvasWidth,
      cy: ny * canvasHeight,
      radius: 22,
      occupied: false,
    }));
  }

  isOnPath(x, y, margin = 40) {
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      if (Math.hypot(p1.x + t * dx - x, p1.y + t * dy - y) < margin) return true;
    }
    return false;
  }

  getPathPoints() {
    return this.path;
  }

  getNearestPathProgress(x, y) {
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const len = Math.hypot(
        this.path[i + 1].x - this.path[i].x,
        this.path[i + 1].y - this.path[i].y,
      );
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return 0;
    let bestDist = Infinity, bestProgress = 0, accumulated = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
        ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestProgress = (accumulated + t * segLens[i]) / totalLen;
      }
      accumulated += segLens[i];
    }
    return bestProgress;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/PathManager.test.js
```

Expected: 8 passing.

- [ ] **Step 5: Run the full test suite to surface any callers that broke**

```bash
npx vitest run
```

Expected: some failures in `GameScene` / call sites that pass only 3 args to `PathManager`. Note the failures and proceed — they'll be fixed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/systems/PathManager.js src/systems/PathManager.test.js
git commit -m "$(cat <<'EOF'
refactor(path-manager): consume towerSlots data; drop _computeZones + renderPath

PathManager constructor now takes (waypoints, towerSlots, w, h) —
zones come from map.towerSlots (hand-placed) instead of midpoint
auto-generation. renderPath removed (PathRenderer handles drawing).

GameScene caller updated in next commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: BootScene — preload all 10 background PNGs (graceful)

**Files:**
- Modify: `src/scenes/BootScene.js`
- Create: `src/scenes/BootScene.test.js`

Loader registers all 10 PNGs. If a file is missing (which it will be until the user generates them), Phaser logs a 404 and the runtime fallback (solid `map.background`) kicks in — the game still runs.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/BootScene.test.js`:

```js
import BootScene from './BootScene.js';
import { MAPS } from '../data/maps.js';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} } },
}));
vi.mock('../systems/SaveManager.js', () => ({ SaveManager: class {} }));
vi.mock('../systems/AudioManager.js', () => ({ getOrCreateAudioManager: () => ({ loadAssets() {} }) }));

describe('BootScene', () => {
  it('preloads one image per map in MAPS', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = {
      image: (key, path) => loaded.push({ key, path }),
    };
    scene.preload();

    for (const m of MAPS) {
      const expectedKey = `bg_map_${m.id}`;
      const expectedPath = `assets/backgrounds/${m.backgroundImage}`;
      const found = loaded.find(l => l.key === expectedKey);
      expect(found).toBeDefined();
      expect(found.path).toBe(expectedPath);
    }
  });

  it('still preloads the spark particle texture', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = { image: (key, path) => loaded.push({ key, path }) };
    scene.preload();
    expect(loaded.find(l => l.key === 'spark')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/scenes/BootScene.test.js
```

Expected: FAIL — `bg_map_0` not found in loaded list.

- [ ] **Step 3: Update `BootScene.js`**

Replace the file:

```js
import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager.js';
import { getOrCreateAudioManager } from '../systems/AudioManager.js';
import { MAPS } from '../data/maps.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const sm = new SaveManager();
    this.game.registry.set('save', sm);
    const am = getOrCreateAudioManager(this.game, sm);
    am.loadAssets(this);
    this.load.image('spark', 'particles/spark.png');

    // Preload all 10 map backdrop PNGs. Missing files log a 404 but
    // don't crash — GameScene falls back to the solid map.background color.
    for (const m of MAPS) {
      this.load.image(`bg_map_${m.id}`, `assets/backgrounds/${m.backgroundImage}`);
    }
  }

  create() {
    this.scene.start('MenuScene');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/scenes/BootScene.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BootScene.js src/scenes/BootScene.test.js
git commit -m "$(cat <<'EOF'
feat(boot-scene): preload all 10 map background PNGs

Adds `bg_map_<id>` texture keys for the new bitmap backdrops.
Missing PNGs log 404 but don't crash — GameScene falls back to
the solid map.background color.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: GameScene — composite backdrop + blockers + path + platforms

**Files:**
- Modify: `src/scenes/GameScene.js`

Wires the new renderers. Backdrop image at depth 0 (or color fallback). New `_renderStaticLayers()` paints blockers + platforms + path into a fresh `Graphics` once at scene start (they don't change per frame). Existing `this.gfx` keeps drawing dynamic things (tower selection ring, range circles, etc.) per frame.

- [ ] **Step 1: Update `GameScene.create()` to pass slots into PathManager and add the static-layer graphics**

In `src/scenes/GameScene.js`, find the `create()` method (~line 80-170) and locate where `PathManager` is constructed and where `setBackgroundColor` is called. Apply these two changes:

**Change A — PathManager constructor call.** Find:

```js
this.pathMgr = new PathManager(map.waypoints, this.scale.width, this.scale.height);
```

Replace with:

```js
this.pathMgr = new PathManager(map.waypoints, map.towerSlots, this.scale.width, this.scale.height);
```

**Change B — background rendering.** Find:

```js
this.gfx = this.add.graphics();
this.cameras.main.setBackgroundColor(map.background);
```

Replace with:

```js
this.gfx = this.add.graphics();
this.cameras.main.setBackgroundColor(map.background);  // fallback if PNG missing

// Backdrop image (depth 0)
const bgKey = `bg_map_${map.id}`;
if (this.textures.exists(bgKey)) {
  this.add.image(this.scale.width / 2, this.scale.height / 2, bgKey)
    .setDisplaySize(this.scale.width, this.scale.height)
    .setDepth(0);
}

// Static layers: backdrop drawing of blockers + platforms + path.
// Painted once at scene start; doesn't redraw per frame.
this._staticLayers = this.add.graphics().setDepth(20);
this._renderStaticLayers(map);
```

- [ ] **Step 2: Add the `_renderStaticLayers` method and import the new modules**

At the top of `GameScene.js`, add imports near the existing imports:

```js
import { renderPath } from '../systems/PathRenderer.js';
import { renderPlatforms } from '../systems/PlatformRenderer.js';
import { computeBlockerPlacements } from '../systems/BlockerPlacement.js';
import { BLOCKER_TYPES } from '../data/blockerTypes.js';
```

Then add this method to the class (place near other render helpers, e.g. near `_drawPathLabels` or before `update`):

```js
_renderStaticLayers(map) {
  const g = this._staticLayers;
  g.clear();

  // Spec depth order (bottom → top): blockers (10) → platforms (15) → path (20).
  // Since all three share one Graphics, render order = draw order.

  // === Blockers ===
  const placements = computeBlockerPlacements(this.pathMgr.path, map.blockerVocab, map.blockerSeed);
  for (const p of placements) {
    const type = BLOCKER_TYPES[p.type];
    if (!type) continue;
    const tint = type.defaultTint(map.id);
    type.draw(g, p.x, p.y, p.scale, tint);
  }

  // === Platforms ===
  renderPlatforms(g, this.pathMgr.buildZones, map.id);

  // === Path (drawn last so it sits on top per spec §4 depth ordering) ===
  renderPath(g, this.pathMgr.path, map.pathRenderStyle);
},
```

- [ ] **Step 3: Remove the now-unused `pathMgr.renderPath` call**

Search GameScene for any remaining `this.pathMgr.renderPath` call and delete it (Task 8 removed the method). Likely line in `update()` or a per-frame draw helper.

Run:

```bash
grep -n "renderPath" src/scenes/GameScene.js
```

If any matches appear, delete those lines.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all green. If `GameScene.shutdown.test.js` or other GameScene tests fail because of the new `_staticLayers`, add `this._staticLayers?.destroy(); this._staticLayers = null;` to the shutdown method.

- [ ] **Step 5: Browser smoke test**

```bash
npm run dev
```

Open the served URL → MapSelect → click Map 0 (Outpost Sigma). Expected:
- Solid color background (PNG not present yet — fallback OK).
- Curved path between waypoints (no more 90° angles).
- 6 platform discs visible with `+` glyphs.
- Procedural blockers visible at each path bend.
- Towers can be placed by clicking on a platform.

Repeat for Map 4 (Asteroid Belt) — should look distinctly different from Map 0 even without the PNG (different blocker types, dashed path style).

If a regression appears (path missing, towers can't place, etc.), STOP and fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(game-scene): composite backdrop + blockers + curved path + platforms

Adds bitmap backdrop layer (depth 0) with solid-color fallback. New
_renderStaticLayers() paints blockers (via BlockerPlacement) + curved
themed path (via PathRenderer) + theme-styled slot discs (via
PlatformRenderer) into a single Graphics painted once at scene start.

Drops the old straight grey-line path render.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `TowerPlacementManager.getNearestSlot` + tighten placement click

**Files:**
- Modify: `src/systems/TowerPlacementManager.js`
- Modify: `src/systems/TowerPlacementManager.test.js`
- Modify: `src/scenes/GameScene.js`

Spec §6.1: add `getNearestSlot(worldX, worldY, snapPx, requireFree)` to `TowerPlacementManager`. Tighten the visible-slot click radius. This method becomes the single source of truth for "is this click on a usable slot?" — both Task 11 (placement) and Task 12 (barracks reposition) call it.

- [ ] **Step 1: Add failing test for `getNearestSlot`**

Append to `src/systems/TowerPlacementManager.test.js`:

```js
describe('TowerPlacementManager.getNearestSlot', () => {
  const zones = [
    { cx: 100, cy: 100, radius: 22, occupied: false },
    { cx: 200, cy: 100, radius: 22, occupied: true  },
    { cx: 300, cy: 100, radius: 22, occupied: false },
  ];

  it('returns the nearest free slot within snapPx', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    const result = mgr.getNearestSlot(105, 100, 22, true);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(0);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('returns null when no slot within snapPx', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    expect(mgr.getNearestSlot(500, 500, 22, true)).toBeNull();
  });

  it('with requireFree=true, skips occupied slots even if they are nearer', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    // (210,100) is closest to occupied slot 1 (10px away) but slot 0 (110px) and slot 2 (90px) are free
    const result = mgr.getNearestSlot(210, 100, 100, true);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(2);
  });

  it('with requireFree=false, returns the nearest slot regardless of occupied state', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    const result = mgr.getNearestSlot(210, 100, 100, false);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/TowerPlacementManager.test.js
```

Expected: 4 new tests fail — `mgr.getNearestSlot is not a function`.

- [ ] **Step 3: Implement `getNearestSlot` on `TowerPlacementManager`**

Add this method to the `TowerPlacementManager` class in `src/systems/TowerPlacementManager.js` (just after `getTowerAtZone`):

```js
  /**
   * Find the nearest slot to (worldX, worldY) within `snapPx` pixels.
   * If requireFree is true, skips occupied slots.
   * Returns { slotIndex, x, y } or null.
   */
  getNearestSlot(worldX, worldY, snapPx, requireFree = true) {
    let bestIdx = -1;
    let bestDist = snapPx;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (requireFree && z.occupied) continue;
      const d = Math.hypot(z.cx - worldX, z.cy - worldY);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1) return null;
    return { slotIndex: bestIdx, x: this.zones[bestIdx].cx, y: this.zones[bestIdx].cy };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/systems/TowerPlacementManager.test.js
```

Expected: all tests (including the 4 new ones) pass.

- [ ] **Step 5: Refactor the GameScene placement click handler to use `getNearestSlot`**

Find this block in `src/scenes/GameScene.js` (search `placementManager.getZones`):

```js
    // 5. Tower placement
    if (this.selectedType) {
      const zones = this.placementManager.getZones();
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
          const tower = this.placementManager.placeTower(i, this.selectedType, this);
          if (!tower) { this._toast('Not enough gold!'); return; }
          if (this.selectedType === 'barracks') {
            tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(zone.cx, zone.cy);
            tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
          }
          return;
        }
      }
      return;
```

Replace with:

```js
    // 5. Tower placement — snap to the nearest free slot within disc radius
    if (this.selectedType) {
      const slot = this.placementManager.getNearestSlot(mx, my, 22, true);
      if (slot) {
        const tower = this.placementManager.placeTower(slot.slotIndex, this.selectedType, this);
        if (!tower) { this._toast('Not enough gold!'); return; }
        if (this.selectedType === 'barracks') {
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(slot.x, slot.y);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        }
      }
      return;
```

(snapPx of 22 = disc radius, matches the visual platform).

- [ ] **Step 6: Run the full test suite**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 7: Browser verify**

```bash
npm run dev
```

- Clicking *on* an empty platform places the selected tower.
- Clicking on the grass *next to* a platform does nothing (no tower placed, no money spent).
- Clicking on an occupied platform opens that tower's panel (existing behavior).

- [ ] **Step 8: Commit**

```bash
git add src/systems/TowerPlacementManager.js src/systems/TowerPlacementManager.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(tower-placement): add getNearestSlot + tighten click hit-test

New TowerPlacementManager.getNearestSlot(x, y, snapPx, requireFree)
gives a single source of truth for "is this click on a usable slot?"
GameScene's placement handler now snaps clicks to within the visible
platform disc (snapPx = 22, the disc radius).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Barracks reposition — snap to nearest free slot

**Files:**
- Modify: `src/scenes/GameScene.js`

Find the reposition click handler (search `repositionMode && this.repositioningBarracks`). Update its click-resolution to snap to nearest *free* `placementMgr` zone rather than free-form coords.

- [ ] **Step 1: Locate the reposition click resolution**

```bash
grep -n "repositionMode && this.repositioningBarracks" src/scenes/GameScene.js
```

Expected two matches: one in the pointerdown handler (~line 805) and one in update or pointer move (~line 1206).

- [ ] **Step 2: Update the pointerdown resolution to use `getNearestSlot` (free filter)**

In the pointerdown handler block (the first match around line 805-815), replace the body with:

```js
if (this.repositionMode && this.repositioningBarracks) {
  const barracks = this.repositioningBarracks;
  // Use getNearestSlot (added in Task 11) with requireFree=true and a
  // 60px reposition snap range (looser than the 22px placement radius
  // because the player is dragging, not single-clicking a target).
  const slot = this.placementManager.getNearestSlot(worldX, worldY, 60, true);
  if (!slot) {
    // No valid target — cancel reposition silently
    this.repositionMode = false;
    this.repositioningBarracks = null;
    return;
  }
  // Free the old slot, occupy the new one, move barracks.
  const zones = this.placementManager.getZones();
  zones[barracks.zoneIndex].occupied = false;
  zones[slot.slotIndex].occupied = true;
  barracks.zoneIndex = slot.slotIndex;
  barracks.setPosition(slot.x, slot.y);
  this.repositionMode = false;
  this.repositioningBarracks = null;
  return;
}
```

If the existing block contains `_clearReposition()` or similar helpers, preserve those calls in place of the manual `this.repositionMode = false; this.repositioningBarracks = null;` lines.

- [ ] **Step 3: Verify in the browser**

```bash
npm run dev
```

- Play Map 0; build a Barracks. Click it → click "Reposition" in the panel.
- Click on another empty platform → barracks moves there; old slot is freed.
- Click on an occupied platform → reposition silently cancels (no move, no crash).
- Click on grass with no platform within 60px → reposition cancels.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(game-scene): barracks reposition snaps to nearest free slot

Reposition target resolution now searches the zone list for the
nearest free slot within 60px. Silently cancels if no valid target.
Properly transfers zoneIndex + occupied state.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Full-suite verification + browser playtest

**Files:** none changed in this task.

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all green. If anything fails, fix it. Common breakages to look for:

- `GameScene.shutdown.test.js` — make sure `this._staticLayers?.destroy()` is in the shutdown method.
- Any other test that constructs `PathManager(waypoints, w, h)` with the old 3-arg signature — add a `towerSlots` arg (use an empty array `[]` if the test doesn't care about zones).

- [ ] **Step 2: Browser playthrough — all 10 maps**

```bash
npm run dev
```

For each map (open MapSelect, click each in turn):

1. Path renders curved (no 90° angles).
2. Blockers are visible at each path bend.
3. Tower platforms are visible and click-targetable.
4. Slot count visually matches `6 + map.id`.
5. Tower placement only succeeds on platforms.
6. Background color (or PNG if user has generated it) is correct per theme.

For Map 0 (Outpost Sigma) also play through one full wave and confirm:
- Enemies still walk along the (straight-segment) path correctly.
- Tower targeting and combat work.
- Hero spawn + abilities work.

- [ ] **Step 3: Push the branch + open the PR**

```bash
git push -u origin feature/space-themed-backgrounds
gh pr create --title "feat: space-themed backgrounds + restricted tower placement" --body "$(cat <<'EOF'
## Summary
- AI-generated bitmap backdrops per map (hybrid pipeline: bitmap + procedural overlay)
- Curved bezier path rendering with 4 theme-specific styles
- Thematic procedural blockers at every path bend
- Hand-placed visible tower platforms; placement restricted to slots (6 + map.id per map)
- Barracks reposition snaps to nearest free slot

PNG assets are generated by the user separately via Midjourney using prompts in `assets/backgrounds/PROMPTS.md`. Game runs correctly without the PNGs (solid-color fallback) — bitmaps are an optional polish layer.

Spec: docs/superpowers/specs/2026-06-06-space-themed-backgrounds-design.md
Plan: docs/superpowers/plans/2026-06-06-space-themed-backgrounds.md

## Test plan
- [ ] All vitest tests green
- [ ] Play through Map 0 — wave completes, towers/hero/enemies all working
- [ ] Each of the 10 maps loads with distinct theming visible
- [ ] Tower placement only works on platform discs
- [ ] Barracks reposition snaps to free slot

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify CI passes on the opened PR.**

If any CI failure appears, fix it before merging.

---

## Done

All 13 tasks complete. The branch ships:
- Curved themed paths replacing flat colored lines.
- Procedural thematic blockers justifying every bend.
- Visible tower platforms with restricted placement.
- Bitmap backdrop pipeline ready (game runs without PNGs; user adds them as art is generated).
- 105 hand-placed tower slots covering all 10 maps.

Follow-up work (already in backlog):
- **#7** Animated background layer per theme.
- **#5 fine-tuning** — adjust individual slot positions per playtest feedback.
