# Armour-Floor Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell the player *why* a hit is weak — surface flat-armour absorption on the tower panel and on the in-world damage number — without changing the damage formula.

**Architecture:** Extract the armour step out of `computeDamage` into a shared `applyArmour`, so a new pure `armourLegibility` module classifies absorption without a second copy of the arithmetic. That module feeds two consumers: a new line on the tower panel, and a band on the existing `damage-dealt` payload that lets `DamageNumberOverlay` print otherwise-suppressed absorbed hits.

**Tech Stack:** Plain ES modules, Phaser 3, Vite 5, Vitest 2 + jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-armour-legibility-design.md`

## Global Constraints

- **The damage formula does not change.** `computeDamage`'s output must be identical for every input before and after this work. `src/systems/damage.test.js` must pass **unmodified** — that is the acceptance test for Task 1.
- **No balance changes.** Nothing under `src/data/` or `src/sim/` is edited. `npm run balance` output must be byte-identical.
- **Absorption is armour-only and honours `pierce`.** Never compute it as `final / raw` — that conflates armour with the weakness matrix and with `vulnerableMult`.
- **Bands:** `floored` = `after === 1 && absorbed > 0`; `heavy` = `absorbed >= HEAVY_ABSORPTION` (0.5) and not floored; else `none`.
- **Piercing sources are never flagged.** `mage` and `sniper` set `pierce: true` at tower level; no tier overrides it.
- **No `innerHTML`.** Panel DOM is built with `replaceChildren` + `createElement`, matching the existing matchup-line code.
- **Tests derive rosters from `TOWER_DEFS`/`ENEMY_DEFS`**, never a hardcoded list of names and never a pinned count. Assert defining properties instead.
- Tests that import an entity which transitively imports Phaser must `vi.mock('phaser', ...)` — jsdom has no canvas. Copy the mock block from `src/scenes/GameScene.wavePreview.test.js`.
- Run the suite with `npm run test`. Never gate a commit on a grepped subset.

---

### Task 1: Extract the armour step from `computeDamage`

Behaviour-preserving refactor. Everything else depends on `applyArmour` existing.

**Files:**
- Modify: `src/systems/damage.js`
- Test: `src/systems/damage.test.js` (add cases; do not alter existing ones)

**Interfaces:**
- Consumes: nothing.
- Produces: `applyArmour(amount, armor = 0, pierce = false) -> number`, exported from `src/systems/damage.js`. Tasks 2 and 5 import it.

- [ ] **Step 1: Write the failing test**

Append to `src/systems/damage.test.js`:

```js
import { computeDamage, applyArmour } from './damage.js';

describe('applyArmour', () => {
  it('subtracts armour from the raw amount', () => {
    expect(applyArmour(20, 8)).toBe(12);
  });

  it('floors at 1 when armour meets or exceeds the amount', () => {
    expect(applyArmour(8, 8)).toBe(1);
    expect(applyArmour(5, 99)).toBe(1);
  });

  it('ignores armour entirely when the hit pierces', () => {
    expect(applyArmour(20, 8, true)).toBe(20);
  });

  it('defaults to no armour and no pierce', () => {
    expect(applyArmour(20)).toBe(20);
  });
});
```

Note the existing file imports `{ computeDamage }` on line 2 — widen that import rather than adding a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/damage.test.js`
Expected: FAIL — `applyArmour is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/systems/damage.js`, add the export and call it from `computeDamage`:

```js
// The armour step on its own. Exported so the UI can explain flat subtraction
// without keeping a second copy of `max(1, ...)` — a second copy is exactly how
// the headless simulator drifted from the game before.
export function applyArmour(amount, armor = 0, pierce = false) {
  return Math.max(1, amount - (pierce ? 0 : armor));
}

export function computeDamage({
  amount,
  armor = 0,
  pierce = false,
  source,
  enemyType,
  vulnerableMult = 1,
}) {
  const afterArmor = applyArmour(amount, armor, pierce);
  const mult = getWeaknessMultiplier(source, enemyType);
  return Math.max(1, Math.floor(afterArmor * mult * vulnerableMult));
}
```

The local `effectiveArmor` variable is now unused — remove it, and nothing else.

- [ ] **Step 4: Run the full suite to verify nothing moved**

Run: `npm run test`
Expected: PASS, including every pre-existing `computeDamage` case unmodified.

- [ ] **Step 5: Commit**

```bash
git add src/systems/damage.js src/systems/damage.test.js
git commit -m "refactor(damage): extract applyArmour from computeDamage"
```

---

### Task 2: `armourAbsorption` — the band classifier

**Files:**
- Create: `src/systems/armourLegibility.js`
- Test: `src/systems/armourLegibility.test.js`

**Interfaces:**
- Consumes: `applyArmour` from Task 1.
- Produces:
  - `HEAVY_ABSORPTION = 0.5` (exported const)
  - `armourAbsorption({ amount, armor = 0, pierce = false }) -> { after, absorbed, band }`, `band` one of `'none' | 'heavy' | 'floored'`. Tasks 3 and 5 import it.

- [ ] **Step 1: Write the failing test**

Create `src/systems/armourLegibility.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { armourAbsorption, HEAVY_ABSORPTION } from './armourLegibility.js';

describe('armourAbsorption', () => {
  it('reports no absorption when the enemy has no armour', () => {
    expect(armourAbsorption({ amount: 15, armor: 0 }))
      .toEqual({ after: 15, absorbed: 0, band: 'none' });
  });

  it('floors when armour equals the damage', () => {
    // ice T1 (8) vs brute (8) — the combination the bug report came from.
    const r = armourAbsorption({ amount: 8, armor: 8 });
    expect(r.after).toBe(1);
    expect(r.band).toBe('floored');
  });

  it('floors when armour exceeds the damage', () => {
    expect(armourAbsorption({ amount: 15, armor: 20 }).band).toBe('floored');
  });

  it('floors when the result lands on 1 without the clamp', () => {
    // 2 - 1 = 1: no clamp, but the player sees the same unreadable 1.
    expect(armourAbsorption({ amount: 2, armor: 1 }).band).toBe('floored');
  });

  it('never flags a piercing hit, however much armour there is', () => {
    const r = armourAbsorption({ amount: 8, armor: 20, pierce: true });
    expect(r).toEqual({ after: 8, absorbed: 0, band: 'none' });
  });

  it('calls absorption heavy at exactly the threshold', () => {
    // archer T3 (40) vs titan (20) -> 20 through, exactly 0.5 absorbed.
    const r = armourAbsorption({ amount: 40, armor: 20 });
    expect(r.absorbed).toBe(HEAVY_ABSORPTION);
    expect(r.band).toBe('heavy');
  });

  it('leaves absorption just under the threshold unflagged', () => {
    // cannon T1 (45) vs titan (20) -> 25 through, 0.444 absorbed.
    expect(armourAbsorption({ amount: 45, armor: 20 }).band).toBe('none');
  });

  it('prefers floored over heavy when both would apply', () => {
    expect(armourAbsorption({ amount: 8, armor: 20 }).band).toBe('floored');
  });

  it('treats a zero-damage source as unflagged', () => {
    // TOWER_DEFS.barracks has damage: 0 — must not divide by zero.
    expect(armourAbsorption({ amount: 0, armor: 20 }))
      .toEqual({ after: 0, absorbed: 0, band: 'none' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/armourLegibility.test.js`
Expected: FAIL — cannot resolve `./armourLegibility.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/systems/armourLegibility.js`:

```js
// Explains the flat-armour step to the player. Armour is `max(1, dmg - armor)`,
// so a tower at or below an enemy's armour lands exactly 1 a shot forever —
// which reads as a broken tower rather than as an absorbed hit. The decision on
// file is to make that legible, not to change the formula, so nothing here
// feeds `src/data/` or `src/sim/`.
import { applyArmour } from './damage.js';
import { ENEMY_DEFS } from '../data/enemies.js';

// Half the shot eaten is where the sorted table of real combinations breaks:
// the next one down is 0.44. Not a tuning dial — a reporting threshold.
export const HEAVY_ABSORPTION = 0.5;

// Absorption is measured on the ARMOUR STEP ALONE, never as final/raw. The
// weakness matrix and the Vulnerable debuff also scale a hit, and folding them
// in would report "armour absorbed 50%" for a cannon hitting an unarmoured
// phantom, and no absorption at all for a sniper that loses 25% to a titan.
export function armourAbsorption({ amount, armor = 0, pierce = false }) {
  if (!(amount > 0)) return { after: 0, absorbed: 0, band: 'none' };
  const after = applyArmour(amount, armor, pierce);
  const absorbed = (amount - after) / amount;
  let band = 'none';
  if (after === 1 && absorbed > 0)          band = 'floored';
  else if (absorbed >= HEAVY_ABSORPTION)    band = 'heavy';
  return { after, absorbed, band };
}
```

The `ENEMY_DEFS` import is used by Task 3 in the same file; add it now so Task 3
does not have to touch the import block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/armourLegibility.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/systems/armourLegibility.js src/systems/armourLegibility.test.js
git commit -m "feat(combat): classify how much of a hit flat armour absorbs"
```

---

### Task 3: `describeTowerArmour` — the per-tower panel rows

**Files:**
- Modify: `src/systems/armourLegibility.js`
- Test: `src/systems/armourLegibility.test.js` (append)

**Interfaces:**
- Consumes: `armourAbsorption` from Task 2; `ENEMY_DEFS`.
- Produces: `describeTowerArmour({ damage, pierce = false }) -> Array<{ enemyType, name, armor, after, absorbed, band }>` — armoured enemies only, `band !== 'none'` only, in `ENEMY_DEFS` key order. Task 4 renders it.

Note the signature takes `damage` and `pierce` **directly**, not a tower type/tier.
The caller already holds a live `Tower` instance whose `damage` and `pierce` reflect
tier upgrades and tier-4 branch overrides (`Tower.js:19` and `Tower.js:71`);
re-deriving them from `TOWER_DEFS` here would let the panel disagree with the
entity actually shooting.

- [ ] **Step 1: Write the failing test**

Append to `src/systems/armourLegibility.test.js`:

```js
import { describeTowerArmour } from './armourLegibility.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

describe('describeTowerArmour', () => {
  it('lists only armoured enemies that are actually flagged', () => {
    // ice T1: damage 8. Floors against brute(8), colossus(15), titan(20).
    const rows = describeTowerArmour({ damage: 8 });
    expect(rows.map(r => r.enemyType)).toEqual(['brute', 'colossus', 'titan']);
    expect(rows.every(r => r.band === 'floored')).toBe(true);
  });

  it('returns nothing for a tower that loses little to armour', () => {
    // cannon T3: damage 100. Worst case is titan at 20% absorbed.
    expect(describeTowerArmour({ damage: 100 })).toEqual([]);
  });

  it('returns nothing at all for a piercing tower', () => {
    // sniper T1: damage 80, pierce true.
    expect(describeTowerArmour({ damage: 80, pierce: true })).toEqual([]);
  });

  it('returns nothing for a zero-damage tower', () => {
    // the barracks tower itself deals 0; its soldiers are passed separately.
    expect(describeTowerArmour({ damage: 0 })).toEqual([]);
  });

  it('never lists an unarmoured enemy', () => {
    const rows = describeTowerArmour({ damage: 8 });
    expect(rows.some(r => ['drone', 'skitter', 'phantom'].includes(r.enemyType)))
      .toBe(false);
  });

  it('carries the display name and the armour value for the panel', () => {
    const [brute] = describeTowerArmour({ damage: 8 });
    expect(brute.name).toBe(ENEMY_DEFS.brute.name);
    expect(brute.armor).toBe(ENEMY_DEFS.brute.armor);
    expect(brute.after).toBe(1);
  });

  it('orders rows by ENEMY_DEFS key order', () => {
    const order = Object.keys(ENEMY_DEFS);
    const rows = describeTowerArmour({ damage: 15 });   // archer T1
    const idx  = rows.map(r => order.indexOf(r.enemyType));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

// Derived, not hardcoded: a pinned list of names is what made waves.test.js
// ENFORCE the colossus bug. Assert the properties that DEFINE each band, so a
// future balance retune moves the roster without silently gutting coverage.
describe('band membership across the real tables', () => {
  const sources = [];
  for (const [type, def] of Object.entries(TOWER_DEFS)) {
    for (const tier of [1, 2, 3]) {
      const damage = tier === 1 ? def.damage : def[`tier${tier}`]?.damage;
      if (!damage) continue;
      sources.push({ label: `${type} T${tier}`, damage, pierce: def.pierce });
    }
    if (def.soldierStats) {
      for (const tier of [1, 2, 3]) {
        sources.push({
          label: `${type} soldier T${tier}`,
          damage: def.soldierStats[`tier${tier}`].damage,
          pierce: false,
        });
      }
    }
  }

  const rowsFor = (s) => Object.values(ENEMY_DEFS)
    .filter(e => e.armor > 0)
    .map(e => ({ s, e, ...armourAbsorption({ amount: s.damage, armor: e.armor, pierce: s.pierce }) }));
  const all = sources.flatMap(rowsFor);

  it('gives every floored row exactly 1 damage through', () => {
    for (const r of all.filter(r => r.band === 'floored')) expect(r.after).toBe(1);
  });

  it('gives every heavy row at least the threshold and more than 1 through', () => {
    for (const r of all.filter(r => r.band === 'heavy')) {
      expect(r.absorbed).toBeGreaterThanOrEqual(HEAVY_ABSORPTION);
      expect(r.after).toBeGreaterThan(1);
    }
  });

  it('partitions every combination into exactly one band', () => {
    for (const r of all) expect(['none', 'heavy', 'floored']).toContain(r.band);
  });

  it('never flags a piercing source', () => {
    for (const r of all.filter(r => r.s.pierce)) expect(r.band).toBe('none');
  });

  it('flags at least one combination, so the feature is never vacuous', () => {
    expect(all.some(r => r.band !== 'none')).toBe(true);
  });

  it('still floors ice T1 against a brute — the reported symptom', () => {
    const r = armourAbsorption({ amount: TOWER_DEFS.ice.damage, armor: ENEMY_DEFS.brute.armor });
    expect(r.band).toBe('floored');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/armourLegibility.test.js`
Expected: FAIL — `describeTowerArmour is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/systems/armourLegibility.js`:

```js
// Rows for the tower panel: which armoured enemies blunt THIS tower, and by how
// much. Takes the live tower's damage and pierce rather than a type/tier pair,
// because the placed entity already carries tier upgrades and tier-4 branch
// overrides that a table lookup here would miss.
export function describeTowerArmour({ damage, pierce = false }) {
  const rows = [];
  for (const def of Object.values(ENEMY_DEFS)) {
    if (!(def.armor > 0)) continue;
    const { after, absorbed, band } = armourAbsorption({ amount: damage, armor: def.armor, pierce });
    if (band === 'none') continue;
    rows.push({ enemyType: def.type, name: def.name, armor: def.armor, after, absorbed, band });
  }
  return rows;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/armourLegibility.js src/systems/armourLegibility.test.js
git commit -m "feat(combat): describe which armoured enemies blunt a given tower"
```

---

### Task 4: The tower panel armour line

**Files:**
- Modify: `index.html` (style block near line 61; markup at line 503)
- Modify: `src/scenes/GameScene.js` (`_openTowerPanel`, after the matchup block that ends ~line 1091)
- Test: `src/scenes/GameScene.armourPanel.test.js` (create)

**Interfaces:**
- Consumes: `describeTowerArmour` from Task 3.
- Produces: `GameScene.prototype._renderArmourLine(tower)` — reads `#panel-armour`, writes its children. Called from `_openTowerPanel`. No other task consumes it.

- [ ] **Step 1: Add the markup and styles**

In `index.html`, after line 503 (`<div class="panel-matchups" id="panel-matchups"></div>`):

```html
      <div class="panel-armour" id="panel-armour"></div>
```

In the style block, after the `.panel-matchups` rules (lines 61-63):

```css
    #tower-panel .panel-armour { font-size: 10px; margin: 4px 0; line-height: 1.4; }
    #tower-panel .panel-armour .ar-head  { display: block; color: #aaa; }
    #tower-panel .panel-armour .ar-heavy { color: #fc6; }
    #tower-panel .panel-armour .ar-floor { color: #f66; font-weight: bold; }
```

- [ ] **Step 2: Write the failing test**

Create `src/scenes/GameScene.armourPanel.test.js`:

```js
// The tower panel's armour line. Exercises the REAL GameScene.prototype method
// against real DOM, the same way GameScene.wavePreview.test.js does, so it
// proves the actual render and not a local replica of it.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

import { describe, it, expect, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { TOWER_DEFS } from '../data/towers.js';

function setupDOM() {
  document.body.replaceChildren();
  const el = document.createElement('div');
  el.id = 'panel-armour';
  document.body.appendChild(el);
  return el;
}

const render = (tower) => GameScene.prototype._renderArmourLine.call({}, tower);

describe('tower panel armour line', () => {
  let el;
  beforeEach(() => { el = setupDOM(); });

  it('names every armoured enemy that blunts an ice T1', () => {
    render({ type: 'ice', damage: TOWER_DEFS.ice.damage, pierce: false });
    expect(el.textContent).toContain('Brute');
    expect(el.textContent).toContain('Colossus');
    expect(el.textContent).toContain('Titan');
  });

  it('strips the Veth prefix, matching the matchup line', () => {
    render({ type: 'ice', damage: TOWER_DEFS.ice.damage, pierce: false });
    expect(el.textContent).not.toContain('Veth');
  });

  it('shows the damage that actually lands', () => {
    render({ type: 'ice', damage: TOWER_DEFS.ice.damage, pierce: false });
    expect(el.textContent).toContain('8→1');
  });

  it('marks a floored row apart from a heavy one', () => {
    render({ type: 'archer', damage: TOWER_DEFS.archer.damage, pierce: false });
    expect(el.querySelector('.ar-floor')).not.toBeNull();
    expect(el.querySelector('.ar-heavy')).not.toBeNull();
  });

  it('renders nothing at all for a piercing tower', () => {
    render({ type: 'sniper', damage: TOWER_DEFS.sniper.damage, pierce: true });
    expect(el.childNodes.length).toBe(0);
    expect(el.style.display).toBe('none');
  });

  it('renders nothing for a tower armour barely touches', () => {
    render({ type: 'cannon', damage: TOWER_DEFS.cannon.tier3.damage, pierce: false });
    expect(el.childNodes.length).toBe(0);
  });

  it('uses soldier damage for a barracks, not the barracks own zero', () => {
    const ss = TOWER_DEFS.barracks.soldierStats.tier1;
    render({ type: 'barracks', damage: 0, pierce: false, soldierStats: ss });
    expect(el.textContent).toContain('Titan');
    expect(el.childNodes.length).toBeGreaterThan(0);
  });

  it('reads the live tower damage, not the tier-1 table', () => {
    // A placed tower carries its upgraded damage (Tower.js:71). If the panel
    // re-derived damage from TOWER_DEFS it would keep warning about an ice T1
    // long after the player upgraded out of the floor.
    render({ type: 'ice', damage: TOWER_DEFS.ice.tier3.damage, pierce: false });
    const floored = el.querySelectorAll('.ar-floor');
    // ice T3 (18) still floors vs titan (20) but only heavily absorbs colossus.
    expect(el.textContent).toContain('18→1');    // titan, floored
    expect(el.textContent).toContain('18→3');    // colossus, heavy
    // ice T3 clears the brute (10 through, 44% absorbed) — no longer flagged.
    expect(el.textContent).not.toContain('Brute');
    expect(floored.length).toBe(1);
  });

  it('honours a tier-4 branch that turns pierce on', () => {
    // Pierce is read off the entity, so a branch granting it silences the line.
    render({ type: 'ice', damage: TOWER_DEFS.ice.tier3.damage, pierce: true });
    expect(el.childNodes.length).toBe(0);
  });

  it('clears a previous tower rows when re-rendered', () => {
    render({ type: 'ice', damage: TOWER_DEFS.ice.damage, pierce: false });
    render({ type: 'sniper', damage: TOWER_DEFS.sniper.damage, pierce: true });
    expect(el.childNodes.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.armourPanel.test.js`
Expected: FAIL — `_renderArmourLine is not a function`.

- [ ] **Step 4: Write the implementation**

In `src/scenes/GameScene.js`, add the import alongside the existing `describeMatchups` import:

```js
import { describeTowerArmour } from '../systems/armourLegibility.js';
```

Add the method to the class, next to `_openTowerPanel`:

```js
  // Flat armour is subtracted before any multiplier, so a tower at or below an
  // enemy's armour lands exactly 1 a shot. The Effective/Weak line above cannot
  // say this — it reads only the multiplicative weakness matrix, which is why an
  // Ice tower shows no warning at all against a brute it can barely scratch.
  _renderArmourLine(tower) {
    const el = document.getElementById('panel-armour');
    el.replaceChildren();

    // A barracks deals no damage itself; its soldiers are its damage.
    const damage = tower.type === 'barracks'
      ? (tower.soldierStats?.damage ?? 0)
      : tower.damage;
    const rows = describeTowerArmour({ damage, pierce: Boolean(tower.pierce) });

    if (!rows.length) { el.style.display = 'none'; return; }
    el.style.display = '';

    const head = document.createElement('span');
    head.className = 'ar-head';
    head.textContent = tower.type === 'barracks'
      ? '🛡 Armour absorbs (soldiers): '
      : '🛡 Armour absorbs: ';

    rows.forEach((row, i) => {
      const span = document.createElement('span');
      span.className = row.band === 'floored' ? 'ar-floor' : 'ar-heavy';
      const name = row.name.replace(/^Veth\s+/, '');
      span.textContent = `${name} ${damage}→${row.after}${row.band === 'floored' ? ' ⚠' : ''}`;
      head.appendChild(span);
      if (i < rows.length - 1) head.appendChild(document.createTextNode(' · '));
    });

    el.appendChild(head);
  }
```

Call it from `_openTowerPanel`, immediately after the existing matchup block
(after the `if (m.weak.length) { ... }` closing brace, before
`const upgradeBtn = ...`):

```js
    this._renderArmourLine(tower);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.armourPanel.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html src/scenes/GameScene.js src/scenes/GameScene.armourPanel.test.js
git commit -m "feat(ui): show which armoured enemies blunt a tower on its panel"
```

---

### Task 5: Put the absorption band on the `damage-dealt` payload

**Files:**
- Modify: `src/entities/Enemy.js` (`takeDamage`, the emit at ~line 136)
- Test: `src/entities/Enemy.armourBand.test.js` (create)

**Interfaces:**
- Consumes: `armourAbsorption` from Task 2.
- Produces: the existing `damage-dealt` event payload gains `absorbedBand: 'none' | 'heavy' | 'floored'`. Task 6 reads it. No new event.

- [ ] **Step 1: Write the failing test**

Create `src/entities/Enemy.armourBand.test.js`:

```js
// takeDamage already holds the raw amount and the final damage at the emit, so
// the band rides along on the existing event rather than needing new plumbing.

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setPosition() { return this; }
      },
    },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import { armourAbsorption } from '../systems/armourLegibility.js';
import { ENEMY_DEFS } from '../data/enemies.js';

// The emit payload is what matters here, and Enemy's constructor drags in the
// whole sprite stack. Assert the contract the overlay depends on: the band the
// emit carries equals what armourAbsorption says for that (amount, armor,
// pierce) triple. Task 6's overlay test covers the consumer side.
describe('damage-dealt absorbedBand contract', () => {
  it('bands a floored tower hit', () => {
    const { band } = armourAbsorption({ amount: 8, armor: ENEMY_DEFS.brute.armor });
    expect(band).toBe('floored');
  });

  it('bands a piercing hit as none', () => {
    const { band } = armourAbsorption({ amount: 8, armor: ENEMY_DEFS.titan.armor, pierce: true });
    expect(band).toBe('none');
  });
});
```

Then add the real wiring assertion by exercising `takeDamage` through a
hand-built object bound to the real prototype method:

```js
import { Enemy } from './Enemy.js';   // named export — see Enemy.js:12

function fakeEnemy(def, overrides = {}) {
  const emitted = [];
  const self = {
    def, armor: def.armor, hp: 10000, maxHp: 10000, dead: false,
    statusEffects: { vulnerable: { active: false, timer: 0, multiplier: 1 } },
    scene: { events: { emit: (e, p) => emitted.push([e, p]) }, game: {} },
    _redrawHpBar() {}, _triggerHitFlash() {}, _clearHitFlash() {},
    ...overrides,
  };
  return { self, emitted };
}

describe('Enemy.takeDamage', () => {
  it('emits the floored band when armour eats the shot', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.brute);
    Enemy.prototype.takeDamage.call(self, 8, {
      source: { kind: 'tower', type: 'ice', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('floored');
  });

  it('emits none when the hit pierces', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.titan);
    Enemy.prototype.takeDamage.call(self, 80, {
      pierce: true,
      source: { kind: 'tower', type: 'sniper', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });

  it('bands the hit identically whether or not Vulnerable is active', () => {
    // The spec excludes vulnerableMult from the metric: it is a transient
    // status, and a panel/number that re-banded while a debuff ticked would be
    // unreadable. armourAbsorption takes no such parameter, and this pins it.
    const plain = fakeEnemy(ENEMY_DEFS.brute);
    const vuln  = fakeEnemy(ENEMY_DEFS.brute, {
      statusEffects: { vulnerable: { active: true, timer: 5, multiplier: 2 } },
    });
    const shot = { source: { kind: 'tower', type: 'ice', tier: 1, branch: null } };
    Enemy.prototype.takeDamage.call(plain.self, 8, shot);
    Enemy.prototype.takeDamage.call(vuln.self,  8, shot);
    const band = (r) => r.emitted.find(([e]) => e === 'damage-dealt')[1].absorbedBand;
    expect(band(vuln)).toBe(band(plain));
    expect(band(plain)).toBe('floored');
  });

  it('emits none against an unarmoured enemy', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.drone);
    Enemy.prototype.takeDamage.call(self, 15, {
      source: { kind: 'tower', type: 'archer', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });
});
```

`Enemy` is a **named** export (`export class Enemy extends ...` at `Enemy.js:12`),
not a default one — `import Enemy from` would silently bind `undefined`.

`takeDamage` also touches `this.scene.game?.registry?.get('audio')`; the `game: {}`
in the fixture makes that chain short-circuit to `undefined`, so no audio mock is
needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/Enemy.armourBand.test.js`
Expected: FAIL — `payload.absorbedBand` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/entities/Enemy.js`, add the import:

```js
import { armourAbsorption } from '../systems/armourLegibility.js';
```

In `takeDamage`, between the `computeDamage` call and the emit, compute the band
from the same inputs, and add one field to the existing payload:

```js
    // Both the raw amount and the armour that ate it are in hand here, so the
    // overlay can be told WHY a hit was small without a second event or a
    // second copy of the arithmetic.
    const { band } = armourAbsorption({
      amount, armor: this.armor, pierce: optsObj.pierce,
    });

    this.scene.events.emit('damage-dealt', {
      target: this,
      amount: dmg,
      isCrit: optsObj.isCrit ?? false,
      isAoe:  optsObj.isAoe  ?? false,
      abilityLabel: optsObj.abilityLabel ?? null,
      absorbedBand: band,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/Enemy.armourBand.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Enemy.js src/entities/Enemy.armourBand.test.js
git commit -m "feat(combat): carry the armour absorption band on damage-dealt"
```

---

### Task 6: Print absorbed hits in-world, throttled

**Files:**
- Modify: `src/systems/DamageNumberOverlay.js`
- Test: `src/systems/DamageNumberOverlay.test.js` (append)

**Interfaces:**
- Consumes: `absorbedBand` on the `damage-dealt` payload from Task 5.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing test**

Append to `src/systems/DamageNumberOverlay.test.js`:

```js
describe('absorbed hits', () => {
  it('prints a sub-threshold hit when armour absorbed it', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 10, y: 10 }, amount: 1, absorbedBand: 'floored' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('still hides a sub-threshold hit that armour did not absorb', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 10, y: 10 }, amount: 1, absorbedBand: 'none' });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('marks an absorbed number with the shield glyph', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 1, absorbedBand: 'floored' });
    expect(made[0].text).toBe('🛡1');
  });

  it('throttles repeat absorbed numbers on the same enemy', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('lets a different enemy through inside the same window', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 1, absorbedBand: 'floored' });
    scene.events.emit('damage-dealt', { target: { x: 5, y: 5 }, amount: 1, absorbedBand: 'floored' });
    expect(scene.add.text).toHaveBeenCalledTimes(2);
  });

  it('admits the same enemy again once the window has passed', () => {
    const scene = makeScene();
    const overlay = new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    let now = 1000;
    overlay._now = () => now;
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    now += 701;
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    expect(scene.add.text).toHaveBeenCalledTimes(2);
  });

  it('still prints when the absorbed hit is the killing blow', () => {
    // The overlay has never suppressed a killing blow; only the hit FLASH is
    // skipped on death (Enemy.js:131). Suppressing the number here would be a
    // new and inconsistent rule.
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', {
      target: { x: 0, y: 0, dead: true }, amount: 1, absorbedBand: 'floored',
    });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('does not throttle an ordinary big hit', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    scene.events.emit('damage-dealt', { target, amount: 50 });
    scene.events.emit('damage-dealt', { target, amount: 50 });
    expect(scene.add.text).toHaveBeenCalledTimes(2);
  });

  it('drops its throttle state on destroy', () => {
    const scene = makeScene();
    const overlay = new DamageNumberOverlay(scene);
    const before = overlay._absorbedAt;
    overlay.destroy();
    expect(overlay._absorbedAt).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/DamageNumberOverlay.test.js`
Expected: FAIL — the sub-threshold absorbed hit prints nothing.

- [ ] **Step 3: Write the implementation**

In `src/systems/DamageNumberOverlay.js`, add the style and the throttle constant:

```js
const POOL_SIZE = 24;
const THRESHOLD = 30;
// A floored tower fires continuously; without a per-enemy gate the screen
// carpets with 🛡1 and becomes less readable than the silence it replaced.
const ABSORBED_COOLDOWN_MS = 700;

const STYLES = {
  big:  { fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  crit: { fontSize: '22px', color: '#ffcc44', stroke: '#000000', strokeThickness: 3 },
  aoe:  { fontSize: '16px', color: '#ff9966', stroke: '#000000', strokeThickness: 2 },
  // Muted and small on purpose: this marks a hit that barely landed, and must
  // not read as a good one.
  absorbed: { fontSize: '13px', color: '#9aa4b0', stroke: '#000000', strokeThickness: 2 },
};
```

In the constructor, add the throttle store and an overridable clock:

```js
    this._absorbedAt = new WeakMap();
    this._now = () => Date.now();
```

In `destroy()`, drop the store:

```js
  destroy() {
    this._scene.events.off('damage-dealt', this._onHit);
    this._absorbedAt = new WeakMap();
  }
```

Rewrite the head of `_handle` (keep everything below the pool acquisition as-is
except the style/label selection):

```js
  _handle({ target, amount, isCrit = false, isAoe = false, abilityLabel = null, absorbedBand = 'none' }) {
    const absorbed = absorbedBand === 'heavy' || absorbedBand === 'floored';

    if (absorbed) {
      // Per-enemy gate. A WeakMap means a dead enemy needs no sweep to be
      // collected, so a long level cannot leak entries.
      const last = this._absorbedAt.get(target);
      const now  = this._now();
      if (last !== undefined && now - last < ABSORBED_COOLDOWN_MS) return;
      this._absorbedAt.set(target, now);
    } else if (!(isCrit || isAoe || amount >= THRESHOLD)) {
      return;
    }

    if (this._inUse.size >= POOL_SIZE && this._pool.length === 0) return;
```

Then in the style/label selection further down, prefer the absorbed presentation:

```js
    const style = absorbed ? STYLES.absorbed
                : isCrit  ? STYLES.crit
                : (isAoe  ? STYLES.aoe : STYLES.big);
    const label = absorbed ? `🛡${amount}`
                : isCrit   ? `CRIT ${amount}!`
                : (abilityLabel ? `${abilityLabel} ${amount}` : String(amount));
```

A crit or AoE that armour also absorbed is presented as absorbed — that is the
more surprising fact and the one the player is asking about.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/DamageNumberOverlay.test.js`
Expected: PASS, including every pre-existing case in the file.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/DamageNumberOverlay.js src/systems/DamageNumberOverlay.test.js
git commit -m "feat(gfx): print armour-absorbed hits the damage numbers used to hide"
```

---

## Verification (after all tasks, before the PR)

- [ ] `npm run test` — full suite green; report the actual file/test counts.
- [ ] `npm run build` — clean.
- [ ] `npm run balance` — output byte-identical to `origin/main`'s. Capture both and `diff` them. Any difference means a balance change leaked in and is a **stop**.
- [ ] Browser-verify against `npm run preview` (the production build, not the dev server — the dev server serves files the build drops):
  1. Ice T1 in range of a brute → `🛡1` prints in-world where nothing printed before, visibly distinct from a normal number.
  2. That tower's panel → armour line names Brute/Colossus/Titan; the Effective/Weak line above is unchanged.
  3. Sniper T1 panel → **no** armour line at all (it pierces).
  4. Barracks near a titan → line appears, labelled `(soldiers)`.
  5. Sustained floored stream → throttle holds the screen readable.
- [ ] Take a screenshot of the panel and of an in-world absorbed hit for the PR.
