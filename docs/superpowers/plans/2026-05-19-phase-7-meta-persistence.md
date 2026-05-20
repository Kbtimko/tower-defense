# Phase 7 — Meta & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned save system and a star-funded permanent upgrade tree ("Command Doctrine") to the Last Light tower defense game.

**Architecture:** `SaveManager` replaces `ProgressManager` as the single pure-persistence authority, owning a versioned localStorage envelope (maps, upgrades, stats). `data/upgrades.js` holds the 13-node upgrade catalog. `UpgradeManager` wraps `SaveManager` + the catalog with purchase/refund/modifier logic. `GameScene` reads `getModifiers()` once at match start and threads modifiers into `EconomyManager`, `Hero`, towers, and soldiers; it commits lifetime stats at match end. `MapSelectScene` gains a total-stars bar, a stats panel, and an "Upgrades" button opening a DOM overlay (`UpgradeTreeOverlay`).

**Tech Stack:** Phaser 3, vanilla JS (ES modules), Vite, vitest. DOM-based UI panels (existing project pattern). Tests are co-located `*.test.js`; run with `npm test` (`vitest run`).

**Spec:** `docs/superpowers/specs/2026-05-19-phase-7-meta-persistence-design.md`

---

## Task 1: SaveManager — versioned save envelope

**Files:**
- Create: `src/systems/SaveManager.js`
- Create: `src/systems/SaveManager.test.js`
- Delete: `src/systems/ProgressManager.js`
- Delete: `src/systems/ProgressManager.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/SaveManager.test.js`:

```js
import { SaveManager } from './SaveManager.js';

const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';

beforeEach(() => {
  localStorage.clear();
});

describe('SaveManager — map stars', () => {
  it('fresh load: all stars 0, only map 0 unlocked', () => {
    const sm = new SaveManager();
    for (let i = 0; i < 10; i++) expect(sm.getStars(i)).toBe(0);
    expect(sm.isUnlocked(0)).toBe(true);
    expect(sm.isUnlocked(1)).toBe(false);
  });

  it('setStars upgrades but never downgrades', () => {
    const sm = new SaveManager();
    sm.setStars(0, 1);
    expect(sm.getStars(0)).toBe(1);
    sm.setStars(0, 3);
    expect(sm.getStars(0)).toBe(3);
    sm.setStars(0, 1);
    expect(sm.getStars(0)).toBe(3);
  });

  it('beating map N unlocks map N+1', () => {
    const sm = new SaveManager();
    expect(sm.isUnlocked(1)).toBe(false);
    sm.setStars(0, 2);
    expect(sm.isUnlocked(1)).toBe(true);
  });

  it('getTotalStars sums all maps', () => {
    const sm = new SaveManager();
    sm.setStars(0, 3);
    sm.setStars(1, 2);
    expect(sm.getTotalStars()).toBe(5);
  });
});

describe('SaveManager — migration', () => {
  it('migrates a legacy bare array into a v1 envelope and deletes the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([3,2,0,0,0,0,0,0,0,0]));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getStars(1)).toBe(2);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    const env = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(env.version).toBe(1);
    expect(env.maps).toEqual([3,2,0,0,0,0,0,0,0,0]);
    expect(env.upgrades).toEqual([]);
    expect(env.stats).toEqual({ kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 });
  });

  it('corrupt JSON in either key falls back to a fresh envelope', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const sm = new SaveManager();
    expect(sm.getTotalStars()).toBe(0);
    expect(sm.getPurchasedUpgrades()).toEqual([]);
  });
});

describe('SaveManager — upgrades & stats', () => {
  it('upgrades round-trip and persist', () => {
    const sm = new SaveManager();
    sm.setPurchasedUpgrades(['log_supply_cache']);
    expect(sm.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
    const reloaded = new SaveManager();
    expect(reloaded.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
  });

  it('stats round-trip and persist', () => {
    const sm = new SaveManager();
    sm.setStats({ kills: 12, victories: 1 });
    expect(sm.getStats()).toEqual({ kills: 12, gamesPlayed: 0, victories: 1, defeats: 0, bestWave: 0 });
    const reloaded = new SaveManager();
    expect(reloaded.getStats().kills).toBe(12);
  });

  it('getPurchasedUpgrades returns a copy, not the internal array', () => {
    const sm = new SaveManager();
    sm.setPurchasedUpgrades(['log_supply_cache']);
    sm.getPurchasedUpgrades().push('hacked');
    expect(sm.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SaveManager`
Expected: FAIL — `Cannot find module './SaveManager.js'`

- [ ] **Step 3: Create SaveManager**

Create `src/systems/SaveManager.js`:

```js
const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';
const MAP_COUNT   = 10;
const VERSION     = 1;

function freshEnvelope() {
  return {
    version:  VERSION,
    maps:     new Array(MAP_COUNT).fill(0),
    upgrades: [],
    stats:    { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
  };
}

export class SaveManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    // 1. Current versioned envelope
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
          return this._normalize(parsed);
        }
      }
    } catch (_) { /* fall through to migration / fresh */ }

    // 2. Legacy bare-array migration
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr) && arr.length === MAP_COUNT) {
          const env = freshEnvelope();
          env.maps = arr.slice();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
          localStorage.removeItem(LEGACY_KEY);
          return env;
        }
      }
    } catch (_) { /* fall through to fresh */ }

    // 3. Fresh
    return freshEnvelope();
  }

  _normalize(parsed) {
    const env = freshEnvelope();
    env.maps     = parsed.maps.slice();
    env.upgrades = Array.isArray(parsed.upgrades) ? parsed.upgrades.slice() : [];
    if (parsed.stats && typeof parsed.stats === 'object') {
      env.stats = { ...env.stats, ...parsed.stats };
    }
    return env;
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  // ─── Map stars ───
  getStars(mapId) {
    return this._data.maps[mapId] ?? 0;
  }

  setStars(mapId, stars) {
    if (stars > this._data.maps[mapId]) {
      this._data.maps[mapId] = stars;
      this._save();
    }
  }

  isUnlocked(mapId) {
    if (mapId === 0) return true;
    return this._data.maps[mapId - 1] > 0;
  }

  getTotalStars() {
    return this._data.maps.reduce((sum, s) => sum + s, 0);
  }

  // ─── Upgrades ───
  getPurchasedUpgrades() {
    return this._data.upgrades.slice();
  }

  setPurchasedUpgrades(ids) {
    this._data.upgrades = ids.slice();
    this._save();
  }

  // ─── Stats ───
  getStats() {
    return { ...this._data.stats };
  }

  setStats(stats) {
    this._data.stats = { ...this._data.stats, ...stats };
    this._save();
  }
}
```

- [ ] **Step 4: Delete the obsolete ProgressManager files**

```bash
git rm src/systems/ProgressManager.js src/systems/ProgressManager.test.js
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- SaveManager`
Expected: PASS — all SaveManager tests green.

- [ ] **Step 6: Commit**

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "feat: SaveManager — versioned save envelope, replaces ProgressManager"
```

---

## Task 2: Wire SaveManager into the scenes

`ProgressManager` is deleted, so the two scenes that imported it must switch to `SaveManager`. This task is a pure swap — no behavior change. `SaveManager` has no `unlockNext` (it was a documented no-op), so that call is removed.

**Files:**
- Modify: `src/scenes/MapSelectScene.js`
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Update MapSelectScene**

In `src/scenes/MapSelectScene.js`, change the import on line 3:

```js
import { SaveManager } from '../systems/SaveManager.js';
```

Replace every occurrence of `this._progressMgr` with `this._saveMgr` (5 occurrences: line 15 assignment, lines 20, 34, 49, 68 reads). Line 15 becomes:

```js
    this._saveMgr = new SaveManager();
```

- [ ] **Step 2: Update GameScene**

In `src/scenes/GameScene.js`, change the import on line 14:

```js
import { SaveManager } from '../systems/SaveManager.js';
```

Line 40 becomes:

```js
    this.saveMgr = new SaveManager();
```

In `_onVictory` (around lines 711–712), replace:

```js
    this.progressMgr.setStars(this.mapId, stars);
    this.progressMgr.unlockNext(this.mapId);
```

with:

```js
    this.saveMgr.setStars(this.mapId, stars);
```

- [ ] **Step 3: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — all tests green (the deleted ProgressManager tests are gone; SaveManager tests cover the same behavior). No test imports `ProgressManager`.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/MapSelectScene.js src/scenes/GameScene.js
git commit -m "refactor: wire SaveManager into MapSelectScene and GameScene"
```

---

## Task 3: Upgrade catalog data

**Files:**
- Create: `src/data/upgrades.js`
- Create: `src/data/upgrades.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/data/upgrades.test.js`:

```js
import { UPGRADES } from './upgrades.js';

describe('UPGRADES catalog', () => {
  it('has 13 nodes', () => {
    expect(UPGRADES).toHaveLength(13);
  });

  it('every id is unique', () => {
    const ids = UPGRADES.map(u => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-null `requires` points to a real id in the same branch', () => {
    const byId = new Map(UPGRADES.map(u => [u.id, u]));
    for (const node of UPGRADES) {
      if (node.requires === null) continue;
      const parent = byId.get(node.requires);
      expect(parent, `${node.id} requires missing ${node.requires}`).toBeDefined();
      expect(parent.branch).toBe(node.branch);
    }
  });

  it('each branch has exactly one root (requires === null)', () => {
    for (const branch of ['command', 'logistics', 'arsenal']) {
      const roots = UPGRADES.filter(u => u.branch === branch && u.requires === null);
      expect(roots).toHaveLength(1);
    }
  });

  it('starThreshold is present only on the three deep nodes, all set to 15', () => {
    const gated = UPGRADES.filter(u => u.starThreshold != null);
    expect(gated.map(u => u.id).sort()).toEqual(
      ['ars_overcharge', 'cmd_elite', 'log_garrison'],
    );
    for (const node of gated) expect(node.starThreshold).toBe(15);
  });

  it('catalog total cost is 45', () => {
    expect(UPGRADES.reduce((s, u) => s + u.cost, 0)).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- upgrades`
Expected: FAIL — `Cannot find module './upgrades.js'`

- [ ] **Step 3: Create the catalog**

Create `src/data/upgrades.js`:

```js
// Phase 7 "Command Doctrine" permanent upgrade tree.
// Funded by spending earned stars (30 total in the game; 45 to buy everything).
// `requires` — id of the prerequisite node, or null for branch roots.
// `starThreshold` — total stars EARNED required before the node can be purchased.

export const UPGRADES = [
  // ─── Command — Commander Rael ───
  { id: 'cmd_battle_hardened', branch: 'command',   name: 'Battle-Hardened',
    effect: 'Hero +50 max HP',            cost: 2, requires: null },
  { id: 'cmd_veteran',         branch: 'command',   name: 'Veteran Commander',
    effect: 'Hero starts at Level 2',     cost: 4, requires: 'cmd_battle_hardened' },
  { id: 'cmd_rapid_redeploy',  branch: 'command',   name: 'Rapid Redeployment',
    effect: 'Hero respawn −6s',           cost: 3, requires: 'cmd_battle_hardened' },
  { id: 'cmd_elite',           branch: 'command',   name: 'Elite Commander',
    effect: 'Hero starts at Level 3',     cost: 6, requires: 'cmd_veteran', starThreshold: 15 },

  // ─── Logistics — economy ───
  { id: 'log_supply_cache',    branch: 'logistics', name: 'Supply Cache',
    effect: '+40 starting gold',          cost: 2, requires: null },
  { id: 'log_deep_reserves',   branch: 'logistics', name: 'Deep Reserves',
    effect: '+80 starting gold',          cost: 3, requires: 'log_supply_cache' },
  { id: 'log_bounty',          branch: 'logistics', name: 'Bounty Protocol',
    effect: '+20% gold from kills',       cost: 4, requires: 'log_supply_cache' },
  { id: 'log_garrison',        branch: 'logistics', name: 'Garrison Command',
    effect: '+2 starting lives',          cost: 4, requires: 'log_bounty', starThreshold: 15 },

  // ─── Arsenal — towers & soldiers ───
  { id: 'ars_munitions',       branch: 'arsenal',   name: 'Munitions Discount',
    effect: 'Towers cost 10% less',       cost: 3, requires: null },
  { id: 'ars_optics',          branch: 'arsenal',   name: 'Targeting Optics',
    effect: 'All towers +8% range',       cost: 3, requires: 'ars_munitions' },
  { id: 'ars_recruits',        branch: 'arsenal',   name: 'Hardened Recruits',
    effect: 'Soldiers +30 max HP',        cost: 3, requires: 'ars_munitions' },
  { id: 'ars_overcharge',      branch: 'arsenal',   name: 'Overcharged Rounds',
    effect: 'All towers +6% damage',      cost: 5, requires: 'ars_optics', starThreshold: 15 },
  { id: 'ars_drills',          branch: 'arsenal',   name: 'Combat Drills',
    effect: 'Soldiers respawn 25% faster', cost: 3, requires: 'ars_recruits' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- upgrades`
Expected: PASS — all 6 catalog tests green.

- [ ] **Step 5: Commit**

```bash
git add src/data/upgrades.js src/data/upgrades.test.js
git commit -m "feat: Command Doctrine upgrade catalog (13 nodes)"
```

---

## Task 4: UpgradeManager

**Files:**
- Create: `src/systems/UpgradeManager.js`
- Create: `src/systems/UpgradeManager.test.js`

`UpgradeManager` is constructed with a `SaveManager`. Tests build a real `SaveManager` (it uses `localStorage`, which vitest's jsdom environment provides — `SaveManager.test.js` already relies on this).

- [ ] **Step 1: Write the failing test**

Create `src/systems/UpgradeManager.test.js`:

```js
import { SaveManager }    from './SaveManager.js';
import { UpgradeManager } from './UpgradeManager.js';

// Helper: a SaveManager with `total` stars spread across maps (3 per map).
function saveWithStars(total) {
  localStorage.clear();
  const sm = new SaveManager();
  let mapId = 0;
  while (total > 0) {
    const give = Math.min(3, total);
    sm.setStars(mapId++, give);
    total -= give;
  }
  return sm;
}

describe('UpgradeManager — getAvailableStars', () => {
  it('equals total stars when nothing purchased', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(um.getAvailableStars()).toBe(10);
  });

  it('subtracts the cost of purchased nodes', () => {
    const sm = saveWithStars(10);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache'); // cost 2
    expect(um.getAvailableStars()).toBe(8);
  });
});

describe('UpgradeManager — canPurchase', () => {
  it('rejects an already-owned node', () => {
    const um = new UpgradeManager(saveWithStars(10));
    um.purchase('log_supply_cache');
    expect(um.canPurchase('log_supply_cache')).toBe(false);
  });

  it('rejects a node whose prerequisite is not owned', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(um.canPurchase('log_deep_reserves')).toBe(false);
  });

  it('rejects a node whose starThreshold is not met', () => {
    const sm = saveWithStars(14); // < 15
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.canPurchase('cmd_elite')).toBe(false);
  });

  it('rejects a node the player cannot afford', () => {
    const um = new UpgradeManager(saveWithStars(1)); // supply cache costs 2
    expect(um.canPurchase('log_supply_cache')).toBe(false);
  });

  it('accepts a node when prereq, threshold and affordability all pass', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.canPurchase('cmd_elite')).toBe(true); // 20 earned >= 15, 14 available >= 6
  });
});

describe('UpgradeManager — purchase', () => {
  it('throws when the node cannot be purchased', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(() => um.purchase('log_deep_reserves')).toThrow();
  });

  it('persists the purchase through SaveManager', () => {
    const sm = saveWithStars(10);
    new UpgradeManager(sm).purchase('log_supply_cache');
    expect(sm.getPurchasedUpgrades()).toContain('log_supply_cache');
  });
});

describe('UpgradeManager — refund cascade', () => {
  it('refunding a leaf removes only that node', () => {
    const um = new UpgradeManager(saveWithStars(10));
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_rapid_redeploy');
    um.refund('cmd_rapid_redeploy');
    expect(um.isPurchased('cmd_rapid_redeploy')).toBe(false);
    expect(um.isPurchased('cmd_battle_hardened')).toBe(true);
  });

  it('refunding a root cascades to all transitive dependents and recovers all stars', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened'); // 2
    um.purchase('cmd_veteran');         // 4
    um.purchase('cmd_rapid_redeploy');  // 3
    um.purchase('cmd_elite');           // 6
    expect(um.getAvailableStars()).toBe(5);
    um.refund('cmd_battle_hardened');
    expect(um.getPurchasedUpgrades()).toEqual([]);
    expect(um.getAvailableStars()).toBe(20);
  });

  it('refunding an unowned node is a no-op', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(() => um.refund('cmd_elite')).not.toThrow();
  });
});

describe('UpgradeManager — getNodeState', () => {
  it('reports the lifecycle states', () => {
    const sm = saveWithStars(14);
    const um = new UpgradeManager(sm);
    expect(um.getNodeState('cmd_battle_hardened')).toBe('affordable');
    expect(um.getNodeState('cmd_veteran')).toBe('locked-prereq');
    um.purchase('cmd_battle_hardened');
    expect(um.getNodeState('cmd_battle_hardened')).toBe('purchased');
    um.purchase('cmd_veteran');
    expect(um.getNodeState('cmd_elite')).toBe('locked-threshold'); // 14 < 15
  });

  it('reports unaffordable when prereq met but stars too low', () => {
    const sm = saveWithStars(2);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache');     // spends 2, 0 available
    expect(um.getNodeState('log_bounty')).toBe('unaffordable'); // bounty costs 4
  });
});

describe('UpgradeManager — getModifiers', () => {
  it('returns all defaults when nothing is purchased', () => {
    const um = new UpgradeManager(saveWithStars(0));
    expect(um.getModifiers()).toEqual({
      heroMaxHpBonus: 0, heroStartLevel: 1, heroRespawnDelta: 0,
      startGoldBonus: 0, killGoldMult: 1.0, startLivesBonus: 0,
      towerCostMult: 1.0, towerRangeMult: 1.0, towerDamageMult: 1.0,
      soldierMaxHpBonus: 0, soldierRespawnMult: 1.0,
    });
  });

  it('aggregates additive starting gold from both logistics nodes', () => {
    const sm = saveWithStars(10);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache');
    um.purchase('log_deep_reserves');
    expect(um.getModifiers().startGoldBonus).toBe(120);
  });

  it('Elite Commander beats Veteran Commander for heroStartLevel', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.getModifiers().heroStartLevel).toBe(2);
    um.purchase('cmd_elite');
    expect(um.getModifiers().heroStartLevel).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- UpgradeManager`
Expected: FAIL — `Cannot find module './UpgradeManager.js'`

- [ ] **Step 3: Create UpgradeManager**

Create `src/systems/UpgradeManager.js`:

```js
import { UPGRADES } from '../data/upgrades.js';

const BY_ID = new Map(UPGRADES.map(u => [u.id, u]));

export class UpgradeManager {
  constructor(saveMgr) {
    this._save = saveMgr;
  }

  _owned() {
    return new Set(this._save.getPurchasedUpgrades());
  }

  getNode(id) {
    return BY_ID.get(id) ?? null;
  }

  isPurchased(id) {
    return this._owned().has(id);
  }

  getAvailableStars() {
    let spent = 0;
    for (const id of this._owned()) {
      const node = BY_ID.get(id);
      if (node) spent += node.cost;
    }
    return this._save.getTotalStars() - spent;
  }

  canPurchase(id) {
    const node = BY_ID.get(id);
    if (!node) return false;
    const owned = this._owned();
    if (owned.has(id)) return false;
    if (node.requires && !owned.has(node.requires)) return false;
    if (node.starThreshold != null
        && this._save.getTotalStars() < node.starThreshold) return false;
    return this.getAvailableStars() >= node.cost;
  }

  purchase(id) {
    if (!this.canPurchase(id)) {
      throw new Error(`Cannot purchase upgrade: ${id}`);
    }
    this._save.setPurchasedUpgrades([...this._save.getPurchasedUpgrades(), id]);
  }

  refund(id) {
    const owned = this._owned();
    if (!owned.has(id)) return;
    // Collect id + all transitive dependents that are currently owned.
    const toRemove = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of UPGRADES) {
        if (owned.has(node.id) && !toRemove.has(node.id)
            && node.requires && toRemove.has(node.requires)) {
          toRemove.add(node.id);
          changed = true;
        }
      }
    }
    this._save.setPurchasedUpgrades(
      [...owned].filter(uid => !toRemove.has(uid)),
    );
  }

  getNodeState(id) {
    const node = BY_ID.get(id);
    if (!node) return 'unaffordable';
    const owned = this._owned();
    if (owned.has(id)) return 'purchased';
    if (node.requires && !owned.has(node.requires)) return 'locked-prereq';
    if (node.starThreshold != null
        && this._save.getTotalStars() < node.starThreshold) return 'locked-threshold';
    return this.getAvailableStars() >= node.cost ? 'affordable' : 'unaffordable';
  }

  getModifiers() {
    const owned = this._owned();
    const has = id => owned.has(id);
    const mods = {
      heroMaxHpBonus:     0,
      heroStartLevel:     1,
      heroRespawnDelta:   0,
      startGoldBonus:     0,
      killGoldMult:       1.0,
      startLivesBonus:    0,
      towerCostMult:      1.0,
      towerRangeMult:     1.0,
      towerDamageMult:    1.0,
      soldierMaxHpBonus:  0,
      soldierRespawnMult: 1.0,
    };
    if (has('cmd_battle_hardened')) mods.heroMaxHpBonus     = 50;
    if (has('cmd_veteran'))         mods.heroStartLevel     = 2;
    if (has('cmd_elite'))           mods.heroStartLevel     = 3;
    if (has('cmd_rapid_redeploy'))  mods.heroRespawnDelta   = -6;
    if (has('log_supply_cache'))    mods.startGoldBonus    += 40;
    if (has('log_deep_reserves'))   mods.startGoldBonus    += 80;
    if (has('log_bounty'))          mods.killGoldMult       = 1.2;
    if (has('log_garrison'))        mods.startLivesBonus    = 2;
    if (has('ars_munitions'))       mods.towerCostMult      = 0.9;
    if (has('ars_optics'))          mods.towerRangeMult     = 1.08;
    if (has('ars_overcharge'))      mods.towerDamageMult    = 1.06;
    if (has('ars_recruits'))        mods.soldierMaxHpBonus  = 30;
    if (has('ars_drills'))          mods.soldierRespawnMult = 0.75;
    return mods;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- UpgradeManager`
Expected: PASS — all UpgradeManager tests green.

- [ ] **Step 5: Commit**

```bash
git add src/systems/UpgradeManager.js src/systems/UpgradeManager.test.js
git commit -m "feat: UpgradeManager — purchase, refund cascade, modifier aggregation"
```

---

## Task 5: Thread modifiers through the Hero

The `Hero` constructor gains an optional `modifiers` argument. When absent (e.g. tests, direct construction) the hero behaves exactly as before. Modifier application is trivial arithmetic; it is verified in-browser in Task 10.

**Files:**
- Modify: `src/entities/Hero.js`

- [ ] **Step 1: Apply modifiers in the Hero constructor**

In `src/entities/Hero.js`, change the constructor signature (line 12) from:

```js
  constructor(scene, { x, y }) {
    super(scene, x, y);

    this.hp           = MAX_HP;
    this.maxHp        = MAX_HP;
    this.level        = 1;
```

to:

```js
  constructor(scene, { x, y }, modifiers = {}) {
    super(scene, x, y);

    const maxHp = MAX_HP + (modifiers.heroMaxHpBonus ?? 0);
    this.hp           = maxHp;
    this.maxHp        = maxHp;
    this.level        = modifiers.heroStartLevel ?? 1;
    this._respawnTime = RESPAWN_TIME + (modifiers.heroRespawnDelta ?? 0);
```

- [ ] **Step 2: Use the per-hero respawn time**

In `takeDamage` (around line 76), change:

```js
      this.respawnTimer = RESPAWN_TIME;
```

to:

```js
      this.respawnTimer = this._respawnTime;
```

(The module constant `RESPAWN_TIME` stays — it is the default the constructor adds the delta to.)

- [ ] **Step 3: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — no regressions. Existing Hero usage passes no `modifiers`, so defaults apply.

- [ ] **Step 4: Commit**

```bash
git add src/entities/Hero.js
git commit -m "feat: Hero accepts upgrade modifiers (HP, start level, respawn)"
```

---

## Task 6: Thread modifiers through towers and soldiers

A single `modifiers` object flows: `TowerPlacementManager` → tower `opts` → `Tower` / `Barracks` → `Soldier`. Tower range/damage multipliers must be re-applied on every `upgrade()` because `upgrade()` overwrites those stats from the tier definition.

**Files:**
- Modify: `src/systems/TowerPlacementManager.js`
- Modify: `src/entities/Tower.js`
- Modify: `src/entities/Barracks.js`
- Modify: `src/entities/Soldier.js`

- [ ] **Step 1: TowerPlacementManager — accept modifiers, apply cost multiplier**

In `src/systems/TowerPlacementManager.js`, change the constructor (lines 4–10):

```js
  constructor(zones, economy, entityFactory, modifiers = {}) {
    this.zones      = zones;
    this.economy    = economy;
    this._factory   = entityFactory;
    this._modifiers = modifiers;
    this.towers     = [];
    this._nextId    = 0;
  }
```

Replace `placeTower` (lines 19–30) with:

```js
  placeTower(zoneIndex, type, scene) {
    const zone = this.zones[zoneIndex];
    if (!zone || zone.occupied) return null;
    const def = TOWER_DEFS[type];
    if (!def) return null;
    const cost = Math.round(def.cost * (this._modifiers.towerCostMult ?? 1));
    if (!this.economy.spend(cost)) return null;
    const tower = this._factory(type, scene, {
      type, x: zone.cx, y: zone.cy, def, zoneIndex, modifiers: this._modifiers,
    });
    tower.id        = this._nextId++;
    tower.totalCost = cost;
    zone.occupied   = true;
    this.towers.push(tower);
    return tower;
  }
```

- [ ] **Step 2: Tower — apply range/damage multipliers in constructor and upgrade**

In `src/entities/Tower.js`, change the constructor (lines 5–19). Replace:

```js
  constructor(scene, { type, x, y, def, zoneIndex }) {
    super(scene, x, y);

    this.type         = type;
    this.level        = 1;
    this.branch       = null;
    this.damage       = def.damage;
    this.range        = def.range;
```

with:

```js
  constructor(scene, { type, x, y, def, zoneIndex, modifiers = {} }) {
    super(scene, x, y);

    this._rangeMult   = modifiers.towerRangeMult  ?? 1;
    this._damageMult  = modifiers.towerDamageMult ?? 1;
    this.type         = type;
    this.level        = 1;
    this.branch       = null;
    this.damage       = Math.round(def.damage * this._damageMult);
    this.range        = Math.round(def.range  * this._rangeMult);
```

In `upgrade` (lines 52–53), replace:

```js
    if (tierDef.damage       !== undefined) this.damage       = tierDef.damage;
    if (tierDef.range        !== undefined) this.range        = tierDef.range;
```

with:

```js
    if (tierDef.damage       !== undefined) this.damage       = Math.round(tierDef.damage * this._damageMult);
    if (tierDef.range        !== undefined) this.range        = Math.round(tierDef.range  * this._rangeMult);
```

- [ ] **Step 3: Barracks — pass modifiers to super and store them**

In `src/entities/Barracks.js`, change the constructor (lines 6–11):

```js
  constructor(scene, { type, x, y, def, zoneIndex, modifiers = {} }) {
    super(scene, { type, x, y, def, zoneIndex, modifiers });
    this._modifiers          = modifiers;
    this.soldiers            = [];
    this.soldierPathProgress = 0.5;
    this.soldierStats        = def.soldierStats.tier1;
  }
```

In `spawnSoldiers` (lines 13–22), pass the modifiers into each `Soldier`:

```js
  spawnSoldiers(scene, pathPoints) {
    for (let i = 0; i < this.soldierStats.count; i++) {
      this.soldiers.push(new Soldier(scene, {
        barracks:     this,
        pathProgress: this.soldierPathProgress,
        pathPoints,
        soldierStats: this.soldierStats,
        modifiers:    this._modifiers,
      }));
    }
  }
```

- [ ] **Step 4: Soldier — apply HP and respawn modifiers**

In `src/entities/Soldier.js`, change the constructor (lines 4–17). Replace:

```js
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats }) {
    super(scene, 0, 0);

    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = soldierStats.hp;
    this.maxHp           = soldierStats.hp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierStats.respawnDuration;
```

with:

```js
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats, modifiers = {} }) {
    super(scene, 0, 0);

    const maxHp = soldierStats.hp + (modifiers.soldierMaxHpBonus ?? 0);
    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = maxHp;
    this.maxHp           = maxHp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierStats.respawnDuration * (modifiers.soldierRespawnMult ?? 1);
```

- [ ] **Step 5: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — no regressions. All existing callers pass no `modifiers`, so defaults (`×1`, `+0`) apply.

- [ ] **Step 6: Commit**

```bash
git add src/systems/TowerPlacementManager.js src/entities/Tower.js src/entities/Barracks.js src/entities/Soldier.js
git commit -m "feat: thread upgrade modifiers through towers and soldiers"
```

---

## Task 7: GameScene — apply modifiers and commit stats

`GameScene` builds the `UpgradeManager`, reads `getModifiers()` once in `create()`, and threads the result into `EconomyManager`, the `Hero`, and the `TowerPlacementManager`. Kill rewards are scaled by `killGoldMult`. Lifetime stats are committed on victory and defeat.

**Files:**
- Modify: `src/scenes/GameScene.js`

- [ ] **Step 1: Import UpgradeManager**

In `src/scenes/GameScene.js`, add after the `SaveManager` import (line 14):

```js
import { UpgradeManager } from '../systems/UpgradeManager.js';
```

- [ ] **Step 2: Build the UpgradeManager and read modifiers**

In `create()`, the systems block (lines 36–48) currently reads:

```js
    // Systems
    this.pathMgr  = new PathManager(map.waypoints, width, height);
    this.economy  = new EconomyManager(map.startGold, map.startLives, this.events);
    this.waveMgr  = new WaveManager(MAP_WAVES[this.mapId] ?? MAP_WAVES[0], this.events);
    this.saveMgr = new SaveManager();
    this.storyMgr    = new StoryManager(STORY_PANELS);
    this.placementManager = new TowerPlacementManager(
      this.pathMgr.buildZones,
      this.economy,
      (type, scene, opts) => type === 'barracks'
        ? new Barracks(scene, opts)
        : new Tower(scene, opts)
    );
```

Replace it with:

```js
    // Systems
    this.saveMgr     = new SaveManager();
    this.upgradeMgr  = new UpgradeManager(this.saveMgr);
    const mods       = this.upgradeMgr.getModifiers();
    this.killGoldMult = mods.killGoldMult;

    this.pathMgr  = new PathManager(map.waypoints, width, height);
    this.economy  = new EconomyManager(
      map.startGold  + mods.startGoldBonus,
      map.startLives + mods.startLivesBonus,
      this.events,
    );
    this.waveMgr  = new WaveManager(MAP_WAVES[this.mapId] ?? MAP_WAVES[0], this.events);
    this.storyMgr = new StoryManager(STORY_PANELS);
    this.placementManager = new TowerPlacementManager(
      this.pathMgr.buildZones,
      this.economy,
      (type, scene, opts) => type === 'barracks'
        ? new Barracks(scene, opts)
        : new Tower(scene, opts),
      mods,
    );
```

- [ ] **Step 3: Pass modifiers to the Hero**

In `create()`, the Hero block (line 51) currently reads:

```js
    this.hero                     = new Hero(this, this.pathMgr.path[0]);
```

Change it to:

```js
    this.hero                     = new Hero(this, this.pathMgr.path[0], mods);
```

- [ ] **Step 4: Emit the hero's actual start level**

In `create()`, the `delayedCall` (lines 104–107) currently hardcodes level 1:

```js
    // Unlock Q immediately (hero starts at L1)
    this.time.delayedCall(150, () => {
      this.game.events.emit('hero:level-up', { level: 1 });
    });
```

Change it to emit the hero's real starting level (so a Veteran/Elite hero unlocks W/E from the start):

```js
    // Unlock abilities for the hero's starting level
    this.time.delayedCall(150, () => {
      this.game.events.emit('hero:level-up', { level: this.hero.level });
    });
```

- [ ] **Step 5: Scale kill rewards by killGoldMult**

In `_updateHero` (around line 259), change:

```js
        this.economy.earn(e.reward);
```

to:

```js
        this.economy.earn(Math.round(e.reward * this.killGoldMult));
```

In `_dealDamage` (around line 407), change:

```js
      this.economy.earn(enemy.reward);
```

to:

```js
      this.economy.earn(Math.round(enemy.reward * this.killGoldMult));
```

(The flat `38` wave-completion bonus in `_checkWaveComplete` is intentionally left unchanged — `killGoldMult` only affects gold from kills.)

- [ ] **Step 6: Add the stats-commit helper and call it on game end**

Add this method to `GameScene` (place it just before `_toast`, after `_onDefeat`):

```js
  _commitStats(isVictory) {
    const s = this.saveMgr.getStats();
    this.saveMgr.setStats({
      kills:       s.kills + this.kills,
      gamesPlayed: s.gamesPlayed + 1,
      victories:   s.victories + (isVictory ? 1 : 0),
      defeats:     s.defeats + (isVictory ? 0 : 1),
      bestWave:    Math.max(s.bestWave, this.waveMgr.currentWave),
    });
  }
```

In `_onVictory` (line 707), add the commit as the first statement after `this.won = true;`:

```js
  _onVictory() {
    this.won = true;
    this._commitStats(true);
```

In `_onDefeat` (line 729), add the commit as the first statement after `this.over = true;`:

```js
  _onDefeat() {
    this.over = true;
    this._commitStats(false);
```

- [ ] **Step 7: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 8: Browser smoke check**

Run: `npm run dev`, open the served URL, click Play on Map 1. Verify the game loads and a wave can be started (no console errors). Full upgrade-effect verification happens in Task 10.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: GameScene applies upgrade modifiers and commits lifetime stats"
```

---

## Task 8: index.html — DOM and CSS for the meta UI

Add the total-stars bar, the "Upgrades" button, the lifetime-stats strip, and the upgrade-tree overlay shell. The overlay's branch columns and nodes are built dynamically in Task 10; this task only adds the static shell and styling.

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the meta bar and stats strip inside `#map-select`**

In `index.html`, the `#map-select` block currently reads:

```html
    <div id="map-select">
      <div id="map-select-title">LAST LIGHT</div>
      <div id="map-select-layout">
        <div id="map-sidebar"></div>
        <div id="map-featured">
```

Insert a meta bar after the title, and the stats strip after the layout. Replace the block above with:

```html
    <div id="map-select">
      <div id="map-select-title">LAST LIGHT</div>
      <div id="map-meta-bar">
        <div id="total-stars">★ 0 / 30</div>
        <button id="open-upgrades">⚙ Upgrades</button>
      </div>
      <div id="map-select-layout">
        <div id="map-sidebar"></div>
        <div id="map-featured">
```

Then find the closing of `#map-select-layout` (the `</div>` that pairs with `<div id="map-select-layout">`, immediately before the `</div>` that closes `#map-select`) and add the stats strip after it, so the end of the `#map-select` block reads:

```html
        </div>
      </div>
      <div id="lifetime-stats"></div>
    </div>
```

- [ ] **Step 2: Add the upgrade overlay shell**

Inside `#game`, after the `#game-msg` block's closing `</div>` and before the `</div>` that closes `#game`, add:

```html
    <div id="upgrade-overlay">
      <div id="upgrade-overlay-inner">
        <div id="upgrade-overlay-header">
          <span id="upgrade-overlay-title">Command Doctrine</span>
          <span id="upgrade-available">Available: 0★</span>
          <button id="upgrade-close">✕ Close</button>
        </div>
        <div id="upgrade-tree"></div>
      </div>
    </div>
```

- [ ] **Step 3: Add the CSS**

In the `<style>` block, append before the closing `</style>`:

```css
    #map-meta-bar { display:flex; align-items:center; justify-content:center; gap:18px;
                    margin-bottom:14px; }
    #total-stars { font-size:18px; color:#ffd700; font-weight:bold; letter-spacing:1px; }
    #open-upgrades { background:#1a2a3a; border:2px solid #4fc3f7; color:#4fc3f7;
                     padding:6px 16px; border-radius:6px; cursor:pointer; font-size:14px;
                     font-family:'Georgia',serif; }
    #open-upgrades:hover { background:#223344; }
    #lifetime-stats { display:flex; justify-content:center; gap:10px; margin-top:14px;
                      flex-wrap:wrap; }
    .stat-chip { background:#0f0f2e; border:1px solid #2a3442; border-radius:6px;
                 padding:5px 12px; text-align:center; min-width:64px; }
    .stat-chip-val { display:block; font-size:16px; color:#ffd700; font-weight:bold; }
    .stat-chip-lbl { display:block; font-size:9px; color:#888; text-transform:uppercase;
                     letter-spacing:.5px; }
    #upgrade-overlay { display:none; position:absolute; inset:0; z-index:15;
                       background:rgba(4,4,14,0.96); align-items:center;
                       justify-content:center; padding:24px; }
    #upgrade-overlay-inner { width:100%; max-width:900px; max-height:100%;
                             display:flex; flex-direction:column; }
    #upgrade-overlay-header { display:flex; align-items:center; gap:18px;
                              margin-bottom:16px; }
    #upgrade-overlay-title { font-size:22px; color:#ffd700; font-weight:bold; flex:1; }
    #upgrade-available { font-size:15px; color:#ffd700; font-weight:bold; }
    #upgrade-close { background:#3a1a1a; border:1px solid #8a3a3a; color:#f07a7a;
                     padding:6px 14px; border-radius:6px; cursor:pointer; font-size:13px;
                     font-family:'Georgia',serif; }
    #upgrade-tree { display:flex; gap:14px; overflow-y:auto; }
    .upgrade-branch { flex:1; background:#11161f; border:1px solid #2a3442;
                      border-radius:10px; padding:12px; }
    .upgrade-branch h3 { font-size:15px; color:#ffd700; margin-bottom:10px;
                         text-align:center; }
    .upgrade-node { background:#1b2530; border:1px solid #38465a; border-radius:8px;
                    padding:8px 10px; margin-bottom:10px; position:relative; }
    .upgrade-node-name { font-weight:bold; font-size:13px; color:#e8e0d0; }
    .upgrade-node-fx { font-size:11px; color:#aaa; }
    .upgrade-node-cost { position:absolute; top:8px; right:10px; font-size:12px;
                         font-weight:bold; color:#ffd700; }
    .upgrade-node-gate { font-size:10px; font-weight:bold; color:#ffcf5c;
                         background:#3a2d12; border:1px solid #6b5520; border-radius:4px;
                         padding:1px 6px; display:inline-block; margin-top:4px; }
    .upgrade-node-refund { background:#3a1a1a; border:1px solid #8a3a3a; color:#f07a7a;
                           font-size:10px; padding:2px 8px; border-radius:4px;
                           cursor:pointer; margin-top:6px; font-family:'Georgia',serif; }
    .upgrade-node.purchased { border-color:#4a8a4a; background:#16261a; }
    .upgrade-node.affordable { border-color:#4fc3f7; cursor:pointer; }
    .upgrade-node.affordable:hover { background:#223344; }
    .upgrade-node.unaffordable { opacity:0.55; }
    .upgrade-node.locked-prereq { opacity:0.35; }
    .upgrade-node.locked-threshold { opacity:0.7; }
```

- [ ] **Step 4: Verify the page builds**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: meta UI scaffold — stars bar, stats strip, upgrade overlay shell"
```

---

## Task 9: MapSelectScene — render the meta bar, stats, and Upgrades button

`MapSelectScene` populates the total-stars bar and the lifetime-stats strip, and wires the "Upgrades" button to open the overlay. The overlay itself is implemented in Task 10; this task imports it and calls `open()`.

**Files:**
- Modify: `src/scenes/MapSelectScene.js`

> Task 10 creates `src/ui/UpgradeTreeOverlay.js`. If executing strictly in order, complete Task 10's Step 1–2 (file creation) before Task 9's Step 3, or do Task 10 first — they are interdependent only at the import line. Recommended: do Task 10 first, then Task 9.

- [ ] **Step 1: Import UpgradeManager and UpgradeTreeOverlay**

In `src/scenes/MapSelectScene.js`, add after the existing imports:

```js
import { UpgradeManager }     from '../systems/UpgradeManager.js';
import { UpgradeTreeOverlay } from '../ui/UpgradeTreeOverlay.js';
```

- [ ] **Step 2: Render the meta bar and stats in `create()`**

In `create()`, after `this._saveMgr = new SaveManager();`, add:

```js
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);
```

At the end of `create()` (after `this._bindPlay();`), add:

```js
    this._renderMetaBar();
    this._renderStats();
    this._bindUpgrades();
```

- [ ] **Step 3: Add the render and binding methods**

Add these methods to `MapSelectScene` (before `shutdown`):

```js
  _renderMetaBar() {
    document.getElementById('total-stars').textContent =
      `★ ${this._saveMgr.getTotalStars()} / 30`;
  }

  _renderStats() {
    const s   = this._saveMgr.getStats();
    const el  = document.getElementById('lifetime-stats');
    el.replaceChildren();
    const chips = [
      ['Kills',       s.kills],
      ['Games',       s.gamesPlayed],
      ['Victories',   s.victories],
      ['Defeats',     s.defeats],
      ['Best Wave',   s.bestWave],
      ['Total Stars', this._saveMgr.getTotalStars()],
    ];
    for (const [label, value] of chips) {
      const chip = document.createElement('div');
      chip.className = 'stat-chip';
      const valEl = document.createElement('span');
      valEl.className   = 'stat-chip-val';
      valEl.textContent = value;
      const lblEl = document.createElement('span');
      lblEl.className   = 'stat-chip-lbl';
      lblEl.textContent = label;
      chip.append(valEl, lblEl);
      el.appendChild(chip);
    }
  }

  _bindUpgrades() {
    // Clone removes any prior listener before re-adding (matches _bindPlay).
    const old = document.getElementById('open-upgrades');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._overlay.open());
  }
```

- [ ] **Step 4: Hide the overlay on scene shutdown**

In `shutdown()`, add the overlay hide so it never leaks into `GameScene`:

```js
  shutdown() {
    document.getElementById('map-select').style.display     = 'none';
    document.getElementById('upgrade-overlay').style.display = 'none';
  }
```

- [ ] **Step 5: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js
git commit -m "feat: MapSelectScene renders stars bar, stats, Upgrades button"
```

---

## Task 10: UpgradeTreeOverlay — render and interaction

The overlay renders the three branch columns into `#upgrade-tree`, reflects each node's state, and handles purchase, per-node refund (with cascade via `UpgradeManager.refund`), and close. Every purchase/refund triggers a full re-render — simple and always correct.

**Files:**
- Create: `src/ui/UpgradeTreeOverlay.js`

- [ ] **Step 1: Create the overlay module**

Create `src/ui/UpgradeTreeOverlay.js`:

```js
import { UPGRADES } from '../data/upgrades.js';

const BRANCHES = [
  { key: 'command',   label: 'Command'   },
  { key: 'logistics', label: 'Logistics' },
  { key: 'arsenal',   label: 'Arsenal'   },
];

export class UpgradeTreeOverlay {
  constructor(upgradeMgr) {
    this._mgr      = upgradeMgr;
    this._overlay  = document.getElementById('upgrade-overlay');
    this._tree     = document.getElementById('upgrade-tree');
    this._avail    = document.getElementById('upgrade-available');
    this._closeBtn = document.getElementById('upgrade-close');
    this._onClose  = () => this.close();
  }

  open() {
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.style.display = 'flex';
    this._render();
  }

  close() {
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.style.display = 'none';
  }

  _render() {
    this._avail.textContent = `Available: ${this._mgr.getAvailableStars()}★`;
    this._tree.replaceChildren();
    for (const branch of BRANCHES) {
      const col = document.createElement('div');
      col.className = 'upgrade-branch';
      const heading = document.createElement('h3');
      heading.textContent = branch.label;
      col.appendChild(heading);
      for (const node of UPGRADES.filter(u => u.branch === branch.key)) {
        col.appendChild(this._renderNode(node));
      }
      this._tree.appendChild(col);
    }
  }

  _renderNode(node) {
    const state = this._mgr.getNodeState(node.id);
    const el = document.createElement('div');
    el.className = `upgrade-node ${state}`;

    const name = document.createElement('div');
    name.className   = 'upgrade-node-name';
    name.textContent = node.name;

    const fx = document.createElement('div');
    fx.className   = 'upgrade-node-fx';
    fx.textContent = node.effect;

    const cost = document.createElement('div');
    cost.className   = 'upgrade-node-cost';
    cost.textContent = `${node.cost}★`;

    el.append(name, fx, cost);

    if (state === 'locked-threshold') {
      const gate = document.createElement('div');
      gate.className   = 'upgrade-node-gate';
      gate.textContent = `Needs ${node.starThreshold}★ earned`;
      el.appendChild(gate);
    }

    if (state === 'affordable') {
      el.addEventListener('click', () => {
        this._mgr.purchase(node.id);
        this._render();
      });
    } else if (state === 'purchased') {
      const refund = document.createElement('button');
      refund.className   = 'upgrade-node-refund';
      refund.textContent = 'Refund';
      refund.addEventListener('click', (e) => {
        e.stopPropagation();
        this._mgr.refund(node.id);
        this._render();
      });
      el.appendChild(refund);
    }

    return el;
  }
}
```

- [ ] **Step 2: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS — no regressions (this is a new untested file; the suite must stay green).

- [ ] **Step 3: Browser verification of the full Phase 7 flow**

Run: `npm run dev` and open the served URL. With browser devtools:

1. **Seed stars** — in the console run:
   `localStorage.setItem('lastlight_progress', JSON.stringify([3,3,3,3,3,2,0,0,0,0]))` then reload. This exercises the **legacy migration path** (Task 1) and gives 17 total stars.
2. **Meta bar** — MapSelectScene shows `★ 17 / 30`; the stats strip shows six chips (all zero except Total Stars = 17).
3. **Open overlay** — click "⚙ Upgrades". The three branch columns render. "Available: 17★".
4. **Purchase** — click `Battle-Hardened` (affordable) → it turns purchased (green) with a Refund button; `Veteran Commander` becomes affordable; "Available" drops to 15★.
5. **Threshold gate** — buy `Veteran Commander`; `Elite Commander` should show `affordable` (17 earned ≥ 15). Re-seed with fewer stars (`[3,3,3,2,0,0,0,0,0,0]` = 11) and reload to confirm `Elite Commander` shows the `Needs 15★ earned` gate.
6. **Refund cascade** — with `Battle-Hardened` + `Veteran Commander` owned, click Refund on `Battle-Hardened`. Both should clear; "Available" returns to full.
7. **Modifier effect** — buy `Supply Cache` (+40 gold), close the overlay, click Play on Map 1. The HUD gold should start 40 higher than the map's `startGold`.
8. **Stats commit** — lose or win the map, return to Map Select, confirm the stats chips updated (Games +1, Kills increased, Best Wave set).

Confirm no console errors throughout.

- [ ] **Step 4: Commit**

```bash
git add src/ui/UpgradeTreeOverlay.js
git commit -m "feat: UpgradeTreeOverlay — render, purchase, refund cascade"
```

---

## Self-Review Notes

- **Spec coverage:** §3 save schema → Task 1; §4 SaveManager → Task 1 + Task 2 wiring; §5 catalog → Task 3; §6 UpgradeManager → Task 4; §7.1 modifier application → Tasks 5–7; §7.2 stats commit → Task 7; §8.1 MapSelectScene UI → Tasks 8–9; §8.2 overlay → Tasks 8 + 10; §9 testing → Tasks 1, 3, 4 (TDD) + Task 10 browser flow.
- **Type consistency:** the `modifiers` object shape is defined once in `UpgradeManager.getModifiers()` (Task 4) and consumed with `?? default` fallbacks in Tasks 5–7; field names (`heroMaxHpBonus`, `towerCostMult`, etc.) match across producer and all consumers. `SaveManager` method names (`getStars`, `setStars`, `isUnlocked`, `getTotalStars`, `getPurchasedUpgrades`, `setPurchasedUpgrades`, `getStats`, `setStats`) are consistent between Task 1 and every caller.
- **Task ordering:** Tasks 9 and 10 are mutually referencing at the import line only; the note in Task 9 directs doing Task 10 first.
- **Known limitation (accepted, not a defect):** the in-game tower panel displays base soldier HP/respawn from `soldierStats`, so `soldierMaxHpBonus` / `soldierRespawnMult` are not reflected in that panel's text. The actual `Soldier` instances do receive the modifiers. This matches the spec's scope (panel text is not listed as a modifier consumer).
- **Accepted deviation from spec §8.2:** the spec describes overlay nodes "connected by prerequisite lines." The overlay (Task 10) instead renders each branch as a vertical column of stacked nodes, with prerequisite hierarchy conveyed functionally via the `locked-prereq` state (dimmed opacity) and within-branch ordering (root first). Connector lines are purely decorative; all gating behavior is fully implemented. Drawing positioned SVG connectors is intentionally out of scope for this plan.
