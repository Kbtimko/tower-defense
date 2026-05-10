# Phase 1: Project Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Vite + Phaser.js project, port all prototype mechanics into GameScene, and confirm `npm run dev` runs a playable game with the bottom-bar HUD layout.

**Architecture:** Phaser Scenes (BootScene → MenuScene → GameScene) with ES6 class stubs for entities and systems. GameScene holds all migrated prototype logic for Phase 1; proper entity/system separation happens in Phase 2. DOM elements for top HUD and bottom tower bar; Phaser Graphics for all in-canvas rendering.

**Tech Stack:** Phaser.js 3.x, Vite, JavaScript ES6+, Vitest

---

## File Map

```
tower-defense/
├── src/
│   ├── scenes/
│   │   ├── BootScene.js        # loads assets, transitions to MenuScene
│   │   ├── MenuScene.js        # title screen + map select + Play button
│   │   └── GameScene.js        # full migrated game loop (Phase 1 monolith)
│   ├── entities/
│   │   ├── Tower.js            # data class: type, level, branch, stats, cooldown
│   │   ├── Enemy.js            # data class: hp, speed, statusEffects, movement
│   │   └── Projectile.js       # data class: homing or AoE, damage, slow
│   ├── systems/
│   │   ├── EconomyManager.js   # gold, lives, spend/earn/loseLife
│   │   ├── PathManager.js      # waypoints → pixels, buildZones, isOnPath
│   │   └── WaveManager.js      # wave config → spawn queue, update per frame
│   ├── data/
│   │   ├── towers.js           # 4 prototype towers in 4-tier+branch structure
│   │   ├── enemies.js          # 4 prototype enemies with alien names
│   │   ├── maps.js             # 2 prototype maps with full metadata
│   │   └── waves.js            # makeWaves(mapId) factory
│   ├── ui/
│   │   └── HUD.js              # stub (DOM wiring lives in GameScene for Phase 1)
│   └── main.js                 # Phaser.Game config + scene registry
├── public/assets/
│   ├── sprites/                # empty placeholder dir
│   ├── audio/                  # empty placeholder dir
│   └── maps/                   # empty placeholder dir
├── index.html                  # bottom-bar layout, DOM HUD elements
├── vite.config.js
└── package.json
```

---

## Task 1: Initialize repo and project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: all directories

- [ ] **Step 1: git init and create directories**

```bash
cd /Users/keithtimko/projects/tower-defense
git init
mkdir -p src/scenes src/entities src/systems src/data src/ui
mkdir -p public/assets/sprites public/assets/audio public/assets/maps
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.DS_Store
.superpowers/
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "tower-defense",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "phaser": "^3.88.0",
    "howler": "^2.2.4"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: initialize project with npm dependencies"
```

---

## Task 2: Build config and HTML layout

**Files:**
- Create: `vite.config.js`
- Create: `index.html`

- [ ] **Step 1: Create vite.config.js**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Last Light</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; font-family: 'Georgia', serif; color: #e8e0d0;
           overflow: hidden; display: flex; flex-direction: column; height: 100vh; }
    #hud { display: none; align-items: center; gap: 14px; padding: 7px 14px;
           background: #0f0f1e; border-bottom: 2px solid #8b6914; flex-shrink: 0; }
    .hud-stat { display: flex; align-items: center; gap: 5px; font-size: 13px; }
    .hud-val { font-weight: bold; color: #ffd700; font-size: 15px; }
    .hud-lbl { color: #aaa; font-size: 11px; }
    #speed-btn { background: #1a2a1a; border: 1px solid #4a6a4a; color: #aaddaa;
                 padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    #game { flex: 1; position: relative; }
    #game canvas { display: block; width: 100% !important; height: 100% !important; }
    #bottom-bar { display: none; align-items: center; gap: 8px; padding: 8px 14px;
                  background: #0f0f1e; border-top: 2px solid #8b6914; flex-shrink: 0; }
    .tower-btn { background: #1a1a3a; border: 2px solid #444; border-radius: 6px;
                 padding: 6px 10px; cursor: pointer; display: flex; flex-direction: column;
                 align-items: center; gap: 2px; transition: all 0.15s; color: #e8e0d0; }
    .tower-btn:hover { border-color: #ffd700; background: #252545; }
    .tower-btn.selected { border-color: #ffd700; background: #2a2a1a; }
    .tower-btn .t-icon { font-size: 20px; }
    .tower-btn .t-cost { font-size: 11px; color: #ffd700; }
    .tower-btn .t-name { font-size: 10px; color: #aaa; }
    #wave-btn { margin-left: auto; background: #8b1a1a; border: 2px solid #cc3333;
                color: #fff; padding: 8px 16px; border-radius: 6px; cursor: pointer;
                font-size: 13px; font-weight: bold; }
    #wave-btn:hover { background: #aa2222; }
    #wave-btn:disabled { background: #333; border-color: #555; color: #666; cursor: not-allowed; }
    #tower-panel { position: absolute; background: #0f0f1e; border: 2px solid #8b6914;
                   border-radius: 8px; padding: 11px; width: 170px; z-index: 10; display: none; }
    #tower-panel .panel-name { font-size: 13px; font-weight: bold; color: #ffd700; margin-bottom: 5px; }
    #tower-panel .panel-stat { font-size: 11px; color: #aaa; margin: 2px 0; }
    #tower-panel .upgrade-btn { width: 100%; background: #1a3a1a; border: 1px solid #4a8a4a;
                                 color: #7af07a; padding: 5px; border-radius: 4px;
                                 cursor: pointer; font-size: 11px; margin-top: 4px; }
    #tower-panel .upgrade-btn:hover { background: #2a4a2a; }
    #tower-panel .upgrade-btn.maxed { background: #1a1a3a; border-color: #4a4aaa;
                                       color: #7a7af0; cursor: default; }
    #tower-panel .sell-btn { width: 100%; background: #3a1a1a; border: 1px solid #8a3a3a;
                              color: #f07a7a; padding: 5px; border-radius: 4px;
                              cursor: pointer; font-size: 11px; margin-top: 3px; }
    #game-msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.88); border: 3px solid #8b6914; border-radius: 12px;
                padding: 28px 38px; text-align: center; display: none; z-index: 20; }
    #game-msg h2 { font-size: 26px; margin-bottom: 8px; }
    #game-msg p { color: #aaa; margin-bottom: 14px; font-size: 13px; }
    #game-msg button { background: #8b6914; border: none; color: #fff; padding: 9px 22px;
                       border-radius: 6px; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <div id="hud">
    <div class="hud-stat"><span>❤️</span><span class="hud-val" id="stat-lives">20</span><span class="hud-lbl">Lives</span></div>
    <div class="hud-stat"><span>💰</span><span class="hud-val" id="stat-gold">150</span><span class="hud-lbl">Gold</span></div>
    <div class="hud-stat"><span>🌊</span><span class="hud-val" id="stat-wave">0/10</span><span class="hud-lbl">Wave</span></div>
    <div class="hud-stat"><span>💀</span><span class="hud-val" id="stat-kills">0</span><span class="hud-lbl">Kills</span></div>
    <button id="speed-btn">⏩ 2x</button>
  </div>
  <div id="game">
    <div id="tower-panel">
      <div class="panel-name" id="panel-name">Tower</div>
      <div class="panel-stat" id="panel-dmg">Damage: -</div>
      <div class="panel-stat" id="panel-rng">Range: -</div>
      <div class="panel-stat" id="panel-spd">Fire rate: -</div>
      <div class="panel-stat" id="panel-lvl">Level: -</div>
      <button class="upgrade-btn" id="panel-upgrade-btn">Upgrade</button>
      <button class="sell-btn" id="panel-sell-btn">💰 Sell</button>
    </div>
    <div id="game-msg">
      <h2 id="msg-title">Victory!</h2>
      <p id="msg-body">You defended humanity!</p>
      <button id="msg-btn">Play Again</button>
    </div>
  </div>
  <div id="bottom-bar">
    <button class="tower-btn" data-type="archer">
      <span class="t-icon">🏹</span><span class="t-cost">60g</span><span class="t-name">Archer</span>
    </button>
    <button class="tower-btn" data-type="mage">
      <span class="t-icon">🔮</span><span class="t-cost">90g</span><span class="t-name">Mage</span>
    </button>
    <button class="tower-btn" data-type="cannon">
      <span class="t-icon">💣</span><span class="t-cost">110g</span><span class="t-name">Cannon</span>
    </button>
    <button class="tower-btn" data-type="ice">
      <span class="t-icon">❄️</span><span class="t-cost">80g</span><span class="t-name">Ice</span>
    </button>
    <button id="wave-btn">▶ Send Wave 1</button>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add vite.config.js index.html
git commit -m "chore: add Vite config and index.html with bottom-bar layout"
```

---

## Task 3: main.js — Phaser game config

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Create src/main.js**

```js
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NONE,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, GameScene],
};

new Phaser.Game(config);
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: add Phaser game config with scene registry"
```

---

## Task 4: Data files

**Files:**
- Create: `src/data/towers.js`
- Create: `src/data/enemies.js`
- Create: `src/data/maps.js`
- Create: `src/data/waves.js`
- Create: `src/data/towers.test.js`
- Create: `src/data/maps.test.js`

- [ ] **Step 1: Write failing data shape tests**

```js
// src/data/towers.test.js
import { TOWER_DEFS } from './towers.js';

describe('TOWER_DEFS', () => {
  const REQUIRED = ['name','icon','cost','color','range','damage','fireRate',
                    'splashRadius','pierce','slow','tier2','tier3','tier4A','tier4B','ability'];

  for (const [type, def] of Object.entries(TOWER_DEFS)) {
    it(`${type} has all required fields`, () => {
      for (const field of REQUIRED) expect(def).toHaveProperty(field);
    });
    it(`${type} all tier costs are positive`, () => {
      expect(def.cost).toBeGreaterThan(0);
      expect(def.tier2.cost).toBeGreaterThan(0);
      expect(def.tier3.cost).toBeGreaterThan(0);
      expect(def.tier4A.cost).toBeGreaterThan(0);
      expect(def.tier4B.cost).toBeGreaterThan(0);
    });
  }
});
```

```js
// src/data/maps.test.js
import { MAPS } from './maps.js';

describe('MAPS', () => {
  const REQUIRED = ['id','name','background','pathColor','waypoints','startGold',
                    'startLives','unlockCost','waveCount','maxTierAllowed','storyKey'];
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
  }
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: fail with "Cannot find module './towers.js'"

- [ ] **Step 3: Create src/data/towers.js**

```js
// src/data/towers.js
// Phase 1: 4 prototype towers. Phase 3 expands to 6 and fills tier4A/B content.
export const TOWER_DEFS = {
  archer: {
    name: 'Archer', icon: '🏹', cost: 60, color: 0x8B4513,
    range: 120, damage: 15, fireRate: 1.0, splashRadius: 0, pierce: false, slow: 0,
    tier2: { cost: 50, damage: 25, range: 135, label: 'Eagle Eye' },
    tier3: { cost: 80, damage: 40, range: 150, label: 'Barrage' },
    tier4A: { cost: 120, damage: 60, label: 'Volley', passiveEffect: 'Fires 2 arrows per shot' },
    tier4B: { cost: 120, damage: 80, range: 180, label: 'Marksman', passiveEffect: '+50% range, armor piercing' },
    ability: { label: 'Volley', cooldown: 15, description: 'All-target burst for 3s' },
  },
  mage: {
    name: 'Mage', icon: '🔮', cost: 90, color: 0x6a0dad,
    range: 100, damage: 30, fireRate: 0.6, splashRadius: 0, pierce: true, slow: 0,
    tier2: { cost: 60, damage: 50, range: 115, label: 'Arcane Power' },
    tier3: { cost: 90, damage: 80, range: 130, label: 'Sorcery' },
    tier4A: { cost: 130, damage: 120, label: 'Archmage', passiveEffect: 'Chain lightning to 3 targets' },
    tier4B: { cost: 130, damage: 60, splashRadius: 60, label: 'Frost Mage', passiveEffect: 'AoE frost on every shot, 30% slow' },
    ability: { label: 'Slow Nova', cooldown: 20, description: 'AoE freeze in range for 2s' },
  },
  cannon: {
    name: 'Cannon', icon: '💣', cost: 110, color: 0x666666,
    range: 110, damage: 45, fireRate: 0.45, splashRadius: 45, pierce: false, slow: 0,
    tier2: { cost: 70, damage: 70, range: 125, splashRadius: 55, label: 'Heavy Shell' },
    tier3: { cost: 100, damage: 100, range: 140, splashRadius: 65, label: 'Mega Bomb' },
    tier4A: { cost: 150, damage: 150, splashRadius: 80, label: 'Artillery', passiveEffect: 'Splits into 3 shells on impact' },
    tier4B: { cost: 150, damage: 80, fireRate: 1.2, label: 'Rapid Cannon', passiveEffect: '3x fire rate, direct damage focus' },
    ability: { label: 'Big Bomb', cooldown: 30, description: 'Massive AoE strike on target' },
  },
  ice: {
    name: 'Ice', icon: '❄️', cost: 80, color: 0x4a8fa8,
    range: 115, damage: 8, fireRate: 0.7, splashRadius: 0, pierce: false, slow: 0.45,
    tier2: { cost: 55, damage: 12, range: 130, slow: 0.3, label: 'Deep Freeze' },
    tier3: { cost: 85, damage: 18, range: 145, slow: 0.2, label: 'Blizzard' },
    tier4A: { cost: 110, damage: 28, slow: 0.15, label: 'Permafrost', passiveEffect: 'Slows to 15% speed' },
    tier4B: { cost: 110, damage: 50, splashRadius: 60, label: 'Shatter', passiveEffect: 'Frozen enemies take 2x damage' },
    ability: { label: 'Blizzard', cooldown: 25, description: 'Freeze all enemies in range' },
  },
};
```

- [ ] **Step 4: Create src/data/enemies.js**

```js
// src/data/enemies.js
// Phase 1: 4 prototype enemies renamed as Veth aliens. Phase 4 expands to 8.
export const ENEMY_DEFS = {
  drone:    { name: 'Veth Drone',    hp: 70,  speed: 50, reward: 14, armor: 0,  color: 0xcc3333, radius: 9,  flying: false },
  skitter:  { name: 'Veth Skitter',  hp: 40,  speed: 90, reward: 15, armor: 0,  color: 0xdd6600, radius: 7,  flying: false },
  brute:    { name: 'Veth Brute',    hp: 120, speed: 38, reward: 22, armor: 8,  color: 0x666666, radius: 11, flying: false },
  colossus: { name: 'Veth Colossus', hp: 400, speed: 28, reward: 55, armor: 15, color: 0x880044, radius: 16, flying: false },
};
```

- [ ] **Step 5: Create src/data/maps.js**

```js
// src/data/maps.js
// Phase 1: 2 prototype maps. Phase 5 expands to 10.
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
  },
  {
    id: 1,
    name: 'Lunar Gate',
    background: 0x1e1e2e,
    pathColor: 0x6a5a5a,
    waypoints: [[0,.2],[.3,.2],[.3,.55],[.15,.55],[.15,.82],[.55,.82],[.55,.4],[.75,.4],[.75,.78],[1,.78]],
    startGold: 160,
    startLives: 20,
    unlockCost: 5,
    waveCount: 10,
    maxTierAllowed: 2,
    storyKey: 'lunar_gate',
  },
];
```

- [ ] **Step 6: Create src/data/waves.js**

```js
// src/data/waves.js
export function makeWaves(mapId) {
  const hardMult = mapId === 1 ? 1.5 : 1;
  const raw = [
    [{ type: 'drone',    count: 7,  interval: 1200 }],
    [{ type: 'drone',    count: 9,  interval: 1000 }, { type: 'skitter',  count: 4,  interval: 950  }],
    [{ type: 'skitter',  count: 9,  interval: 850  }],
    [{ type: 'brute',    count: 4,  interval: 1400 }, { type: 'drone',    count: 5,  interval: 1000 }],
    [{ type: 'drone',    count: 12, interval: 900  }, { type: 'skitter',  count: 8,  interval: 800  }],
    [{ type: 'brute',    count: 8,  interval: 1100 }, { type: 'skitter',  count: 6,  interval: 700  }],
    [{ type: 'colossus', count: 1,  interval: 2000 }, { type: 'drone',    count: 10, interval: 800  }],
    [{ type: 'brute',    count: 10, interval: 1000 }, { type: 'skitter',  count: 10, interval: 600  }],
    [{ type: 'colossus', count: 2,  interval: 2500 }, { type: 'brute',    count: 8,  interval: 900  }],
    [{ type: 'colossus', count: 3,  interval: 2000 }, { type: 'brute',    count: 10, interval: 800  }, { type: 'skitter', count: 12, interval: 600 }],
  ];
  return raw.map(groups =>
    groups.map(g => ({ ...g, count: Math.ceil(g.count * hardMult) }))
  );
}
```

- [ ] **Step 7: Run tests — confirm they pass**

```bash
npm test
```

Expected: all data shape tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/data/
git commit -m "feat: add data files for towers, enemies, maps, and waves"
```

---

## Task 5: EconomyManager (TDD)

**Files:**
- Create: `src/systems/EconomyManager.js`
- Create: `src/systems/EconomyManager.test.js`

- [ ] **Step 1: Write failing tests**

```js
// src/systems/EconomyManager.test.js
import { EconomyManager } from './EconomyManager.js';

describe('EconomyManager', () => {
  let emitter, mgr;

  beforeEach(() => {
    emitter = { emit: vi.fn() };
    mgr = new EconomyManager(200, 25, emitter);
  });

  it('initializes with correct gold and lives', () => {
    expect(mgr.gold).toBe(200);
    expect(mgr.lives).toBe(25);
  });

  it('spend deducts gold and returns true when affordable', () => {
    expect(mgr.spend(60)).toBe(true);
    expect(mgr.gold).toBe(140);
  });

  it('spend returns false without deducting when unaffordable', () => {
    expect(mgr.spend(300)).toBe(false);
    expect(mgr.gold).toBe(200);
  });

  it('earn adds gold', () => {
    mgr.earn(50);
    expect(mgr.gold).toBe(250);
  });

  it('spend and earn emit economy:update', () => {
    mgr.spend(10);
    expect(emitter.emit).toHaveBeenCalledWith('economy:update', expect.any(Object));
    mgr.earn(10);
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it('loseLife decrements lives', () => {
    mgr.loseLife();
    expect(mgr.lives).toBe(24);
  });

  it('lives cannot go below zero', () => {
    for (let i = 0; i < 30; i++) mgr.loseLife();
    expect(mgr.lives).toBe(0);
  });

  it('loseLife emits game:defeat when lives reach zero', () => {
    for (let i = 0; i < 25; i++) mgr.loseLife();
    expect(emitter.emit).toHaveBeenCalledWith('game:defeat');
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```bash
npm test
```

Expected: fail with "Cannot find module './EconomyManager.js'"

- [ ] **Step 3: Implement EconomyManager**

```js
// src/systems/EconomyManager.js
export class EconomyManager {
  constructor(startGold, startLives, eventEmitter) {
    this.gold = startGold;
    this.lives = startLives;
    this._emitter = eventEmitter;
  }

  spend(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    return true;
  }

  earn(amount) {
    this.gold += amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    if (this.lives <= 0) this._emitter.emit('game:defeat');
  }
}
```

- [ ] **Step 4: Run — confirm all pass**

```bash
npm test
```

Expected: all EconomyManager tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/EconomyManager.js src/systems/EconomyManager.test.js
git commit -m "feat: add EconomyManager with gold/lives logic"
```

---

## Task 6: PathManager

**Files:**
- Create: `src/systems/PathManager.js`
- Create: `src/systems/PathManager.test.js`

- [ ] **Step 1: Write failing tests**

```js
// src/systems/PathManager.test.js
import { PathManager } from './PathManager.js';

// L-shaped path: (0,0)→(100,0)→(100,100) in normalized coords
const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, 100, 100); });

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
    expect(pm.isOnPath(50, 50, 10)).toBe(false);
  });

  it('computes build zones with required shape', () => {
    expect(pm.buildZones.length).toBeGreaterThan(0);
    expect(pm.buildZones[0]).toMatchObject({ cx: expect.any(Number), cy: expect.any(Number), radius: 22, occupied: false });
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```bash
npm test
```

- [ ] **Step 3: Implement PathManager**

```js
// src/systems/PathManager.js
export class PathManager {
  constructor(waypoints, canvasWidth, canvasHeight) {
    this.path = waypoints.map(([nx, ny]) => ({ x: nx * canvasWidth, y: ny * canvasHeight }));
    this.buildZones = this._computeZones(canvasWidth, canvasHeight);
  }

  _computeZones(w, h) {
    const zones = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const px = -dy / len, py = dx / len;
      const offset = 56;
      for (const side of [1, -1]) {
        const cx = mx + px * offset * side;
        const cy = my + py * offset * side;
        if (cx > 30 && cx < w - 30 && cy > 30 && cy < h - 30 && !this.isOnPath(cx, cy, 40)) {
          zones.push({ cx, cy, radius: 22, occupied: false });
        }
      }
    }
    return zones;
  }

  isOnPath(x, y, margin = 40) {
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      if (Math.hypot(p1.x + t * dx - x, p1.y + t * dy - y) < margin) return true;
    }
    return false;
  }

  renderPath(gfx, pathColor) {
    if (this.path.length < 2) return;
    // Shadow
    gfx.lineStyle(34, 0x000000, 0.3);
    gfx.beginPath();
    gfx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) gfx.lineTo(this.path[i].x, this.path[i].y);
    gfx.strokePath();
    // Path surface
    gfx.lineStyle(28, pathColor, 1);
    gfx.beginPath();
    gfx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) gfx.lineTo(this.path[i].x, this.path[i].y);
    gfx.strokePath();
  }
}
```

- [ ] **Step 4: Run — confirm all pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/PathManager.js src/systems/PathManager.test.js
git commit -m "feat: add PathManager with waypoint-to-pixel conversion and build zones"
```

---

## Task 7: WaveManager

**Files:**
- Create: `src/systems/WaveManager.js`

- [ ] **Step 1: Create WaveManager**

```js
// src/systems/WaveManager.js
import { ENEMY_DEFS } from '../data/enemies.js';

export class WaveManager {
  constructor(waves, eventEmitter) {
    this.waves = waves;
    this.currentWave = 0;
    this.active = false;
    this._emitter = eventEmitter;
    this._spawnQ = [];
    this._elapsed = 0;
  }

  get hasQueuedEnemies() {
    return this._spawnQ.length > 0;
  }

  get done() {
    return this.currentWave >= this.waves.length;
  }

  startWave() {
    if (this.active || this.done) return;
    this.active = true;
    this._elapsed = 0;
    this._spawnQ = [];
    const scaleFactor = 1 + this.currentWave * 0.13;
    let delay = 0;
    for (const group of this.waves[this.currentWave]) {
      const def = ENEMY_DEFS[group.type];
      for (let i = 0; i < group.count; i++) {
        this._spawnQ.push({ delayMs: delay, def, scaleFactor });
        delay += group.interval;
      }
    }
    this._spawnQ.sort((a, b) => a.delayMs - b.delayMs);
    this.currentWave++;
    this._emitter.emit('wave:start', { waveNum: this.currentWave });
  }

  update(deltaMs) {
    if (!this.active || !this.hasQueuedEnemies) return;
    this._elapsed += deltaMs;
    while (this._spawnQ.length > 0 && this._elapsed >= this._spawnQ[0].delayMs) {
      const { def, scaleFactor } = this._spawnQ.shift();
      this._emitter.emit('enemy:spawn', { def, scaleFactor });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/systems/WaveManager.js
git commit -m "feat: add WaveManager with spawn queue"
```

---

## Task 8: Entity classes

**Files:**
- Create: `src/entities/Tower.js`
- Create: `src/entities/Enemy.js`
- Create: `src/entities/Projectile.js`
- Create: `src/ui/HUD.js`

- [ ] **Step 1: Create src/entities/Tower.js**

```js
// src/entities/Tower.js
export class Tower {
  constructor({ type, x, y, def, zoneIndex }) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.zoneIndex = zoneIndex;
    this.level = 1;
    this.branch = null;       // 'A' | 'B' — set when upgrading to tier 4
    this.totalCost = def.cost;

    this.damage = def.damage;
    this.range = def.range;
    this.fireRate = def.fireRate;
    this.splashRadius = def.splashRadius;
    this.pierce = def.pierce;
    this.slow = def.slow;
    this.cooldown = 0;        // seconds until next shot
  }
}
```

- [ ] **Step 2: Create src/entities/Enemy.js**

```js
// src/entities/Enemy.js
export class Enemy {
  constructor({ def, scaleFactor = 1, startX, startY }) {
    this.def = def;
    this.x = startX;
    this.y = startY;
    this.waypointIndex = 0;
    this.maxHp = def.hp * scaleFactor;
    this.hp = this.maxHp;
    this.armor = def.armor;
    this.reward = def.reward;
    this.dead = false;
    this.statusEffects = {
      slow: { active: false, timer: 0, factor: 1 },
    };
  }

  get currentSpeed() {
    return this.statusEffects.slow.active
      ? this.def.speed * this.statusEffects.slow.factor
      : this.def.speed;
  }

  takeDamage(amount, pierce = false) {
    const armor = pierce ? 0 : this.armor;
    this.hp -= Math.max(1, amount - armor);
    if (this.hp <= 0) this.dead = true;
  }

  applyStatus({ type, duration, factor }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
    }
  }

  update(dt) {
    if (this.statusEffects.slow.active) {
      this.statusEffects.slow.timer -= dt;
      if (this.statusEffects.slow.timer <= 0) {
        this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
      }
    }
  }
}
```

- [ ] **Step 3: Create src/entities/Projectile.js**

```js
// src/entities/Projectile.js
export class Projectile {
  constructor({ x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff }) {
    this.x = x;
    this.y = y;
    this.target = target;             // Enemy instance (homing) or null (AoE)
    this.targetX = target.x;
    this.targetY = target.y;
    this.damage = damage;
    this.splashRadius = splashRadius;
    this.pierce = pierce;
    this.slowFactor = slowFactor;
    this.color = color;
    this.dead = false;
    this.speed = 280;                 // px/s
  }
}
```

- [ ] **Step 4: Create src/ui/HUD.js (stub)**

```js
// src/ui/HUD.js
// Phase 1: HUD wiring lives in GameScene directly.
// This stub exists so Phase 3 can extract it without changing imports.
export class HUD {
  constructor() {}
  update() {}
}
```

- [ ] **Step 5: Commit**

```bash
git add src/entities/ src/ui/
git commit -m "feat: add Tower, Enemy, Projectile entity classes and HUD stub"
```

---

## Task 9: BootScene and MenuScene

**Files:**
- Create: `src/scenes/BootScene.js`
- Create: `src/scenes/MenuScene.js`

- [ ] **Step 1: Create src/scenes/BootScene.js**

```js
// src/scenes/BootScene.js
import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Phase 1: no assets to preload — placeholder sprites drawn via Graphics.
  }

  create() {
    this.scene.start('MenuScene');
  }
}
```

- [ ] **Step 2: Create src/scenes/MenuScene.js**

```js
// src/scenes/MenuScene.js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;
    let selectedMapId = 0;

    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Title
    this.add.text(width / 2, height / 2 - 120, 'LAST LIGHT', {
      fontSize: '52px', color: '#ffd700', fontFamily: 'Georgia', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 65, 'A Tower Defense Game', {
      fontSize: '18px', color: '#aaa', fontFamily: 'Georgia',
    }).setOrigin(0.5);

    // Map selector buttons
    const mapBtns = MAPS.map((map, i) => {
      const btn = this.add.text(width / 2 - 110 + i * 130, height / 2, map.name, {
        fontSize: '13px', color: '#ccc', fontFamily: 'Georgia',
        backgroundColor: '#2a2a4a', padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        selectedMapId = i;
        mapBtns.forEach((b, j) => b.setStyle({ backgroundColor: j === i ? '#8b6914' : '#2a2a4a' }));
      });

      return btn;
    });
    mapBtns[0].setStyle({ backgroundColor: '#8b6914' });

    // Play button
    const play = this.add.text(width / 2, height / 2 + 70, '▶  PLAY', {
      fontSize: '26px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold',
      backgroundColor: '#8b1a1a', padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    play.on('pointerover', () => play.setStyle({ backgroundColor: '#aa2222' }));
    play.on('pointerout',  () => play.setStyle({ backgroundColor: '#8b1a1a' }));
    play.on('pointerdown', () => this.scene.start('GameScene', { mapId: selectedMapId }));
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/scenes/BootScene.js src/scenes/MenuScene.js
git commit -m "feat: add BootScene and MenuScene with map selector"
```

---

## Task 10: GameScene — full prototype migration

**Files:**
- Create: `src/scenes/GameScene.js`

- [ ] **Step 1: Create src/scenes/GameScene.js**

This is the full migration of the prototype's game loop into Phaser. Create the file with this complete content:

```js
// src/scenes/GameScene.js
import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { MAPS } from '../data/maps.js';
import { makeWaves } from '../data/waves.js';
import { PathManager } from '../systems/PathManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { Tower } from '../entities/Tower.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';

const PROJ_COLORS = { archer: 0xcd853f, mage: 0xdd00ff, cannon: 0x888888, ice: 0x00eeff };

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.mapId = data?.mapId ?? 0;
  }

  create() {
    const map = MAPS[this.mapId];
    const { width, height } = this.scale;

    // Systems
    this.pathMgr  = new PathManager(map.waypoints, width, height);
    this.economy  = new EconomyManager(map.startGold, map.startLives, this.events);
    this.waveMgr  = new WaveManager(makeWaves(this.mapId), this.events);

    // Entity arrays
    this.towers      = [];
    this.enemies     = [];
    this.projectiles = [];
    this.particles   = [];
    this.kills       = 0;
    this.speed       = 1;
    this.over        = false;
    this.won         = false;
    this.selectedType   = null;
    this.selectedTower  = null;

    // Phaser graphics (cleared + redrawn every frame)
    this.gfx = this.add.graphics();
    this.cameras.main.setBackgroundColor(map.background);

    // Static IN/OUT text labels
    const p = this.pathMgr.path;
    this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
    this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);

    // Phaser input
    this.input.on('pointerdown', this._onPointerDown, this);

    // Scene events from systems
    this.events.on('enemy:spawn',    this._spawnEnemy,  this);
    this.events.on('economy:update', this._updateHUD,   this);
    this.events.on('game:defeat',    this._onDefeat,    this);

    // Show DOM UI
    document.getElementById('hud').style.display        = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';

    // Wire DOM buttons (use once-registered named functions; shutdown() cleans up via clone)
    this._bindDOMEvents();
    this._updateHUD();
    this._updateWaveButton();
  }

  _bindDOMEvents() {
    document.querySelectorAll('.tower-btn').forEach(btn => {
      btn.addEventListener('click', () => this._selectTowerType(btn.dataset.type, btn));
    });
    document.getElementById('wave-btn').addEventListener('click',          () => this._startWave());
    document.getElementById('speed-btn').addEventListener('click',         () => this._toggleSpeed());
    document.getElementById('panel-upgrade-btn').addEventListener('click', () => this._upgradeSelectedTower());
    document.getElementById('panel-sell-btn').addEventListener('click',    () => this._sellSelectedTower());
    document.getElementById('msg-btn').addEventListener('click',           () => this.scene.restart({ mapId: this.mapId }));
  }

  shutdown() {
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display        = 'none';
    document.getElementById('bottom-bar').style.display = 'none';
  }

  // ─── Update loop ───────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.over || this.won) return;
    const dt    = (delta / 1000) * this.speed;
    const dtMs  = delta * this.speed;

    this.waveMgr.update(dtMs);
    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._updateParticles(dt);
    this._checkWaveComplete();

    this.gfx.clear();
    this._drawPath();
    this._drawZones();
    this._drawTowers();
    this._drawEnemies();
    this._drawProjectiles();
    this._drawParticles();
  }

  // ─── Wave ──────────────────────────────────────────────────────────────────

  _startWave() {
    if (this.waveMgr.active) return;
    this.waveMgr.startWave();
    this._updateWaveButton();
  }

  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy({ def, scaleFactor, startX: start.x, startY: start.y }));
  }

  _checkWaveComplete() {
    if (!this.waveMgr.active) return;
    if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
    this.waveMgr.active = false;
    this.economy.earn(38);
    this._updateWaveButton();
    if (this.waveMgr.done) this._onVictory();
  }

  // ─── Enemies ───────────────────────────────────────────────────────────────

  _updateEnemies(dt) {
    const path = this.pathMgr.path;
    for (const enemy of this.enemies) {
      enemy.update(dt);
      let rem = enemy.currentSpeed * dt;
      while (rem > 0 && enemy.waypointIndex < path.length - 1) {
        const tgt = path[enemy.waypointIndex + 1];
        const dx = tgt.x - enemy.x, dy = tgt.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= rem) {
          enemy.x = tgt.x; enemy.y = tgt.y;
          enemy.waypointIndex++;
          rem -= dist;
        } else {
          enemy.x += (dx / dist) * rem; enemy.y += (dy / dist) * rem;
          rem = 0;
        }
      }
      if (enemy.waypointIndex >= path.length - 1) {
        enemy.dead = true;
        this.economy.loseLife();
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  // ─── Towers ────────────────────────────────────────────────────────────────

  _updateTowers(dt) {
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      let best = null, bestProg = -1;
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.range
            && enemy.waypointIndex > bestProg) {
          best = enemy; bestProg = enemy.waypointIndex;
        }
      }
      if (best) {
        this.projectiles.push(new Projectile({
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
        }));
        tower.cooldown = 1 / tower.fireRate;
      }
    }
  }

  // ─── Projectiles ───────────────────────────────────────────────────────────

  _updateProjectiles(dt) {
    for (const proj of this.projectiles) {
      if (proj.target && !proj.target.dead) {
        proj.targetX = proj.target.x;
        proj.targetY = proj.target.y;
      }
      const dx = proj.targetX - proj.x, dy = proj.targetY - proj.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        this._onProjectileHit(proj);
        proj.dead = true;
      } else {
        const step = Math.min(proj.speed * dt, dist);
        proj.x += (dx / dist) * step;
        proj.y += (dy / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  _onProjectileHit(proj) {
    if (proj.splashRadius > 0) {
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - proj.targetX, enemy.y - proj.targetY) <= proj.splashRadius) {
          this._dealDamage(enemy, proj.damage, proj.pierce);
        }
      }
      this._addParticle(proj.targetX, proj.targetY, 0xff8800, 14);
    } else if (proj.target && !proj.target.dead) {
      this._dealDamage(proj.target, proj.damage, proj.pierce);
      if (proj.slowFactor > 0) proj.target.applyStatus({ type: 'slow', duration: 2, factor: proj.slowFactor });
      this._addParticle(proj.targetX, proj.targetY, proj.color, 7);
    }
  }

  _dealDamage(enemy, damage, pierce) {
    enemy.takeDamage(damage, pierce);
    if (enemy.dead) {
      this.economy.earn(enemy.reward);
      this.kills++;
      document.getElementById('stat-kills').textContent = this.kills;
    }
  }

  // ─── Particles ─────────────────────────────────────────────────────────────

  _addParticle(x, y, color, size) {
    this.particles.push({ x, y, color, radius: size * 0.3, maxLife: 0.3, life: 0.3, alpha: 1 });
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt; p.radius += dt * 28; p.alpha = Math.max(0, p.life / p.maxLife);
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _onPointerDown(pointer) {
    const mx = pointer.x, my = pointer.y;
    for (const tower of this.towers) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        this._deselectButtons();
        this._openTowerPanel(tower, mx, my);
        return;
      }
    }
    this._closeTowerPanel();
    if (!this.selectedType) return;
    const def = TOWER_DEFS[this.selectedType];
    for (const zone of this.pathMgr.buildZones) {
      if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
        if (!this.economy.spend(def.cost)) { this._toast('Not enough gold!'); return; }
        this.towers.push(new Tower({
          type: this.selectedType, x: zone.cx, y: zone.cy, def,
          zoneIndex: this.pathMgr.buildZones.indexOf(zone),
        }));
        zone.occupied = true;
        return;
      }
    }
  }

  _selectTowerType(type, btn) {
    if (this.selectedType === type) { this.selectedType = null; this._deselectButtons(); return; }
    this.selectedType = type;
    this.selectedTower = null;
    this._closeTowerPanel();
    this._deselectButtons();
    btn.classList.add('selected');
  }

  _deselectButtons() {
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  // ─── Tower panel ───────────────────────────────────────────────────────────

  _openTowerPanel(tower, mx, my) {
    this.selectedTower = tower;
    const def = TOWER_DEFS[tower.type];
    const map = MAPS[this.mapId];
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name;
    document.getElementById('panel-dmg').textContent  = 'Damage: ' + tower.damage;
    document.getElementById('panel-rng').textContent  = 'Range: ' + tower.range;
    document.getElementById('panel-spd').textContent  = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const nextLevel  = tower.level + 1;
    if (tower.level >= 4) {
      upgradeBtn.textContent = 'MAX LEVEL';
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = map.maxTierAllowed < 2 ? 3 : 5;
      upgradeBtn.textContent = `🔒 Unlocked on Map ${unlockMap}`;
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else {
      const tierDef = def['tier' + nextLevel];
      upgradeBtn.textContent = `Upgrade 💰${tierDef.cost}: ${tierDef.label}`;
      upgradeBtn.className   = 'upgrade-btn';
    }
    document.getElementById('panel-sell-btn').textContent = `💰 Sell (${Math.floor(tower.totalCost * 0.6)}g)`;

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(mx + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(my - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';
  }

  _closeTowerPanel() {
    document.getElementById('tower-panel').style.display = 'none';
    this.selectedTower = null;
  }

  _upgradeSelectedTower() {
    if (!this.selectedTower) return;
    const tower     = this.selectedTower;
    const def       = TOWER_DEFS[tower.type];
    const map       = MAPS[this.mapId];
    const nextLevel = tower.level + 1;
    if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
    const tierDef = def['tier' + nextLevel];
    if (!tierDef || !this.economy.spend(tierDef.cost)) { this._toast('Not enough gold!'); return; }
    tower.level++;
    tower.totalCost += tierDef.cost;
    if (tierDef.damage)      tower.damage      = tierDef.damage;
    if (tierDef.range)       tower.range       = tierDef.range;
    if (tierDef.splashRadius)tower.splashRadius = tierDef.splashRadius;
    if (tierDef.slow)        tower.slow        = tierDef.slow;
    if (tierDef.fireRate)    tower.fireRate    = tierDef.fireRate;
    const panel = document.getElementById('tower-panel');
    this._openTowerPanel(tower, parseInt(panel.style.left), parseInt(panel.style.top));
  }

  _sellSelectedTower() {
    if (!this.selectedTower) return;
    const tower = this.selectedTower;
    this.economy.earn(Math.floor(tower.totalCost * 0.6));
    this.towers = this.towers.filter(t => t !== tower);
    this.pathMgr.buildZones[tower.zoneIndex].occupied = false;
    this._closeTowerPanel();
  }

  _toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    document.getElementById('speed-btn').textContent = this.speed === 1 ? '⏩ 2x' : '⏸ 1x';
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  _updateHUD() {
    document.getElementById('stat-lives').textContent = this.economy.lives;
    document.getElementById('stat-gold').textContent  = this.economy.gold;
    document.getElementById('stat-wave').textContent  = `${this.waveMgr.currentWave}/${MAPS[this.mapId].waveCount}`;
  }

  _updateWaveButton() {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (this.waveMgr.done) {
      btn.disabled = true; btn.textContent = 'All Waves Done';
    } else if (this.waveMgr.active) {
      btn.disabled = true; btn.textContent = `Wave ${this.waveMgr.currentWave} in progress...`;
    } else {
      btn.disabled = false; btn.textContent = `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
    }
  }

  // ─── Game end ──────────────────────────────────────────────────────────────

  _onVictory() {
    this.won = true;
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  = `Survived all ${MAPS[this.mapId].waveCount} waves! Kills: ${this.kills}`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _onDefeat() {
    this.over = true;
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _toast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#f39c12;padding:6px 16px;border-radius:6px;font-size:13px;z-index:30;pointer-events:none;';
    el.textContent = msg;
    document.getElementById('game').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _drawPath() {
    const map = MAPS[this.mapId];
    this.pathMgr.renderPath(this.gfx, map.pathColor);
    const p = this.pathMgr.path;
    this.gfx.fillStyle(0x27ae60, 1); this.gfx.fillCircle(p[0].x, p[0].y, 13);
    this.gfx.fillStyle(0xc0392b, 1); this.gfx.fillCircle(p[p.length-1].x, p[p.length-1].y, 13);
  }

  _drawZones() {
    const canAfford = this.selectedType && this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
    for (const zone of this.pathMgr.buildZones) {
      if (zone.occupied) continue;
      const color = this.selectedType ? (canAfford ? 0xffd700 : 0x884444) : 0x444444;
      const alpha = this.selectedType ? 1 : 0.3;
      this.gfx.lineStyle(this.selectedType ? 2 : 1, color, alpha);
      this.gfx.strokeCircle(zone.cx, zone.cy, zone.radius);
      if (this.selectedType && canAfford) {
        this.gfx.fillStyle(0xffd700, 0.07); this.gfx.fillCircle(zone.cx, zone.cy, zone.radius);
      }
    }
  }

  _drawTowers() {
    for (const tower of this.towers) {
      if (this.selectedTower === tower) {
        this.gfx.lineStyle(1, 0xffd700, 0.25); this.gfx.strokeCircle(tower.x, tower.y, tower.range);
      }
      this.gfx.fillStyle(0x2a2a3a, 1); this.gfx.fillCircle(tower.x, tower.y, 18);
      this.gfx.lineStyle(2.5, TOWER_DEFS[tower.type].color, 1);
      this.gfx.strokeCircle(tower.x, tower.y, 18);
    }
  }

  _drawEnemies() {
    for (const enemy of this.enemies) {
      const r = enemy.def.radius;
      this.gfx.fillStyle(0x000000, 0.25);
      this.gfx.fillEllipse(enemy.x, enemy.y + r + 2, r * 1.5, 6);
      this.gfx.fillStyle(enemy.def.color, 1);
      this.gfx.fillCircle(enemy.x, enemy.y, r);
      if (enemy.statusEffects.slow.active) {
        this.gfx.lineStyle(2, 0x00eeff, 1); this.gfx.strokeCircle(enemy.x, enemy.y, r);
      }
      // HP bar
      const bw = r * 2.2, bh = 4, bx = enemy.x - bw / 2, by = enemy.y - r - 8;
      const pct = enemy.hp / enemy.maxHp;
      this.gfx.fillStyle(0x222222, 1); this.gfx.fillRect(bx, by, bw, bh);
      this.gfx.fillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xf39c12 : 0xe74c3c, 1);
      this.gfx.fillRect(bx, by, bw * pct, bh);
    }
  }

  _drawProjectiles() {
    for (const proj of this.projectiles) {
      this.gfx.fillStyle(proj.color, 1);
      this.gfx.fillCircle(proj.x, proj.y, proj.splashRadius > 0 ? 5 : 3);
      if (proj.slowFactor > 0) {
        this.gfx.lineStyle(1, 0xaaffff, 1);
        this.gfx.strokeCircle(proj.x, proj.y, proj.splashRadius > 0 ? 5 : 3);
      }
    }
  }

  _drawParticles() {
    for (const p of this.particles) {
      this.gfx.lineStyle(2, p.color, p.alpha);
      this.gfx.strokeCircle(p.x, p.y, p.radius);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: migrate prototype game loop into Phaser GameScene"
```

---

## Task 11: Verify and tag

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass (data shape, EconomyManager, PathManager).

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Expected output includes something like:
```
  VITE v5.x.x  ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173` and confirm:

1. Menu screen appears with "LAST LIGHT" title and two map buttons
2. Click Play — game canvas appears with bottom-bar tower buttons and top HUD
3. Path renders on canvas with IN/OUT markers
4. Build zones appear as dashed circles
5. Click a tower button (e.g. 🏹 Archer), click a zone — tower places
6. Click the tower — panel opens showing stats, Upgrade and Sell buttons
7. Click "Send Wave 1" — enemies spawn and traverse the path
8. Enemies take damage from towers; gold increments on kill
9. Speed toggle works (⏩ 2x / ⏸ 1x)
10. Sell button refunds 60% of tower cost
11. Click Play Again on victory/defeat — game restarts cleanly with no double-event errors

- [ ] **Step 4: Tag and final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 project scaffold and prototype migration"
git tag phase-1-complete
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Vite + Phaser setup
- ✅ Full folder structure from spec
- ✅ BootScene, MenuScene, GameScene
- ✅ Entity stubs: Tower, Enemy, Projectile (Phase 2 will replace with proper Phaser GameObjects)
- ✅ System stubs: PathManager, WaveManager, EconomyManager
- ✅ Data files: towers (4-tier + branch structure), enemies, maps, waves
- ✅ Bottom-bar HUD layout
- ✅ Tower placement, upgrade (Tiers 1–3; Tier 4 branch picker in Phase 3), sell
- ✅ `maxTierAllowed` respected in upgrade panel
- ✅ Wave spawning, enemy traversal, tower targeting, projectile homing + AoE
- ✅ EconomyManager + loseLife → defeat
- ✅ Victory/defeat screens with Play Again
- ✅ Shutdown cleanup prevents DOM event doubling on restart
- ✅ git tag phase-1-complete

**Deferred to later phases (by design):**
- Tier 4 branch picker UI → Phase 3
- Sniper + Barracks towers → Phase 3
- Full 8-enemy Veth roster + flying units → Phase 4
- Tower icons rendered as emoji on canvas → Phase 2 (GameObjects replace Graphics)
- StoryManager, cutscenes → Phase 5
- Audio → Phase 8
