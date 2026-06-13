# Phase 9c — Click-to-Inspect Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-peek + click-pin inspector panels for enemies and the hero, with a reverse-matrix view ("Vulnerable to / Resists") that makes 9b's weakness matrix legible from the enemy side.

**Architecture:** One new pure data helper (`describeEnemyMatchups`) and one new controller module (`InspectController`) keep all UI state out of `GameScene.js`. The controller owns three DOM panels (`#enemy-inspector`, `#hero-inspector`, `#inspect-peek`), reacts to `pointermove` and `pointerdown`, and is refreshed once per scene tick. GameScene wiring is ~20 lines: import + construct + click priority insertion + tick refresh + shutdown destroy.

**Tech Stack:** Vanilla JS ES modules, Vitest + jsdom (already devDep), DOM-driven UI in `index.html`. No new dependencies. **All DOM construction uses `createElement` + `textContent` + `appendChild` — no `innerHTML` anywhere, in production code OR in test fixtures.**

**Spec:** `docs/superpowers/specs/2026-05-28-phase-9c-click-inspect-design.md`
**Branch:** `feature/phase-9c-click-inspect` (off `origin/feature/phase-3-tower-system` at `ebc0512`)

---

## File Structure

**New files (2):**
- `src/scenes/InspectController.js` — controller class: hit-tests, peek/pin state, two panel renderers, refresh, ESC handler
- `src/scenes/InspectController.test.js` — jsdom unit tests

**Modified files (6):**
- `src/data/weaknessMatrix.js` — new export `describeEnemyMatchups(enemyType)`
- `src/data/weaknessMatrix.test.js` — new test block
- `src/data/enemies.js` — add `icon` field to each of the 6 entries
- `src/data/enemies.test.js` — assert non-empty icon per entry
- `src/entities/Hero.js` — export `HERO_STATS` const (attack damage/range/rate + ability unlock levels)
- `src/scenes/GameScene.js` — ~20 lines: import, construct, pointermove, click step 4 insert, refresh, shutdown destroy
- `index.html` — three new DOM elements + ~25 lines of CSS

**Total: ~250 lines of source + ~250 lines of tests + ~50 lines of HTML/CSS.**

---

## Task 1: `describeEnemyMatchups` reverse-matrix helper

**Files:**
- Modify: `src/data/weaknessMatrix.js`
- Modify: `src/data/weaknessMatrix.test.js`

The function iterates the 6 tower types + hero and classifies each by multiplier into `vulnerableTo` (≥1.25) or `resists` (≤0.75). Tier-4 overrides are intentionally NOT folded in — base-row only — per spec §3.1.

- [ ] **Step 1: Add failing tests**

Append to `src/data/weaknessMatrix.test.js`:

```js
import { describeEnemyMatchups } from './weaknessMatrix.js';

describe('describeEnemyMatchups', () => {
  it('drone → vulnerableTo [mage], resists [cannon]', () => {
    expect(describeEnemyMatchups('drone')).toEqual({ vulnerableTo: ['mage'], resists: ['cannon'] });
  });

  it('skitter → vulnerableTo [archer, barracks], resists [cannon, sniper]', () => {
    const r = describeEnemyMatchups('skitter');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'barracks']);
    expect(r.resists.sort()).toEqual(['cannon', 'sniper']);
  });

  it('brute → vulnerableTo [barracks, cannon, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('brute');
    expect(r.vulnerableTo.sort()).toEqual(['barracks', 'cannon', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });

  it('colossus → vulnerableTo [cannon, mage, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('colossus');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });

  it('phantom → vulnerableTo [archer, hero, mage], resists [barracks, cannon, sniper]', () => {
    const r = describeEnemyMatchups('phantom');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'hero', 'mage']);
    expect(r.resists.sort()).toEqual(['barracks', 'cannon', 'sniper']);
  });

  it('titan → vulnerableTo [cannon, mage, sniper], resists [archer, barracks, ice]', () => {
    const r = describeEnemyMatchups('titan');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer', 'barracks', 'ice']);
  });

  it('unknown enemy → empty arrays', () => {
    expect(describeEnemyMatchups('unknown')).toEqual({ vulnerableTo: [], resists: [] });
  });

  it('hero appears in phantom vulnerableTo (HERO_MULTIPLIERS phantom: 1.5)', () => {
    expect(describeEnemyMatchups('phantom').vulnerableTo).toContain('hero');
  });

  it('hero is NOT in any other enemy\'s vulnerableTo today', () => {
    for (const e of ['drone', 'skitter', 'brute', 'colossus', 'titan']) {
      expect(describeEnemyMatchups(e).vulnerableTo).not.toContain('hero');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: FAIL — `describeEnemyMatchups is not a function` (or import error).

- [ ] **Step 3: Add the helper**

Append to `src/data/weaknessMatrix.js`:

```js
const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks'];

export function describeEnemyMatchups(enemyType) {
  const vulnerableTo = [];
  const resists = [];
  for (const towerType of TOWER_TYPES) {
    const m = getWeaknessMultiplier({ kind: 'tower', type: towerType, tier: 1, branch: null }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(towerType);
    else if (m <= WEAK_THRESHOLD)  resists.push(towerType);
  }
  const heroMult = getWeaknessMultiplier({ kind: 'hero' }, enemyType);
  if (heroMult >= EFFECTIVE_THRESHOLD) vulnerableTo.push('hero');
  else if (heroMult <= WEAK_THRESHOLD)  resists.push('hero');
  return { vulnerableTo, resists };
}
```

Note: `EFFECTIVE_THRESHOLD` and `WEAK_THRESHOLD` are already defined in this file (from Task 2 of Phase 9b). `TOWER_TYPES` is a new module-private constant.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/data/weaknessMatrix.test.js`
Expected: all 9 new tests pass; previous tests still pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 263 prior tests + 9 new = 272, all green.

- [ ] **Step 6: Commit**

```bash
git add src/data/weaknessMatrix.js src/data/weaknessMatrix.test.js
git commit -m "feat(data): describeEnemyMatchups reverse-matrix lookup"
```

---

## Task 2: Add `icon` field to `ENEMY_DEFS`

**Files:**
- Modify: `src/data/enemies.js`
- Modify: `src/data/enemies.test.js`

- [ ] **Step 1: Add failing test**

Append to `src/data/enemies.test.js`:

```js
describe('ENEMY_DEFS icon field', () => {
  it('every enemy def has a non-empty icon string', () => {
    for (const [type, def] of Object.entries(ENEMY_DEFS)) {
      expect(typeof def.icon).toBe('string');
      expect(def.icon.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/enemies.test.js`
Expected: FAIL — `typeof undefined !== 'string'` for all 6 entries.

- [ ] **Step 3: Add icons to enemies.js**

Replace `src/data/enemies.js` entirely with:

```js
export const ENEMY_DEFS = {
  drone:    { type: 'drone',    name: 'Veth Drone',    icon: '🤖', hp: 70,  speed: 50,  reward: 14, armor: 0,  color: 0x33ff66, radius: 9,  flying: false },
  skitter:  { type: 'skitter',  name: 'Veth Skitter',  icon: '🪲', hp: 40,  speed: 90,  reward: 15, armor: 0,  color: 0xff6600, radius: 7,  flying: false },
  brute:    { type: 'brute',    name: 'Veth Brute',    icon: '🦏', hp: 120, speed: 38,  reward: 22, armor: 8,  color: 0x667766, radius: 11, flying: false },
  colossus: { type: 'colossus', name: 'Veth Colossus', icon: '🦖', hp: 400, speed: 28,  reward: 55, armor: 15, color: 0x880044, radius: 16, flying: false },
  phantom:  { type: 'phantom',  name: 'Veth Phantom',  icon: '👻', hp: 60,  speed: 140, reward: 12, armor: 0,  color: 0x9b59b6, radius: 9,  flying: true  },
  titan:    { type: 'titan',    name: 'Veth Titan',    icon: '👹', hp: 800, speed: 28,  reward: 80, armor: 20, color: 0xe74c3c, radius: 22, flying: false },
};
```

(The only change is adding an `icon` field to each entry. All other fields and their values are preserved verbatim.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/data/enemies.test.js`
Expected: new test passes; existing field-presence + key-matching tests still pass.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 272 + 1 = 273 tests, all green.

- [ ] **Step 6: Commit**

```bash
git add src/data/enemies.js src/data/enemies.test.js
git commit -m "feat(data): add icon field to ENEMY_DEFS"
```

---

## Task 3: Export `HERO_STATS` from `Hero.js`

**File:**
- Modify: `src/entities/Hero.js`

The inspector needs `ATTACK_DAMAGE`, `ATTACK_RANGE`, ability unlock levels, and `MAX_LEVEL`. These are currently module-private constants. Export them as a single `HERO_STATS` object so the inspector imports one name.

- [ ] **Step 1: Add the export to Hero.js**

Find the existing constants block near the top of `src/entities/Hero.js` (lines 4-8 today):

```js
const MOVE_SPEED     = 130;
const MOVE_STOP_DIST = 8;
const ATTACK_RANGE   = 40;
const ATTACK_RATE    = 1.5;
const ATTACK_DAMAGE  = 18;
```

Immediately after these lines (before `export class Hero`), add:

```js
export const HERO_STATS = {
  attackDamage: ATTACK_DAMAGE,
  attackRange:  ATTACK_RANGE,
  attackRate:   ATTACK_RATE,
  maxLevel:     3,
  abilityUnlockLevels: { q: 1, w: 2, e: 3 },
};
```

(Adds a single new export. Existing constants stay module-private and remain used internally by the class — no other changes.)

- [ ] **Step 2: Verify no test regressions**

Run: `npm test`
Expected: 273 tests still pass. (Hero.test.js doesn't reference these constants directly, so no test changes needed.)

- [ ] **Step 3: Commit**

```bash
git add src/entities/Hero.js
git commit -m "feat(hero): export HERO_STATS for inspector consumption"
```

---

## Task 4: HTML + CSS scaffolding

**File:**
- Modify: `index.html`

Adds the three new DOM elements (`#enemy-inspector`, `#hero-inspector`, `#inspect-peek`) and CSS rules used by `InspectController` in Tasks 5-7.

- [ ] **Step 1: Add CSS rules**

Open `index.html`. Find a stable anchor — the existing `#tower-panel` CSS block (search for `#tower-panel { position: absolute` — currently around line 46). After the last `#tower-panel` rule (just before the next selector block), add:

```css
    .inspector-panel { position: absolute; background: #0f0f1e; border: 2px solid #8b6914;
                       border-radius: 6px; padding: 8px 10px; font-size: 11px; color: #ddd;
                       min-width: 200px; max-width: 260px; z-index: 40; }
    .inspector-header { display: flex; justify-content: space-between; align-items: center;
                        margin-bottom: 6px; }
    .inspector-name { font-weight: bold; color: #ffd700; }
    .inspector-close { background: none; border: none; color: #aaa; cursor: pointer;
                       font-size: 14px; padding: 0 4px; }
    .inspector-close:hover { color: #fff; }
    .inspector-hpbar { background: #222; height: 8px; border-radius: 2px; overflow: hidden;
                       margin-bottom: 2px; }
    .inspector-hpfill { background: #6f6; height: 100%; transition: width 0.1s linear; }
    .inspector-hp-label { font-size: 10px; color: #888; margin-bottom: 5px; }
    .inspector-stat { font-size: 11px; color: #aaa; margin: 2px 0; }
    .inspector-stat .ei-status-active { color: #6cf; }
    .inspector-matchups { margin-top: 5px; font-size: 10px; line-height: 1.4; }
    .inspector-matchups .mu-good { display: block; color: #6f6; }
    .inspector-matchups .mu-bad  { display: block; color: #f88; }
    .inspector-abilities .ab-line { display: flex; justify-content: space-between;
                                    margin: 1px 0; }
    .inspector-abilities .ab-line.locked { color: #555; }
    #inspect-peek { position: absolute; display: none; z-index: 45; pointer-events: none;
                    background: #0f0f1e; border: 1px solid #8b6914; border-radius: 4px;
                    padding: 5px 7px; font-size: 10px; color: #ddd; white-space: nowrap;
                    max-width: 220px; }
    #inspect-peek strong { display: block; color: #ffd700; margin-bottom: 2px; }
```

- [ ] **Step 2: Add the three DOM elements**

Find the closing `</body>` tag in `index.html`. Just before it (after the last existing `<div>` or `<script>` block, but before `</body>`), add the three panel elements:

```html
    <div id="enemy-inspector" class="inspector-panel" style="display:none">
      <div class="inspector-header">
        <span class="inspector-name" id="ei-name">Enemy</span>
        <button class="inspector-close" id="ei-close">✕</button>
      </div>
      <div class="inspector-hpbar"><div class="inspector-hpfill" id="ei-hpfill"></div></div>
      <div class="inspector-hp-label" id="ei-hp-label">- / -</div>
      <div class="inspector-stat" id="ei-stats">Speed: - · Armor: -</div>
      <div class="inspector-stat" id="ei-meta">Reward: - · Ground</div>
      <div class="inspector-stat" id="ei-status">Status: —</div>
      <div class="inspector-matchups" id="ei-matchups"></div>
    </div>

    <div id="hero-inspector" class="inspector-panel" style="display:none">
      <div class="inspector-header">
        <span class="inspector-name">🛡️ Commander Rael</span>
        <button class="inspector-close" id="hi-close">✕</button>
      </div>
      <div class="inspector-hpbar"><div class="inspector-hpfill" id="hi-hpfill"></div></div>
      <div class="inspector-hp-label" id="hi-hp-label">- / -</div>
      <div class="inspector-stat" id="hi-level">Level: -</div>
      <div class="inspector-stat" id="hi-attack">Attack: - dmg @ - range</div>
      <div class="inspector-abilities" id="hi-abilities"></div>
      <div class="inspector-matchups" id="hi-matchups"></div>
    </div>

    <div id="inspect-peek" style="display:none"></div>
```

If the closing `</body>` tag is preceded by a `<script type="module">` block, place the new divs BEFORE that script (anywhere among the other body-level elements).

- [ ] **Step 3: Verify build is clean**

Run: `npm run build`
Expected: Vite build completes without errors.

Also run: `npm test`
Expected: 273 tests still pass (HTML changes don't affect tests).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "chore(html): inspector panel + peek tooltip scaffolding"
```

---

## Task 5: `InspectController` skeleton — constructor, pin/dismiss/toggle, ESC, hit-tests, tryClickInspect

**Files:**
- Create: `src/scenes/InspectController.js`
- Create: `src/scenes/InspectController.test.js`

This task creates the controller with state management, hit-testing, click consumption, ESC handler, and destroy. The render methods are STUBBED (just toggle display) — Task 6 fills them in. The peek methods are STUBBED too — Task 7 fills them in.

The test fixture builds its DOM with `createElement` + `appendChild` (matching the pattern in `src/ui/SettingsOverlay.test.js`) — no `innerHTML` in test fixtures.

- [ ] **Step 1: Write failing tests**

Create `src/scenes/InspectController.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InspectController } from './InspectController.js';

// Build the inspector DOM scaffolding (createElement/appendChild — no innerHTML).
function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);

  // Helper for creating a child with id (and optional class).
  const mk = (tag, id, className) => {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (className) el.className = className;
    return el;
  };

  // #enemy-inspector
  const ei = mk('div', 'enemy-inspector');
  ei.style.display = 'none';
  ei.appendChild(mk('span', 'ei-name'));
  ei.appendChild(mk('button', 'ei-close'));
  ei.appendChild(mk('div', 'ei-hpfill'));
  ei.appendChild(mk('div', 'ei-hp-label'));
  ei.appendChild(mk('div', 'ei-stats'));
  ei.appendChild(mk('div', 'ei-meta'));
  ei.appendChild(mk('div', 'ei-status'));
  ei.appendChild(mk('div', 'ei-matchups'));
  document.body.appendChild(ei);

  // #hero-inspector
  const hi = mk('div', 'hero-inspector');
  hi.style.display = 'none';
  hi.appendChild(mk('button', 'hi-close'));
  hi.appendChild(mk('div', 'hi-hpfill'));
  hi.appendChild(mk('div', 'hi-hp-label'));
  hi.appendChild(mk('div', 'hi-level'));
  hi.appendChild(mk('div', 'hi-attack'));
  hi.appendChild(mk('div', 'hi-abilities'));
  hi.appendChild(mk('div', 'hi-matchups'));
  document.body.appendChild(hi);

  // #inspect-peek
  const peek = mk('div', 'inspect-peek');
  peek.style.display = 'none';
  document.body.appendChild(peek);
}

const makeEnemy = (overrides = {}) => ({
  x: 100, y: 100, hp: 80, maxHp: 120, dead: false,
  def: { type: 'brute', name: 'Veth Brute', icon: '🦏', hp: 120, speed: 38,
         armor: 8, reward: 22, flying: false, radius: 11 },
  statusEffects: { slow: { active: false, timer: 0, factor: 1 }, stun: { active: false, timer: 0 } },
  ...overrides,
});

const makeHero = (overrides = {}) => ({
  x: 50, y: 50, hp: 150, maxHp: 200, level: 2, killCount: 47, dead: false,
  overchargeTimer: 0, airstrikeTimer: 12, empTimer: 0, respawnTimer: 0,
  ...overrides,
});

const makeScene = (enemies = [], hero = null) => ({ enemies, hero });

describe('InspectController — construction + state', () => {
  beforeEach(setupDom);

  it('constructs with pinned=null and peekTarget=null', () => {
    const ctrl = new InspectController(makeScene());
    expect(ctrl.pinned).toBeNull();
    expect(ctrl.peekTarget).toBeNull();
  });
});

describe('InspectController — pin/dismiss', () => {
  beforeEach(setupDom);

  it('pin opens enemy inspector and stores target', () => {
    const ctrl = new InspectController(makeScene());
    const enemy = makeEnemy();
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(ctrl.pinned).toEqual({ kind: 'enemy', target: enemy });
    expect(document.getElementById('enemy-inspector').style.display).not.toBe('none');
  });

  it('pin opens hero inspector for hero kind', () => {
    const ctrl = new InspectController(makeScene());
    const hero = makeHero();
    ctrl.pin({ kind: 'hero', target: hero });
    expect(ctrl.pinned.kind).toBe('hero');
    expect(document.getElementById('hero-inspector').style.display).not.toBe('none');
  });

  it('clicking same target toggles closed', () => {
    const ctrl = new InspectController(makeScene());
    const enemy = makeEnemy();
    ctrl.pin({ kind: 'enemy', target: enemy });
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(ctrl.pinned).toBeNull();
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
  });

  it('switching to a different target replaces the pin', () => {
    const ctrl = new InspectController(makeScene());
    const a = makeEnemy({ x: 100 });
    const b = makeEnemy({ x: 200 });
    ctrl.pin({ kind: 'enemy', target: a });
    ctrl.pin({ kind: 'enemy', target: b });
    expect(ctrl.pinned.target).toBe(b);
    expect(document.getElementById('enemy-inspector').style.display).not.toBe('none');
  });

  it('switching kinds (enemy → hero) hides enemy panel and shows hero panel', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    ctrl.pin({ kind: 'hero', target: makeHero() });
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
    expect(document.getElementById('hero-inspector').style.display).not.toBe('none');
  });

  it('dismiss hides both panels and clears state', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    ctrl.dismiss();
    expect(ctrl.pinned).toBeNull();
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
    expect(document.getElementById('hero-inspector').style.display).toBe('none');
  });

  it('close button on enemy inspector dismisses', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    document.getElementById('ei-close').click();
    expect(ctrl.pinned).toBeNull();
  });

  it('close button on hero inspector dismisses', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    document.getElementById('hi-close').click();
    expect(ctrl.pinned).toBeNull();
  });
});

describe('InspectController — ESC key', () => {
  let ctrl;
  beforeEach(() => { setupDom(); ctrl = new InspectController(makeScene()); });
  afterEach(() => { ctrl.destroy(); });

  it('ESC dismisses a pinned panel', () => {
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).toBeNull();
  });

  it('ESC with no panel open is a no-op', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).toBeNull();
  });

  it('destroy removes the ESC listener', () => {
    ctrl.destroy();
    ctrl.pinned = { kind: 'enemy', target: makeEnemy() };  // bypass for test
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).not.toBeNull(); // listener removed, state unchanged
  });
});

describe('InspectController — hit-tests', () => {
  beforeEach(setupDom);

  it('_hitTestEnemy returns enemy within radius+4 slop', () => {
    const enemy = makeEnemy();  // x:100 y:100 radius:11
    const ctrl = new InspectController(makeScene([enemy]));
    expect(ctrl._hitTestEnemy(100, 100)).toBe(enemy);
    expect(ctrl._hitTestEnemy(114, 100)).toBe(enemy);  // dist 14 = radius+slop boundary
    expect(ctrl._hitTestEnemy(120, 100)).toBeNull();   // dist 20 > 11+4
  });

  it('_hitTestEnemy returns null when no enemies', () => {
    const ctrl = new InspectController(makeScene([]));
    expect(ctrl._hitTestEnemy(100, 100)).toBeNull();
  });

  it('_hitTestEnemy skips dead enemies', () => {
    const dead = makeEnemy({ dead: true });
    const ctrl = new InspectController(makeScene([dead]));
    expect(ctrl._hitTestEnemy(100, 100)).toBeNull();
  });

  it('_hitTestHero returns true within 18px of hero', () => {
    const hero = makeHero();  // x:50 y:50
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl._hitTestHero(50, 50)).toBe(true);
    expect(ctrl._hitTestHero(67, 50)).toBe(true);   // dist 17
    expect(ctrl._hitTestHero(70, 50)).toBe(false);  // dist 20 > 18
  });

  it('_hitTestHero returns false when scene.hero is null', () => {
    const ctrl = new InspectController(makeScene([], null));
    expect(ctrl._hitTestHero(50, 50)).toBe(false);
  });

  it('_hitTestHero returns false when hero is dead', () => {
    const hero = makeHero({ dead: true });
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl._hitTestHero(50, 50)).toBe(false);
  });
});

describe('InspectController — tryClickInspect', () => {
  beforeEach(setupDom);

  it('returns false for empty space', () => {
    const ctrl = new InspectController(makeScene([], makeHero()));
    expect(ctrl.tryClickInspect(500, 500)).toBe(false);
    expect(ctrl.pinned).toBeNull();
  });

  it('hits enemy and pins enemy panel', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    expect(ctrl.tryClickInspect(100, 100)).toBe(true);
    expect(ctrl.pinned.kind).toBe('enemy');
    expect(ctrl.pinned.target).toBe(enemy);
  });

  it('hits hero when no enemy is under cursor', () => {
    const hero = makeHero();
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl.tryClickInspect(50, 50)).toBe(true);
    expect(ctrl.pinned.kind).toBe('hero');
  });

  it('enemy takes priority over hero on overlap', () => {
    const enemy = makeEnemy({ x: 50, y: 50 });
    const hero  = makeHero({ x: 50, y: 50 });
    const ctrl = new InspectController(makeScene([enemy], hero));
    ctrl.tryClickInspect(50, 50);
    expect(ctrl.pinned.kind).toBe('enemy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the controller skeleton**

Create `src/scenes/InspectController.js`:

```js
export class InspectController {
  constructor(scene) {
    this.scene = scene;
    this.pinned = null;       // { kind: 'enemy'|'hero', target } | null
    this.peekTarget = null;

    document.getElementById('ei-close').addEventListener('click', () => this.dismiss());
    document.getElementById('hi-close').addEventListener('click', () => this.dismiss());

    this._onKeyDown = (e) => { if (e.key === 'Escape') this.dismiss(); };
    window.addEventListener('keydown', this._onKeyDown);
  }

  // Called by GameScene._onPointerDown. Returns true if click was consumed.
  tryClickInspect(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) { this.pin({ kind: 'enemy', target: enemy }); return true; }
    if (this._hitTestHero(mx, my)) {
      this.pin({ kind: 'hero', target: this.scene.hero });
      return true;
    }
    return false;
  }

  // Hover handler — STUB; populated in Task 7.
  onPointerMove(_mx, _my) {
    // Task 7 will implement peek display.
  }

  // Per-tick refresh — STUB; populated in Task 6.
  refresh() {
    // Task 6 will implement auto-dismiss + live HP/cooldown updates.
  }

  pin(spec) {
    if (this.pinned && this.pinned.target === spec.target) {
      this.dismiss();
      return;
    }
    this.pinned = spec;
    this._showPanel(spec.kind);
  }

  dismiss() {
    this.pinned = null;
    document.getElementById('enemy-inspector').style.display = 'none';
    document.getElementById('hero-inspector').style.display = 'none';
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _hitTestEnemy(mx, my) {
    for (const e of this.scene.enemies) {
      if (e.dead) continue;
      const r = (e.def?.radius ?? 0) + 4;
      if (Math.hypot(e.x - mx, e.y - my) <= r) return e;
    }
    return null;
  }

  _hitTestHero(mx, my) {
    const h = this.scene.hero;
    if (!h || h.dead) return false;
    return Math.hypot(h.x - mx, h.y - my) <= 18;
  }

  _showPanel(kind) {
    if (kind === 'enemy') {
      document.getElementById('enemy-inspector').style.display = 'block';
      document.getElementById('hero-inspector').style.display = 'none';
    } else {
      document.getElementById('hero-inspector').style.display = 'block';
      document.getElementById('enemy-inspector').style.display = 'none';
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: all ~21 tests pass.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 273 + ~21 = ~294 tests, all green.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/InspectController.js src/scenes/InspectController.test.js
git commit -m "feat(scenes): InspectController skeleton (pin, hit-tests, ESC)"
```

---

## Task 6: `InspectController` — panel rendering + refresh

**Files:**
- Modify: `src/scenes/InspectController.js`
- Modify: `src/scenes/InspectController.test.js`

This task fills in `_renderEnemyPanel`, `_renderHeroPanel`, and `refresh()`. After this task, pinned panels show real content and update live each tick.

- [ ] **Step 1: Add failing tests**

Append to `src/scenes/InspectController.test.js`:

```js
describe('InspectController — enemy panel rendering', () => {
  beforeEach(setupDom);

  it('pin renders icon + name in header', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    expect(document.getElementById('ei-name').textContent).toContain('🦏');
    expect(document.getElementById('ei-name').textContent).toContain('Veth Brute');
  });

  it('pin renders HP bar label', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    expect(document.getElementById('ei-hp-label').textContent).toBe('80 / 120');
  });

  it('pin renders speed and armor', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    expect(document.getElementById('ei-stats').textContent).toContain('Speed: 38');
    expect(document.getElementById('ei-stats').textContent).toContain('Armor: 8');
  });

  it('pin renders reward + Ground/Flying meta', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    expect(document.getElementById('ei-meta').textContent).toContain('22g');
    expect(document.getElementById('ei-meta').textContent).toContain('Ground');
  });

  it('flying enemy meta shows Flying', () => {
    const phantom = makeEnemy({ def: { type: 'phantom', name: 'Veth Phantom', icon: '👻',
                                       hp: 60, speed: 140, armor: 0, reward: 12,
                                       flying: true, radius: 9 } });
    phantom.maxHp = 60; phantom.hp = 60;
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: phantom });
    expect(document.getElementById('ei-meta').textContent).toContain('Flying');
  });

  it('status with no active effects renders em-dash', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    expect(document.getElementById('ei-status').textContent).toContain('—');
  });

  it('status with active slow renders slow + remaining seconds', () => {
    const enemy = makeEnemy();
    enemy.statusEffects.slow = { active: true, timer: 1.4, factor: 0.5 };
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(document.getElementById('ei-status').textContent.toLowerCase()).toContain('slow');
  });

  it('status with active stun renders stun', () => {
    const enemy = makeEnemy();
    enemy.statusEffects.stun = { active: true, timer: 2 };
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(document.getElementById('ei-status').textContent.toLowerCase()).toContain('stun');
  });

  it('matchups: brute → Vulnerable to includes Cannon and Sniper', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });   // brute
    const text = document.getElementById('ei-matchups').textContent;
    expect(text).toContain('Vulnerable to');
    expect(text).toContain('Cannon');
    expect(text).toContain('Sniper');
    expect(text).toContain('Resists');
    expect(text).toContain('Archer');
  });

  it('matchups render for drone (Mage vulnerable, Cannon resists)', () => {
    const drone = makeEnemy({ def: { type: 'drone', name: 'Veth Drone', icon: '🤖',
                                     hp: 70, speed: 50, armor: 0, reward: 14,
                                     flying: false, radius: 9 } });
    drone.maxHp = 70; drone.hp = 70;
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: drone });
    const text = document.getElementById('ei-matchups').textContent;
    expect(text).toContain('Vulnerable to');
    expect(text).toContain('Mage');
    expect(text).toContain('Resists');
    expect(text).toContain('Cannon');
  });
});

describe('InspectController — hero panel rendering', () => {
  beforeEach(setupDom);

  it('pin renders HP label', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    expect(document.getElementById('hi-hp-label').textContent).toBe('150 / 200');
  });

  it('pin renders level and kills', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    expect(document.getElementById('hi-level').textContent).toContain('Level: 2');
    expect(document.getElementById('hi-level').textContent).toContain('Kills: 47');
  });

  it('pin renders attack stats from HERO_STATS', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    const text = document.getElementById('hi-attack').textContent;
    expect(text).toContain('18');   // ATTACK_DAMAGE
    expect(text).toContain('40');   // ATTACK_RANGE
  });

  it('Q ability (overcharge) shows "ready" when timer is 0', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    const text = document.getElementById('hi-abilities').textContent;
    expect(text).toContain('Overcharge');
    expect(text.toLowerCase()).toContain('ready');
  });

  it('W ability (airstrike) shows cooldown when timer > 0', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });   // airstrikeTimer: 12
    expect(document.getElementById('hi-abilities').textContent).toContain('12');
  });

  it('E ability locked at hero level 2', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });   // level: 2
    const text = document.getElementById('hi-abilities').textContent;
    expect(text).toContain('🔒');
  });

  it('W ability locked at hero level 1', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero({ level: 1 }) });
    // Both W and E should be locked
    const lockedCount = (document.getElementById('hi-abilities').textContent.match(/🔒/g) || []).length;
    expect(lockedCount).toBe(2);
  });

  it('matchups shows Phantom 1.5×', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    const text = document.getElementById('hi-matchups').textContent;
    expect(text).toContain('Phantom');
    expect(text).toContain('1.5');
  });

  it('dead hero shows respawn timer in place of abilities', () => {
    const hero = makeHero({ dead: true, respawnTimer: 4.2 });
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: hero });
    expect(document.getElementById('hi-abilities').textContent.toLowerCase()).toContain('respawn');
    expect(document.getElementById('hi-abilities').textContent).toContain('5');  // ceil(4.2)
  });
});

describe('InspectController — refresh', () => {
  beforeEach(setupDom);

  it('refresh no-ops when nothing is pinned', () => {
    const ctrl = new InspectController(makeScene());
    expect(() => ctrl.refresh()).not.toThrow();
  });

  it('refresh updates HP label as enemy takes damage', () => {
    const enemy = makeEnemy();
    const scene = makeScene([enemy]);
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'enemy', target: enemy });
    enemy.hp = 50;
    ctrl.refresh();
    expect(document.getElementById('ei-hp-label').textContent).toBe('50 / 120');
  });

  it('refresh dismisses when inspected enemy is marked dead', () => {
    const enemy = makeEnemy();
    const scene = makeScene([enemy]);
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'enemy', target: enemy });
    enemy.dead = true;
    ctrl.refresh();
    expect(ctrl.pinned).toBeNull();
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
  });

  it('refresh dismisses when inspected enemy is removed from scene.enemies', () => {
    const enemy = makeEnemy();
    const scene = makeScene([enemy]);
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'enemy', target: enemy });
    scene.enemies = [];   // filtered out by _updateEnemies
    ctrl.refresh();
    expect(ctrl.pinned).toBeNull();
  });

  it('refresh updates hero ability cooldown as it ticks down', () => {
    const hero = makeHero({ airstrikeTimer: 12 });
    const scene = makeScene([], hero);
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'hero', target: hero });
    hero.airstrikeTimer = 5;
    ctrl.refresh();
    expect(document.getElementById('hi-abilities').textContent).toContain('5');
  });

  it('refresh does NOT dismiss hero when hero is dead (hero panel persists during respawn)', () => {
    const hero = makeHero({ dead: true, respawnTimer: 3 });
    const scene = makeScene([], hero);
    const ctrl = new InspectController(scene);
    ctrl.pin({ kind: 'hero', target: hero });
    ctrl.refresh();
    expect(ctrl.pinned).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: the new rendering + refresh tests FAIL — HP label is empty, name is empty, refresh doesn't do anything yet.

- [ ] **Step 3: Add imports to InspectController.js**

At the top of `src/scenes/InspectController.js`, add:

```js
import { getWeaknessMultiplier, describeEnemyMatchups, HERO_MULTIPLIERS } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_STATS } from '../entities/Hero.js';
```

- [ ] **Step 4: Replace stub `refresh()` with real implementation**

In `src/scenes/InspectController.js`, find the `refresh()` method (currently a stub) and replace it with:

```js
  refresh() {
    if (!this.pinned) return;
    if (this.pinned.kind === 'enemy') {
      const e = this.pinned.target;
      if (e.dead || !this.scene.enemies.includes(e)) {
        this.dismiss();
        return;
      }
      this._renderEnemyPanel(e);
    } else if (this.pinned.kind === 'hero') {
      this._renderHeroPanel(this.pinned.target);
    }
  }
```

- [ ] **Step 5: Update `pin()` to render content on open**

In `src/scenes/InspectController.js`, replace the existing `pin()` method:

```js
  pin(spec) {
    if (this.pinned && this.pinned.target === spec.target) {
      this.dismiss();
      return;
    }
    this.pinned = spec;
    this._showPanel(spec.kind);
    if (spec.kind === 'enemy') this._renderEnemyPanel(spec.target);
    else                       this._renderHeroPanel(spec.target);
  }
```

- [ ] **Step 6: Add render helpers**

Append the following private methods to the `InspectController` class (after `_showPanel`):

```js
  _renderEnemyPanel(enemy) {
    const def = enemy.def;
    const icon = def.icon ?? '?';
    document.getElementById('ei-name').textContent = `${icon} ${def.name}`;

    const hpfill = document.getElementById('ei-hpfill');
    hpfill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
    document.getElementById('ei-hp-label').textContent = `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;

    document.getElementById('ei-stats').textContent = `Speed: ${def.speed} · Armor: ${def.armor}`;
    document.getElementById('ei-meta').textContent  = `Reward: ${def.reward}g · ${def.flying ? 'Flying' : 'Ground'}`;
    document.getElementById('ei-status').textContent = `Status: ${this._statusText(enemy)}`;

    this._renderEnemyMatchups(def.type);
  }

  _statusText(enemy) {
    const parts = [];
    const slow = enemy.statusEffects?.slow;
    const stun = enemy.statusEffects?.stun;
    if (slow?.active) parts.push(`❄ slowed (${slow.timer.toFixed(1)}s)`);
    if (stun?.active) parts.push(`⚡ stunned (${stun.timer.toFixed(1)}s)`);
    return parts.length ? parts.join(', ') : '—';
  }

  _renderEnemyMatchups(enemyType) {
    const el = document.getElementById('ei-matchups');
    el.replaceChildren();
    const { vulnerableTo, resists } = describeEnemyMatchups(enemyType);
    const displayName = (type) =>
      type === 'hero' ? 'Hero' : (TOWER_DEFS[type]?.name ?? type);
    if (vulnerableTo.length) {
      const line = document.createElement('span');
      line.className = 'mu-good';
      line.textContent = `Vulnerable to: ${vulnerableTo.map(displayName).join(', ')}`;
      el.appendChild(line);
    }
    if (resists.length) {
      const line = document.createElement('span');
      line.className = 'mu-bad';
      line.textContent = `Resists: ${resists.map(displayName).join(', ')}`;
      el.appendChild(line);
    }
  }

  _renderHeroPanel(hero) {
    const hpfill = document.getElementById('hi-hpfill');
    hpfill.style.width = `${Math.max(0, (hero.hp / hero.maxHp) * 100)}%`;
    document.getElementById('hi-hp-label').textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;

    document.getElementById('hi-level').textContent = `Level: ${hero.level} / ${HERO_STATS.maxLevel} · Kills: ${hero.killCount}`;
    document.getElementById('hi-attack').textContent = `Attack: ${HERO_STATS.attackDamage} dmg @ ${HERO_STATS.attackRange} range`;

    this._renderHeroAbilities(hero);
    this._renderHeroMatchups();
  }

  _renderHeroAbilities(hero) {
    const el = document.getElementById('hi-abilities');
    el.replaceChildren();

    if (hero.dead) {
      const respawn = document.createElement('div');
      respawn.className = 'ab-line';
      respawn.textContent = `Respawning ${Math.ceil(hero.respawnTimer)}s`;
      el.appendChild(respawn);
      return;
    }

    const abilities = [
      { slot: 'q', label: 'Q Overcharge', timer: hero.overchargeTimer, unlockLvl: HERO_STATS.abilityUnlockLevels.q },
      { slot: 'w', label: 'W Airstrike',  timer: hero.airstrikeTimer,  unlockLvl: HERO_STATS.abilityUnlockLevels.w },
      { slot: 'e', label: 'E EMP Pulse',  timer: hero.empTimer,        unlockLvl: HERO_STATS.abilityUnlockLevels.e },
    ];

    for (const ab of abilities) {
      const line = document.createElement('div');
      line.className = 'ab-line';
      const name = document.createElement('span');
      name.textContent = ab.label;
      const state = document.createElement('span');
      if (hero.level < ab.unlockLvl) {
        line.classList.add('locked');
        state.textContent = `🔒 (lvl ${ab.unlockLvl})`;
      } else if (ab.timer > 0) {
        state.textContent = `${Math.ceil(ab.timer)}s`;
      } else {
        state.textContent = 'ready';
      }
      line.appendChild(name);
      line.appendChild(state);
      el.appendChild(line);
    }
  }

  _renderHeroMatchups() {
    const el = document.getElementById('hi-matchups');
    el.replaceChildren();
    for (const [enemyType, mult] of Object.entries(HERO_MULTIPLIERS)) {
      if (mult === 1.0) continue;
      const line = document.createElement('span');
      line.className = mult >= 1 ? 'mu-good' : 'mu-bad';
      const enemyName = (ENEMY_DEFS[enemyType]?.name ?? enemyType).replace(/^Veth\s+/, '');
      line.textContent = `${mult}× vs ${enemyName}`;
      el.appendChild(line);
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: all new rendering + refresh tests pass; Task 5's skeleton tests still pass.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: ~294 + ~22 = ~316 tests, all green.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/InspectController.js src/scenes/InspectController.test.js
git commit -m "feat(scenes): InspectController panel rendering + live refresh"
```

---

## Task 7: `InspectController` — peek tooltip + panel positioning

**Files:**
- Modify: `src/scenes/InspectController.js`
- Modify: `src/scenes/InspectController.test.js`

This task fills in `onPointerMove`, `_showPeek`, `_hidePeek`, and `_positionPanel`. After this, hover shows the transient tooltip and pinned panels are anchored intelligently (with flip-on-overflow).

- [ ] **Step 1: Add failing tests**

Append to `src/scenes/InspectController.test.js`:

```js
describe('InspectController — peek tooltip', () => {
  beforeEach(setupDom);

  it('onPointerMove over empty space hides peek', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.onPointerMove(500, 500);
    expect(document.getElementById('inspect-peek').style.display).toBe('none');
  });

  it('onPointerMove over enemy shows peek with name + HP', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    ctrl.onPointerMove(100, 100);
    const peek = document.getElementById('inspect-peek');
    expect(peek.style.display).toBe('block');
    expect(peek.textContent).toContain('Veth Brute');
    expect(peek.textContent).toContain('80');
    expect(peek.textContent).toContain('120');
  });

  it('peek hides when mouse moves off enemy', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    ctrl.onPointerMove(100, 100);
    ctrl.onPointerMove(500, 500);
    expect(document.getElementById('inspect-peek').style.display).toBe('none');
  });

  it('peek over hero shows hero info', () => {
    const hero = makeHero();
    const ctrl = new InspectController(makeScene([], hero));
    ctrl.onPointerMove(50, 50);
    const peek = document.getElementById('inspect-peek');
    expect(peek.style.display).toBe('block');
    expect(peek.textContent).toContain('Commander Rael');
  });

  it('peek shows shortened matchup hint for brute (Cannon weakness)', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    ctrl.onPointerMove(100, 100);
    const text = document.getElementById('inspect-peek').textContent;
    // brute: vulnerableTo: [barracks, cannon, sniper], resists: [archer]
    // The peek shows only the FIRST entry of each (sorted alphabetically by describeEnemyMatchups).
    expect(text).toContain('Barracks');  // first in sorted vulnerableTo
    expect(text).toContain('Archer');    // first (and only) in resists
  });

  it('pin hides any open peek', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    ctrl.onPointerMove(100, 100);
    expect(document.getElementById('inspect-peek').style.display).toBe('block');
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(document.getElementById('inspect-peek').style.display).toBe('none');
  });
});

describe('InspectController — panel positioning', () => {
  beforeEach(setupDom);

  it('_positionPanel sets left and top pixels relative to target', () => {
    const ctrl = new InspectController(makeScene());
    const el = document.createElement('div');
    document.body.appendChild(el);
    ctrl._positionPanel(el, 200, 300);
    // Default anchor: target.x + 24, target.y - 60 (clipped to 0+)
    expect(el.style.left).toBe('224px');
    expect(parseInt(el.style.top, 10)).toBe(240);
  });

  it('pin positions enemy inspector near the target', () => {
    const enemy = makeEnemy({ x: 200, y: 300 });
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: enemy });
    const panel = document.getElementById('enemy-inspector');
    expect(panel.style.left).toBe('224px');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: the new peek + positioning tests FAIL — peek stays hidden, panel never gets positioned.

- [ ] **Step 3: Replace `onPointerMove` stub with real implementation**

In `src/scenes/InspectController.js`, find the `onPointerMove` method (currently a stub) and replace it with:

```js
  onPointerMove(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) { this._showPeek('enemy', enemy, mx, my); return; }
    if (this._hitTestHero(mx, my)) { this._showPeek('hero', this.scene.hero, mx, my); return; }
    this._hidePeek();
  }
```

- [ ] **Step 4: Update `pin()` to hide peek when pinning**

In `src/scenes/InspectController.js`, find `pin()` (from Task 6) and add a `_hidePeek()` call before showing the panel:

```js
  pin(spec) {
    if (this.pinned && this.pinned.target === spec.target) {
      this.dismiss();
      return;
    }
    this.pinned = spec;
    this._hidePeek();
    this._showPanel(spec.kind);
    if (spec.kind === 'enemy') this._renderEnemyPanel(spec.target);
    else                       this._renderHeroPanel(spec.target);
    this._positionPanelForTarget(spec);
  }
```

(Two changes: added `this._hidePeek()` before `_showPanel`, and added `this._positionPanelForTarget(spec)` at the end.)

- [ ] **Step 5: Add peek + positioning helpers**

Append to the `InspectController` class (after `_renderHeroMatchups`):

```js
  _showPeek(kind, target, mx, my) {
    this.peekTarget = target;
    const peek = document.getElementById('inspect-peek');
    peek.replaceChildren();
    const header = document.createElement('strong');
    if (kind === 'enemy') {
      header.textContent = target.def.name;
      peek.appendChild(header);

      const stat = document.createElement('div');
      stat.textContent = `HP ${Math.ceil(target.hp)} / ${target.maxHp} · Armor ${target.def.armor}`;
      peek.appendChild(stat);

      const { vulnerableTo, resists } = describeEnemyMatchups(target.def.type);
      const displayName = (t) => t === 'hero' ? 'Hero' : (TOWER_DEFS[t]?.name ?? t);
      if (vulnerableTo.length) {
        const v = document.createElement('div');
        v.textContent = `Weak: ${displayName(vulnerableTo[0])}`;
        peek.appendChild(v);
      }
      if (resists.length) {
        const r = document.createElement('div');
        r.textContent = `Resist: ${displayName(resists[0])}`;
        peek.appendChild(r);
      }
    } else {
      // hero
      header.textContent = '🛡️ Commander Rael';
      peek.appendChild(header);
      const stat = document.createElement('div');
      stat.textContent = `HP ${Math.ceil(target.hp)} / ${target.maxHp} · Level ${target.level}`;
      peek.appendChild(stat);
    }
    this._positionPanel(peek, mx, my);
    peek.style.display = 'block';
  }

  _hidePeek() {
    this.peekTarget = null;
    document.getElementById('inspect-peek').style.display = 'none';
  }

  _positionPanel(el, targetX, targetY) {
    // Default: anchor to upper-right of target
    let left = targetX + 24;
    let top  = Math.max(0, targetY - 60);

    // Naive viewport check — flip horizontally if would overflow right edge
    const vw = (typeof window !== 'undefined' && window.innerWidth)  ? window.innerWidth  : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    const w = el.offsetWidth  || 220;
    const h = el.offsetHeight || 100;

    if (left + w > vw) left = Math.max(0, targetX - w - 24);
    if (top + h > vh)  top  = Math.max(0, vh - h - 8);

    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
  }

  _positionPanelForTarget(spec) {
    const el = spec.kind === 'enemy'
      ? document.getElementById('enemy-inspector')
      : document.getElementById('hero-inspector');
    this._positionPanel(el, spec.target.x, spec.target.y);
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/scenes/InspectController.test.js`
Expected: all peek + positioning tests pass; all prior InspectController tests still pass.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: ~316 + ~8 = ~324 tests, all green.

- [ ] **Step 8: Build sanity check**

Run: `npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/InspectController.js src/scenes/InspectController.test.js
git commit -m "feat(scenes): InspectController peek tooltip + panel positioning"
```

---

## Task 8: GameScene wiring

**File:**
- Modify: `src/scenes/GameScene.js`

Wire the `InspectController` into `GameScene` — construct in `create()`, listen for `pointermove`, insert click step 4 in `_onPointerDown`, refresh in `update()`, destroy in `shutdown()`. Total: ~6 distinct edits, ~20 lines.

- [ ] **Step 1: Add the import**

At the top of `src/scenes/GameScene.js`, after existing scene/system/entity imports (find the import block — `import` lines clustered at the top of the file), add:

```js
import { InspectController } from './InspectController.js';
```

- [ ] **Step 2: Construct the controller in `create()`**

Find the `create()` method in `src/scenes/GameScene.js`. After the existing Phase 8 systems are constructed (look for lines that build `ParticleSpawner`, `ShakeController`, `DamageNumberOverlay` — these constructors land in `create()` before the bottom-bar wiring), add:

```js
    this.inspector = new InspectController(this);
    this.input.on('pointermove', (p) => this.inspector.onPointerMove(p.worldX, p.worldY));
```

If the precise insertion point is unclear, place it just BEFORE the `this.input.on('pointerdown', this._onPointerDown, this);` line (currently at line 108) — the inspector needs the input listener set up after construction, and this co-locates the pointer listeners.

- [ ] **Step 3: Insert click step 4 in `_onPointerDown`**

Find `_onPointerDown(pointer)` in `src/scenes/GameScene.js` (currently around line 533). The existing dispatch is:

```js
    // 3. Tower click
    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        this._deselectButtons();
        this._openTowerPanel(tower, mx, my);
        return;
      }
    }
    // No tower hit — dismiss any open panel before continuing
    this._closeTowerPanel();

    // 4. Tower placement
    if (this.selectedType) {
```

Insert the inspector step BETWEEN the `_closeTowerPanel()` line and the existing `// 4. Tower placement` comment. After inserting, that section becomes:

```js
    // 3. Tower click
    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        this._deselectButtons();
        this._openTowerPanel(tower, mx, my);
        return;
      }
    }
    // No tower hit — dismiss any open panel before continuing
    this._closeTowerPanel();

    // 4. Inspect click (enemy or hero)
    if (this.inspector?.tryClickInspect(mx, my)) return;

    // 5. Tower placement
    if (this.selectedType) {
```

Also update the comment above the move-hero block — change `// 5. Move hero` to `// 6. Move hero` for numbering consistency (search for `// 5. Move hero` near line 588).

- [ ] **Step 4: Call `refresh()` in `update()`**

Find the `update(dt)` method in `src/scenes/GameScene.js` (search for `update(dt)` — it's the main per-frame method). After all existing per-frame logic (after `_updateTowers(dt)`, `_updateProjectiles(dt)`, etc.), at the END of the method, add:

```js
    this.inspector?.refresh();
```

(Use optional chaining in case construction fails for some reason — defensive against null.)

- [ ] **Step 5: Destroy on shutdown**

Find `shutdown()` (currently around line 153). At the start of the method (before any existing teardown), add:

```js
    this.inspector?.destroy();
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: ~324 tests still passing. (No new tests in this task — wiring is covered by InspectController unit tests and manual walkthrough.)

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): wire InspectController for enemy/hero click + hover"
```

---

## Task 9: Manual walkthrough + push + PR

**Files:** none — verification + git only.

If the walkthrough finds a bug, fix it in a focused follow-up task — do NOT bundle the fix into this verification task.

- [ ] **Step 1: Final test + build**

Run: `npm test`
Expected: ~324 tests, all green.

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`
Open the URL in a browser.

- [ ] **Step 3: Walkthrough — enemies (spec §7.5 items 1-5, 11)**

1. **Enemy hover peek.** Start Map 1, let wave 1 spawn. Hover a Veth Drone — confirm a small peek tooltip appears with name, HP, armor, and "Weak: Mage" / "Resist: Cannon" lines. Move mouse away — peek disappears.
2. **Enemy click pin.** Click a drone. Confirm the full enemy-inspector panel opens near it: icon + name in header, HP bar that shrinks as drone takes damage, "Speed · Armor", "Reward · Ground" lines, "Status: —" line, and **"Vulnerable to: Mage" + "Resists: Cannon"** matchup lines.
3. **Death auto-dismiss.** Let the drone die. Inspector panel closes within a frame. Console clean.
4. **Toggle off.** Click another enemy, then click the same enemy again. Panel closes.
5. **Switch target.** Click enemy A, then enemy B without dismissing first. Panel content updates to B.
6. **Status indicator.** Place an Ice tower. Let it slow an enemy. Click the slowed enemy — confirm "Status: ❄ slowed (X.Xs)" line with ticking timer.

- [ ] **Step 4: Walkthrough — hero (spec §7.5 items 6-7)**

7. **Hero hover.** Hover the Commander Rael sprite — peek shows name, HP, level.
8. **Hero click pin.** Click the hero. Confirm the hero-inspector panel opens with:
   - HP bar
   - "Level: N / 3 · Kills: K" line
   - "Attack: 18 dmg @ 40 range" line
   - Three ability lines (Q/W/E) showing `ready` or `🔒 (lvl N)` for locked
   - "1.5× vs Phantom" matchup line
9. **Ability cooldown ticks.** Trigger Q (Overcharge). Confirm "Q Overcharge" line shows the cooldown timer and ticks down each second.
10. **W/E locks.** With a level-1 hero, confirm W and E show 🔒. After level-up to 2, confirm W unlocks (shows `ready`).
11. **Hero death state.** Let the hero die. Confirm the panel stays open and the abilities area is replaced with "Respawning Xs" (ticking down).

- [ ] **Step 5: Walkthrough — interactions (spec §7.5 items 8-12)**

12. **ESC dismissal.** Pin any panel. Press ESC. Closes.
13. **Reverse matrix correctness.** Click each enemy type across waves 1-10 (drone, skitter, brute, colossus, phantom, titan). Spot-check the "Vulnerable to / Resists" lists against `src/data/weaknessMatrix.js`. Phantom should show "Hero" in Vulnerable.
14. **Tower-click priority preserved.** Click a placed tower — TowerPanel opens (not inspector). 9b matchup line still renders inside TowerPanel.
15. **Tower-placement priority.** Select Cannon from the bottom bar. Click an enemy — inspector opens (step 4 beats step 5). Cannon icon stays selected. Click an empty zone — cannon places.
16. **Hero-move priority.** Click an empty path tile (no enemy/hero/tower/zone). Hero moves there. Inspector does NOT open.
17. **Wave clear auto-dismiss.** Pin a late-wave enemy. Let it die or leak. Inspector closes when target is gone.

- [ ] **Step 6: No-regression spot-check**

- Gold income works.
- Wave progression advances.
- Tower placement, upgrades, branch picker all work.
- Hero abilities Q/W/E still trigger when fired via keyboard.
- Story banners still appear at the right waves.
- Audio cues play.
- 9a send-wave-early bonus (button label `(+Xg)`, toast) still works.
- 9b TowerPanel matchup line + tower-build hover tooltip + Tier-4 branch picker hint all still render correctly.

- [ ] **Step 7: Push + PR (if walkthrough passes)**

```bash
git push -u origin feature/phase-9c-click-inspect
gh pr create --base feature/phase-3-tower-system --title "feat: Phase 9c — click-to-inspect overlay" --body "$(cat <<'EOF'
## Summary

Third "Strategic Depth" sub-feature for Last Light. Adds hover-peek + click-pin **inspector panels** for enemies and the hero, completing the trilogy with 9a (send-wave-early) and 9b (weakness matrix).

**Killer feature:** the enemy panel includes a **reverse-matrix view** — "Vulnerable to: Cannon, Sniper · Resists: Archer" — making 9b's matrix legible from the enemy side. A player who sees a wave of Titans incoming can now answer "what should I build?" by clicking a Titan.

### Changes
- New: `src/data/weaknessMatrix.js` exports `describeEnemyMatchups(enemyType)`
- New: `src/scenes/InspectController.js` — all inspector state and DOM manipulation
- Modified: `src/data/enemies.js` — added `icon` field per enemy type
- Modified: `src/entities/Hero.js` — exported `HERO_STATS` so the panel can read attack stats + ability unlock levels
- Modified: `src/scenes/GameScene.js` — ~20 lines of wiring (construct, pointermove, click step 4, refresh, destroy)
- Modified: `index.html` — three new DOM elements + ~25 lines of CSS

### Click priority in _onPointerDown
1. aim mode → 2. reposition → 3. tower click → 4. inspect (NEW) → 5. placement → 6. move hero

### Test plan
- [x] `npm test` — ~324 tests passing
- [x] `npm run build` — clean
- [ ] **Manual walkthrough** per `docs/superpowers/specs/2026-05-28-phase-9c-click-inspect-design.md` §7.5

### Security
All DOM construction uses `createElement` + `textContent` + `appendChild`. No string-based HTML anywhere (production code or test fixtures).

### Spec & plan
- Spec: `docs/superpowers/specs/2026-05-28-phase-9c-click-inspect-design.md`
- Plan: `docs/superpowers/plans/2026-05-28-phase-9c-click-inspect.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Update `.claude/notes.md`**

Append a phase-completion bullet for Phase 9c (mirror the 9b/9a format). Reference the PR number once GitHub returns it.

---

## Task ordering and parallelism notes

**Strictly serial dependencies:**
- Task 1 → Task 6 (`describeEnemyMatchups` consumed by enemy matchups rendering + peek)
- Task 2 → Task 6 (icon field consumed by enemy panel header)
- Task 3 → Task 6 (HERO_STATS consumed by hero panel)
- Task 4 → Task 5 (HTML elements must exist before InspectController binds close-button listeners in its constructor)
- Tasks 5 → 6 → 7 all extend `InspectController.js` — must run sequentially to avoid merge conflicts
- Task 8 depends on Tasks 5-7 (InspectController must exist before GameScene imports it)
- Task 9 depends on everything

**Independent (could run in parallel if dispatch supports it):**
- Tasks 1, 2, 3 — different files, no shared symbols
- Task 4 is independent of Tasks 1-3 (HTML doesn't reference any JS)

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9, all serial via subagent-driven-development. Single-task dispatches keep the diff small enough for per-task review and avoid merge conflicts on `InspectController.js` and `GameScene.js`.

---

## Self-Review Notes

**Spec coverage:**
- Spec §2 trigger model (hover peek + click pin) → Tasks 5, 7 ✓
- Spec §2.3 click priority → Task 8 ✓
- Spec §3.1 `describeEnemyMatchups` → Task 1 ✓
- Spec §3.2 `icon` field → Task 2 ✓
- Spec §4.1-4.2 DOM + CSS scaffolding → Task 4 ✓
- Spec §4.3 enemy panel render → Task 6 ✓
- Spec §4.4 hero panel render → Task 6 ✓
- Spec §4.5 peek tooltip → Task 7 ✓
- Spec §5.1 `InspectController` module → Tasks 5, 6, 7 ✓
- Spec §5.2 GameScene wiring → Task 8 ✓
- Spec §5.3 hit-test radii → Task 5 ✓
- Spec §5.4 panel positioning → Task 7 ✓
- Spec §5.5 live updates → Task 6 (refresh) ✓
- Spec §6 edge cases — covered by InspectController unit tests across Tasks 5-7 ✓
- Spec §7.1 reverse-matrix tests → Task 1 ✓
- Spec §7.2 icon test → Task 2 ✓
- Spec §7.3 InspectController tests → Tasks 5, 6, 7 ✓
- Spec §7.5 manual walkthrough → Task 9 ✓
- Spec §10 acceptance criteria → Task 9

**Placeholder scan:** every code step contains executable code or an exact command. No TBD. The "approximate test count" notes (~316, ~324) drift if other tasks land in parallel — implementer can ignore the absolute count as long as the suite goes UP and stays green.

**Type/symbol consistency:**
- `describeEnemyMatchups(enemyType)` — Task 1 (def) → Tasks 6, 7 (use) ✓
- `HERO_STATS` shape `{attackDamage, attackRange, attackRate, maxLevel, abilityUnlockLevels:{q,w,e}}` — Task 3 (def) → Task 6 (use) ✓
- `def.icon` field — Task 2 (data) → Task 6 (panel render) ✓
- Source-object shape `{kind, type, tier, branch}` is already established by 9b — Task 1's reverse-matrix calls use the same shape
- DOM element ids: `ei-name`, `ei-hp-label`, `ei-stats`, `ei-meta`, `ei-status`, `ei-matchups`, `ei-hpfill`, `ei-close`, `hi-hp-label`, `hi-level`, `hi-attack`, `hi-abilities`, `hi-matchups`, `hi-hpfill`, `hi-close`, `inspect-peek` — consistent across Task 4 (DOM) and Tasks 5-7 (controller)
- CSS classes: `inspector-panel`, `inspector-header`, `inspector-name`, `inspector-close`, `inspector-hpbar`, `inspector-hpfill`, `inspector-hp-label`, `inspector-stat`, `inspector-matchups`, `mu-good`, `mu-bad`, `inspector-abilities`, `ab-line`, `locked` — consistent across Task 4 (CSS) and Tasks 5-7 (controller)

**Security:** All DOM construction in production code AND in test fixtures uses `createElement` + `textContent` + `appendChild`. No string-based HTML anywhere. No user-supplied input flows into the panel — all strings derive from `ENEMY_DEFS`/`TOWER_DEFS`/`HERO_MULTIPLIERS` constants or computed numbers.

**Scope:** 8 implementation tasks + 1 acceptance walkthrough. One PR. No new dependencies. No scope creep beyond the spec.
