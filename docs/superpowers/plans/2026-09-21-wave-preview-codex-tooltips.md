# Wave Preview, Codex, and Ability Tooltips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player the information the game already has — what is in the next wave, what every tower/hero/enemy does, and what each hero ability does on hover.

**Architecture:** Three pure modules in `src/systems/` produce plain data shapes from the existing `src/data/` tables; three DOM modules in `src/ui/` put different chrome around that data. No new game state, no save migration, no balance change.

**Tech Stack:** Vanilla ES modules, Phaser 3.88, Vite 5, Vitest 2 + jsdom. DOM HUD lives in `index.html`; scenes drive it by `getElementById`.

---

## Ground rules for every task

- **TDD.** Write the failing test, run it, watch it fail for the right reason, then implement.
- **No hardcoded content lists.** Derive allow-lists from the data (`Object.keys(ENEMY_DEFS)`, `MAP_WAVES[id].length`, `stats.abilityUnlockLevels[slot]`). A hardcoded list that omits a real type makes the suite enforce dead content.
- **Any test importing a module that transitively imports Phaser must `vi.mock('phaser', ...)`** or jsdom crashes on canvas. Copy the mock from `src/scenes/MapSelectScene.heroOverlay.test.js:3-5`.
- **Listeners are wired and unwired as a pair.** `this.events` survives scene shutdown; an un-removed listener stacks on the next level entry. This repo already shipped a bug where that duplicated every enemy spawn.
- Run the full suite before each commit: `npm test`. Never gate a commit on `grep` — `grep` exits 0 on a match even when the suite is red.
- Work in the worktree: `~/.config/superpowers/worktrees/tower-defense/codex-and-previews`.

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/systems/entityDescriptors.js` | Turn `ENEMY_DEFS` / `TOWER_DEFS` / `HEROES` into display-ready plain shapes |
| `src/systems/entityDescriptors.test.js` | Tests for the above |
| `src/systems/wavePreview.js` | `summarizeWave` / `waveCount` over `MAP_WAVES` |
| `src/systems/wavePreview.test.js` | Tests + `MAP_WAVES` data invariants |
| `src/systems/codexCatalog.js` | `buildCatalog(progress)` + `progressFromSave(save)` |
| `src/systems/codexCatalog.test.js` | Tests for gating at zero/partial/full progress |
| `src/ui/WavePreviewPopover.js` | Popover anchored to the Send Wave control |
| `src/ui/WavePreviewPopover.test.js` | jsdom tests incl. listener teardown |
| `src/ui/CodexOverlay.js` | Three-tab codex overlay |
| `src/ui/CodexOverlay.test.js` | jsdom tests |
| `src/ui/AbilityTooltip.js` | Shared hover card |
| `src/ui/AbilityTooltip.test.js` | jsdom tests |
| `src/scenes/GameScene.codex.test.js` | Pause handshake tests |
| `src/scenes/GameScene.wavePreview.test.js` | Popover wiring tests |

**Modify:**

| File | Change |
|---|---|
| `index.html` | Markup + CSS for popover, codex overlay, ability card; wrap `#wave-btn`; add `#open-codex` to `#hud` and `#map-meta-bar` |
| `src/scenes/GameScene.js` | Own the popover; refresh in `_updateWaveButton`; codex button + pause handshake; teardown in `shutdown` |
| `src/scenes/UIScene.js` | Replace the `btn.title` assignment with `AbilityTooltip` |
| `src/scenes/MapSelectScene.js` | Bind `#open-codex` |
| `src/ui/HeroManagementOverlay.js` | Add an ability strip to `_renderTree` and attach the tooltip |

---

### Task 1: Enemy and tower descriptors

> **Amended after code review (see commit history).** The shipped module differs
> from the code shown below in four ways, and later tasks assume the *amended*
> shape:
> 1. `Object.hasOwn` guards, so a prototype key like `'constructor'` returns
>    `null` instead of throwing.
> 2. `soldierStats` and `ability` are deep-copied, so a renderer cannot mutate
>    the live balance tables.
> 3. `vulnerableTo` / `resists` / `effectiveAtBase` / `weakAtBase` are arrays of
>    `{kind, type, name, icon}` objects, **not** bare type strings. The raw
>    `describeEnemyMatchups` output mixes bare tower types with `hero:`-prefixed
>    hero ids; mapping it once here stops three UI surfaces each re-parsing it.
> 4. The tower matchup fields are named `effectiveAtBase` / `weakAtBase`,
>    because they are tier-1 unbranched values and `TIER4_OVERRIDES` can invert
>    them (cannon is weak vs skitter at base; Artillery is 2.0x *against* it).

**Files:**
- Create: `src/systems/entityDescriptors.js`
- Test: `src/systems/entityDescriptors.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { describeEnemy, describeTower } from './entityDescriptors.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

describe('describeEnemy', () => {
  it('carries the stat block for a known enemy', () => {
    const d = describeEnemy('brute');
    expect(d.name).toBe('Veth Brute');
    expect(d.icon).toBe('🦏');
    expect(d.hp).toBe(120);
    expect(d.armor).toBe(8);
    expect(d.speed).toBe(38);
    expect(d.flying).toBe(false);
    expect(d.reward).toBe(22);
  });

  it('reports which towers beat it and which bounce off', () => {
    const d = describeEnemy('brute');
    expect(d.vulnerableTo).toContain('cannon');
    expect(d.resists).toContain('archer');
  });

  it('marks the phantom as flying', () => {
    expect(describeEnemy('phantom').flying).toBe(true);
  });

  it('returns null for an unknown type', () => {
    expect(describeEnemy('nope')).toBeNull();
  });

  // Derived from the data, so a new enemy cannot silently go undescribed.
  it('describes every enemy in ENEMY_DEFS', () => {
    for (const type of Object.keys(ENEMY_DEFS)) {
      const d = describeEnemy(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(typeof d.name).toBe('string');
      expect(Array.isArray(d.vulnerableTo)).toBe(true);
    }
  });
});

describe('describeTower', () => {
  it('carries base stats', () => {
    const d = describeTower('archer');
    expect(d.name).toBe('Archer');
    expect(d.cost).toBe(60);
    expect(d.range).toBe(120);
    expect(d.damage).toBe(15);
  });

  it('lists the tier ladder in order with labels and costs', () => {
    const d = describeTower('archer');
    expect(d.tiers.map(t => t.key)).toEqual(['tier2', 'tier3', 'tier4A', 'tier4B']);
    expect(d.tiers[0].label).toBe('Eagle Eye');
    expect(d.tiers[0].cost).toBe(50);
    expect(d.tiers[3].passiveEffect).toBe('+50% range, armor piercing');
  });

  // The barracks is the shape-breaker: damage 0, no per-tier damage/range,
  // and soldier stats instead. It must not render a blank damage row.
  it('exposes soldier stats for the barracks and flags it as non-damaging', () => {
    const d = describeTower('barracks');
    expect(d.dealsDirectDamage).toBe(false);
    expect(d.soldierStats.tier1.count).toBe(3);
    expect(d.soldierStats.tier4A.canBlockFlyers).toBe(true);
    expect(d.tiers.map(t => t.label))
      .toEqual(['Drill Sergeant', 'Elite Guard', 'Vanguard', 'Rapid Response']);
  });

  it('flags damaging towers as damaging', () => {
    expect(describeTower('sniper').dealsDirectDamage).toBe(true);
  });

  it('reports matchups', () => {
    const d = describeTower('cannon');
    expect(d.effective).toContain('brute');
    expect(d.weak).toContain('skitter');
  });

  it('returns null for an unknown type', () => {
    expect(describeTower('nope')).toBeNull();
  });

  it('describes every tower in TOWER_DEFS', () => {
    for (const type of Object.keys(TOWER_DEFS)) {
      const d = describeTower(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(d.tiers.length).toBe(4);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/systems/entityDescriptors.test.js`
Expected: FAIL — `Failed to resolve import "./entityDescriptors.js"`.

- [ ] **Step 3: Implement the module**

```js
// Display-ready shapes for the entity tables. Pure: no Phaser, no DOM, no
// game state — every consumer (wave popover, codex, tooltips) reads the same
// description of what a thing is, so the three surfaces cannot drift.
import { ENEMY_DEFS }                             from '../data/enemies.js';
import { TOWER_DEFS }                             from '../data/towers.js';
import { describeEnemyMatchups, describeMatchups } from '../data/weaknessMatrix.js';

const TIER_KEYS = ['tier2', 'tier3', 'tier4A', 'tier4B'];

export function describeEnemy(type) {
  const def = ENEMY_DEFS[type];
  if (!def) return null;
  const { vulnerableTo, resists } = describeEnemyMatchups(type);
  return {
    kind: 'enemy',
    type:   def.type,
    name:   def.name,
    icon:   def.icon,
    hp:     def.hp,
    speed:  def.speed,
    armor:  def.armor,
    reward: def.reward,
    flying: def.flying,
    vulnerableTo,
    resists,
  };
}

export function describeTower(type) {
  const def = TOWER_DEFS[type];
  if (!def) return null;
  const { effective, weak } = describeMatchups({ kind: 'tower', type, tier: 1, branch: null });
  return {
    kind: 'tower',
    type,
    name:         def.name,
    icon:         def.icon,
    cost:         def.cost,
    range:        def.range,
    damage:       def.damage,
    fireRate:     def.fireRate,
    splashRadius: def.splashRadius,
    pierce:       def.pierce,
    slow:         def.slow,
    // The barracks deals no direct damage; its output is its squad. Consumers
    // use this to choose a soldier stat block over a damage row.
    dealsDirectDamage: def.damage > 0,
    soldierStats:      def.soldierStats ?? null,
    ability:           def.ability ?? null,
    tiers: TIER_KEYS.map(key => ({
      key,
      label:         def[key].label,
      cost:          def[key].cost,
      damage:        def[key].damage       ?? null,
      range:         def[key].range        ?? null,
      splashRadius:  def[key].splashRadius ?? null,
      fireRate:      def[key].fireRate     ?? null,
      slow:          def[key].slow         ?? null,
      passiveEffect: def[key].passiveEffect ?? null,
    })),
    effective,
    weak,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/systems/entityDescriptors.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 1182 prior tests plus the new ones, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/systems/entityDescriptors.js src/systems/entityDescriptors.test.js
git commit -m "feat(codex): describe enemies and towers as display-ready shapes"
```

---

### Task 2: Hero and ability descriptors

> **Amended after code review.** The shipped module differs from the code below:
> 1. `Object.hasOwn` guards on both the hero id and the ability slot; a bad
>    `def` returns `null` rather than throwing.
> 2. `stats.abilityUnlockLevels` is nested, so `{...def.stats}` alone would
>    alias the balance table — that one field is copied separately.
> 3. **`matchups` is gone.** A raw multiplier map gave consumers no signal that
>    0.5 means "weak" and 1.5 means "strong". Heroes now expose
>    `effectiveAgainst` / `weakAgainst`, display-ready `{kind, type, name, icon}`
>    arrays, matching what `describeTower` does.
> 4. Ability descriptors carry `kind: 'ability'`.
> 5. A null `unlockMapAfter` no longer renders as "Clear Map 1".

**Files:**
- Modify: `src/systems/entityDescriptors.js`
- Modify: `src/systems/entityDescriptors.test.js`

- [ ] **Step 1: Write the failing test** (append to the existing test file)

```js
import { describeHero, describeAbility } from './entityDescriptors.js';
import { HEROES, HERO_ORDER } from '../data/heroes.js';

describe('describeHero', () => {
  it('carries identity, role and stats', () => {
    const d = describeHero('scout');
    expect(d.displayName).toBe('Scout Vex');
    expect(d.role).toBe('Ranged DPS / anti-air');
    expect(d.stats.maxHp).toBe(80);
    expect(d.unlockMapAfter).toBe(4);
  });

  it('lists three abilities in q/w/e order, in static form', () => {
    const d = describeHero('rael');
    expect(d.abilities.map(a => a.slot)).toEqual(['q', 'w', 'e']);
    expect(d.abilities[0].label).toBe('Overcharge');
    expect(d.abilities[0].unlockLevel).toBe(1);
    expect(d.abilities[2].unlockLevel).toBe(3);
    // Static form: no live state on a codex entry.
    expect(d.abilities[0].state).toBeUndefined();
  });

  it('reports hero matchups', () => {
    expect(describeHero('engineer').matchups.titan).toBe(1.5);
  });

  it('returns null for an unknown hero', () => {
    expect(describeHero('nope')).toBeNull();
  });

  it('describes every hero in HERO_ORDER', () => {
    for (const id of HERO_ORDER) {
      const d = describeHero(id);
      expect(d, `missing descriptor for ${id}`).not.toBeNull();
      expect(d.abilities.length).toBe(3);
    }
  });
});

describe('describeAbility', () => {
  const rael = HEROES.rael;

  it('is available when the hero is unlocked, level is high enough, no cooldown', () => {
    const a = describeAbility(rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 0 });
    expect(a.state).toBe('available');
    expect(a.hotkey).toBe('Q');
    expect(a.cooldown).toBe(30);
    expect(a.effect).toBe('+50% tower fire rate for 6s');
    expect(a.lockReason).toBeNull();
  });

  it('reports remaining cooldown', () => {
    const a = describeAbility(rael, 'q', { level: 3, heroUnlocked: true, cooldownRemaining: 7 });
    expect(a.state).toBe('cooldown');
    expect(a.cooldownRemaining).toBe(7);
  });

  it('is locked by level below its unlock level, and says which level', () => {
    const a = describeAbility(rael, 'e', { level: 2, heroUnlocked: true, cooldownRemaining: 0 });
    expect(a.state).toBe('locked_level');
    expect(a.unlockLevel).toBe(3);
    expect(a.lockReason).toBe('Unlocks at level 3');
  });

  // Hero lock outranks level lock: in Hero Command a locked hero shows the
  // map to clear, not a level the player cannot reach yet anyway.
  it('is locked by the hero itself when the hero is not unlocked', () => {
    const a = describeAbility(HEROES.scout, 'q', { level: 1, heroUnlocked: false, cooldownRemaining: 0 });
    expect(a.state).toBe('locked_hero');
    expect(a.lockReason).toBe('Clear Map 5 to unlock Scout Vex');
  });

  it('defaults to available-at-level-1 when no options are given', () => {
    expect(describeAbility(rael, 'q').state).toBe('available');
  });

  it('reads unlock levels from the hero data, not a hardcoded map', () => {
    for (const id of HERO_ORDER) {
      const def = HEROES[id];
      for (const slot of ['q', 'w', 'e']) {
        const a = describeAbility(def, slot, { level: 1, heroUnlocked: true, cooldownRemaining: 0 });
        expect(a.unlockLevel).toBe(def.stats.abilityUnlockLevels[slot]);
      }
    }
  });
});
```

> The `locked_hero` wording is `Clear Map ${unlockMapAfter + 1} to unlock
> ${displayName}`, matching the phrasing already used at
> `HeroManagementOverlay.js:120`. Scout is `displayName: 'Scout Vex'` with
> `unlockMapAfter: 4`, hence "Clear Map 5 to unlock Scout Vex".

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/systems/entityDescriptors.test.js`
Expected: FAIL — `describeHero is not a function`.

- [ ] **Step 3: Implement**

Add to `src/systems/entityDescriptors.js`:

```js
import { HEROES }           from '../data/heroes.js';
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';

const ABILITY_SLOTS = ['q', 'w', 'e'];

// The static form: what an ability IS, with no live state. A codex entry uses
// this; the HUD calls describeAbility directly with the current level and
// cooldown, because those change between renders.
function staticAbility(def, slot) {
  const a = def.abilities[slot];
  return {
    slot,
    hotkey:      slot.toUpperCase(),
    id:          a.id,
    label:       a.label,
    icon:        a.icon,
    cooldown:    a.cooldown,
    aim:         a.aim,
    effect:      a.tooltip,
    unlockLevel: def.stats.abilityUnlockLevels[slot],
  };
}

export function describeHero(id) {
  const def = HEROES[id];
  if (!def) return null;
  return {
    kind: 'hero',
    id:             def.id,
    displayName:    def.displayName,
    shortName:      def.shortName,
    role:           def.role,
    portraitChar:   def.portraitChar,
    bodyColor:      def.bodyColor,
    strokeColor:    def.strokeColor,
    stats:          { ...def.stats },
    matchups:       { ...def.matchups },
    unlockMapAfter: def.unlockMapAfter,
    abilities:      ABILITY_SLOTS.map(slot => staticAbility(def, slot)),
  };
}

export function describeAbility(def, slot, opts = {}) {
  const { level = 1, heroUnlocked = true, cooldownRemaining = 0 } = opts;
  const base = staticAbility(def, slot);

  if (!heroUnlocked) {
    return {
      ...base,
      state: 'locked_hero',
      cooldownRemaining: 0,
      lockReason: `Clear Map ${def.unlockMapAfter + 1} to unlock ${def.displayName}`,
    };
  }
  if (level < base.unlockLevel) {
    return {
      ...base,
      state: 'locked_level',
      cooldownRemaining: 0,
      lockReason: `Unlocks at level ${base.unlockLevel}`,
    };
  }
  if (cooldownRemaining > 0) {
    return { ...base, state: 'cooldown', cooldownRemaining, lockReason: null };
  }
  return { ...base, state: 'available', cooldownRemaining: 0, lockReason: null };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/systems/entityDescriptors.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/systems/entityDescriptors.js src/systems/entityDescriptors.test.js
git commit -m "feat(codex): describe heroes and abilities, with four ability states"
```

---

### Task 3: Wave summaries

**Files:**
- Create: `src/systems/wavePreview.js`
- Test: `src/systems/wavePreview.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { summarizeWave, waveCount } from './wavePreview.js';
import { MAP_WAVES }  from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { MAPS }       from '../data/maps.js';

describe('summarizeWave', () => {
  it('summarises a single-type wave', () => {
    const s = summarizeWave(0, 0);           // map 0 wave 1: 7 drones
    expect(s.waveNumber).toBe(1);            // 1-based for display
    expect(s.totalCount).toBe(7);
    expect(s.groups.length).toBe(1);
    expect(s.groups[0].type).toBe('drone');
    expect(s.groups[0].count).toBe(7);
    expect(s.groups[0].hp).toBe(70);
    expect(s.groups[0].vulnerableTo).toBeDefined();
  });

  it('summarises a multi-type wave in authored order', () => {
    const s = summarizeWave(0, 1);           // 9 drones + 3 skitters
    expect(s.groups.map(g => g.type)).toEqual(['drone', 'skitter']);
    expect(s.totalCount).toBe(12);
  });

  it('returns null for an out-of-range wave index', () => {
    expect(summarizeWave(0, 999)).toBeNull();
    expect(summarizeWave(0, -1)).toBeNull();
  });

  it('returns null for an unknown map', () => {
    expect(summarizeWave(99, 0)).toBeNull();
  });

  it('sums counts when one wave lists the same type twice', () => {
    const fake = [[{ type: 'drone', count: 3 }, { type: 'drone', count: 4 }]];
    const s = summarizeWave(0, 0, { waves: fake });
    expect(s.groups.length).toBe(1);
    expect(s.groups[0].count).toBe(7);
  });
});

describe('waveCount', () => {
  it('reads the real length per map, which is not always 10', () => {
    expect(waveCount(0)).toBe(10);
    expect(waveCount(9)).toBe(18);
  });

  it('returns 0 for an unknown map', () => {
    expect(waveCount(99)).toBe(0);
  });
});

// Data invariants. These guard the preview against future wave edits.
describe('MAP_WAVES invariants', () => {
  it('every enemy type used in a wave exists in ENEMY_DEFS', () => {
    const known = new Set(Object.keys(ENEMY_DEFS));
    for (const [mapId, waves] of Object.entries(MAP_WAVES)) {
      waves.forEach((wave, i) => {
        for (const group of wave) {
          expect(known.has(group.type), `map ${mapId} wave ${i}: unknown type ${group.type}`).toBe(true);
        }
      });
    }
  });

  it('no wave lists the same enemy type twice', () => {
    for (const [mapId, waves] of Object.entries(MAP_WAVES)) {
      waves.forEach((wave, i) => {
        const types = wave.map(g => g.type);
        expect(new Set(types).size, `map ${mapId} wave ${i} repeats a type`).toBe(types.length);
      });
    }
  });

  // maps.js carries its own waveCount; MAP_WAVES is what actually spawns.
  // Two sources of truth, so assert they agree.
  it('maps.js waveCount agrees with MAP_WAVES length', () => {
    for (const m of MAPS) {
      expect(m.waveCount, `map ${m.id}`).toBe(MAP_WAVES[m.id].length);
    }
  });

  it('every summary is renderable for every wave of every map', () => {
    for (const m of MAPS) {
      for (let i = 0; i < waveCount(m.id); i++) {
        const s = summarizeWave(m.id, i);
        expect(s, `map ${m.id} wave ${i}`).not.toBeNull();
        expect(s.totalCount).toBeGreaterThan(0);
        expect(s.groups.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/systems/wavePreview.test.js`
Expected: FAIL — cannot resolve `./wavePreview.js`.

- [ ] **Step 3: Implement**

```js
// Wave composition for display. MAP_WAVES is the table that actually spawns
// enemies, so it — not maps.js waveCount — is what the preview reads.
import { MAP_WAVES }     from '../data/waves.js';
import { describeEnemy } from './entityDescriptors.js';

export function waveCount(mapId, { waves = MAP_WAVES[mapId] } = {}) {
  return Array.isArray(waves) ? waves.length : 0;
}

export function summarizeWave(mapId, waveIndex, { waves = MAP_WAVES[mapId] } = {}) {
  if (!Array.isArray(waves))                             return null;
  if (!Number.isInteger(waveIndex))                      return null;
  if (waveIndex < 0 || waveIndex >= waves.length)        return null;

  const byType = new Map();
  for (const group of waves[waveIndex]) {
    const existing = byType.get(group.type);
    // A wave should never list a type twice, but if one ever does, one row
    // with a summed count beats two rows the player has to add up.
    if (existing) { existing.count += group.count; continue; }
    const described = describeEnemy(group.type);
    if (!described) continue;
    byType.set(group.type, { ...described, count: group.count });
  }

  const groups = [...byType.values()];
  return {
    waveNumber: waveIndex + 1,
    totalCount: groups.reduce((sum, g) => sum + g.count, 0),
    groups,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/systems/wavePreview.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/systems/wavePreview.js src/systems/wavePreview.test.js
git commit -m "feat(wave-preview): summarize a wave's composition from MAP_WAVES"
```

---

### Task 4: Codex catalogue and encounter gating

**Files:**
- Create: `src/systems/codexCatalog.js`
- Test: `src/systems/codexCatalog.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { buildCatalog, progressFromSave } from './codexCatalog.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_ORDER } from '../data/heroes.js';

const NOTHING = { reachedMapIds: [0], unlockedHeroIds: ['rael'] };
const ALL     = { reachedMapIds: [0,1,2,3,4,5,6,7,8,9], unlockedHeroIds: [...HERO_ORDER] };

describe('buildCatalog', () => {
  it('lists every tower, hero and enemy regardless of progress', () => {
    const c = buildCatalog(NOTHING);
    expect(c.towers.length).toBe(Object.keys(TOWER_DEFS).length);
    expect(c.heroes.length).toBe(HERO_ORDER.length);
    expect(c.enemies.length).toBe(6);
  });

  // All six towers are purchasable from wave 1, so gating them would be a lie.
  it('marks every tower encountered even on a fresh save', () => {
    for (const t of buildCatalog(NOTHING).towers) expect(t.encountered).toBe(true);
  });

  it('marks only map-0 enemies encountered on a fresh save', () => {
    const c = buildCatalog(NOTHING);
    const seen = c.enemies.filter(e => e.encountered).map(e => e.type).sort();
    expect(seen).toEqual(['brute', 'drone', 'skitter']);
  });

  it('marks phantom encountered once map 3 is reached', () => {
    const c = buildCatalog({ reachedMapIds: [0,1,2,3], unlockedHeroIds: ['rael'] });
    expect(c.enemies.find(e => e.type === 'phantom').encountered).toBe(true);
    expect(c.enemies.find(e => e.type === 'titan').encountered).toBe(false);
  });

  it('marks everything encountered at full progress', () => {
    const c = buildCatalog(ALL);
    for (const group of [c.towers, c.heroes, c.enemies]) {
      for (const entry of group) expect(entry.encountered).toBe(true);
    }
  });

  it('gates heroes on the unlocked list', () => {
    const c = buildCatalog(NOTHING);
    expect(c.heroes.find(h => h.id === 'rael').encountered).toBe(true);
    expect(c.heroes.find(h => h.id === 'scout').encountered).toBe(false);
  });

  it('carries the full descriptor on every entry', () => {
    const c = buildCatalog(ALL);
    expect(c.enemies[0].hp).toBeGreaterThan(0);
    expect(c.towers[0].tiers.length).toBe(4);
    expect(c.heroes[0].abilities.length).toBe(3);
  });

  it('tolerates an empty progress object', () => {
    const c = buildCatalog({});
    expect(c.enemies.every(e => e.encountered === false)).toBe(true);
    expect(c.towers.every(t => t.encountered === true)).toBe(true);
  });
});

describe('progressFromSave', () => {
  it('reads reached maps and unlocked heroes from a SaveManager-shaped object', () => {
    const fakeSave = {
      isUnlocked:     (id) => id <= 3,
      isHeroUnlocked: (id) => id === 'rael' || id === 'engineer',
    };
    const p = progressFromSave(fakeSave);
    expect(p.reachedMapIds).toEqual([0, 1, 2, 3]);
    expect(p.unlockedHeroIds).toEqual(['rael', 'engineer']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/systems/codexCatalog.test.js`
Expected: FAIL — cannot resolve `./codexCatalog.js`.

- [ ] **Step 3: Implement**

```js
// The codex catalogue. Encounter state is DERIVED from progress the game
// already stores — no new save field, no migration. "Reached" means the map is
// unlocked, not cleared, so an enemy you are currently losing to is documented.
import { TOWER_DEFS }  from '../data/towers.js';
import { HERO_ORDER }  from '../data/heroes.js';
import { ENEMY_DEFS }  from '../data/enemies.js';
import { MAPS }        from '../data/maps.js';
import { MAP_WAVES }   from '../data/waves.js';
import { describeTower, describeHero, describeEnemy } from './entityDescriptors.js';

export function progressFromSave(save) {
  return {
    reachedMapIds:   MAPS.filter(m => save.isUnlocked(m.id)).map(m => m.id),
    unlockedHeroIds: HERO_ORDER.filter(id => save.isHeroUnlocked(id)),
  };
}

function enemyTypesOnMaps(mapIds) {
  const seen = new Set();
  for (const id of mapIds) {
    for (const wave of MAP_WAVES[id] ?? []) {
      for (const group of wave) seen.add(group.type);
    }
  }
  return seen;
}

export function buildCatalog({ reachedMapIds = [], unlockedHeroIds = [] } = {}) {
  const seenEnemies = enemyTypesOnMaps(reachedMapIds);
  const heroSet     = new Set(unlockedHeroIds);

  return {
    // Every tower is purchasable from the first wave of the first map, so
    // there is nothing to discover and nothing to gate.
    towers:  Object.keys(TOWER_DEFS).map(t => ({ ...describeTower(t), encountered: true })),
    heroes:  HERO_ORDER.map(id      => ({ ...describeHero(id),  encountered: heroSet.has(id) })),
    enemies: Object.keys(ENEMY_DEFS).map(t => ({ ...describeEnemy(t), encountered: seenEnemies.has(t) })),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/systems/codexCatalog.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/systems/codexCatalog.js src/systems/codexCatalog.test.js
git commit -m "feat(codex): build the catalogue with progress-derived encounter gating"
```

---

### Task 5: Markup and styles

**Files:**
- Modify: `index.html`

No logic in this task — markup and CSS only, so the next three tasks have something to drive.

- [ ] **Step 1: Wrap the Send Wave button**

A disabled `<button>` fires no pointer events in Chrome or Safari, and
`_updateWaveButton()` disables `#wave-btn` for the whole of an active wave.
Without a wrapper the preview would silently die exactly when it is most
wanted. Replace the existing line (`index.html`, currently `<button id="wave-btn">▶ Send Wave 1</button>`) with:

```html
    <span id="wave-btn-wrap" tabindex="0">
      <button id="wave-btn">▶ Send Wave 1</button>
      <div id="wave-preview" class="wave-preview" role="tooltip" aria-hidden="true"></div>
    </span>
```

- [ ] **Step 2: Add the in-game codex button**

In `#hud`, immediately after `<button id="pause-btn">⏸ Pause</button>`:

```html
    <button id="open-codex" title="Codex (towers, heroes, enemies)">📚 Codex</button>
```

- [ ] **Step 3: Add the map-select codex button**

In `#map-meta-bar`, after the `open-story-log` button:

```html
        <button id="open-codex-ms" title="Codex">📚 Codex</button>
```

- [ ] **Step 4: Add the codex overlay markup**

After the `#settings-overlay` block:

```html
    <div id="codex-overlay">
      <div id="codex-overlay-inner">
        <div id="codex-overlay-header">
          <span id="codex-overlay-title">📚 Codex</span>
          <div id="codex-tabs">
            <button class="codex-tab" data-tab="towers">Towers</button>
            <button class="codex-tab" data-tab="heroes">Heroes</button>
            <button class="codex-tab" data-tab="enemies">Enemies</button>
          </div>
          <button id="codex-close">Close</button>
        </div>
        <div id="codex-body">
          <div id="codex-list"></div>
          <div id="codex-detail"></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 5: Add the shared ability card element**

Immediately before `</body>`:

```html
  <div id="ability-card" class="ability-card" role="tooltip" aria-hidden="true"></div>
```

- [ ] **Step 6: Add the CSS**

In the existing `<style>` block, after the `#settings-overlay` rules. Colours
match the existing panels (`#0a1018` ground, `#ffd700` titles, `#6bf` accents).

```css
    /* Wave preview popover */
    #wave-btn-wrap { position: relative; display: inline-block; }
    .wave-preview { display: none; position: absolute; bottom: calc(100% + 10px); right: 0;
      min-width: 240px; max-width: 320px; max-height: 50vh; overflow-y: auto;
      background: #0a1018; border: 2px solid #4fc3f7; border-radius: 6px;
      padding: 10px 12px; z-index: 19; text-align: left; box-shadow: 0 4px 18px rgba(0,0,0,0.6); }
    .wave-preview.shown { display: block; }
    .wp-title { color: #ffd700; font-size: 13px; font-weight: bold; margin-bottom: 8px; }
    .wp-row { display: flex; gap: 8px; align-items: baseline; margin-bottom: 7px; }
    .wp-icon { font-size: 17px; }
    .wp-name { font-size: 12px; color: #dde; flex: 1; }
    .wp-count { font-size: 13px; color: #ffd700; font-weight: bold; }
    .wp-stats { font-size: 10px; color: #8aa; margin: 0 0 3px 25px; }
    .wp-match { font-size: 10px; color: #7c9; margin: 0 0 3px 25px; }
    .wp-match.resist { color: #c87; }
    .wp-empty { font-size: 11px; color: #789; }

    /* Codex overlay */
    #codex-overlay { display: none; position: absolute; inset: 0; z-index: 20;
      background: rgba(0,0,0,0.72); align-items: center; justify-content: center; padding: 20px; }
    #codex-overlay-inner { width: 100%; max-width: 900px; max-height: 100%; display: flex;
      flex-direction: column; background: #0a1018; border: 2px solid #2a3a4a;
      border-radius: 8px; padding: 16px; }
    #codex-overlay-header { display: flex; align-items: center; gap: 14px; padding-bottom: 10px;
      border-bottom: 1px solid #2a3a4a; }
    #codex-overlay-title { font-size: 18px; color: #ffd700; font-weight: bold; }
    #codex-tabs { display: flex; gap: 6px; flex: 1; }
    .codex-tab { background: #12202e; border: 1px solid #2a3a4a; color: #8aa; border-radius: 4px;
      padding: 5px 12px; font-size: 12px; cursor: pointer; }
    .codex-tab.active { background: #1a3145; border-color: #4fc3f7; color: #cfe; }
    #codex-close { background: transparent; border: 1px solid #3a4a5a; color: #8aa;
      border-radius: 4px; padding: 5px 12px; cursor: pointer; }
    #codex-body { display: flex; gap: 14px; flex: 1; min-height: 0; padding-top: 12px; }
    #codex-list { width: 210px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
    #codex-detail { flex: 1; overflow-y: auto; padding-left: 14px; border-left: 1px solid #2a3a4a; }
    .codex-entry { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left;
      background: #12202e; border: 1px solid #2a3a4a; border-radius: 4px; color: #cde;
      padding: 7px 9px; font-size: 12px; cursor: pointer; }
    .codex-entry:hover { background: #1a3145; }
    .codex-entry.active { border-color: #ffd700; }
    .codex-entry.codex-unseen { opacity: 0.55; }
    .codex-unseen-tag { font-size: 9px; color: #789; margin-left: auto; }
    .codex-detail-title { font-size: 16px; color: #ffd700; font-weight: bold; margin-bottom: 2px; }
    .codex-detail-sub { font-size: 11px; color: #8aa; margin-bottom: 10px; }
    .codex-stat { font-size: 12px; color: #cde; margin-bottom: 3px; }
    .codex-section { font-size: 11px; color: #6bf; font-weight: bold;
      margin: 12px 0 5px; text-transform: uppercase; letter-spacing: 1px; }
    .codex-tier { font-size: 11px; color: #bcd; margin-bottom: 4px; padding-left: 8px;
      border-left: 2px solid #2a3a4a; }
    .codex-tier-label { color: #ffd700; }

    /* Shared ability hover card */
    .ability-card { display: none; position: absolute; z-index: 21; min-width: 210px;
      max-width: 280px; background: #0a1018; border: 2px solid #4fc3f7; border-radius: 6px;
      padding: 9px 11px; text-align: left; box-shadow: 0 4px 18px rgba(0,0,0,0.6);
      pointer-events: none; }
    .ability-card.shown { display: block; }
    .ac-head { display: flex; gap: 7px; align-items: baseline; margin-bottom: 5px; }
    .ac-icon { font-size: 16px; }
    .ac-label { font-size: 13px; color: #ffd700; font-weight: bold; flex: 1; }
    .ac-key { font-size: 10px; color: #8aa; border: 1px solid #3a4a5a; border-radius: 3px;
      padding: 1px 5px; }
    .ac-effect { font-size: 11px; color: #cde; margin-bottom: 5px; line-height: 1.4; }
    .ac-meta { font-size: 10px; color: #8aa; }
    .ac-lock { font-size: 10px; color: #c87; margin-top: 4px; }
```

- [ ] **Step 7: Verify the page still builds and renders**

Run: `npm run build`
Expected: exit 0, no errors.

Run: `npm test`
Expected: still green — existing `GameScene`/`UIScene` tests must not break on
the `#wave-btn` wrapper. If a test builds DOM fixtures by hand and now fails,
add `#wave-btn-wrap` to that fixture rather than changing the markup.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(ui): markup and styles for wave preview, codex, and ability card"
```

---

### Task 6: WavePreviewPopover

**Files:**
- Create: `src/ui/WavePreviewPopover.js`
- Test: `src/ui/WavePreviewPopover.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { WavePreviewPopover } from './WavePreviewPopover.js';
import { summarizeWave } from '../systems/wavePreview.js';
import { MAP_WAVES }  from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';

// Wave composition is balance data and HAS been retuned mid-project. Derive
// every expected count from the table instead of hardcoding it, or this file
// goes red on the next rebalance for no correctness reason.
const countOf = (mapId, waveIdx, type) =>
  MAP_WAVES[mapId][waveIdx].find(g => g.type === type).count;
const firstWaveWith = (mapId, type) =>
  MAP_WAVES[mapId].findIndex(w => w.some(g => g.type === type));

function setupDom() {
  document.body.replaceChildren();
  const wrap = document.createElement('span');
  wrap.id = 'wave-btn-wrap';
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  const pop = document.createElement('div');
  pop.id = 'wave-preview';
  wrap.append(btn, pop);
  document.body.appendChild(wrap);
  return { wrap, btn, pop };
}

describe('WavePreviewPopover', () => {
  let dom, popover;
  beforeEach(() => { dom = setupDom(); popover = new WavePreviewPopover(); });

  it('renders one row per enemy type with counts', () => {
    popover.setWave(summarizeWave(0, 1));   // drones + skitters
    popover.show();
    expect(dom.pop.classList.contains('shown')).toBe(true);
    const rows = dom.pop.querySelectorAll('.wp-row');
    expect(rows.length).toBe(2);
    expect(dom.pop.textContent).toContain('Veth Drone');
    expect(dom.pop.textContent).toContain(`×${countOf(0, 1, 'drone')}`);
    expect(dom.pop.textContent).toContain(`×${countOf(0, 1, 'skitter')}`);
  });

  it('shows the wave number and total', () => {
    popover.setWave(summarizeWave(0, 1));
    const total = MAP_WAVES[0][1].reduce((n, g) => n + g.count, 0);
    expect(dom.pop.textContent).toContain('Wave 2');
    expect(dom.pop.textContent).toContain(String(total));
  });

  it('shows stats and matchup lines', () => {
    popover.setWave(summarizeWave(0, firstWaveWith(0, 'brute')));
    expect(dom.pop.textContent).toContain(`${ENEMY_DEFS.brute.hp} HP`);
    expect(dom.pop.textContent.toLowerCase()).toContain('cannon');
  });

  it('marks flying enemies', () => {
    popover.setWave(summarizeWave(3, firstWaveWith(3, 'phantom')));
    expect(dom.pop.textContent.toLowerCase()).toContain('flying');
  });

  // No next wave: show nothing at all, not an empty frame.
  it('stays hidden when the wave is null', () => {
    popover.setWave(null);
    popover.show();
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on pointerenter of the wrapper and closes on pointerleave', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(new Event('pointerleave'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on focus and closes on blur', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.dispatchEvent(new Event('focus'));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(new Event('blur'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('closes on Escape', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // Touch has no hover. A tap must open it, and a tap elsewhere must dismiss it.
  it('toggles on a touch tap of the wrapper', () => {
    popover.setWave(summarizeWave(0, 0));
    const tap = () => dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    tap();
    expect(dom.pop.classList.contains('shown')).toBe(true);
    tap();
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('dismisses on a pointerdown outside the wrapper', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // A mouse click on Send Wave must start the wave, not toggle a popover.
  it('does not toggle on a mouse pointerdown', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });

  it('keeps aria-hidden in step with visibility', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    expect(dom.pop.getAttribute('aria-hidden')).toBe('false');
    popover.hide();
    expect(dom.pop.getAttribute('aria-hidden')).toBe('true');
  });

  // The leak this repo already shipped once: listeners that outlive their owner.
  it('removes every listener on destroy', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.destroy();
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('survives construction when the DOM is absent', () => {
    document.body.replaceChildren();
    const orphan = new WavePreviewPopover();
    expect(() => { orphan.setWave(summarizeWave(0, 0)); orphan.show(); orphan.destroy(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/ui/WavePreviewPopover.test.js`
Expected: FAIL — cannot resolve `./WavePreviewPopover.js`.

- [ ] **Step 3: Implement**

```js
// Popover showing what the Send Wave button would send.
//
// The hover target is the WRAPPER, not the button: _updateWaveButton disables
// #wave-btn for the whole of an active wave, and Chrome and Safari fire no
// pointer events on a disabled control. Hovering the button would go dead
// exactly when a player most wants to see what is coming.
// vulnerableTo/resists arrive from describeEnemy as {kind, type, name, icon}
// objects — already display-ready, so no prefix parsing happens here.
function counterNames(counters) {
  return counters.map(c => c.name).join(', ');
}

export class WavePreviewPopover {
  constructor() {
    this._wrap    = document.getElementById('wave-btn-wrap');
    this._el      = document.getElementById('wave-preview');
    this._summary = null;

    this._onEnter = () => this.show();
    this._onLeave = () => this.hide();
    this._onEsc   = (e) => { if (e.key === 'Escape') this.hide(); };

    // Touch has no hover, so a tap toggles. Guarded on pointerType: a mouse
    // click on Send Wave must start the wave, not fight with the popover.
    this._onTap = (e) => {
      if (e.pointerType !== 'touch') return;
      if (this._el?.classList.contains('shown')) this.hide(); else this.show();
    };
    // Any pointerdown outside dismisses — the touch equivalent of pointerleave.
    this._onOutside = (e) => {
      if (this._wrap && !this._wrap.contains(e.target)) this.hide();
    };

    if (this._wrap) {
      this._wrap.addEventListener('pointerenter', this._onEnter);
      this._wrap.addEventListener('pointerleave', this._onLeave);
      this._wrap.addEventListener('focus',        this._onEnter);
      this._wrap.addEventListener('blur',         this._onLeave);
      this._wrap.addEventListener('pointerdown',  this._onTap);
    }
    document.addEventListener('keydown',     this._onEsc);
    document.addEventListener('pointerdown', this._onOutside);
  }

  setWave(summary) {
    this._summary = summary;
    if (!this._el) return;
    if (!summary) { this.hide(); this._el.replaceChildren(); return; }
    this._render(summary);
  }

  _render(summary) {
    this._el.replaceChildren();

    const title = document.createElement('div');
    title.className   = 'wp-title';
    title.textContent = `Wave ${summary.waveNumber} · ${summary.totalCount} enemies`;
    this._el.appendChild(title);

    for (const g of summary.groups) {
      const row = document.createElement('div');
      row.className = 'wp-row';
      const icon = document.createElement('span');
      icon.className   = 'wp-icon';
      icon.textContent = g.icon;
      const name = document.createElement('span');
      name.className   = 'wp-name';
      name.textContent = g.name;
      const count = document.createElement('span');
      count.className   = 'wp-count';
      count.textContent = `×${g.count}`;
      row.append(icon, name, count);
      this._el.appendChild(row);

      const stats = document.createElement('div');
      stats.className = 'wp-stats';
      const bits = [`${g.hp} HP`, g.armor > 0 ? `${g.armor} armour` : 'no armour', g.flying ? 'flying' : 'ground'];
      stats.textContent = bits.join(' · ');
      this._el.appendChild(stats);

      if (g.vulnerableTo.length) {
        const weak = document.createElement('div');
        weak.className   = 'wp-match';
        weak.textContent = `weak to ${counterNames(g.vulnerableTo)}`;
        this._el.appendChild(weak);
      }
      if (g.resists.length) {
        const res = document.createElement('div');
        res.className   = 'wp-match resist';
        res.textContent = `resists ${counterNames(g.resists)}`;
        this._el.appendChild(res);
      }
    }
  }

  show() {
    if (!this._el || !this._summary) return;
    this._el.classList.add('shown');
    this._el.setAttribute('aria-hidden', 'false');
  }

  hide() {
    if (!this._el) return;
    this._el.classList.remove('shown');
    this._el.setAttribute('aria-hidden', 'true');
  }

  destroy() {
    if (this._wrap) {
      this._wrap.removeEventListener('pointerenter', this._onEnter);
      this._wrap.removeEventListener('pointerleave', this._onLeave);
      this._wrap.removeEventListener('focus',        this._onEnter);
      this._wrap.removeEventListener('blur',         this._onLeave);
      this._wrap.removeEventListener('pointerdown',  this._onTap);
    }
    document.removeEventListener('keydown',     this._onEsc);
    document.removeEventListener('pointerdown', this._onOutside);
    this.hide();
    this._summary = null;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/ui/WavePreviewPopover.test.js`
Expected: PASS.

> **Do not hardcode wave composition.** The plan originally carried literal
> counts read from a checkout that was 41 commits stale; two balance commits
> (`c134db2`, `18641a1`) had since retuned map 0, moving brutes off wave index
> 3 entirely. The `countOf` / `firstWaveWith` helpers above read the live table,
> so the tests stay correct across a rebalance. Keep it that way.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/ui/WavePreviewPopover.js src/ui/WavePreviewPopover.test.js
git commit -m "feat(wave-preview): popover rendering the next wave's composition"
```

---

### Task 7: Wire the popover into GameScene

**Files:**
- Modify: `src/scenes/GameScene.js`
- Test: `src/scenes/GameScene.wavePreview.test.js`

- [ ] **Step 1: Read how the existing GameScene tests stub the scene**

Run: `sed -n '1,60p' src/scenes/GameScene.updateWaveButton.test.js`

Follow that file's fixture and Phaser-mock approach exactly; the test below
assumes the same `_updateWaveButton` call shape.

- [ ] **Step 2: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, off(){}, once(){} } } },
}));

import { WavePreviewPopover } from '../ui/WavePreviewPopover.js';
import { summarizeWave } from '../systems/wavePreview.js';

function setupDom() {
  document.body.replaceChildren();
  const wrap = document.createElement('span');
  wrap.id = 'wave-btn-wrap';
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  const pop = document.createElement('div');
  pop.id = 'wave-preview';
  wrap.append(btn, pop);
  document.body.appendChild(wrap);
  return { wrap, btn, pop };
}

// Mirrors GameScene._refreshWavePreview: the index of the wave the button
// would send, or null when there is none.
function nextWaveIndex(waveMgr) {
  if (waveMgr.done) return null;
  return waveMgr.currentWave;   // currentWave is 1-based-count of started waves
}

describe('wave preview wiring', () => {
  let dom;
  beforeEach(() => { dom = setupDom(); });

  it('previews wave 1 before anything has started', () => {
    const popover = new WavePreviewPopover();
    popover.setWave(summarizeWave(0, nextWaveIndex({ done: false, currentWave: 0 })));
    popover.show();
    expect(dom.pop.textContent).toContain('Wave 1');
  });

  it('previews wave N+1 during an early-send window', () => {
    const popover = new WavePreviewPopover();
    popover.setWave(summarizeWave(0, nextWaveIndex({ done: false, currentWave: 3 })));
    popover.show();
    expect(dom.pop.textContent).toContain('Wave 4');
  });

  it('shows nothing once all waves are done', () => {
    const popover = new WavePreviewPopover();
    const idx = nextWaveIndex({ done: true, currentWave: 10 });
    popover.setWave(idx === null ? null : summarizeWave(0, idx));
    popover.show();
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // The wrapper exists precisely so this works.
  it('opens while the button is disabled', () => {
    const popover = new WavePreviewPopover();
    popover.setWave(summarizeWave(0, 2));
    dom.btn.disabled = true;
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test -- src/scenes/GameScene.wavePreview.test.js`
Expected: FAIL — the assertions fail until `summarizeWave` indexing is right.
If it passes immediately, the test is not exercising new behaviour; confirm the
`nextWaveIndex` mapping against the real `waveMgr` before moving on.

- [ ] **Step 4: Verify the wave-index mapping against the real WaveManager**

Run: `grep -n "currentWave" src/systems/WaveManager.js`

Confirm whether `currentWave` counts started waves (so the next wave's 0-based
index equals `currentWave`) or is already an index. **Adjust `_refreshWavePreview`
below to match what you find — do not assume.** The existing button text
`Send Wave ${this.waveMgr.currentWave + 1}` implies `currentWave` is the count
of started waves, making `currentWave` the correct 0-based index of the next.

- [ ] **Step 5: Add the popover to GameScene**

In `create()`, after `this._bindDOMEvents();`:

```js
    this._wavePreview = new WavePreviewPopover();
```

Add the import at the top of the file:

```js
import { WavePreviewPopover } from '../ui/WavePreviewPopover.js';
import { summarizeWave }      from '../systems/wavePreview.js';
```

Add the refresh method next to `_updateWaveButton`:

```js
  // The popover always describes the wave the button would send, so the two
  // never disagree — including during an early-send window, where the button
  // reads "Send Wave N+1".
  _refreshWavePreview() {
    if (!this._wavePreview) return;
    if (this.waveMgr.done) { this._wavePreview.setWave(null); return; }
    this._wavePreview.setWave(summarizeWave(this.mapId, this.waveMgr.currentWave));
  }
```

Call it at the end of `_updateWaveButton()` — in every branch, so add it as the
last line of the method body by restructuring the early returns into a single
exit, or simply call `this._refreshWavePreview()` immediately after each
`return`-guarded branch sets its text. The simplest correct change is to rename
the existing body to `_updateWaveButtonText()` and add:

```js
  _updateWaveButton() {
    this._updateWaveButtonText();
    this._refreshWavePreview();
  }
```

> Confirm `this.mapId` is the property name GameScene uses for the current map.
> Run `grep -n "this.mapId\|mapId =" src/scenes/GameScene.js` and use the real
> name.

In `shutdown()`, alongside the other teardown:

```js
    this._wavePreview?.destroy();
    this._wavePreview = null;
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/scenes/GameScene.wavePreview.test.js src/scenes/GameScene.updateWaveButton.test.js`
Expected: PASS, including the pre-existing wave-button tests.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test
git add src/scenes/GameScene.js src/scenes/GameScene.wavePreview.test.js
git commit -m "feat(wave-preview): show the next wave's composition from GameScene"
```

---

### Task 8: CodexOverlay

**Files:**
- Create: `src/ui/CodexOverlay.js`
- Test: `src/ui/CodexOverlay.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { CodexOverlay } from './CodexOverlay.js';
import { buildCatalog } from '../systems/codexCatalog.js';
import { HERO_ORDER } from '../data/heroes.js';

const FRESH = { reachedMapIds: [0], unlockedHeroIds: ['rael'] };
const ALL   = { reachedMapIds: [0,1,2,3,4,5,6,7,8,9], unlockedHeroIds: [...HERO_ORDER] };

function setupDom() {
  document.body.replaceChildren();
  const overlay = document.createElement('div');
  overlay.id = 'codex-overlay';
  overlay.style.display = 'none';
  const tabs = document.createElement('div');
  tabs.id = 'codex-tabs';
  for (const t of ['towers', 'heroes', 'enemies']) {
    const b = document.createElement('button');
    b.className = 'codex-tab';
    b.dataset.tab = t;
    tabs.appendChild(b);
  }
  const list   = document.createElement('div'); list.id   = 'codex-list';
  const detail = document.createElement('div'); detail.id = 'codex-detail';
  const close  = document.createElement('button'); close.id = 'codex-close';
  overlay.append(tabs, list, detail, close);
  document.body.appendChild(overlay);
  return { overlay, tabs, list, detail, close };
}

describe('CodexOverlay', () => {
  let dom, codex;
  beforeEach(() => { dom = setupDom(); codex = new CodexOverlay(); });

  it('opens on the towers tab and lists all six towers', () => {
    codex.open(buildCatalog(ALL));
    expect(dom.overlay.style.display).toBe('flex');
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(6);
  });

  it('switches tabs', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(6);
    expect(dom.list.textContent).toContain('Veth Drone');
  });

  // The decision: dim, tag, but never hide or disable.
  it('dims unencountered entries but keeps them readable and clickable', () => {
    codex.open(buildCatalog(FRESH));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    const entries = [...dom.list.querySelectorAll('.codex-entry')];
    const titan = entries.find(e => e.textContent.includes('Titan'));
    expect(titan.classList.contains('codex-unseen')).toBe(true);
    expect(titan.textContent).toContain('Veth Titan');
    expect(titan.disabled).toBeFalsy();
    titan.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Veth Titan');
  });

  it('marks nothing unseen at full progress', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="heroes"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.list.querySelectorAll('.codex-unseen').length).toBe(0);
  });

  it('shows the selected entry detail with stats', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    const brute = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Brute'));
    brute.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('120');
  });

  it('renders the tier ladder for a tower', () => {
    codex.open(buildCatalog(ALL));
    const archer = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Archer'));
    archer.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Eagle Eye');
    expect(dom.detail.textContent).toContain('Marksman');
  });

  // The barracks deals 0 damage; a blank damage row would read as a bug.
  it('renders soldier stats for the barracks instead of a damage row', () => {
    codex.open(buildCatalog(ALL));
    const b = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Barracks'));
    b.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent.toLowerCase()).toContain('soldier');
    expect(dom.detail.textContent).not.toMatch(/Damage:\s*0\b/);
  });

  it('renders hero abilities on a hero entry', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="heroes"]').dispatchEvent(new Event('click', { bubbles: true }));
    const rael = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Rael'));
    rael.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Overcharge');
    expect(dom.detail.textContent).toContain('EMP Pulse');
  });

  it('opens directly on a requested tab and entry', () => {
    codex.open(buildCatalog(ALL), { initialTab: 'enemies', initialEntry: 'phantom' });
    expect(dom.detail.textContent).toContain('Veth Phantom');
  });

  it('closes on the close button, on backdrop click, and on Escape', () => {
    codex.open(buildCatalog(ALL));
    dom.close.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');

    codex.open(buildCatalog(ALL));
    dom.overlay.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');

    codex.open(buildCatalog(ALL));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.overlay.style.display).toBe('none');
  });

  it('calls onClose when it closes', () => {
    let closed = 0;
    codex.open(buildCatalog(ALL), { onClose: () => closed++ });
    codex.close();
    expect(closed).toBe(1);
  });

  it('removes every listener on close', () => {
    codex.open(buildCatalog(ALL));
    codex.close();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    dom.close.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');
  });

  it('is idempotent when opened twice', () => {
    codex.open(buildCatalog(ALL));
    codex.open(buildCatalog(ALL));
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/ui/CodexOverlay.test.js`
Expected: FAIL — cannot resolve `./CodexOverlay.js`.

- [ ] **Step 3: Implement**

```js
// Three-tab reference for towers, heroes and enemies. Follows the
// SettingsOverlay idiom: an explicit listener array, wired in open() and
// unwired in close(), so nothing outlives the overlay.
const TABS = ['towers', 'heroes', 'enemies'];

function line(cls, text) {
  const el = document.createElement('div');
  el.className   = cls;
  el.textContent = text;
  return el;
}

// Matchup entries are already {kind, type, name, icon} from the descriptors.
function names(entries) {
  return entries.map(e => e.name).join(', ');
}

export class CodexOverlay {
  constructor() {
    this._overlay  = document.getElementById('codex-overlay');
    this._tabs     = document.getElementById('codex-tabs');
    this._list     = document.getElementById('codex-list');
    this._detail   = document.getElementById('codex-detail');
    this._closeBtn = document.getElementById('codex-close');
    this._listeners = [];
    this._catalog   = null;
    this._tab       = 'towers';
    this._onClose   = null;
  }

  open(catalog, { initialTab = 'towers', initialEntry = null, onClose = null } = {}) {
    if (!this._overlay) return;
    this._catalog = catalog;
    this._tab     = TABS.includes(initialTab) ? initialTab : 'towers';
    this._onClose = onClose;

    this._teardownListeners();          // idempotent: a second open must not double-wire

    const close = () => this.close();
    this._bind(this._closeBtn, 'click', close);
    this._bind(this._overlay, 'click', (e) => { if (e.target === this._overlay) this.close(); });
    this._bind(document, 'keydown', (e) => { if (e.key === 'Escape') this.close(); });

    for (const btn of this._tabs.querySelectorAll('.codex-tab')) {
      this._bind(btn, 'click', () => { this._tab = btn.dataset.tab; this._renderList(); });
    }

    this._overlay.style.display = 'flex';
    this._renderList(initialEntry);
  }

  close() {
    if (!this._overlay) return;
    this._teardownListeners();
    this._overlay.style.display = 'none';
    const cb = this._onClose;
    this._onClose = null;
    cb?.();
  }

  _bind(el, evt, fn) {
    if (!el) return;
    el.addEventListener(evt, fn);
    this._listeners.push({ el, evt, fn });
  }

  _teardownListeners() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
  }

  _entries() {
    return this._catalog?.[this._tab] ?? [];
  }

  _renderList(selectId = null) {
    for (const btn of this._tabs.querySelectorAll('.codex-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === this._tab);
    }
    this._list.replaceChildren();

    const entries = this._entries();
    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.className = 'codex-entry';
      if (!entry.encountered) btn.classList.add('codex-unseen');

      const icon = document.createElement('span');
      icon.textContent = entry.icon ?? entry.portraitChar ?? '•';
      const name = document.createElement('span');
      name.textContent = entry.name ?? entry.displayName;
      btn.append(icon, name);

      if (!entry.encountered) {
        // Dimmed and tagged, never hidden: the codex must still help you plan.
        btn.appendChild(line('codex-unseen-tag', 'not yet encountered'));
      }

      this._bind(btn, 'click', () => {
        for (const b of this._list.querySelectorAll('.codex-entry')) b.classList.remove('active');
        btn.classList.add('active');
        this._renderDetail(entry);
      });
      this._list.appendChild(btn);
    }

    const initial = entries.find(e => (e.type ?? e.id) === selectId) ?? entries[0];
    if (initial) {
      const idx = entries.indexOf(initial);
      this._list.querySelectorAll('.codex-entry')[idx]?.classList.add('active');
      this._renderDetail(initial);
    } else {
      this._detail.replaceChildren();
    }
  }

  _renderDetail(entry) {
    this._detail.replaceChildren();
    if (entry.kind === 'tower')  return this._renderTower(entry);
    if (entry.kind === 'hero')   return this._renderHero(entry);
    return this._renderEnemy(entry);
  }

  _renderEnemy(e) {
    this._detail.append(
      line('codex-detail-title', `${e.icon} ${e.name}`),
      line('codex-detail-sub', e.flying ? 'Flying' : 'Ground'),
      line('codex-stat', `HP: ${e.hp}`),
      line('codex-stat', `Armour: ${e.armor}`),
      line('codex-stat', `Speed: ${e.speed}`),
      line('codex-stat', `Bounty: ${e.reward} gold`),
      line('codex-section', 'Matchups'),
      line('codex-stat', e.vulnerableTo.length ? `Weak to: ${names(e.vulnerableTo)}` : 'No particular weakness'),
      line('codex-stat', e.resists.length ? `Resists: ${names(e.resists)}` : 'Resists nothing'),
    );
    if (!e.encountered) this._detail.appendChild(line('codex-unseen-tag', 'Not yet encountered'));
  }

  _renderTower(t) {
    this._detail.append(
      line('codex-detail-title', `${t.icon} ${t.name}`),
      line('codex-detail-sub', `${t.cost} gold`),
      line('codex-stat', `Range: ${t.range}`),
    );
    if (t.dealsDirectDamage) {
      this._detail.append(
        line('codex-stat', `Damage: ${t.damage}`),
        line('codex-stat', `Fire rate: ${t.fireRate}/s`),
      );
      if (t.splashRadius > 0) this._detail.appendChild(line('codex-stat', `Splash: ${t.splashRadius}`));
      if (t.slow > 0)         this._detail.appendChild(line('codex-stat', `Slow: ${Math.round(t.slow * 100)}%`));
    } else if (t.soldierStats) {
      // The barracks fields a squad instead of shooting.
      this._detail.appendChild(line('codex-section', 'Soldiers'));
      for (const [tier, s] of Object.entries(t.soldierStats)) {
        this._detail.appendChild(line('codex-tier',
          `${tier}: ${s.count} soldiers · ${s.hp} HP · ${s.damage} dmg · respawn ${s.respawnDuration}s${s.canBlockFlyers ? ' · blocks flyers' : ''}`));
      }
    }

    this._detail.appendChild(line('codex-section', 'Upgrade path'));
    for (const tier of t.tiers) {
      const row = document.createElement('div');
      row.className = 'codex-tier';
      const label = document.createElement('span');
      label.className   = 'codex-tier-label';
      label.textContent = `${tier.label} (${tier.cost}g)`;
      row.appendChild(label);
      const bits = [];
      if (tier.damage       != null) bits.push(`${tier.damage} dmg`);
      if (tier.range        != null) bits.push(`${tier.range} range`);
      if (tier.splashRadius != null) bits.push(`${tier.splashRadius} splash`);
      if (tier.passiveEffect)        bits.push(tier.passiveEffect);
      if (bits.length) row.appendChild(document.createTextNode(` — ${bits.join(', ')}`));
      this._detail.appendChild(row);
    }

    if (t.ability) {
      this._detail.append(
        line('codex-section', 'Ability'),
        line('codex-stat', `${t.ability.label} (${t.ability.cooldown}s) — ${t.ability.description}`),
      );
    }

    // Labelled "at base tier" deliberately: TIER4_OVERRIDES can invert these
    // outright (cannon is weak vs skitter at base, but Artillery is 2.0x
    // AGAINST skitter), and the tier ladder is rendered directly above.
    this._detail.append(
      line('codex-section', 'Matchups (at base tier)'),
      line('codex-stat', t.effectiveAtBase.length ? `Strong against: ${names(t.effectiveAtBase)}` : 'No particular strength'),
      line('codex-stat', t.weakAtBase.length ? `Weak against: ${names(t.weakAtBase)}` : 'No particular weakness'),
    );
  }

  _renderHero(h) {
    this._detail.append(
      line('codex-detail-title', h.displayName),
      line('codex-detail-sub', h.role),
      line('codex-stat', `HP: ${h.stats.maxHp}`),
      line('codex-stat', `Attack: ${h.stats.attackDamage} every ${h.stats.attackRate}s`),
      line('codex-stat', `Range: ${h.stats.attackRange}`),
      line('codex-stat', `Move speed: ${h.stats.moveSpeed}`),
      line('codex-section', 'Matchups'),
      line('codex-stat', h.effectiveAgainst.length ? `Strong against: ${names(h.effectiveAgainst)}` : 'No particular strength'),
      line('codex-stat', h.weakAgainst.length ? `Weak against: ${names(h.weakAgainst)}` : 'No particular weakness'),
      line('codex-section', 'Abilities'),
    );
    for (const a of h.abilities) {
      this._detail.appendChild(line('codex-tier',
        `${a.icon} ${a.label} [${a.hotkey}] — ${a.effect} · ${a.cooldown}s cooldown · unlocks at level ${a.unlockLevel}`));
    }
    if (!h.encountered && h.unlockMapAfter != null) {
      this._detail.appendChild(line('codex-unseen-tag', `Clear Map ${h.unlockMapAfter + 1} to unlock`));
    }
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/ui/CodexOverlay.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/ui/CodexOverlay.js src/ui/CodexOverlay.test.js
git commit -m "feat(codex): three-tab overlay for towers, heroes and enemies"
```

---

### Task 9: Wire the codex into both scenes, with the pause handshake

**Files:**
- Modify: `src/scenes/MapSelectScene.js`
- Modify: `src/scenes/GameScene.js`
- Test: `src/scenes/GameScene.codex.test.js`

- [ ] **Step 1: Write the failing test for the pause handshake**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, off(){}, once(){} } } },
}));

// The handshake under test, extracted exactly as GameScene implements it.
// Reading a stat block must never cost lives, and must never silently
// un-pause a player who had paused deliberately.
function makeScene() {
  return {
    _userPaused: false,
    paused: false,
    codexOpen: false,
    openCodex() {
      this.codexOpen = true;
      if (!this._userPaused) this.paused = true;
    },
    closeCodex() {
      this.codexOpen = false;
      if (!this._userPaused) this.paused = false;
    },
  };
}

describe('codex pause handshake', () => {
  let s;
  beforeEach(() => { s = makeScene(); });

  it('pauses a running game on open and resumes on close', () => {
    s.openCodex();
    expect(s.paused).toBe(true);
    s.closeCodex();
    expect(s.paused).toBe(false);
  });

  it('leaves an already-paused game paused after closing', () => {
    s._userPaused = true;
    s.paused = true;
    s.openCodex();
    expect(s.paused).toBe(true);
    s.closeCodex();
    expect(s.paused).toBe(true);
  });

  it('never resumes a game the player paused while the codex was open', () => {
    s.openCodex();
    s._userPaused = true;      // player hit Pause behind the overlay
    s.closeCodex();
    expect(s.paused).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm it fails or passes for the right reason**

Run: `npm test -- src/scenes/GameScene.codex.test.js`
Expected: PASS — this test pins the contract before you implement it in
`GameScene`. Its value is that Step 4's real implementation must match it
line for line.

- [ ] **Step 3: Wire the codex into MapSelectScene**

Add the import:

```js
import { CodexOverlay }   from '../ui/CodexOverlay.js';
import { buildCatalog, progressFromSave } from '../systems/codexCatalog.js';
```

Add a `_bindCodex()` method mirroring `_bindSettings()` exactly (the clone
trick removes any prior listener):

```js
  _bindCodex() {
    // Clone removes any prior listener before re-adding (matches _bindSettings).
    const old = document.getElementById('open-codex-ms');
    if (!old) return;
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      if (!this._codexOverlay) this._codexOverlay = new CodexOverlay();
      const save = this.game.registry.get('save');
      this._codexOverlay.open(buildCatalog(progressFromSave(save)));
    });
  }
```

Call `this._bindCodex();` in `create()` beside `this._bindSettings();`, and
close it in `shutdown()` beside the other overlay teardown:

```js
    this._codexOverlay?.close();
```

> Confirm the registry key for SaveManager. Run
> `grep -n "registry.get('save')\|registry.set('save'" src/ -r` and use the
> real key.

- [ ] **Step 4: Wire the codex into GameScene with the pause handshake**

Add the same imports to `GameScene.js`, then in `_bindDOMEvents()`:

```js
    document.getElementById('open-codex')?.addEventListener('click', () => this._openCodex());
```

Add the method next to `_onPauseToggle`:

```js
  // Reading a stat block should not cost lives. Opening pauses a running game;
  // closing resumes it ONLY if the player had not paused deliberately — the
  // same rule the exit-confirm dialog uses at _bindDOMEvents.
  _openCodex() {
    if (this.over || this.won) return;
    if (!this._codexOverlay) this._codexOverlay = new CodexOverlay();
    const save = this.game.registry.get('save');
    if (!this._userPaused) this.scene.pause();
    this._codexOverlay.open(buildCatalog(progressFromSave(save)), {
      onClose: () => { if (!this._userPaused) this.scene.resume(); },
    });
  }
```

Add `'open-codex'` to the id list in `shutdown()` that clones nodes to drop
listeners (currently `['wave-btn','speed-btn','pause-btn', ...]`), and close the
overlay in `shutdown()`:

```js
    this._codexOverlay?.close();
    this._codexOverlay = null;
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/scenes/GameScene.codex.test.js src/scenes/MapSelectScene.heroOverlay.test.js`
Expected: PASS. If the MapSelect test fails because its DOM fixture lacks
`#open-codex-ms`, add that button to `setupDom()` in that test file — the
`_bindCodex` guard returns early when absent, so the fixture is the fix.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test
git add src/scenes/GameScene.js src/scenes/MapSelectScene.js src/scenes/GameScene.codex.test.js src/scenes/MapSelectScene.heroOverlay.test.js
git commit -m "feat(codex): open the codex from map select and mid-level, pausing safely"
```

---

### Task 10: AbilityTooltip

**Files:**
- Create: `src/ui/AbilityTooltip.js`
- Test: `src/ui/AbilityTooltip.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { AbilityTooltip } from './AbilityTooltip.js';
import { describeAbility } from '../systems/entityDescriptors.js';
import { HEROES } from '../data/heroes.js';

function setupDom() {
  document.body.replaceChildren();
  const card = document.createElement('div');
  card.id = 'ability-card';
  document.body.appendChild(card);
  const anchor = document.createElement('button');
  anchor.id = 'anchor';
  document.body.appendChild(anchor);
  return { card, anchor };
}

describe('AbilityTooltip', () => {
  let dom, tip;
  beforeEach(() => { dom = setupDom(); tip = new AbilityTooltip(); });

  it('shows label, hotkey, cooldown and effect on hover', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 0 }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    expect(dom.card.textContent).toContain('Overcharge');
    expect(dom.card.textContent).toContain('Q');
    expect(dom.card.textContent).toContain('30s');
    expect(dom.card.textContent).toContain('+50% tower fire rate for 6s');
  });

  it('hides on pointerleave', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    dom.anchor.dispatchEvent(new Event('pointerleave'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  // The model is read at hover time, not at attach time, so cooldown and
  // level are always current.
  it('re-reads the model on every hover', () => {
    let level = 1;
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'e', { level, heroUnlocked: true, cooldownRemaining: 0 }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('Unlocks at level 3');
    dom.anchor.dispatchEvent(new Event('pointerleave'));
    level = 3;
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).not.toContain('Unlocks at level 3');
  });

  it('shows remaining cooldown', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 9 }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('9s');
  });

  it('shows the hero unlock condition for a locked hero', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.scout, 'q', { level: 1, heroUnlocked: false }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('Clear Map 5');
  });

  it('opens on focus and closes on blur', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('focus'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    dom.anchor.dispatchEvent(new Event('blur'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('closes on Escape', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('stays hidden when the model getter returns null', () => {
    tip.attach(dom.anchor, () => null);
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('removes every listener on detachAll', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.detachAll();
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('supports several anchors at once', () => {
    const second = document.createElement('button');
    document.body.appendChild(second);
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.attach(second,     () => describeAbility(HEROES.rael, 'w'));
    second.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('Airstrike');
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- src/ui/AbilityTooltip.test.js`
Expected: FAIL — cannot resolve `./AbilityTooltip.js`.

- [ ] **Step 3: Implement**

```js
// One shared hover card, reused by every ability anchor on the page.
//
// The model is supplied by a getter called at hover time, not a snapshot taken
// at attach time: cooldown and hero level change between renders, and a card
// that showed stale state would be worse than no card.
export class AbilityTooltip {
  constructor() {
    this._el        = document.getElementById('ability-card');
    this._listeners = [];
    this._onEsc     = (e) => { if (e.key === 'Escape') this.hide(); };
    document.addEventListener('keydown', this._onEsc);
  }

  attach(anchor, getModel) {
    if (!anchor) return;
    const show = () => this._show(anchor, getModel());
    const hide = () => this.hide();
    for (const [evt, fn] of [['pointerenter', show], ['pointerleave', hide], ['focus', show], ['blur', hide]]) {
      anchor.addEventListener(evt, fn);
      this._listeners.push({ el: anchor, evt, fn });
    }
  }

  _show(anchor, model) {
    if (!this._el || !model) return;
    this._el.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ac-head';
    const icon = document.createElement('span');
    icon.className   = 'ac-icon';
    icon.textContent = model.icon;
    const label = document.createElement('span');
    label.className   = 'ac-label';
    label.textContent = model.label;
    const key = document.createElement('span');
    key.className   = 'ac-key';
    key.textContent = model.hotkey;
    head.append(icon, label, key);

    const effect = document.createElement('div');
    effect.className   = 'ac-effect';
    effect.textContent = model.effect;

    const meta = document.createElement('div');
    meta.className = 'ac-meta';
    meta.textContent = model.state === 'cooldown'
      ? `Ready in ${model.cooldownRemaining}s · ${model.cooldown}s cooldown`
      : `${model.cooldown}s cooldown · unlocks at level ${model.unlockLevel}`;

    this._el.append(head, effect, meta);

    if (model.lockReason) {
      const lock = document.createElement('div');
      lock.className   = 'ac-lock';
      lock.textContent = `🔒 ${model.lockReason}`;
      this._el.appendChild(lock);
    }

    this._position(anchor);
    this._el.classList.add('shown');
    this._el.setAttribute('aria-hidden', 'false');
  }

  // Positioned above the anchor, clamped into the viewport. getBoundingClientRect
  // returns zeros under jsdom, which is harmless — the tests assert content.
  _position(anchor) {
    const r = anchor.getBoundingClientRect();
    this._el.style.left   = `${Math.max(8, r.left)}px`;
    this._el.style.top    = `${Math.max(8, r.top - this._el.offsetHeight - 10)}px`;
  }

  hide() {
    if (!this._el) return;
    this._el.classList.remove('shown');
    this._el.setAttribute('aria-hidden', 'true');
  }

  detachAll() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
    this.hide();
  }

  destroy() {
    this.detachAll();
    document.removeEventListener('keydown', this._onEsc);
  }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- src/ui/AbilityTooltip.test.js`
Expected: PASS.

> The `Clear Map 5` assertion depends on scout's `unlockMapAfter` being 4.
> Confirm with `grep -n "unlockMapAfter" src/data/heroes.js` and use the real value.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add src/ui/AbilityTooltip.js src/ui/AbilityTooltip.test.js
git commit -m "feat(hero): shared hover card describing an ability's live state"
```

---

### Task 11: Wire AbilityTooltip into the in-game HUD

**Files:**
- Modify: `src/scenes/UIScene.js`

- [ ] **Step 1: Read the current ability wiring**

Run: `sed -n '355,435p' src/scenes/UIScene.js`

Note three things the tooltip must read: `_heroDef` (set in the hero-init
method), the hero level tracked in `_onHeroLevelUp`, and the per-slot cooldown
seconds delivered to `_onHeroCooldownTick`.

- [ ] **Step 2: Track level and cooldowns as fields**

In the scene's `create()` (or wherever `_heroDef` is first assigned), add:

```js
    this._heroLevel = 1;
    this._heroCds   = { q: 0, w: 0, e: 0 };
```

In `_onHeroLevelUp({ level })`, as the first line of the method body:

```js
    this._heroLevel = level;
```

In `_onHeroCooldownTick({ q, w, e })`, as the first line:

```js
    this._heroCds = { q, w, e };
```

- [ ] **Step 3: Replace the native title with the tooltip**

Add the imports:

```js
import { AbilityTooltip }  from '../ui/AbilityTooltip.js';
import { describeAbility } from '../systems/entityDescriptors.js';
```

In the hero-init loop, delete this line:

```js
      btn.title = `${a.label} — ${a.tooltip}`;
```

and replace it with an attach, after the loop:

```js
    // Live state is read at hover time, so the card always matches the button.
    this._abilityTip?.detachAll();
    this._abilityTip ??= new AbilityTooltip();
    for (const slot of ['q', 'w', 'e']) {
      const btn = document.getElementById(`ability-${slot}`);
      this._abilityTip.attach(btn, () => describeAbility(def, slot, {
        level:             this._heroLevel,
        heroUnlocked:      true,     // an in-level hero is by definition unlocked
        cooldownRemaining: this._heroCds[slot],
      }));
    }
```

- [ ] **Step 4: Tear down on shutdown**

In UIScene's shutdown path (the same place the button ids are cloned, around
`UIScene.js:63`), add:

```js
    this._abilityTip?.destroy();
    this._abilityTip = null;
```

> `pointer-events: none` on `.ability-card` means the card cannot swallow a
> click meant for the button beneath it. Do not remove that rule.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. `UIScene.spaceKey.test.js` must still be green — if its fixture
lacks `#ability-card`, the tooltip's null guard handles it, but add the element
to the fixture if anything throws.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/UIScene.js
git commit -m "feat(hero): replace the native ability title with the hover card"
```

---

### Task 12: Ability strip in Hero Command

**Files:**
- Modify: `src/ui/HeroManagementOverlay.js`
- Modify: `index.html` (one CSS rule)
- Test: `src/ui/HeroManagementOverlay.abilities.test.js` (create)

`HeroManagementOverlay` renders a hero rail and an upgrade tree today — there
are **no ability rows to decorate**, so this task creates them.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeroManagementOverlay } from './HeroManagementOverlay.js';

function setupDom() {
  document.body.replaceChildren();
  for (const id of ['hero-mgmt-overlay', 'hero-rail', 'hero-tree', 'hero-mgmt-avail', 'ability-card']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  const close = document.createElement('button');
  close.id = 'hero-mgmt-close';
  document.body.appendChild(close);
}

// renderUpgradeNode(node, mgr, HEROES, onChange) is called for every upgrade in
// the hero's branch, so this fake must satisfy whatever it calls. Read
// `src/ui/upgradeNode.js` first and add any method it needs (e.g. isPurchased,
// canAfford, purchase) rather than guessing — a missing method throws inside
// _renderTree and every test in this file fails for the wrong reason.
const fakeMgr = {
  getAvailableStars: () => 3,
  getPurchasedUpgrades: () => [],
};

function fakeSave(unlocked = ['rael']) {
  return {
    getSelectedHero: () => 'rael',
    setSelectedHero: () => {},
    isHeroUnlocked:  (id) => unlocked.includes(id),
    getStars:        () => 0,
  };
}

describe('HeroManagementOverlay ability strip', () => {
  beforeEach(setupDom);

  it('renders three ability rows for the inspected hero', () => {
    const o = new HeroManagementOverlay(fakeMgr, fakeSave());
    o.open();
    const rows = document.querySelectorAll('#hero-tree .ho-ability');
    expect(rows.length).toBe(3);
    expect(document.getElementById('hero-tree').textContent).toContain('Overcharge');
  });

  it('shows the hover card with the ability effect', () => {
    const o = new HeroManagementOverlay(fakeMgr, fakeSave());
    o.open();
    const first = document.querySelector('#hero-tree .ho-ability');
    first.dispatchEvent(new Event('pointerenter'));
    expect(document.getElementById('ability-card').textContent)
      .toContain('+50% tower fire rate for 6s');
  });

  // A locked hero's abilities must explain the map to clear, not a level.
  it('shows the hero unlock condition for a locked hero', () => {
    const save = fakeSave(['rael']);
    const o = new HeroManagementOverlay(fakeMgr, save);
    o.open();
    document.querySelectorAll('#hero-rail .ho-card')[2]
      .dispatchEvent(new Event('click', { bubbles: true }));   // scout: locked
    const first = document.querySelector('#hero-tree .ho-ability');
    first.dispatchEvent(new Event('pointerenter'));
    expect(document.getElementById('ability-card').textContent).toContain('Clear Map');
  });

  it('detaches tooltips on close', () => {
    const o = new HeroManagementOverlay(fakeMgr, fakeSave());
    o.open();
    const first = document.querySelector('#hero-tree .ho-ability');
    o.close();
    first.dispatchEvent(new Event('pointerenter'));
    expect(document.getElementById('ability-card').classList.contains('shown')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- src/ui/HeroManagementOverlay.abilities.test.js`
Expected: FAIL — `.ho-ability` matches nothing.

- [ ] **Step 3: Implement the strip**

Add the imports to `src/ui/HeroManagementOverlay.js`:

```js
import { AbilityTooltip }  from './AbilityTooltip.js';
import { describeAbility } from '../systems/entityDescriptors.js';
```

In `_renderTree(heroId)`, after the unlock banner block and **before** the
`for (const node of UPGRADES...)` loop:

```js
    // Ability reference for this hero. The overlay is a planning screen, so
    // the cards describe the ability in the abstract: a hero's in-level
    // cooldown has no meaning here, but its unlock level does.
    const unlocked = this._save.isHeroUnlocked(heroId);
    this._abilityTip ??= new AbilityTooltip();
    const strip = document.createElement('div');
    strip.className = 'ho-ability-strip';
    for (const slot of ['q', 'w', 'e']) {
      const a   = def.abilities[slot];
      const row = document.createElement('div');
      row.className   = 'ho-ability';
      row.textContent = `${a.icon} ${a.label} [${slot.toUpperCase()}]`;
      this._abilityTip.attach(row, () => describeAbility(def, slot, {
        level:             def.stats.maxLevel,
        heroUnlocked:      unlocked,
        cooldownRemaining: 0,
      }));
      strip.appendChild(row);
    }
    this._tree.appendChild(strip);
```

`_renderTree` is called on every `_render()`, so detach before re-attaching to
avoid stacking listeners. As the first line of `_renderTree`:

```js
    this._abilityTip?.detachAll();
```

In `close()`, add:

```js
    this._abilityTip?.destroy();
    this._abilityTip = null;
```

- [ ] **Step 4: Add the CSS**

In `index.html`, beside the other `ho-` rules:

```css
    .ho-ability-strip { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 14px; }
    .ho-ability { background: #12202e; border: 1px solid #2a3a4a; border-radius: 4px;
      color: #cde; padding: 5px 9px; font-size: 11px; cursor: help; }
    .ho-ability:hover { background: #1a3145; border-color: #4fc3f7; }
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npm test -- src/ui/HeroManagementOverlay.abilities.test.js`
Expected: PASS.

> If the rail-card index for scout is wrong, `HERO_ORDER` is
> `['rael','engineer','scout','pyro']` — scout is index 2.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test
git add src/ui/HeroManagementOverlay.js src/ui/HeroManagementOverlay.abilities.test.js index.html
git commit -m "feat(hero): ability reference strip in Hero Command"
```

---

### Task 13: Production build and live verification

**Files:**
- Modify: `.claude/notes.md`

A green suite is not a working feature. This task is the gate.

- [ ] **Step 1: Run the full suite one more time**

Run: `npm test`
Expected: all green. Record the exact test count for the PR body.

- [ ] **Step 2: Build for production**

Run: `npm run build`
Expected: exit 0, no warnings about missing assets.

- [ ] **Step 3: Serve the production build**

Run: `npm run preview`
Note the port it prints. **Verify against the preview server, not `npm run dev`** —
the dev server serves files the build drops, which has hidden real breakage in
this repo before.

- [ ] **Step 4: Verify the wave preview in a browser**

Confirm each of these by looking at the running game:
- Before wave 1: hovering Send Wave shows "Wave 1", the right types and counts.
- During an active wave with the button **disabled**: hovering still opens the popover.
- During an early-send window: the popover's wave number matches the button's label.
- After the final wave: hovering shows nothing — no empty frame.
- On a map with a colossus or titan (maps 4+ / 7): the popover lists it with armour.
- In a touch emulation mode (Chrome DevTools device toolbar): tapping Send Wave
  opens the popover, tapping elsewhere dismisses it, and a normal mouse click
  still starts the wave.

- [ ] **Step 5: Verify the codex in a browser**

- Map select → 📚 Codex opens; all three tabs list entries.
- On a fresh profile (or a browser profile with no save), titan and colossus
  are dimmed and tagged, still clickable, and their detail still renders.
- The barracks entry shows soldier stats, not "Damage: 0".
- In-level → 📚 Codex pauses the game; closing resumes it.
- Pause first, then open and close the codex: the game is **still paused**.
- Escape closes the codex.

> **Escape, honestly:** the popover, the ability card and the codex each listen
> for Escape on `document`, so one press hides all three. That is harmless —
> hiding an already-hidden popover is a no-op — but it is not true "topmost
> only" dismissal. If a future surface needs Escape to mean something other
> than "dismiss", give the overlays a shared z-order stack then. Do not build
> that now.

- [ ] **Step 6: Verify the ability cards in a browser**

- In-level: hover Q at level 1 → card with effect and cooldown, no lock line.
- Hover E at level 1 → "Unlocks at level 3".
- Fire an ability, then hover it → shows remaining cooldown.
- Map select → Hero Command: hover an ability on Rael, then on a locked hero
  (Scout before map 5) → the locked one shows the map to clear.

- [ ] **Step 7: Check for console errors**

With the browser console open, replay a level from start to finish twice in the
same tab. Expect **zero** errors and no sign of duplicated enemy spawns — that
is the signature of a listener that outlived its scene.

- [ ] **Step 8: Update the backlog**

Append to the completed section of `.claude/notes.md` a one-line entry naming
the three features, the PR number once open, the final test count, and the
browser-verified evidence.

- [ ] **Step 9: Commit and open the PR**

```bash
git add .claude/notes.md
git commit -m "docs(notes): record wave preview, codex, and ability tooltips"
git push -u origin feat/wave-preview-codex-tooltips
gh pr create --base main --title "feat: wave preview, codex, and hero ability tooltips" --body "<summary + test count + verification evidence>"
```

> Confirm the PR base is `main` before merging, and never push to `main`
> directly — `main` is the Vercel production branch and merging auto-deploys.
