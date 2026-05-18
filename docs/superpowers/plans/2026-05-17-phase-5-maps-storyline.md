# Phase 5: Maps & Storyline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Last Light from 2 prototype maps to a full 10-map campaign with persistent star ratings, a map select screen, and a slide-in story banner system.

**Architecture:** Two sub-phases — 5a adds pure data+logic (new enemy types, map defs, waves, ProgressManager) with zero scene changes; 5b builds the UI (MapSelectScene, StoryManager, GameScene wiring). All new systems are unit-tested before wiring.

**Tech Stack:** Phaser 3, Vanilla JS ES modules, Vitest + jsdom for tests, localStorage for persistence, DOM for UI panels

**Spec:** `docs/superpowers/specs/2026-05-17-phase-5-maps-storyline-design.md`

---

## File Map

**Created:**
- `src/utils/display.js` — `starsDisplay(n)` shared utility
- `src/data/story.js` — STORY_PANELS data keyed by storyKey
- `src/systems/ProgressManager.js` — localStorage wrapper for star ratings and unlock state
- `src/systems/ProgressManager.test.js`
- `src/systems/StoryManager.js` — story banner show/hide logic
- `src/systems/StoryManager.test.js`
- `src/scenes/MapSelectScene.js` — map select screen (replaces MenuScene body)

**Modified:**
- `src/data/enemies.js` — add `phantom` and `titan` entries
- `src/data/enemies.test.js` — add specific assertions for phantom/titan properties
- `src/data/maps.js` — expand 2 → 10 maps, add `blurb` field to all
- `src/data/maps.test.js` — add `blurb` to REQUIRED array
- `src/data/waves.js` — add MAP_WAVES[2–9]
- `src/data/waves.test.js` — tests for new wave entries
- `src/entities/Enemy.js` — add phantom + titan branches to `_redrawBody`
- `src/scenes/MenuScene.js` — redirect to MapSelectScene on create
- `src/scenes/GameScene.js` — wire ProgressManager, StoryManager, star rating, unlock flow
- `src/main.js` — import and register MapSelectScene
- `index.html` — add `#story-banner` + `#map-select` DOM elements and CSS

---

## Phase 5a — Data Layer

### Task 1: Add phantom + titan enemy definitions

**Files:**
- Modify: `src/data/enemies.js`
- Modify: `src/data/enemies.test.js`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npx vitest run src/data/enemies.test.js
```
Expected: all existing tests PASS (drone, skitter, brute, colossus)

- [ ] **Step 2: Add specific property tests to enemies.test.js**

In `src/data/enemies.test.js`, add inside the `describe('ENEMY_DEFS')` block after the existing loop:

```js
  it('phantom.flying is true', () => {
    expect(ENEMY_DEFS.phantom.flying).toBe(true);
  });

  it('titan.armor equals 20 (flat damage reduction)', () => {
    expect(ENEMY_DEFS.titan.armor).toBe(20);
  });
```

- [ ] **Step 3: Run tests — confirm new tests FAIL**

```bash
npx vitest run src/data/enemies.test.js
```
Expected: FAIL — `ENEMY_DEFS.phantom is undefined`

- [ ] **Step 4: Add phantom and titan to enemies.js**

In `src/data/enemies.js`, add two entries to the `ENEMY_DEFS` object after `colossus`:

```js
  phantom: { type: 'phantom', name: 'Veth Phantom', hp: 60,  speed: 140, reward: 12, armor: 0,  color: 0x9b59b6, radius: 9,  flying: true  },
  titan:   { type: 'titan',   name: 'Veth Titan',   hp: 800, speed: 28,  reward: 80, armor: 20, color: 0xe74c3c, radius: 22, flying: false },
```

- [ ] **Step 5: Run tests — confirm all pass**

```bash
npx vitest run src/data/enemies.test.js
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/enemies.js src/data/enemies.test.js
git commit -m "feat: add phantom and titan enemy definitions"
```

---

### Task 2: Expand maps.js to 10 maps with blurb field

**Files:**
- Modify: `src/data/maps.js`
- Modify: `src/data/maps.test.js`

- [ ] **Step 1: Run existing map tests to establish baseline**

```bash
npx vitest run src/data/maps.test.js
```
Expected: all existing tests PASS (2 maps)

- [ ] **Step 2: Add blurb to REQUIRED in maps.test.js**

In `src/data/maps.test.js`, change the `REQUIRED` constant:

```js
const REQUIRED = ['id','name','background','pathColor','waypoints','startGold',
                  'startLives','unlockCost','waveCount','maxTierAllowed','storyKey','blurb'];
```

- [ ] **Step 3: Run tests — confirm blurb check fails**

```bash
npx vitest run src/data/maps.test.js
```
Expected: FAIL — maps 0 and 1 missing `blurb`

- [ ] **Step 4: Replace maps.js with all 10 map definitions**

Replace the entire content of `src/data/maps.js`:

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
  },
];
```

- [ ] **Step 5: Run tests — confirm all pass**

```bash
npx vitest run src/data/maps.test.js
```
Expected: 20 tests PASS (2 per map × 10 maps)

- [ ] **Step 6: Commit**

```bash
git add src/data/maps.js src/data/maps.test.js
git commit -m "feat: expand maps to 10 with blurb field and new waypoints"
```

---

### Task 3: Add MAP_WAVES[2–9] to waves.js

**Files:**
- Modify: `src/data/waves.js`
- Modify: `src/data/waves.test.js`

- [ ] **Step 1: Run existing wave tests to establish baseline**

```bash
npx vitest run src/data/waves.test.js
```
Expected: all existing tests PASS

- [ ] **Step 2: Add wave tests for maps 2–9 to waves.test.js**

Add after the existing `describe` block in `src/data/waves.test.js`:

```js
const VALID_TYPES = new Set(['drone', 'skitter', 'brute', 'phantom', 'titan']);
const WAVE_COUNTS = { 2: 12, 3: 12, 4: 14, 5: 14, 6: 15, 7: 15, 8: 16, 9: 18 };

for (const [mapId, count] of Object.entries(WAVE_COUNTS)) {
  describe(`MAP_WAVES[${mapId}]`, () => {
    const waves = MAP_WAVES[Number(mapId)];

    it(`has exactly ${count} waves`, () => {
      expect(waves).toHaveLength(count);
    });

    it('contains no colossus enemies', () => {
      for (const wave of waves) {
        for (const group of wave) {
          expect(group.type).not.toBe('colossus');
        }
      }
    });

    it('all groups have a valid type, positive count, and positive interval', () => {
      for (const wave of waves) {
        for (const group of wave) {
          expect(VALID_TYPES.has(group.type)).toBe(true);
          expect(group.count).toBeGreaterThan(0);
          expect(group.interval).toBeGreaterThan(0);
        }
      }
    });
  });
}
```

- [ ] **Step 3: Run tests — confirm new tests FAIL**

```bash
npx vitest run src/data/waves.test.js
```
Expected: FAIL — MAP_WAVES[2] through [9] are undefined

- [ ] **Step 4: Add MAP_WAVES[2–9] to waves.js**

In `src/data/waves.js`, add entries inside the `MAP_WAVES` object after the existing `0:` entry:

```js
  2: [
    [{ type: 'drone',   count: 8,  interval: 1100 }],
    [{ type: 'skitter', count: 6,  interval: 900  }],
    [{ type: 'drone',   count: 10, interval: 1000 }, { type: 'skitter', count: 4, interval: 850 }],
    [{ type: 'brute',   count: 5,  interval: 1300 }],
    [{ type: 'drone',   count: 12, interval: 950  }, { type: 'brute',   count: 3, interval: 1300 }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'brute',   count: 4, interval: 1200 }],
    [{ type: 'drone',   count: 10, interval: 900  }, { type: 'skitter', count: 6, interval: 780  }],
    [{ type: 'brute',   count: 7,  interval: 1100 }],
    [{ type: 'drone',   count: 12, interval: 850  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 6, interval: 1000 }],
    [{ type: 'drone',   count: 15, interval: 800  }, { type: 'skitter', count: 8, interval: 700  }],
    [{ type: 'drone',   count: 20, interval: 650  }, { type: 'brute',   count: 8, interval: 900  }],
  ],

  3: [
    [{ type: 'drone',   count: 8,  interval: 1050 }],
    [{ type: 'skitter', count: 7,  interval: 850  }],
    [{ type: 'brute',   count: 5,  interval: 1250 }],
    [{ type: 'phantom', count: 4,  interval: 1000 }],
    [{ type: 'drone',   count: 10, interval: 950  }, { type: 'phantom', count: 3, interval: 900  }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'phantom', count: 4, interval: 850  }],
    [{ type: 'brute',   count: 6,  interval: 1100 }, { type: 'drone',   count: 8, interval: 950  }],
    [{ type: 'phantom', count: 6,  interval: 800  }, { type: 'skitter', count: 5, interval: 780  }],
    [{ type: 'drone',   count: 12, interval: 850  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 8,  interval: 750  }, { type: 'drone',   count: 8, interval: 850  }],
    [{ type: 'brute',   count: 7,  interval: 1000 }, { type: 'phantom', count: 6, interval: 750  }],
    [{ type: 'drone',   count: 15, interval: 750  }, { type: 'phantom', count: 8, interval: 700  }, { type: 'brute', count: 5, interval: 1000 }],
  ],

  4: [
    [{ type: 'drone',   count: 10, interval: 1000 }],
    [{ type: 'phantom', count: 5,  interval: 950  }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'phantom', count: 4, interval: 850  }],
    [{ type: 'brute',   count: 6,  interval: 1200 }],
    [{ type: 'drone',   count: 12, interval: 900  }, { type: 'phantom', count: 5, interval: 850  }],
    [{ type: 'skitter', count: 9,  interval: 750  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 8,  interval: 800  }, { type: 'drone',   count: 10, interval: 900 }],
    [{ type: 'brute',   count: 8,  interval: 1050 }, { type: 'skitter', count: 6, interval: 750  }],
    [{ type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 6, interval: 720  }],
    [{ type: 'drone',   count: 14, interval: 850  }, { type: 'brute',   count: 6, interval: 1000 }],
    [{ type: 'phantom', count: 8,  interval: 700  }, { type: 'brute',   count: 7, interval: 950  }],
    [{ type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 6, interval: 750  }],
    [{ type: 'drone',   count: 16, interval: 800  }, { type: 'phantom', count: 8, interval: 750  }, { type: 'brute', count: 5, interval: 1000 }],
    [{ type: 'drone',   count: 20, interval: 650  }, { type: 'brute',   count: 8, interval: 900  }, { type: 'phantom', count: 8, interval: 700 }],
  ],

  5: [
    [{ type: 'drone',   count: 10, interval: 950  }],
    [{ type: 'phantom', count: 6,  interval: 900  }],
    [{ type: 'skitter', count: 10, interval: 780  }],
    [{ type: 'brute',   count: 7,  interval: 1150 }],
    [{ type: 'phantom', count: 8,  interval: 820  }, { type: 'drone',   count: 8, interval: 900  }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 6, interval: 720  }],
    [{ type: 'drone',   count: 15, interval: 850  }, { type: 'brute',   count: 6, interval: 1050 }],
    [{ type: 'phantom', count: 10, interval: 700  }, { type: 'brute',   count: 7, interval: 1000 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'phantom', count: 8,  interval: 750 }],
    [{ type: 'titan',   count: 2,  interval: 4000 }, { type: 'drone',   count: 15, interval: 750 }],
    [{ type: 'titan',   count: 2,  interval: 4000 }, { type: 'brute',   count: 8,  interval: 900 }, { type: 'phantom', count: 6, interval: 750 }],
  ],

  6: [
    [{ type: 'drone',   count: 12, interval: 900  }],
    [{ type: 'phantom', count: 8,  interval: 850  }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'phantom', count: 5, interval: 800  }],
    [{ type: 'brute',   count: 8,  interval: 1100 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 10, interval: 850 }],
    [{ type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 8,  interval: 730 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'brute',   count: 6,  interval: 1050 }],
    [{ type: 'drone',   count: 16, interval: 800  }, { type: 'phantom', count: 8,  interval: 780 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'skitter', count: 8,  interval: 720 }],
    [{ type: 'brute',   count: 8,  interval: 1000 }, { type: 'phantom', count: 10, interval: 750 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'phantom', count: 12, interval: 700  }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'phantom', count: 8, interval: 750 }, { type: 'drone', count: 10, interval: 800 }],
    [{ type: 'drone',   count: 18, interval: 750  }, { type: 'brute',   count: 8,  interval: 900 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'phantom', count: 10, interval: 700 }, { type: 'skitter', count: 8, interval: 700 }],
  ],

  7: [
    [{ type: 'phantom', count: 10, interval: 800  }],
    [{ type: 'drone',   count: 14, interval: 850  }],
    [{ type: 'phantom', count: 12, interval: 750  }, { type: 'skitter', count: 6, interval: 730  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 10, interval: 850 }],
    [{ type: 'phantom', count: 14, interval: 700  }, { type: 'brute',   count: 5,  interval: 1050 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'phantom', count: 8,  interval: 750 }],
    [{ type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 8,  interval: 1000 }],
    [{ type: 'phantom', count: 16, interval: 680  }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'skitter', count: 10, interval: 700 }, { type: 'phantom', count: 8, interval: 730 }],
    [{ type: 'drone',   count: 20, interval: 750  }, { type: 'phantom', count: 12, interval: 700 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'phantom', count: 18, interval: 650  }, { type: 'skitter', count: 10, interval: 680 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 15, interval: 750 }, { type: 'phantom', count: 8, interval: 700 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 15, interval: 650 }, { type: 'brute',   count: 8, interval: 900 }],
  ],

  8: [
    [{ type: 'drone',   count: 15, interval: 850  }],
    [{ type: 'phantom', count: 12, interval: 750  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'skitter', count: 10, interval: 730 }],
    [{ type: 'phantom', count: 14, interval: 720  }, { type: 'brute',   count: 6,  interval: 1050 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 8,  interval: 1000 }, { type: 'phantom', count: 8, interval: 750 }],
    [{ type: 'drone',   count: 18, interval: 780  }, { type: 'phantom', count: 12, interval: 700 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'phantom', count: 18, interval: 660  }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 16, interval: 780 }, { type: 'phantom', count: 8, interval: 720 }],
    [{ type: 'skitter', count: 14, interval: 680  }, { type: 'phantom', count: 12, interval: 700 }, { type: 'brute', count: 8, interval: 950 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'phantom', count: 14, interval: 680 }],
    [{ type: 'drone',   count: 22, interval: 720  }, { type: 'titan',   count: 2,  interval: 4000 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 12, interval: 670 }, { type: 'brute', count: 8, interval: 900 }],
    [{ type: 'titan',   count: 5,  interval: 5000 }, { type: 'phantom', count: 18, interval: 640 }, { type: 'skitter', count: 12, interval: 680 }],
  ],

  9: [
    [{ type: 'phantom', count: 12, interval: 750  }],
    [{ type: 'drone',   count: 18, interval: 800  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'skitter', count: 14, interval: 700  }, { type: 'brute',   count: 8,  interval: 1000 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 14, interval: 780 }],
    [{ type: 'phantom', count: 16, interval: 680  }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 10, interval: 950 }, { type: 'phantom', count: 8, interval: 730 }],
    [{ type: 'drone',   count: 20, interval: 750  }, { type: 'phantom', count: 14, interval: 700 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'skitter', count: 12, interval: 690 }],
    [{ type: 'phantom', count: 20, interval: 650  }, { type: 'brute',   count: 10, interval: 920 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 18, interval: 760 }, { type: 'phantom', count: 10, interval: 710 }],
    [{ type: 'skitter', count: 16, interval: 670  }, { type: 'phantom', count: 14, interval: 680 }, { type: 'brute', count: 8, interval: 950 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 12, interval: 670 }, { type: 'drone', count: 14, interval: 780 }],
    [{ type: 'drone',   count: 24, interval: 700  }, { type: 'titan',   count: 3,  interval: 4500 }],
    [{ type: 'phantom', count: 20, interval: 640  }, { type: 'titan',   count: 3,  interval: 4500 }, { type: 'brute', count: 10, interval: 900 }],
    [{ type: 'titan',   count: 5,  interval: 5000 }, { type: 'skitter', count: 16, interval: 660 }, { type: 'phantom', count: 14, interval: 660 }],
    [{ type: 'titan',   count: 5,  interval: 5000 }, { type: 'drone',   count: 22, interval: 720 }, { type: 'phantom', count: 16, interval: 650 }],
    [{ type: 'titan',   count: 6,  interval: 5500 }, { type: 'phantom', count: 24, interval: 620 }, { type: 'brute', count: 12, interval: 880 }],
  ],
```

- [ ] **Step 5: Run tests — confirm all pass**

```bash
npx vitest run src/data/waves.test.js
```
Expected: all PASS (existing 5 + new 3×8 = 29 tests)

- [ ] **Step 6: Commit**

```bash
git add src/data/waves.js src/data/waves.test.js
git commit -m "feat: add MAP_WAVES[2-9] with phantom and titan enemies"
```

---

### Task 4: Add phantom + titan visual shapes to Enemy._redrawBody

**Files:**
- Modify: `src/entities/Enemy.js`

No automated tests — verified visually in the browser after Task 11.

- [ ] **Step 1: Insert phantom and titan branches into _redrawBody**

In `src/entities/Enemy.js`, find the `_redrawBody` method. Locate this exact block:

```js
    } else {
      // Fallback for unknown types (colossus, future enemies)
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }
```

Replace it with:

```js
    } else if (t === 'phantom') {
      // Outer translucent ring — ghostly form
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillCircle(0, 0, r * 1.8);
      this._body.lineStyle(2, this.def.color, 0.7);
      this._body.strokeCircle(0, 0, r * 1.4);
      // Solid inner core
      this._body.fillStyle(this.def.color, 0.9);
      this._body.fillCircle(0, 0, r * 0.6);
    } else if (t === 'titan') {
      // Triple-layer hexagon: dark armor shell, mid layer, bright core
      this._body.fillStyle(0x1a0000, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(0x660000, 1);
      this._body.fillPoints(this._hexPoints(r * 0.72), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.44), true);
    } else {
      // Fallback for unknown types (colossus)
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/entities/Enemy.js
git commit -m "feat: add phantom and titan visual shapes to Enemy._redrawBody"
```

---

### Task 5: Create ProgressManager

**Files:**
- Create: `src/systems/ProgressManager.js`
- Create: `src/systems/ProgressManager.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/systems/ProgressManager.test.js`:

```js
import { ProgressManager } from './ProgressManager.js';

const STORAGE_KEY = 'lastlight_progress';

beforeEach(() => {
  localStorage.clear();
});

describe('ProgressManager', () => {
  it('fresh load: all stars are 0, only map 0 unlocked', () => {
    const pm = new ProgressManager();
    for (let i = 0; i < 10; i++) expect(pm.getStars(i)).toBe(0);
    expect(pm.isUnlocked(0)).toBe(true);
    expect(pm.isUnlocked(1)).toBe(false);
  });

  it('setStars upgrades but never downgrades', () => {
    const pm = new ProgressManager();
    pm.setStars(0, 1);
    expect(pm.getStars(0)).toBe(1);
    pm.setStars(0, 3);
    expect(pm.getStars(0)).toBe(3);
    pm.setStars(0, 1);
    expect(pm.getStars(0)).toBe(3);
  });

  it('beating map N unlocks map N+1 via isUnlocked', () => {
    const pm = new ProgressManager();
    expect(pm.isUnlocked(1)).toBe(false);
    pm.setStars(0, 2);
    expect(pm.isUnlocked(1)).toBe(true);
  });

  it('map 0 is always unlocked regardless of storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0,0,0,0,0,0,0,0,0,0]));
    const pm = new ProgressManager();
    expect(pm.isUnlocked(0)).toBe(true);
  });

  it('unlockNext(9) is a no-op — does not throw', () => {
    const pm = new ProgressManager();
    expect(() => pm.unlockNext(9)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
npx vitest run src/systems/ProgressManager.test.js
```
Expected: FAIL — `ProgressManager` not found

- [ ] **Step 3: Implement ProgressManager**

Create `src/systems/ProgressManager.js`:

```js
const STORAGE_KEY = 'lastlight_progress';
const MAP_COUNT   = 10;

export class ProgressManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Array(MAP_COUNT).fill(0);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === MAP_COUNT) return parsed;
    } catch (_) { /* ignore corrupt data */ }
    return new Array(MAP_COUNT).fill(0);
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  getStars(mapId) {
    return this._data[mapId] ?? 0;
  }

  setStars(mapId, stars) {
    if (stars > this._data[mapId]) {
      this._data[mapId] = stars;
      this._save();
    }
  }

  isUnlocked(mapId) {
    if (mapId === 0) return true;
    return this._data[mapId - 1] > 0;
  }

  // Unlock is implicit: isUnlocked(N+1) reads getStars(N) > 0.
  // setStars() already persisted the result, so this is a semantic no-op.
  unlockNext(mapId) {}
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npx vitest run src/systems/ProgressManager.test.js
```
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/ProgressManager.js src/systems/ProgressManager.test.js
git commit -m "feat: add ProgressManager for localStorage star ratings and unlock state"
```

---

### Task 6: Create starsDisplay utility

**Files:**
- Create: `src/utils/display.js`

- [ ] **Step 1: Create the file**

Create `src/utils/display.js`:

```js
export function starsDisplay(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}
```

(U+2605 = ★, U+2606 = ☆ — using escapes to avoid encoding issues)

- [ ] **Step 2: Commit**

```bash
git add src/utils/display.js
git commit -m "feat: add starsDisplay utility"
```

---

## Phase 5b — UI Layer

### Task 7: Create STORY_PANELS data

**Files:**
- Create: `src/data/story.js`

- [ ] **Step 1: Create story.js**

Create `src/data/story.js`:

```js
export const STORY_PANELS = {
  outpost_sigma: {
    waves: {
      3: { headline: 'Intel — Wave 3', body: 'Scouts confirm three more assault waves inbound. Reinforce the eastern perimeter before they regroup.' },
      7: { headline: "Commander's Log — Wave 7", body: 'Seven waves held. Whatever is coming next is bigger than anything we have faced.' },
    },
    unlock: { headline: 'Outpost Sigma — Cleared', body: 'The line holds. Command has authorized our advance to the Lunar Gate. Move out.' },
  },
  lunar_gate: {
    waves: {
      3: { headline: 'Intel — Wave 3', body: 'Enemy units are adapting to our defensive positions. Expect faster assault patterns next.' },
      7: { headline: 'Transmission — Wave 7', body: 'The gate is nearly overwhelmed. Hold three more waves and reinforcements will reach us.' },
    },
    unlock: { headline: 'Lunar Gate — Cleared', body: 'The gateway is ours. The path to the outer installations is open. Proceed to The Crater.' },
  },
  the_crater: {
    waves: {
      4: { headline: 'Intel — Wave 4', body: 'The crater rim gives us cover, but the enemy has mapped our chokepoints. Expect a new approach vector.' },
      8: { headline: "Commander's Log — Wave 8", body: 'Four more waves to go. Our towers have held against everything thrown at us. Trust the defenses.' },
    },
    unlock: { headline: 'The Crater — Cleared', body: 'Crater sector secured. Intelligence points to a large enemy presence at the orbital station. Prepare to launch.' },
  },
  orbital_station: {
    waves: {
      4: { headline: 'Intercept — Wave 4', body: 'Enemy transmissions detected. They are calling in aerial support. Expect flying units in the next assault.' },
      8: { headline: 'Status Report — Wave 8', body: 'Station systems holding at 60%. Eight waves repelled. The enemy is throwing everything at us now.' },
    },
    unlock: { headline: 'Orbital Station — Cleared', body: 'Station secure. The enemy is retreating toward the asteroid belt. We follow.' },
  },
  asteroid_belt: {
    waves: {
      4: { headline: 'Mining Log — Wave 4', body: 'The mining platforms give us high ground, but the enemy is adapting. Multiple attack vectors now active.' },
      9: { headline: 'Field Report — Wave 9', body: 'Nine waves in the belt. The enemy is clustering larger units together. Prioritize armor-piercing towers.' },
    },
    unlock: { headline: 'Asteroid Belt — Cleared', body: "Belt sector cleared. We are entering Titan territory. Something massive is mobilizing on the surface." },
  },
  titans_reach: {
    waves: {
      5: { headline: 'Warning — Wave 5', body: 'Surface scanners detect an enormous life form — designation TITAN. Armor-piercing weapons required. Pierce is key.' },
      10: { headline: 'Emergency Broadcast — Wave 10', body: 'First Titan confirmed neutralized. There are more. Armor-piercing towers are the only thing keeping us alive.' },
    },
    unlock: { headline: "Titan's Reach — Cleared", body: "Titan forces routed. We press deeper into enemy-controlled space. There is no turning back now." },
  },
  deep_space_corridor: {
    waves: {
      5: { headline: 'Navigation Alert — Wave 5', body: 'All comm relays ahead are dark. We are operating without support. Every resource matters.' },
      10: { headline: 'Tactical Update — Wave 10', body: 'Ten waves deep in hostile territory. The corridor narrows ahead — the enemy will have nowhere to flank.' },
    },
    unlock: { headline: 'Deep Space Corridor — Cleared', body: 'Corridor secured. The Void Frontier is ahead. Whatever lives out there has been waiting for us.' },
  },
  the_void_frontier: {
    waves: {
      5: { headline: 'Sensor Report — Wave 5', body: 'Multiple Titan-class contacts emerging from the void. They travel in packs this far from the homeworld.' },
      10: { headline: 'Final Warning — Wave 10', body: 'Ten waves and our tower network is still holding. Five more to go. Do not let a single enemy through.' },
    },
    unlock: { headline: 'The Void Frontier — Cleared', body: 'The frontier falls. Enemy homeworld coordinates acquired. We know where they come from. We are going there.' },
  },
  enemy_homeworld: {
    waves: {
      5: { headline: 'Breach Confirmed — Wave 5', body: 'We are inside enemy territory. Their home defenses are unlike anything we have encountered. Hold the perimeter.' },
      11: { headline: 'Last Stand Report — Wave 11', body: 'Eleven waves inside the homeworld. Their numbers are not infinite. Keep pushing.' },
    },
    unlock: { headline: 'Enemy Homeworld — Cleared', body: 'The homeworld is broken. One final stronghold remains — their Last Light. Finish this.' },
  },
  last_light: {
    waves: {
      6: { headline: 'Final Transmission — Wave 6', body: 'Six waves of their absolute best. They are throwing everything remaining at us. This is what we trained for.' },
      12: { headline: "Commander's Last Log — Wave 12", body: 'Six waves left. If we fall here, there is no one left to defend Earth. We do not fall.' },
    },
    unlock: { headline: 'Last Light — Victory', body: 'It is over. The enemy is gone. Against everything, humanity held the line. This is the Last Light — and it burns bright.' },
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/data/story.js
git commit -m "feat: add STORY_PANELS data for all 10 maps"
```

---

### Task 8: Create StoryManager + add story-banner DOM

**Files:**
- Create: `src/systems/StoryManager.js`
- Create: `src/systems/StoryManager.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing tests**

Create `src/systems/StoryManager.test.js`:

```js
import { StoryManager } from './StoryManager.js';

const PANELS = {
  map_a: {
    waves: {
      3: { headline: 'Wave 3 headline', body: 'Wave 3 body' },
    },
    unlock: { headline: 'Unlock headline', body: 'Unlock body' },
  },
};

function buildBannerDOM() {
  const banner   = document.createElement('div');
  banner.id      = 'story-banner';
  const headline = document.createElement('div');
  headline.id    = 'story-headline';
  const body     = document.createElement('div');
  body.id        = 'story-body';
  const btn      = document.createElement('button');
  btn.id         = 'story-dismiss';
  banner.append(headline, body, btn);
  document.body.replaceChildren(banner);
}

beforeEach(buildBannerDOM);

describe('StoryManager', () => {
  it('getPanelForWave returns correct panel for valid storyKey and wave', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('map_a', 3)).toEqual({ headline: 'Wave 3 headline', body: 'Wave 3 body' });
  });

  it('getPanelForWave returns null for wave number with no panel', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('map_a', 5)).toBeNull();
  });

  it('getPanelForWave returns null for unknown storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('unknown_key', 3)).toBeNull();
  });

  it('getUnlockPanel returns correct unlock panel for valid storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getUnlockPanel('map_a')).toEqual({ headline: 'Unlock headline', body: 'Unlock body' });
  });

  it('getUnlockPanel returns null for unknown storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getUnlockPanel('unknown_key')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
npx vitest run src/systems/StoryManager.test.js
```
Expected: FAIL — `StoryManager` not found

- [ ] **Step 3: Implement StoryManager**

Create `src/systems/StoryManager.js`:

```js
export class StoryManager {
  constructor(panels) {
    this._panels    = panels;
    this._onDismiss = null;

    const btn = document.getElementById('story-dismiss');
    if (btn) {
      btn.addEventListener('click', () => {
        this.hideBanner();
        if (this._onDismiss) this._onDismiss();
      });
    }
  }

  getPanelForWave(storyKey, waveNum) {
    return this._panels[storyKey]?.waves?.[waveNum] ?? null;
  }

  getUnlockPanel(storyKey) {
    return this._panels[storyKey]?.unlock ?? null;
  }

  showBanner(panel, onDismiss) {
    this._onDismiss = onDismiss;
    document.getElementById('story-headline').textContent = panel.headline;
    document.getElementById('story-body').textContent     = panel.body;
    document.getElementById('story-banner').classList.add('visible');
  }

  hideBanner() {
    document.getElementById('story-banner').classList.remove('visible');
  }
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npx vitest run src/systems/StoryManager.test.js
```
Expected: 5 tests PASS

- [ ] **Step 5: Add #story-banner to index.html**

In `index.html`, inside `<div id="game">` before `<div id="tower-panel">`, add:

```html
    <div id="story-banner" class="story-banner">
      <div class="story-content">
        <div id="story-headline"></div>
        <div id="story-body"></div>
      </div>
      <button id="story-dismiss">&#10005;</button>
    </div>
```

- [ ] **Step 6: Add story-banner CSS to index.html**

In `index.html`, inside the `<style>` block, add after the `#game-msg button` rule:

```css
    .story-banner { position:absolute; top:-130px; left:5%; right:5%; background:linear-gradient(135deg,#0a1a2a,#0a2a1a);
                    border:1px solid #2a5a3a; border-radius:8px; padding:12px 16px; z-index:25;
                    display:flex; align-items:flex-start; gap:12px;
                    transition:transform 0.35s ease; pointer-events:none; }
    .story-banner.visible { transform:translateY(145px); pointer-events:auto; }
    .story-content { flex:1; }
    #story-headline { font-size:10px; color:#5a9a6a; letter-spacing:1px; text-transform:uppercase; margin-bottom:5px; }
    #story-body { font-size:13px; color:#ddd; line-height:1.6; }
    #story-dismiss { background:transparent; border:1px solid #3a6a4a; color:#7aba8a;
                     padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px; flex-shrink:0; }
    #story-dismiss:hover { background:#1a2a1a; }
```

- [ ] **Step 7: Commit**

```bash
git add src/systems/StoryManager.js src/systems/StoryManager.test.js index.html
git commit -m "feat: add StoryManager and story-banner DOM"
```

---

### Task 9: Create MapSelectScene + add map-select DOM

**Files:**
- Create: `src/scenes/MapSelectScene.js`
- Modify: `index.html`

- [ ] **Step 1: Add #map-select DOM to index.html**

In `index.html`, inside `<div id="game">` after `#story-banner`, add:

```html
    <div id="map-select">
      <div id="map-select-title">LAST LIGHT</div>
      <div id="map-select-layout">
        <div id="map-sidebar"></div>
        <div id="map-featured">
          <div id="featured-name"></div>
          <div id="featured-stars"></div>
          <div id="featured-blurb"></div>
          <div id="featured-tier"></div>
          <button id="featured-play">&#9654; PLAY</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Add map-select CSS to index.html**

In `index.html`, inside the `<style>` block, add after the `#story-dismiss:hover` rule:

```css
    #map-select { display:none; position:absolute; inset:0; background:#08081e; z-index:5;
                  padding:20px; flex-direction:column; font-family:'Georgia',serif; }
    #map-select-title { font-size:34px; color:#ffd700; font-weight:bold; text-align:center;
                        margin-bottom:18px; letter-spacing:4px; }
    #map-select-layout { display:flex; gap:16px; flex:1; min-height:0; overflow:hidden; }
    #map-sidebar { width:230px; overflow-y:auto; display:flex; flex-direction:column; gap:5px; }
    #map-featured { flex:1; border:2px solid #8b6914; border-radius:10px; background:#0f0f2e;
                    padding:22px; display:flex; flex-direction:column; }
    #featured-name { font-size:22px; color:#ffd700; font-weight:bold; margin-bottom:6px; }
    #featured-stars { font-size:22px; color:#ffd700; margin-bottom:14px; }
    #featured-blurb { color:#aaa; font-size:14px; line-height:1.6; flex:1; margin-bottom:14px; }
    #featured-tier { color:#7ab8ff; font-size:13px; margin-bottom:18px; }
    #featured-play { background:#8b1a1a; border:none; color:#fff; padding:12px 28px;
                     border-radius:6px; cursor:pointer; font-size:16px; font-weight:bold;
                     align-self:flex-start; }
    #featured-play:hover { background:#aa2222; }
    .map-row { border-radius:5px; padding:8px 10px; }
    .map-row.unlocked { background:#1a2e1a; border:1px solid #4a6a4a; color:#ccc; cursor:pointer; }
    .map-row.unlocked:hover { border-color:#ffd700; background:#252515; }
    .map-row.unlocked.active { border-color:#ffd700; background:#2a2a1a; }
    .map-row.locked { background:#111; border:1px dashed #333; color:#555; }
    .map-row-name { font-size:12px; font-weight:bold; }
    .map-row-stars { font-size:11px; color:#ffd700; min-height:16px; }
```

- [ ] **Step 3: Create MapSelectScene.js**

Create `src/scenes/MapSelectScene.js`:

```js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { ProgressManager } from '../systems/ProgressManager.js';
import { starsDisplay } from '../utils/display.js';

export default class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelectScene'); }

  create() {
    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._progressMgr = new ProgressManager();

    // Default to highest unlocked map
    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._progressMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateSidebar();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
  }

  _populateSidebar() {
    const sidebar = document.getElementById('map-sidebar');
    sidebar.replaceChildren();

    for (const map of MAPS) {
      const unlocked = this._progressMgr.isUnlocked(map.id);

      const row = document.createElement('div');
      row.className = 'map-row ' + (unlocked ? 'unlocked' : 'locked');
      if (unlocked && map.id === this._selectedId) row.classList.add('active');

      const nameEl = document.createElement('div');
      nameEl.className   = 'map-row-name';
      nameEl.textContent = unlocked
        ? (map.id + 1) + ' · ' + map.name
        : '🔒 Map ' + (map.id + 1);

      const starsEl = document.createElement('div');
      starsEl.className = 'map-row-stars';
      if (unlocked) {
        const stars = this._progressMgr.getStars(map.id);
        starsEl.textContent = stars > 0 ? starsDisplay(stars) : '—';
      }

      row.append(nameEl, starsEl);
      if (unlocked) row.addEventListener('click', () => this._selectMap(map.id));
      sidebar.appendChild(row);
    }
  }

  _selectMap(mapId) {
    this._selectedId = mapId;
    document.querySelectorAll('.map-row.active').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.map-row')[mapId].classList.add('active');
    this._renderFeatured(mapId);
  }

  _renderFeatured(mapId) {
    const map   = MAPS[mapId];
    const stars = this._progressMgr.getStars(mapId);

    document.getElementById('featured-name').textContent  = map.name;
    document.getElementById('featured-stars').textContent = stars > 0 ? starsDisplay(stars) : '☆☆☆';
    document.getElementById('featured-blurb').textContent = map.blurb;
    document.getElementById('featured-tier').textContent  =
      'Towers upgrade to Tier ' + map.maxTierAllowed + ' on this map';
  }

  _bindPlay() {
    // Clone removes any prior event listener before re-adding
    const old = document.getElementById('featured-play');
    const btn  = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      this.scene.start('GameScene', { mapId: this._selectedId });
    });
  }

  shutdown() {
    document.getElementById('map-select').style.display = 'none';
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/scenes/MapSelectScene.js index.html
git commit -m "feat: add MapSelectScene with sidebar/featured panel layout"
```

---

### Task 10: Register MapSelectScene + redirect MenuScene

**Files:**
- Modify: `src/main.js`
- Modify: `src/scenes/MenuScene.js`

- [ ] **Step 1: Register MapSelectScene in main.js**

In `src/main.js`, add the MapSelectScene import after the MenuScene import line:

```js
import MapSelectScene from './scenes/MapSelectScene.js';
```

Change the `scene` array from:

```js
  scene: [BootScene, MenuScene, GameScene, UIScene],
```

to:

```js
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene],
```

- [ ] **Step 2: Replace MenuScene body with redirect**

Replace the entire content of `src/scenes/MenuScene.js`:

```js
import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    this.scene.start('MapSelectScene');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main.js src/scenes/MenuScene.js
git commit -m "feat: register MapSelectScene and redirect MenuScene to it"
```

---

### Task 11: Wire GameScene — ProgressManager, StoryManager, star rating, unlock

**Files:**
- Modify: `src/scenes/GameScene.js`
- Modify: `index.html`

- [ ] **Step 1: Add imports at the top of GameScene.js**

After the existing imports, add:

```js
import { ProgressManager } from '../systems/ProgressManager.js';
import { StoryManager }    from '../systems/StoryManager.js';
import { STORY_PANELS }    from '../data/story.js';
import { starsDisplay }    from '../utils/display.js';
```

- [ ] **Step 2: Instantiate ProgressManager and StoryManager in create()**

In the `create()` method, after the `this.waveMgr = new WaveManager(...)` line, add:

```js
    this.progressMgr = new ProgressManager();
    this.storyMgr    = new StoryManager(STORY_PANELS);
```

- [ ] **Step 3: Add story-dismiss to the shutdown clone list**

In the `shutdown()` method, change the id array to include `'story-dismiss'`:

```js
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn','story-dismiss'].forEach(id => {
```

- [ ] **Step 4: Replace _checkWaveComplete to call story panels**

Replace the existing `_checkWaveComplete` method:

```js
  _checkWaveComplete() {
    if (!this.waveMgr.active) return;
    if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
    this.waveMgr.active = false;
    this.economy.earn(38);
    if (this.waveMgr.done) {
      this._onVictory();
    } else {
      const map   = MAPS[this.mapId];
      const panel = this.storyMgr.getPanelForWave(map.storyKey, this.waveMgr.currentWave);
      if (panel) {
        this.storyMgr.showBanner(panel, () => this._updateWaveButton());
      } else {
        this._updateWaveButton();
      }
    }
  }
```

- [ ] **Step 5: Replace _onVictory with star-rating + unlock + story flow**

Replace the existing `_onVictory` method with two methods:

```js
  _onVictory() {
    this.won = true;
    const map   = MAPS[this.mapId];
    const pct   = this.economy.lives / map.startLives;
    const stars = pct >= 0.8 ? 3 : pct >= 0.5 ? 2 : 1;
    this.progressMgr.setStars(this.mapId, stars);
    this.progressMgr.unlockNext(this.mapId);
    const panel = this.storyMgr.getUnlockPanel(map.storyKey);
    if (panel) {
      this.storyMgr.showBanner(panel, () => this._showVictoryOverlay(stars));
    } else {
      this._showVictoryOverlay(stars);
    }
  }

  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('game-msg').style.display = 'block';
  }
```

- [ ] **Step 6: Update msg-btn to navigate to MapSelectScene**

In `_bindDOMEvents()`, change the `msg-btn` listener line from:

```js
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.restart({ mapId: this.mapId }));
```

to:

```js
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
```

- [ ] **Step 7: Update msg-btn label in index.html**

In `index.html`, find:

```html
      <button id="msg-btn">Play Again</button>
```

Replace with:

```html
      <button id="msg-btn">&#8617; Map Select</button>
```

- [ ] **Step 8: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.js index.html
git commit -m "feat: wire GameScene with ProgressManager, StoryManager, star rating, and unlock flow"
```

---

## Final Verification

- [ ] **Start dev server and verify MapSelectScene loads on launch**

```bash
npm run dev
```

Open browser. Expected: MapSelectScene appears with Map 1 (Outpost Sigma) unlocked and selected in the sidebar; maps 2–10 show as locked.

- [ ] **Play Map 1 and verify the full victory flow**

Click PLAY on Map 1. Let all waves run. Expected: after the final wave, the story-banner slide-in appears ("Outpost Sigma — Cleared"), then on dismiss the victory overlay shows star rating (e.g. `★★★ — 47 kills`), and the "Map Select" button returns to MapSelectScene.

- [ ] **Verify map unlock persists**

After beating Map 1: return to MapSelectScene; Map 2 (Lunar Gate) is now unlocked and clickable. Reload the page — it is still unlocked.

- [ ] **Verify between-wave story panels**

Play Map 1. After wave 3 completes, the slide-in banner appears. The wave button stays disabled until dismissed.

- [ ] **Verify defeat flow**

Let lives drop to 0. Expected: defeat overlay shows with "Map Select" button; clicking it returns to MapSelectScene.

- [ ] **Verify phantom and titan visual shapes**

Unlock Map 4 (Asteroid Belt) via console: `localStorage.setItem('lastlight_progress', JSON.stringify([1,1,1,1,0,0,0,0,0,0]))`, then reload. Play Map 4 — phantoms should render as ghostly concentric rings. For Map 6 titans: set index 4 to 1 as well.

- [ ] **Push branch and open PR**

```bash
git push -u origin feature/barracks-soldier-rebuild
gh pr create --base feature/phase-3-tower-system --title "feat: Phase 5 — 10 maps, ProgressManager, StoryManager, MapSelectScene" --body "$(cat <<'EOF'
## Summary
- 10 map definitions with unique waypoints, backgrounds, and story blurbs
- MAP_WAVES[2-9] with phantom and titan enemies across 8 new maps
- Phantom (flying, fast, fragile) and titan (armor 20 flat, massive HP) enemy types with custom visuals
- ProgressManager: localStorage star ratings, sequential map unlock (stars saved per-map, never downgrades)
- StoryManager: CSS slide-in banner between waves and on victory/unlock events
- MapSelectScene: sidebar + featured panel layout, auto-selects highest unlocked map
- GameScene wired: star rating on victory (80%/50% lives thresholds), story panels, msg-btn navigates to MapSelectScene

## Test plan
- [ ] All vitest tests pass (npm test)
- [ ] MapSelectScene loads on game start; Map 1 unlocked, rest locked
- [ ] Beating Map 1 unlocks Map 2 in MapSelectScene
- [ ] Progress persists on page reload (localStorage)
- [ ] Between-wave story banner slides in at correct waves, disables wave button until dismissed
- [ ] Victory shows story banner then overlay with star rating
- [ ] Defeat overlay has Map Select button
- [ ] Phantom renders as ghostly concentric rings (Map 4+)
- [ ] Titan renders as triple-layer hexagon (Map 6+)

Generated with Claude Code
EOF
)"
```
