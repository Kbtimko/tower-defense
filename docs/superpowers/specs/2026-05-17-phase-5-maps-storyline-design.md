# Phase 5: Maps & Storyline — Design Spec
Date: 2026-05-17

## Overview
Expands Last Light from 2 prototype maps to a full 10-map campaign with persistent star ratings, a map select screen, and a slide-in story banner system.

## Sub-phases
- **5a — Data layer:** 10 map defs, MAP_WAVES[2–9], `phantom` + `titan` enemy types, `ProgressManager`. Pure data + logic; no scene changes. All unit-tested.
- **5b — UI layer:** `MapSelectScene`, `StoryManager`, `story.js`, GameScene wiring for star rating and unlock flow.

---

## Architecture

### New Files
| File | Purpose |
|------|---------|
| `src/systems/ProgressManager.js` | localStorage wrapper — stars and unlock state |
| `src/systems/ProgressManager.test.js` | Unit tests |
| `src/systems/StoryManager.js` | Story banner logic |
| `src/systems/StoryManager.test.js` | Unit tests |
| `src/scenes/MapSelectScene.js` | Map select screen (replaces MenuScene) |
| `src/data/story.js` | `STORY_PANELS` keyed by storyKey |

### Modified Files
| File | Change |
|------|--------|
| `src/data/maps.js` | Expand from 2 → 10 map definitions |
| `src/data/waves.js` | Add MAP_WAVES entries 2–9 |
| `src/data/enemies.js` | Add `phantom` and `titan` definitions |
| `src/data/enemies.test.js` | Tests for new enemy defs |
| `src/data/maps.test.js` | Tests for new map defs |
| `src/data/waves.test.js` | Tests for new wave entries |
| `src/entities/Enemy.js` | Add `_redrawBody` branches for phantom + titan |
| `src/scenes/MenuScene.js` | Replace body with redirect to MapSelectScene |
| `src/scenes/GameScene.js` | Wire ProgressManager, StoryManager, star rating, unlock |
| `src/main.js` | Register MapSelectScene |
| `index.html` | Add `#story-banner` and `#map-select` DOM elements |

---

## Data Layer (Phase 5a)

### Map Definitions (`maps.js`)

Tier lock bands:
- Maps 0–1: `maxTierAllowed: 2` (existing)
- Maps 2–3: `maxTierAllowed: 3` (tier 3 unlocks on Map 3 — The Crater)
- Maps 4–9: `maxTierAllowed: 4` (tier 4 unlocks on Map 5 — Titan's Reach)

The existing hardcoded strings in `GameScene._setUpgradeButton` ("Unlocked on Map 3", "Unlocked on Map 5") already reference the correct map indices and remain accurate.

| ID | Name | Background | Path Color | Lives | Gold | Waves | maxTier |
|----|------|------------|-----------|-------|------|-------|---------|
| 0 | Outpost Sigma | `0x1a2e1a` | `0x7a6040` | 25 | 200 | 10 | 2 |
| 1 | Lunar Gate | `0x1e1e2e` | `0x6a5a5a` | 20 | 160 | 10 | 2 |
| 2 | The Crater | `0x1e1e1e` | `0x808080` | 20 | 150 | 12 | 3 |
| 3 | Orbital Station | `0x0a1a2a` | `0x4a7a8a` | 18 | 140 | 12 | 3 |
| 4 | Asteroid Belt | `0x1a1208` | `0x7a5a2a` | 18 | 130 | 14 | 4 |
| 5 | Titan's Reach | `0x1a0a00` | `0x8a3a1a` | 15 | 120 | 14 | 4 |
| 6 | Deep Space Corridor | `0x060618` | `0x3a3a7a` | 15 | 110 | 15 | 4 |
| 7 | The Void Frontier | `0x030308` | `0x2a2a4a` | 12 | 100 | 15 | 4 |
| 8 | Enemy Homeworld | `0x100818` | `0x5a2a6a` | 12 | 90 | 16 | 4 |
| 9 | Last Light | `0x1a0808` | `0x8a1a1a` | 10 | 80 | 18 | 4 |

Each map also gets a `blurb` string (placeholder text for the map select screen) and a `storyKey`.

**Waypoints** (all values are normalized 0–1 ratios, resolved to pixels by PathManager):

```js
// Map 2 — The Crater: central zigzag
[[0,.5],[.2,.5],[.2,.2],[.5,.2],[.5,.8],[.8,.8],[.8,.4],[1,.4]]

// Map 3 — Orbital Station: U-shape within zigzag
[[0,.3],[.15,.3],[.15,.7],[.35,.7],[.35,.15],[.6,.15],[.6,.55],[.45,.55],[.45,.85],[.8,.85],[.8,.5],[1,.5]]

// Map 4 — Asteroid Belt: tight vertical zigzag
[[0,.6],[.2,.6],[.2,.2],[.4,.2],[.4,.8],[.55,.8],[.55,.35],[.7,.35],[.7,.75],[.85,.75],[.85,.3],[1,.3]]

// Map 5 — Titan's Reach: dense zigzag
[[0,.5],[.1,.5],[.1,.8],[.3,.8],[.3,.2],[.5,.2],[.5,.6],[.65,.6],[.65,.25],[.8,.25],[.8,.7],[1,.7]]

// Map 6 — Deep Space Corridor: alternating tight/wide
[[0,.25],[.2,.25],[.2,.75],[.4,.75],[.4,.4],[.55,.4],[.55,.85],[.7,.85],[.7,.15],[.85,.15],[.85,.6],[1,.6]]

// Map 7 — The Void Frontier: maximum waypoints
[[0,.5],[.12,.5],[.12,.15],[.28,.15],[.28,.75],[.42,.75],[.42,.35],[.58,.35],[.58,.8],[.72,.8],[.72,.25],[.88,.25],[.88,.65],[1,.65]]

// Map 8 — Enemy Homeworld: dense vertical zigzag
[[0,.7],[.15,.7],[.15,.3],[.3,.3],[.3,.8],[.48,.8],[.48,.2],[.62,.2],[.62,.6],[.75,.6],[.75,.1],[.9,.1],[.9,.5],[1,.5]]

// Map 9 — Last Light: hardest path
[[0,.4],[.1,.4],[.1,.85],[.25,.85],[.25,.15],[.4,.15],[.4,.65],[.52,.65],[.52,.25],[.65,.25],[.65,.75],[.78,.75],[.78,.35],[.9,.35],[.9,.7],[1,.7]]
```

---

### Enemy Types (`enemies.js`)

Two new entries added to `ENEMY_DEFS`:

```js
phantom: {
  type: 'phantom', name: 'Veth Phantom',
  hp: 60, speed: 140, reward: 12, armor: 0,
  color: 0x9b59b6, radius: 9, flying: true,
}

titan: {
  type: 'titan', name: 'Veth Titan',
  hp: 800, speed: 28, reward: 80, armor: 20,
  color: 0xe74c3c, radius: 22, flying: false,
}
```

**phantom:** `flying: true` means Barracks soldiers do not block it unless `soldier.canBlockFlyers` is true (existing mechanic). Fast and fragile — countered by ice slow + archer/mage burst.

**titan:** `armor: 20` means 20 flat damage reduction per hit (existing `takeDamage` mechanic: `Math.max(1, amount - armor)`). Pierce bypasses armor entirely. Cannon and mage (which have `pierce: true`) are effective; archer and ice towers deal reduced damage. First appears in map 5 wave 10.

**Note:** `colossus` already exists in `ENEMY_DEFS` (hp: 400, armor: 15) but is not used in any MAP_WAVES. It remains unused in Phase 5.

#### Visual Shapes (`Enemy._redrawBody`)

Add two new branches:

**phantom:** Concentric ring visual — outer translucent ring + inner solid circle, suggesting a ghostly form.
```js
} else if (t === 'phantom') {
  this._body.fillStyle(this.def.color, 0.15);
  this._body.fillCircle(0, 0, r * 1.8);
  this._body.lineStyle(2, this.def.color, 0.7);
  this._body.strokeCircle(0, 0, r * 1.4);
  this._body.fillStyle(this.def.color, 0.9);
  this._body.fillCircle(0, 0, r * 0.6);
```

**titan:** Triple-layer hexagon with dark outer armor and bright core, scaled up.
```js
} else if (t === 'titan') {
  this._body.fillStyle(0x1a0000, 1);
  this._body.fillPoints(this._hexPoints(r), true);
  this._body.fillStyle(0x660000, 1);
  this._body.fillPoints(this._hexPoints(r * 0.72), true);
  this._body.fillStyle(this.def.color, 1);
  this._body.fillPoints(this._hexPoints(r * 0.44), true);
```

---

### Wave Compositions (`waves.js`)

MAP_WAVES[0] and MAP_WAVES[1] unchanged (10 waves each).

```js
MAP_WAVES[2] // The Crater — 12 waves, no phantom
[
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
]

MAP_WAVES[3] // Orbital Station — 12 waves, phantom introduced wave 4
[
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
]

MAP_WAVES[4] // Asteroid Belt — 14 waves, heavy phantom
[
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
]

MAP_WAVES[5] // Titan's Reach — 14 waves, titan debuts wave 10
[
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
]

MAP_WAVES[6] // Deep Space Corridor — 15 waves, regular titan
[
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
]

MAP_WAVES[7] // The Void Frontier — 15 waves, phantom swarms
[
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
]

MAP_WAVES[8] // Enemy Homeworld — 16 waves
[
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
]

MAP_WAVES[9] // Last Light — 18 waves, final gauntlet
[
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
]
```

---

## ProgressManager (`src/systems/ProgressManager.js`)

### Storage
- Key: `lastlight_progress`
- Value: JSON array of 10 numbers, index = mapId, value = 0–3 (0 means never beaten)
- Missing key treated as all zeros

### API
```js
class ProgressManager {
  getStars(mapId)      // → 0–3
  setStars(mapId, stars) // saves only if stars > current best
  isUnlocked(mapId)    // map 0: always true; mapN: getStars(N-1) > 0
  unlockNext(mapId)    // convenience; no-ops if mapId === 9
}
```

### Star Calculation (done in GameScene, passed to setStars)
```js
const pct   = this.economy.lives / map.startLives;
const stars = pct >= 0.8 ? 3 : pct >= 0.5 ? 2 : 1;
```

### Tests
1. Fresh load: all stars = 0, only map 0 unlocked
2. `setStars` upgrades (1 → 3) but never downgrades (3 → 1)
3. Beating map N (setStars) causes `isUnlocked(N+1)` to return true
4. Map 0 always unlocked regardless of storage contents
5. `unlockNext(9)` is a no-op (no map 10)

---

## MapSelectScene (`src/scenes/MapSelectScene.js`)

Registered in `main.js` as `'MapSelectScene'`. BootScene (or MenuScene redirect) transitions to it.

### DOM Structure (new elements in `index.html`)
```html
<div id="map-select" style="display:none">
  <div id="map-select-title">LAST LIGHT</div>
  <div id="map-sidebar"><!-- 10 rows rendered by scene --></div>
  <div id="map-featured">
    <div id="featured-name"></div>
    <div id="featured-stars"></div>
    <div id="featured-blurb"></div>
    <div id="featured-tier"></div>
    <button id="featured-play">▶ PLAY</button>
  </div>
</div>
```

### Behavior
- `create()`: show `#map-select`, instantiate `ProgressManager`, populate sidebar, set `selectedMapId` to highest unlocked map, render featured panel.
- `shutdown()`: hide `#map-select`.
- Sidebar rows: unlocked → clickable, shows `"N · Map Name"` + star string (`★★★` etc.); locked → `"🔒 Map N"`, not interactive.
- Featured panel: name, star display, blurb, `"Towers unlock to Tier N on this map"`, ▶ PLAY button.
- Play calls `this.scene.start('GameScene', { mapId: selectedMapId })`.
- On return from GameScene the scene re-creates naturally (Phaser calls `create()` again), which re-reads localStorage and re-renders any new stars or unlocks.

### Shared Utility
A module-level `starsDisplay(n)` helper lives in `src/ui/HUD.js` (or a new `src/utils/display.js` if HUD.js is unsuitable) and is imported by both MapSelectScene and GameScene:
```js
export function starsDisplay(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}
```

---

## StoryManager (`src/systems/StoryManager.js`)

### STORY_PANELS Structure (`src/data/story.js`)
```js
export const STORY_PANELS = {
  outpost_sigma: {
    waves: {
      3: { headline: 'Intel — Wave 3', body: 'Placeholder: enemy forces regrouping...' },
      7: { headline: "Commander's Log — Wave 7", body: 'Placeholder: reinforcements inbound...' },
    },
    unlock: { headline: 'Outpost Sigma — Cleared', body: 'Placeholder: the line holds...' },
  },
  // lunar_gate, the_crater, orbital_station, asteroid_belt,
  // titans_reach, deep_space_corridor, the_void_frontier,
  // enemy_homeworld, last_light — same structure
};
```

Wave panel trigger points (wave number after which panel appears):

| Map | Wave panels at |
|-----|---------------|
| 0 – Outpost Sigma (10w) | 3, 7 |
| 1 – Lunar Gate (10w) | 3, 7 |
| 2 – The Crater (12w) | 4, 8 |
| 3 – Orbital Station (12w) | 4, 8 |
| 4 – Asteroid Belt (14w) | 4, 9 |
| 5 – Titan's Reach (14w) | 5, 10 |
| 6 – Deep Space Corridor (15w) | 5, 10 |
| 7 – The Void Frontier (15w) | 5, 10 |
| 8 – Enemy Homeworld (16w) | 5, 11 |
| 9 – Last Light (18w) | 6, 12 |

### API
```js
class StoryManager {
  constructor(panels)                   // receives STORY_PANELS
  getPanelForWave(storyKey, waveNum)    // waveNum: number → { headline, body } or null
  getUnlockPanel(storyKey)             // → { headline, body } or null (reads .unlock key)
  showBanner(panel, onDismiss)          // populates + shows #story-banner
  hideBanner()                          // hides + resets #story-banner
}
```

### DOM (`#story-banner` in `index.html`)
```html
<div id="story-banner" class="story-banner">
  <div id="story-headline"></div>
  <div id="story-body"></div>
  <button id="story-dismiss">✕ Dismiss</button>
</div>
```
Hidden by default via CSS. `showBanner` adds class `visible` which triggers a CSS slide-down from top (transition: transform 0.3s ease). Dismiss button calls `hideBanner()` then `onDismiss()`.

### GameScene Integration

**`_checkWaveComplete()`** — after setting `waveMgr.active = false`:
```js
const map   = MAPS[this.mapId];
const panel = this.storyMgr.getPanelForWave(map.storyKey, this.waveMgr.currentWave);
if (panel) {
  this.storyMgr.showBanner(panel, () => this._updateWaveButton());
} else {
  this._updateWaveButton();
}
```
The wave button stays disabled until the banner is dismissed.

**`_onVictory()`** — replace current implementation:
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
    starsDisplay(stars) + ` — ${this.kills} kills`;
  document.getElementById('game-msg').style.display = 'block';
}
```

**`_onDefeat()`** — unchanged except msg-btn now navigates to MapSelectScene (see below).

**`msg-btn`** — changes from "Restart" to "Back to Map Select" → `this.scene.start('MapSelectScene')`. A separate "Retry" button can be added in `#game-msg` if desired (out of scope for Phase 5).

### Tests
1. `getPanelForWave` returns correct panel for valid storyKey + wave number
2. `getPanelForWave` returns null for wave number with no panel defined
3. `getPanelForWave` returns null for unknown storyKey
4. `getUnlockPanel` returns correct unlock panel for valid storyKey
5. `getUnlockPanel` returns null for unknown storyKey

---

## Constraints and Non-goals
- No `colossus` in any MAP_WAVES (remains in ENEMY_DEFS, unused)
- No per-map new tower types or abilities (Phase 6+)
- No animated cutscenes — story is text only
- No retry button on the victory/defeat overlay (out of scope)
- Balance tuning (wave difficulty) is expected to need adjustment after browser testing — wave data is a starting point, not final
