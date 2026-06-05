# Hero Management Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `🦸 Heroes` button on MapSelect that opens a single overlay combining hero swap + per-hero upgrades, replacing the small featured-panel hero picker and removing the hero branches from the existing `⚙ Upgrades` overlay.

**Architecture:** New `HeroManagementOverlay` UI class (mirrors `UpgradeTreeOverlay` pattern: jsdom-mountable, `open()`/`close()`, instance-local `_inspectedHeroId` state). Shared node renderer extracted to `src/ui/upgradeNode.js` so both overlays render nodes identically. No data-layer changes other than one additive `role` string field on each `HEROES[*]` def. All existing data APIs (`SaveManager.getSelectedHero` / `setSelectedHero` / `isHeroUnlocked`, `UpgradeManager.getNodeState` / `canPurchase` / `purchase` / `refund` / `getAvailableStars`) are reused as-is.

**Tech Stack:** Vanilla ES modules; Vitest + jsdom for tests; Phaser 3.60 only at the MapSelectScene seam (already mocked in existing tests).

**Spec:** `docs/superpowers/specs/2026-06-04-hero-management-overlay-design.md`

---

## File Structure

**New files:**
- `src/data/heroes.js` — **modified** (adds `role` field to each of the 4 hero defs)
- `src/ui/upgradeNode.js` — **created** (pure renderer for a single upgrade node; used by both overlays)
- `src/ui/upgradeNode.test.js` — **created** (covers all 5 node states)
- `src/ui/HeroManagementOverlay.js` — **created** (the new overlay)
- `src/ui/HeroManagementOverlay.test.js` — **created** (rail + tree + click semantics)
- `src/ui/UpgradeTreeOverlay.test.js` — **created** (first test for the existing overlay, post-refactor)

**Modified files:**
- `src/ui/UpgradeTreeOverlay.js` — `BRANCHES` drops 4 hero entries; `_renderNode` body replaced by call to `renderUpgradeNode`
- `src/scenes/MapSelectScene.js` — drop `_renderHeroPicker` + `toCssColor`; add `_bindHeroes` + overlay instance; `shutdown()` hides new overlay
- `index.html` — add `#open-heroes` button + `#hero-mgmt-overlay` markup + new CSS; delete `#hero-picker` block + old picker CSS; retitle `#upgrade-overlay-title` to "Doctrine"

**Renamed:**
- `src/scenes/MapSelectScene.heroPicker.test.js` → `src/scenes/MapSelectScene.heroOverlay.test.js` (contents rewritten — see Task 9)

---

## Task 1: Add `role` field to HEROES defs

**Files:**
- Modify: `src/data/heroes.js`
- Test: existing `src/data/heroes.test.js` (if present) or new `src/data/heroes.role.test.js`

- [ ] **Step 1: Confirm test file**

Run: `ls src/data/heroes.test.js src/data/heroes.role.test.js 2>/dev/null`
If `heroes.test.js` exists, add the test to it; otherwise create `heroes.role.test.js`.

- [ ] **Step 2: Write the failing test**

If creating `src/data/heroes.role.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HEROES, HERO_ORDER } from './heroes.js';

describe('HEROES role field', () => {
  it('each hero in HERO_ORDER has a non-empty role string', () => {
    for (const id of HERO_ORDER) {
      expect(typeof HEROES[id].role, `${id}.role`).toBe('string');
      expect(HEROES[id].role.length, `${id}.role length`).toBeGreaterThan(0);
    }
  });

  it('role values match the canonical strings from the spec', () => {
    expect(HEROES.rael.role).toBe('Generalist bruiser');
    expect(HEROES.engineer.role).toBe('Support / builder');
    expect(HEROES.scout.role).toBe('Ranged DPS / anti-air');
    expect(HEROES.pyro.role).toBe('AoE / burn');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/heroes.role.test.js`
Expected: FAIL — `HEROES.rael.role` is `undefined`.

- [ ] **Step 4: Add `role` field to each of the 4 hero defs**

In `src/data/heroes.js`, add one line per hero def (place after `upgradeBranchId`):

For `rael`:
```js
    role:            'Generalist bruiser',
```

For `engineer`:
```js
    role:            'Support / builder',
```

For `scout`:
```js
    role:            'Ranged DPS / anti-air',
```

For `pyro`:
```js
    role:            'AoE / burn',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/heroes.role.test.js`
Expected: PASS — both cases green.

- [ ] **Step 6: Run full suite to confirm no regressions**

Run: `npx vitest run`
Expected: all tests pass (count grows by 2).

- [ ] **Step 7: Commit**

```bash
git add src/data/heroes.js src/data/heroes.role.test.js
git commit -m "feat(heroes): add role field to HEROES defs

Presentation-only field used by the upcoming Hero Management overlay
to render the role tag under each hero card. No combat-logic impact.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Extract `renderUpgradeNode` helper

**Files:**
- Create: `src/ui/upgradeNode.js`
- Create: `src/ui/upgradeNode.test.js`

The helper is a pure DOM-builder that mirrors `UpgradeTreeOverlay._renderNode` exactly. After Task 3, both `UpgradeTreeOverlay` and `HeroManagementOverlay` call this function.

- [ ] **Step 1: Write the failing test file**

Create `src/ui/upgradeNode.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderUpgradeNode } from './upgradeNode.js';

function makeMgr(state, available = 10) {
  return {
    getNodeState: vi.fn(() => state),
    getAvailableStars: vi.fn(() => available),
    purchase: vi.fn(),
    refund:   vi.fn(),
  };
}

const RAEL_NODE = {
  id: 'rael_hp', branch: 'rael', name: 'Battle-Hardened',
  effect: 'Rael +50 max HP', cost: 2, requires: null,
};
const RAEL_ELITE_NODE = {
  id: 'rael_elite', branch: 'rael', name: 'Elite Commander',
  effect: 'Rael starts at L3', cost: 6, requires: 'rael_veteran', starThreshold: 15,
};
const ENG_NODE = {
  id: 'engineer_hp', branch: 'engineer', name: 'Reinforced Plating',
  effect: 'Engineer +40 max HP', cost: 2, requires: null, heroUnlock: 'engineer',
};
const HERO_DEFS = {
  rael:     { displayName: 'Commander Rael',  unlockMapAfter: null },
  engineer: { displayName: 'Engineer Dax',    unlockMapAfter: 2 },
};

describe('renderUpgradeNode', () => {
  let onChange;
  beforeEach(() => { onChange = vi.fn(); });

  it('affordable: returns element with .affordable; click calls purchase + onChange', () => {
    const mgr = makeMgr('affordable');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('affordable')).toBe(true);
    expect(el.querySelector('.upgrade-node-name').textContent).toBe('Battle-Hardened');
    expect(el.querySelector('.upgrade-node-cost').textContent).toBe('2★');
    el.click();
    expect(mgr.purchase).toHaveBeenCalledWith('rael_hp');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('purchased: returns element with .purchased + Refund button; refund click calls refund + onChange', () => {
    const mgr = makeMgr('purchased');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('purchased')).toBe(true);
    const refundBtn = el.querySelector('.upgrade-node-refund');
    expect(refundBtn).not.toBeNull();
    refundBtn.click();
    expect(mgr.refund).toHaveBeenCalledWith('rael_hp');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('locked-threshold: returns element with .locked-threshold + gate text', () => {
    const mgr = makeMgr('locked-threshold');
    const el  = renderUpgradeNode(RAEL_ELITE_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('locked-threshold')).toBe(true);
    expect(el.querySelector('.upgrade-node-gate').textContent).toBe('Needs 15★ earned');
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });

  it('locked-hero: returns element with .locked-hero + unlock tooltip', () => {
    const mgr = makeMgr('locked-hero');
    const el  = renderUpgradeNode(ENG_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('locked-hero')).toBe(true);
    expect(el.title).toContain('Clear Map 3');
    expect(el.title).toContain('Engineer Dax');
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });

  it('unaffordable: returns element with .unaffordable and no click handler', () => {
    const mgr = makeMgr('unaffordable');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('unaffordable')).toBe(true);
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refund button click stops propagation (does not also trigger node click)', () => {
    const mgr = makeMgr('purchased');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    el.querySelector('.upgrade-node-refund').click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/upgradeNode.test.js`
Expected: FAIL — `renderUpgradeNode` is not defined.

- [ ] **Step 3: Create `src/ui/upgradeNode.js` with the helper**

```js
// Pure DOM-builder for a single upgrade node. Shared by UpgradeTreeOverlay
// and HeroManagementOverlay so both render nodes identically.
//
// Args:
//   node      — the upgrade def (from src/data/upgrades.js)
//   upgradeMgr — UpgradeManager instance (must expose getNodeState/purchase/refund)
//   heroDefs   — HEROES registry (for the locked-hero unlock tooltip)
//   onChange   — invoked after purchase or refund so the caller can re-render
//
// Returns: a <div class="upgrade-node {state}"> ready to append.
export function renderUpgradeNode(node, upgradeMgr, heroDefs, onChange) {
  const state = upgradeMgr.getNodeState(node.id);
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

  if (state === 'locked-hero') {
    el.classList.add('locked-hero');
    const heroDef = heroDefs[node.heroUnlock];
    el.title = `🔒 Locked — clear Map ${heroDef.unlockMapAfter + 1} to unlock ${heroDef.displayName}`;
  }

  if (state === 'affordable') {
    el.addEventListener('click', () => {
      upgradeMgr.purchase(node.id);
      onChange();
    });
  } else if (state === 'purchased') {
    const refund = document.createElement('button');
    refund.className   = 'upgrade-node-refund';
    refund.textContent = 'Refund';
    refund.addEventListener('click', (e) => {
      e.stopPropagation();
      upgradeMgr.refund(node.id);
      onChange();
    });
    el.appendChild(refund);
  }

  return el;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/upgradeNode.test.js`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/upgradeNode.js src/ui/upgradeNode.test.js
git commit -m "feat(ui): extract renderUpgradeNode helper for shared node rendering

Pure DOM-builder that returns a fully-wired .upgrade-node element.
Will replace inline _renderNode in UpgradeTreeOverlay (Task 3) and
be reused by the new HeroManagementOverlay (Task 7).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Refactor UpgradeTreeOverlay to use the helper and drop hero branches

**Files:**
- Modify: `src/ui/UpgradeTreeOverlay.js`

Two changes in this task:
1. `BRANCHES` shrinks to just `logistics` + `arsenal`.
2. `_renderNode` is replaced with a call to `renderUpgradeNode`.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/ui/UpgradeTreeOverlay.js` with:

```js
import { UPGRADES } from '../data/upgrades.js';
import { HEROES }   from '../data/heroes.js';
import { renderUpgradeNode } from './upgradeNode.js';

const BRANCHES = [
  { id: 'logistics', title: 'Logistics', subtitle: 'Economy' },
  { id: 'arsenal',   title: 'Arsenal',   subtitle: 'Towers & soldiers' },
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
      heading.textContent = branch.title;
      const sub = document.createElement('div');
      sub.className   = 'upgrade-branch-subtitle';
      sub.textContent = branch.subtitle;
      col.appendChild(heading);
      col.appendChild(sub);
      for (const node of UPGRADES.filter(u => u.branch === branch.id)) {
        col.appendChild(renderUpgradeNode(node, this._mgr, HEROES, () => this._render()));
      }
      this._tree.appendChild(col);
    }
  }
}
```

- [ ] **Step 2: Run the helper test to confirm shared file still works**

Run: `npx vitest run src/ui/upgradeNode.test.js`
Expected: PASS (no change — helper was not touched).

- [ ] **Step 3: Run the full suite to surface any callers that asserted on hero branches**

Run: `npx vitest run`
Expected: full suite passes EXCEPT for the existing `MapSelectScene.heroPicker.test.js` (still uses old picker — fixed in Task 9). If any *other* test fails referencing hero branches in `UpgradeTreeOverlay`, fix it in this task — that's a coupling the refactor is meant to break.

If the picker test is the only failure, that is the expected intermediate state.

- [ ] **Step 4: Commit**

```bash
git add src/ui/UpgradeTreeOverlay.js
git commit -m "refactor(upgrade-tree-overlay): drop hero branches, use renderUpgradeNode

BRANCHES now contains only logistics + arsenal — hero branches move
to the new HeroManagementOverlay. _renderNode replaced by the shared
renderUpgradeNode helper. Behavior of remaining branches unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Add UpgradeTreeOverlay smoke test

**Files:**
- Create: `src/ui/UpgradeTreeOverlay.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/ui/UpgradeTreeOverlay.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpgradeTreeOverlay } from './UpgradeTreeOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'upgrade-overlay';
  overlay.style.display = 'none';

  const avail = document.createElement('span');
  avail.id = 'upgrade-available';
  overlay.appendChild(avail);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'upgrade-close';
  overlay.appendChild(closeBtn);

  const tree = document.createElement('div');
  tree.id = 'upgrade-tree';
  overlay.appendChild(tree);

  document.body.appendChild(overlay);
}

function makeMgr() {
  return {
    getAvailableStars: vi.fn(() => 5),
    getNodeState:      vi.fn(() => 'affordable'),
    purchase:          vi.fn(),
    refund:            vi.fn(),
  };
}

beforeEach(() => setupDom());

describe('UpgradeTreeOverlay (post-refactor)', () => {
  it('open() shows overlay and renders exactly 2 branch columns', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('flex');
    const cols = document.querySelectorAll('.upgrade-branch');
    expect(cols.length).toBe(2);
    const headings = Array.from(cols).map(c => c.querySelector('h3').textContent);
    expect(headings).toEqual(['Logistics', 'Arsenal']);
  });

  it('no rael/engineer/scout/pyro branch headings render', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    const headings = Array.from(document.querySelectorAll('.upgrade-branch h3'))
      .map(h => h.textContent.toLowerCase());
    for (const banned of ['rael', 'engineer', 'scout', 'pyromancer']) {
      expect(headings.some(h => h.includes(banned))).toBe(false);
    }
  });

  it('Available chip reflects getAvailableStars', () => {
    const mgr = makeMgr();
    mgr.getAvailableStars.mockReturnValue(7);
    new UpgradeTreeOverlay(mgr).open();
    expect(document.getElementById('upgrade-available').textContent).toBe('Available: 7★');
  });

  it('close-button click closes the overlay', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    document.getElementById('upgrade-close').click();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
  });

  it('close() then open() does not stack close-button listeners', () => {
    const mgr = makeMgr();
    const ov  = new UpgradeTreeOverlay(mgr);
    ov.open(); ov.close(); ov.open();
    document.getElementById('upgrade-close').click();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
    // No second click needed — first click should have closed cleanly.
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/ui/UpgradeTreeOverlay.test.js`
Expected: PASS — all 5 cases green (Task 3's refactor already supports them).

- [ ] **Step 3: Commit**

```bash
git add src/ui/UpgradeTreeOverlay.test.js
git commit -m "test(upgrade-tree-overlay): cover slimmed-down overlay

First test for UpgradeTreeOverlay. Asserts exactly Logistics +
Arsenal columns render after the hero-branch removal in the prior
refactor, plus close/open hygiene.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Add DOM scaffolding to index.html

This task touches markup + CSS only. No JS yet.

**Files:**
- Modify: `index.html`

Three changes:
1. Add `<button id="open-heroes">🦸 Heroes</button>` to `#map-meta-bar`.
2. Delete the `<div id="hero-picker">…</div>` block in `#map-featured`.
3. Retitle `#upgrade-overlay-title` from "Command Doctrine" → "Doctrine".
4. Add new `#hero-mgmt-overlay` markup at the same level as `#upgrade-overlay`.
5. Add new CSS for the overlay; remove old `.hero-card*` / `.hero-picker*` CSS.

- [ ] **Step 1: Add the Heroes button to `#map-meta-bar`**

Locate the existing `#map-meta-bar` block (around line 275 of `index.html`):

```html
      <div id="map-meta-bar">
        <div id="total-stars">★ 0 / 30</div>
        <button id="open-upgrades">⚙ Upgrades</button>
        <button id="open-settings" title="Audio settings">♪ Audio</button>
      </div>
```

Insert the new button between `#open-upgrades` and `#open-settings`:

```html
      <div id="map-meta-bar">
        <div id="total-stars">★ 0 / 30</div>
        <button id="open-upgrades">⚙ Upgrades</button>
        <button id="open-heroes" title="Hero command">🦸 Heroes</button>
        <button id="open-settings" title="Audio settings">♪ Audio</button>
      </div>
```

- [ ] **Step 2: Delete the `#hero-picker` block**

Locate inside `#map-featured`:

```html
          <div id="hero-picker">
            <div class="hero-picker-label">Commander:</div>
            <div class="hero-picker-cards" id="hero-picker-cards"></div>
          </div>
```

Delete those 4 lines. The PLAY button below it stays put — it will move up visually to fill the space.

- [ ] **Step 3: Retitle the existing upgrade overlay**

Locate inside `#upgrade-overlay-inner`:

```html
          <span id="upgrade-overlay-title">Command Doctrine</span>
```

Change to:

```html
          <span id="upgrade-overlay-title">Doctrine</span>
```

- [ ] **Step 4: Add new `#hero-mgmt-overlay` markup**

After the existing `#upgrade-overlay` block (the `</div>` that closes it), insert this block at the same indent level:

```html
    <div id="hero-mgmt-overlay">
      <div id="hero-mgmt-overlay-inner">
        <div id="hero-mgmt-overlay-header">
          <span id="hero-mgmt-overlay-title">🦸 Hero Command</span>
          <span id="hero-mgmt-avail">⭐ 0 to spend</span>
          <button id="hero-mgmt-close">✕ Close</button>
        </div>
        <div id="hero-mgmt-body">
          <div id="hero-rail"></div>
          <div id="hero-tree"></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 5: Remove the old hero-picker CSS rules**

Inside the `<style>` block (around lines 241–252), delete these rules:

```css
    #hero-picker { margin: 14px 0; }
    .hero-picker-label { font-size:11px; color:#aaa; margin-bottom:6px; letter-spacing:1px; }
    .hero-picker-cards { display:flex; gap:10px; }
    .hero-card { display:flex; flex-direction:column; align-items:center; padding:8px;
                 border:2px solid #2a3a4e; border-radius:8px; background:#0a121b; cursor:pointer; min-width:60px; }
    .hero-card.locked { opacity:0.5; cursor:not-allowed; }
    .hero-card.active { background:#1a2a3a; }
    .hero-card-portrait { width:36px; height:36px; border-radius:50%; display:flex;
                          align-items:center; justify-content:center; font-weight:bold; margin-bottom:4px; }
    .hero-card-name { font-size:10px; color:#ddd; }
    .hero-card.locked .hero-card-portrait { background:#222; border:2px solid #444; color:#666; }
```

(The exact line range may vary slightly — match by selector, not line number.)

- [ ] **Step 6: Add new CSS for the Hero Management overlay**

Inside the same `<style>` block, just before `#upgrade-overlay` rules, insert:

```css
    #hero-mgmt-overlay { display:none; position:absolute; inset:0; z-index:15;
                         background:rgba(5,10,16,0.85); align-items:center; justify-content:center; padding:24px; }
    #hero-mgmt-overlay-inner { width:100%; max-width:780px; max-height:100%;
                               background:#0e1620; border:1px solid #2a3a4e; border-radius:8px;
                               padding:16px; color:#cfd8e0; display:flex; flex-direction:column; gap:12px; overflow:auto; }
    #hero-mgmt-overlay-header { display:flex; align-items:center; gap:14px; padding-bottom:10px;
                                border-bottom:1px solid #233044; }
    #hero-mgmt-overlay-title { font-size:16px; color:#ffd700; font-weight:bold; }
    #hero-mgmt-avail { margin-left:auto; font-size:12px; color:#9aa; padding:4px 10px;
                       border:1px solid #2a3a4e; border-radius:4px; background:#0a121b; }
    #hero-mgmt-close { font-size:11px; color:#cfd8e0; padding:4px 10px; border:1px solid #2a3a4e;
                       border-radius:4px; background:#152030; cursor:pointer; }
    #hero-mgmt-body { display:grid; grid-template-columns:170px 1fr; gap:12px; min-height:300px; }
    #hero-rail { display:flex; flex-direction:column; gap:8px; }
    .ho-card { position:relative; display:flex; gap:10px; align-items:center; padding:10px;
               border:1px solid #233044; border-radius:6px; background:#152030; cursor:pointer; font-size:12px; }
    .ho-card.inspecting { border-color:#4fc3f7; background:#1a2a3a; }
    .ho-card.locked { opacity:0.55; }
    .ho-card-portrait { width:32px; height:32px; border-radius:50%; display:flex;
                         align-items:center; justify-content:center; font-weight:bold; font-size:13px; }
    .ho-card-meta { display:flex; flex-direction:column; gap:2px; }
    .ho-card-name { font-weight:bold; color:#cfd8e0; }
    .ho-card-role { font-size:10px; color:#8a99aa; }
    .ho-card-unlock { font-size:9px; color:#888; margin-top:2px; }
    .ho-card-badge { position:absolute; top:-6px; right:-6px; background:#4caf50; color:#0a121b;
                     font-size:9px; font-weight:bold; padding:2px 6px; border-radius:10px; letter-spacing:0.5px; }
    #hero-tree { border:1px solid #233044; border-radius:6px; padding:14px; background:#0a121b; overflow-y:auto; }
    .ho-tree-head { display:flex; align-items:baseline; gap:10px; padding-bottom:10px;
                    border-bottom:1px solid #233044; margin-bottom:10px; }
    .ho-tree-head h4 { font-size:14px; margin:0; }
    .ho-tree-head-sub { font-size:11px; color:#8a99aa; }
    .ho-tree-head-stars { font-size:11px; color:#9aa; margin-left:auto; }
    .ho-tree-banner { background:#2a1a0a; border:1px dashed #ff9933; border-radius:4px; padding:8px 12px;
                      font-size:11px; color:#ffc080; margin-bottom:10px; }
```

- [ ] **Step 7: Spot-check that index.html parses + the existing scene still mounts**

Run: `npx vitest run`
Expected: Same test results as before Task 5 — index.html is referenced only by the running app, not by unit tests, so this step is a sanity check that nothing else broke.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(html): hero-mgmt-overlay scaffolding + Heroes button

Adds the 🦸 Heroes button to the map meta bar, the new
#hero-mgmt-overlay modal markup + CSS, removes the small featured-panel
hero-picker block and its CSS, retitles #upgrade-overlay-title from
'Command Doctrine' to 'Doctrine' (now Logistics + Arsenal only).

Markup only — JS wiring lands in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Create HeroManagementOverlay — render-only

**Files:**
- Create: `src/ui/HeroManagementOverlay.js`
- Create: `src/ui/HeroManagementOverlay.test.js`

This task implements `open()` / `close()` / `_render()` / `_renderRail()` / `_renderTree()` **without** rail click handlers yet (those land in Task 7). The tree pane uses `renderUpgradeNode` from Task 2, so purchase/refund handlers come for free once nodes are rendered.

- [ ] **Step 1: Write the failing test file**

Create `src/ui/HeroManagementOverlay.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeroManagementOverlay } from './HeroManagementOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'hero-mgmt-overlay';
  overlay.style.display = 'none';

  const avail = document.createElement('span');
  avail.id = 'hero-mgmt-avail';
  overlay.appendChild(avail);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'hero-mgmt-close';
  overlay.appendChild(closeBtn);

  const rail = document.createElement('div');
  rail.id = 'hero-rail';
  overlay.appendChild(rail);

  const tree = document.createElement('div');
  tree.id = 'hero-tree';
  overlay.appendChild(tree);

  document.body.appendChild(overlay);
}

function makeMgr() {
  return {
    getAvailableStars: vi.fn(() => 5),
    getNodeState:      vi.fn(() => 'affordable'),
    purchase:          vi.fn(),
    refund:            vi.fn(),
  };
}

function makeSave({ selected = 'rael', unlocked = ['rael'] } = {}) {
  return {
    getSelectedHero: vi.fn(() => selected),
    setSelectedHero: vi.fn(function (id) { selected = id; }),
    isHeroUnlocked:  vi.fn(id => unlocked.includes(id)),
  };
}

beforeEach(() => setupDom());

describe('HeroManagementOverlay — render', () => {
  it('open() shows overlay and renders 4 cards in HERO_ORDER', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('flex');
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards.length).toBe(4);
    const names = Array.from(cards).map(c => c.querySelector('.ho-card-name').textContent);
    expect(names).toEqual(['Rael', 'Dax', 'Vex', 'Mira']);
  });

  it('initial inspected card matches selected hero (cyan border AND badge)', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave({ selected: 'rael', unlocked: ['rael'] }));
    ov.open();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].classList.contains('inspecting')).toBe(true);
    expect(cards[0].querySelector('.ho-card-badge')).not.toBeNull();
  });

  it('locked cards have .locked + unlock hint + no badge', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave({ selected: 'rael', unlocked: ['rael'] }));
    ov.open();
    const dax = document.querySelectorAll('#hero-rail .ho-card')[1];
    expect(dax.classList.contains('locked')).toBe(true);
    expect(dax.querySelector('.ho-card-unlock').textContent).toBe('Clear Map 3');
    expect(dax.querySelector('.ho-card-badge')).toBeNull();
  });

  it('tree pane renders header + nodes for the inspected hero', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    const head = document.querySelector('#hero-tree .ho-tree-head h4');
    expect(head.textContent).toBe('Commander Rael');
    const sub = document.querySelector('#hero-tree .ho-tree-head-sub');
    expect(sub.textContent).toBe('Generalist bruiser');
    // Rael has 4 nodes in upgrades.js
    expect(document.querySelectorAll('#hero-tree .upgrade-node').length).toBe(4);
  });

  it('stars header shows "★ X / Y spent on {shortName}" for inspected hero', () => {
    const mgr = makeMgr();
    // Rael branch nodes have costs 2, 3, 4, 6 → total 15. With no purchases, spent = 0.
    mgr.getPurchasedUpgrades = vi.fn(() => []);
    new HeroManagementOverlay(mgr, makeSave()).open();
    const stars = document.querySelector('#hero-tree .ho-tree-head-stars');
    expect(stars.textContent).toBe('★ 0 / 15 spent on Rael');
  });

  it('stars header sums only purchased nodes in the current branch', () => {
    const mgr = makeMgr();
    // Pretend Rael's first two nodes (cost 2 + 3) are purchased; a logistics
    // node is also purchased but must NOT contribute to Rael's branch total.
    mgr.getPurchasedUpgrades = vi.fn(() => ['rael_hp', 'rael_rapid_redeploy', 'log_supply_cache']);
    new HeroManagementOverlay(mgr, makeSave()).open();
    const stars = document.querySelector('#hero-tree .ho-tree-head-stars');
    expect(stars.textContent).toBe('★ 5 / 15 spent on Rael');
  });

  it('available-stars chip reflects getAvailableStars', () => {
    const mgr = makeMgr();
    mgr.getAvailableStars.mockReturnValue(7);
    new HeroManagementOverlay(mgr, makeSave()).open();
    expect(document.getElementById('hero-mgmt-avail').textContent).toBe('⭐ 7 to spend');
  });

  it('close() hides the overlay', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    ov.close();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });

  it('close-button click closes the overlay', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    document.getElementById('hero-mgmt-close').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });

  it('close() then open() does not stack close-button listeners', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open(); ov.close(); ov.open();
    document.getElementById('hero-mgmt-close').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/HeroManagementOverlay.test.js`
Expected: FAIL — `HeroManagementOverlay` is not defined.

- [ ] **Step 3: Create `src/ui/HeroManagementOverlay.js`**

```js
import { HEROES, HERO_ORDER }  from '../data/heroes.js';
import { UPGRADES }            from '../data/upgrades.js';
import { renderUpgradeNode }   from './upgradeNode.js';

function toCssColor(hex) {
  return '#' + ('000000' + hex.toString(16)).slice(-6);
}

export class HeroManagementOverlay {
  constructor(upgradeMgr, saveMgr) {
    this._mgr      = upgradeMgr;
    this._save     = saveMgr;
    this._overlay  = document.getElementById('hero-mgmt-overlay');
    this._rail     = document.getElementById('hero-rail');
    this._tree     = document.getElementById('hero-tree');
    this._avail    = document.getElementById('hero-mgmt-avail');
    this._closeBtn = document.getElementById('hero-mgmt-close');
    this._onClose  = () => this.close();
    this._inspectedHeroId = null;
  }

  open() {
    this._inspectedHeroId = this._save.getSelectedHero();
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.style.display = 'flex';
    this._render();
  }

  close() {
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.style.display = 'none';
  }

  _render() {
    this._avail.textContent = `⭐ ${this._mgr.getAvailableStars()} to spend`;
    this._renderRail();
    this._renderTree(this._inspectedHeroId);
  }

  _renderRail() {
    this._rail.replaceChildren();
    const selected = this._save.getSelectedHero();
    for (const heroId of HERO_ORDER) {
      const def      = HEROES[heroId];
      const unlocked = this._save.isHeroUnlocked(heroId);

      const card = document.createElement('div');
      card.className = 'ho-card';
      if (heroId === this._inspectedHeroId) card.classList.add('inspecting');
      if (!unlocked) card.classList.add('locked');

      const portrait = document.createElement('div');
      portrait.className   = 'ho-card-portrait';
      if (unlocked) {
        portrait.style.background = toCssColor(def.bodyColor);
        portrait.style.border     = `2px solid ${toCssColor(def.strokeColor)}`;
        portrait.style.color      = toCssColor(def.strokeColor);
        portrait.textContent      = def.portraitChar;
      } else {
        portrait.style.background = '#222';
        portrait.style.border     = '2px solid #444';
        portrait.style.color      = '#666';
        portrait.textContent      = '🔒';
      }

      const meta = document.createElement('div');
      meta.className = 'ho-card-meta';
      const nameEl = document.createElement('div');
      nameEl.className   = 'ho-card-name';
      nameEl.textContent = def.shortName;
      const roleEl = document.createElement('div');
      roleEl.className   = 'ho-card-role';
      roleEl.textContent = def.role;
      meta.append(nameEl, roleEl);
      if (!unlocked && def.unlockMapAfter != null) {
        const unlockEl = document.createElement('div');
        unlockEl.className   = 'ho-card-unlock';
        unlockEl.textContent = `Clear Map ${def.unlockMapAfter + 1}`;
        meta.appendChild(unlockEl);
      }

      card.append(portrait, meta);

      if (unlocked && heroId === selected) {
        const badge = document.createElement('div');
        badge.className   = 'ho-card-badge';
        badge.textContent = '✓ SELECTED';
        card.appendChild(badge);
      }

      // Click handlers added in Task 7.

      this._rail.appendChild(card);
    }
  }

  _renderTree(heroId) {
    const def = HEROES[heroId];
    this._tree.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ho-tree-head';
    const h4 = document.createElement('h4');
    h4.textContent       = def.displayName;
    h4.style.color       = toCssColor(def.strokeColor);
    const sub = document.createElement('span');
    sub.className   = 'ho-tree-head-sub';
    sub.textContent = def.role;
    const stars = document.createElement('span');
    stars.className   = 'ho-tree-head-stars';
    stars.textContent = this._branchStarsLabel(heroId);
    head.append(h4, sub, stars);
    this._tree.appendChild(head);

    if (!this._save.isHeroUnlocked(heroId)) {
      const banner = document.createElement('div');
      banner.className   = 'ho-tree-banner';
      banner.textContent = `🔒 Clear Map ${def.unlockMapAfter + 1} to unlock ${def.displayName}`;
      this._tree.appendChild(banner);
    }

    for (const node of UPGRADES.filter(u => u.branch === heroId)) {
      this._tree.appendChild(renderUpgradeNode(node, this._mgr, HEROES, () => this._render()));
    }
  }

  _branchStarsLabel(heroId) {
    const branchNodes = UPGRADES.filter(u => u.branch === heroId);
    const totalCost   = branchNodes.reduce((s, n) => s + n.cost, 0);
    const purchased   = new Set(this._mgr.getPurchasedUpgrades?.() ?? []);
    const spent       = branchNodes
      .filter(n => purchased.has(n.id))
      .reduce((s, n) => s + n.cost, 0);
    return `★ ${spent} / ${totalCost} spent on ${HEROES[heroId].shortName}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/HeroManagementOverlay.test.js`
Expected: PASS — all 10 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HeroManagementOverlay.js src/ui/HeroManagementOverlay.test.js
git commit -m "feat(ui): HeroManagementOverlay render scaffolding

Render-only: rail of 4 hero cards (inspecting border + selected badge +
locked dim + unlock hint), tree pane with header + role + 'X/Y spent'
chip + branch-filtered upgrade nodes (via renderUpgradeNode). No rail
click handlers yet — those land in the next task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Wire rail click handlers (auto-commit vs inspect-only)

**Files:**
- Modify: `src/ui/HeroManagementOverlay.js`
- Modify: `src/ui/HeroManagementOverlay.test.js`

- [ ] **Step 1: Append failing click-semantics tests**

Append to `src/ui/HeroManagementOverlay.test.js`:

```js
describe('HeroManagementOverlay — click semantics', () => {
  it('clicking an unlocked card calls setSelectedHero AND moves the inspecting border', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    expect(save.setSelectedHero).toHaveBeenCalledWith('engineer');
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].classList.contains('inspecting')).toBe(true);
    expect(cards[0].classList.contains('inspecting')).toBe(false);
  });

  it('clicking an unlocked card moves the ✓ SELECTED badge to that card', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].querySelector('.ho-card-badge')).not.toBeNull();
    expect(cards[0].querySelector('.ho-card-badge')).toBeNull();
  });

  it('clicking an unlocked card swaps the tree to that hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const head = document.querySelector('#hero-tree .ho-tree-head h4');
    expect(head.textContent).toBe('Engineer Dax');
  });

  it('clicking a locked card does NOT call setSelectedHero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    expect(save.setSelectedHero).not.toHaveBeenCalled();
  });

  it('clicking a locked card switches inspecting border AND tree to that hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].classList.contains('inspecting')).toBe(true);
    expect(document.querySelector('#hero-tree .ho-tree-head h4').textContent).toBe('Engineer Dax');
  });

  it('clicking a locked card shows the orange unlock banner in the tree', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const banner = document.querySelector('#hero-tree .ho-tree-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Clear Map 3');
    expect(banner.textContent).toContain('Engineer Dax');
  });

  it('the ✓ SELECTED badge stays on Rael when inspecting a locked hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].querySelector('.ho-card-badge')).not.toBeNull();
    expect(cards[1].querySelector('.ho-card-badge')).toBeNull();
  });

  it('open() always resets _inspectedHeroId to the selected hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();  // inspect locked engineer
    ov.close();
    ov.open();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].classList.contains('inspecting')).toBe(true);
    expect(cards[1].classList.contains('inspecting')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/ui/HeroManagementOverlay.test.js`
Expected: 10 prior cases still PASS; the 8 new cases FAIL because click handlers aren't wired yet.

- [ ] **Step 3: Wire the rail click handler**

In `src/ui/HeroManagementOverlay.js`, inside `_renderRail`, replace the line:

```js
      // Click handlers added in Task 7.
```

with:

```js
      card.addEventListener('click', () => {
        if (unlocked) this._save.setSelectedHero(heroId);
        this._inspectedHeroId = heroId;
        this._render();
      });
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/ui/HeroManagementOverlay.test.js`
Expected: PASS — all 18 cases green.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: full suite passes EXCEPT for the pre-existing `MapSelectScene.heroPicker.test.js` (still uses old picker — fixed in Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/ui/HeroManagementOverlay.js src/ui/HeroManagementOverlay.test.js
git commit -m "feat(ui): HeroManagementOverlay rail click semantics

Unlocked-card click auto-commits selectedHeroId AND moves the ✓ SELECTED
badge. Locked-card click switches inspecting + tree only — selected
state is preserved. open() always resets _inspectedHeroId to the
currently selected hero.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Verify purchase / refund work end-to-end through the new overlay

The purchase + refund handlers are already wired through `renderUpgradeNode` (Task 2). This task adds explicit integration tests that exercise the path from a rail click through node interaction, to make sure the re-render closure threading is right.

**Files:**
- Modify: `src/ui/HeroManagementOverlay.test.js`

- [ ] **Step 1: Append integration tests**

Append to `src/ui/HeroManagementOverlay.test.js`:

```js
describe('HeroManagementOverlay — purchase / refund through tree', () => {
  it('clicking an affordable node delegates to upgradeMgr.purchase and re-renders', () => {
    const mgr  = makeMgr();
    const save = makeSave();
    const ov   = new HeroManagementOverlay(mgr, save);
    ov.open();
    const firstNode = document.querySelector('#hero-tree .upgrade-node');
    firstNode.click();
    expect(mgr.purchase).toHaveBeenCalledTimes(1);
    // The id of the first Rael node in upgrades.js:
    expect(mgr.purchase).toHaveBeenCalledWith('rael_hp');
  });

  it('after purchase, available-stars chip re-reads from the manager', () => {
    const mgr  = makeMgr();
    mgr.getAvailableStars.mockReturnValueOnce(10).mockReturnValue(8);
    const ov = new HeroManagementOverlay(mgr, makeSave());
    ov.open();
    expect(document.getElementById('hero-mgmt-avail').textContent).toBe('⭐ 10 to spend');
    document.querySelector('#hero-tree .upgrade-node').click();
    expect(document.getElementById('hero-mgmt-avail').textContent).toBe('⭐ 8 to spend');
  });

  it('refund-button click delegates to upgradeMgr.refund', () => {
    const mgr = makeMgr();
    mgr.getNodeState.mockReturnValue('purchased');
    const ov = new HeroManagementOverlay(mgr, makeSave());
    ov.open();
    const refundBtn = document.querySelector('#hero-tree .upgrade-node-refund');
    refundBtn.click();
    expect(mgr.refund).toHaveBeenCalledTimes(1);
    expect(mgr.refund).toHaveBeenCalledWith('rael_hp');
  });

  it('purchase nodes inside a locked-hero tree do not fire purchase (every node is locked-hero)', () => {
    const mgr = makeMgr();
    mgr.getNodeState.mockReturnValue('locked-hero');
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(mgr, save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();  // inspect locked engineer
    const nodes = document.querySelectorAll('#hero-tree .upgrade-node');
    for (const n of nodes) n.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/ui/HeroManagementOverlay.test.js`
Expected: PASS — all 22 cases green. The closures from Task 6 (`() => this._render()`) handle the re-render path correctly; no code changes needed in this task.

- [ ] **Step 3: Commit**

```bash
git add src/ui/HeroManagementOverlay.test.js
git commit -m "test(hero-mgmt-overlay): cover purchase + refund through the tree

Integration tests for the rail-click → tree-interaction path. Verifies
that the re-render closure re-reads available-stars from the manager
and that locked-hero trees do not fire purchase even on click.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: MapSelectScene integration

**Files:**
- Modify: `src/scenes/MapSelectScene.js`
- Rename + modify: `src/scenes/MapSelectScene.heroPicker.test.js` → `src/scenes/MapSelectScene.heroOverlay.test.js`

Drop the old picker, instantiate the new overlay, bind the Heroes button, and update tests.

- [ ] **Step 1: Rename the test file and rewrite contents**

```bash
git mv src/scenes/MapSelectScene.heroPicker.test.js src/scenes/MapSelectScene.heroOverlay.test.js
```

Replace the contents of `src/scenes/MapSelectScene.heroOverlay.test.js` with:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { SaveManager } from '../systems/SaveManager.js';

function setupDom() {
  document.body.replaceChildren();

  // #map-select container (so shutdown() does not throw)
  const root = document.createElement('div');
  root.id = 'map-select';
  document.body.appendChild(root);

  // Meta bar + open-heroes button
  const metaBar = document.createElement('div');
  metaBar.id = 'map-meta-bar';
  for (const id of ['total-stars']) {
    const span = document.createElement('span');
    span.id = id;
    metaBar.appendChild(span);
  }
  for (const id of ['open-upgrades', 'open-heroes', 'open-settings']) {
    const btn = document.createElement('button');
    btn.id = id;
    metaBar.appendChild(btn);
  }
  document.body.appendChild(metaBar);

  // Sidebar + featured (placeholder structure — _populateSidebar/_renderFeatured need the elements)
  const sidebar = document.createElement('div');
  sidebar.id = 'map-sidebar';
  document.body.appendChild(sidebar);
  for (const id of ['featured-name', 'featured-stars', 'featured-blurb', 'featured-tier', 'featured-play']) {
    const el = document.createElement(id === 'featured-play' ? 'button' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
  const stats = document.createElement('div');
  stats.id = 'lifetime-stats';
  document.body.appendChild(stats);

  // Both overlays must exist as DOM so their constructors cache refs
  for (const ovId of ['upgrade-overlay', 'hero-mgmt-overlay', 'settings-overlay']) {
    const ov = document.createElement('div');
    ov.id = ovId;
    ov.style.display = 'none';
    document.body.appendChild(ov);
  }
  for (const id of [
    'upgrade-tree', 'upgrade-available', 'upgrade-close',
    'hero-rail', 'hero-tree', 'hero-mgmt-avail', 'hero-mgmt-close',
  ]) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

describe('MapSelectScene heroes-overlay integration', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  it('does NOT render the old #hero-picker block', () => {
    const scene = new MapSelectScene();
    scene.create();
    expect(document.getElementById('hero-picker')).toBeNull();
    expect(document.querySelectorAll('.hero-card').length).toBe(0);
  });

  it('clicking #open-heroes opens the Hero Management overlay', () => {
    const scene = new MapSelectScene();
    scene.create();
    document.getElementById('open-heroes').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('flex');
  });

  it('shutdown() hides #hero-mgmt-overlay along with the others', () => {
    const scene = new MapSelectScene();
    scene.create();
    document.getElementById('open-heroes').click();
    scene.shutdown();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('PLAY button still reads selectedHero from SaveManager', () => {
    const save = new SaveManager();
    save.setStars(2, 1);            // unlock Engineer
    save.setSelectedHero('engineer');
    const scene = new MapSelectScene();
    // Stub scene.start to capture launch args
    scene.scene = { start: vi.fn() };
    scene.create();
    document.getElementById('featured-play').click();
    expect(scene.scene.start).toHaveBeenCalledWith('GameScene',
      expect.objectContaining({ heroId: 'engineer' }));
  });
});
```

(Note: `MAPS` data must drive `_populateSidebar`. If the test fails at scene.create() because `featured-name` etc. don't exist for map 0, expand `setupDom` to also seed `MAPS[0]`-required elements — but they're already in the seed above.)

- [ ] **Step 2: Run the renamed test to confirm it fails**

Run: `npx vitest run src/scenes/MapSelectScene.heroOverlay.test.js`
Expected: FAIL — `MapSelectScene` still calls `_renderHeroPicker` and doesn't bind `#open-heroes`.

- [ ] **Step 3: Modify `src/scenes/MapSelectScene.js`**

Replace the file with:

```js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { SaveManager } from '../systems/SaveManager.js';
import { starsDisplay } from '../utils/display.js';
import { UpgradeManager }         from '../systems/UpgradeManager.js';
import { UpgradeTreeOverlay }     from '../ui/UpgradeTreeOverlay.js';
import { SettingsOverlay }        from '../ui/SettingsOverlay.js';
import { HeroManagementOverlay }  from '../ui/HeroManagementOverlay.js';

export default class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelectScene'); }

  create() {
    this.events.on('shutdown', this.shutdown, this);

    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._saveMgr    = new SaveManager();
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);
    this._heroOverlay = new HeroManagementOverlay(this._upgradeMgr, this._saveMgr);

    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._saveMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateSidebar();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
    this._renderMetaBar();
    this._renderStats();
    this._bindUpgrades();
    this._bindHeroes();
    this._bindSettings();
  }

  _populateSidebar() {
    const sidebar = document.getElementById('map-sidebar');
    sidebar.replaceChildren();

    for (const map of MAPS) {
      const unlocked = this._saveMgr.isUnlocked(map.id);

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
        const stars = this._saveMgr.getStars(map.id);
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
    const stars = this._saveMgr.getStars(mapId);

    document.getElementById('featured-name').textContent  = map.name;
    document.getElementById('featured-stars').textContent = stars > 0 ? starsDisplay(stars) : '☆☆☆';
    document.getElementById('featured-blurb').textContent = map.blurb;
    document.getElementById('featured-tier').textContent  =
      'Towers upgrade to Tier ' + map.maxTierAllowed + ' on this map';
  }

  _bindPlay() {
    const old = document.getElementById('featured-play');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      this.scene.start('GameScene', {
        mapId:  this._selectedId,
        heroId: this._saveMgr.getSelectedHero(),
      });
    });
  }

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
    const old = document.getElementById('open-upgrades');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._overlay.open());
  }

  _bindHeroes() {
    const old = document.getElementById('open-heroes');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._heroOverlay.open());
  }

  _bindSettings() {
    const old = document.getElementById('open-settings');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      const am = this.game.registry.get('audio');
      if (!am) return;
      if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am);
      this._settingsOverlay.open();
    });
  }

  shutdown() {
    document.getElementById('map-select').style.display          = 'none';
    document.getElementById('upgrade-overlay').style.display     = 'none';
    document.getElementById('hero-mgmt-overlay').style.display   = 'none';
    document.getElementById('settings-overlay').style.display    = 'none';
  }
}
```

Key removals: the `toCssColor` helper and the `_renderHeroPicker` method are gone. `HEROES` / `HERO_ORDER` imports are removed (they belonged only to the picker).

- [ ] **Step 4: Run the heroOverlay test**

Run: `npx vitest run src/scenes/MapSelectScene.heroOverlay.test.js`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: full suite passes — including the renamed test, the new HeroManagementOverlay tests, the upgradeNode tests, and the new UpgradeTreeOverlay test.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js src/scenes/MapSelectScene.heroOverlay.test.js
git rm --cached src/scenes/MapSelectScene.heroPicker.test.js 2>/dev/null || true
git commit -m "feat(map-select-scene): wire Heroes overlay, drop legacy hero picker

Removes _renderHeroPicker and toCssColor — picker is replaced by the
Heroes overlay. Adds _bindHeroes mirroring _bindUpgrades / _bindSettings
and instantiates HeroManagementOverlay alongside the existing overlays.
shutdown() hides #hero-mgmt-overlay. Renames the picker test to
MapSelectScene.heroOverlay.test.js with assertions for the new bindings.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Manual browser verification

No code changes — but this is gated work per CLAUDE.md ("a passing test is not the definition of done — a working feature is").

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or `vite`, depending on the project's package.json script). Open the URL printed (typically `http://localhost:5173`).

- [ ] **Step 2: Verify MapSelect renders the new layout**

- The `#map-meta-bar` shows three buttons in order: `⚙ Upgrades`, `🦸 Heroes`, `♪ Audio`
- The featured panel no longer shows the small "Commander:" row above the PLAY button
- The PLAY button sits directly below the tier line

If any of these are wrong, stop and fix before continuing.

- [ ] **Step 3: Verify ⚙ Upgrades overlay**

Click `⚙ Upgrades`. The title reads `Doctrine` (not `Command Doctrine`). Exactly 2 columns: `Logistics`, `Arsenal`. No Rael/Engineer/Scout/Pyro columns. Close.

- [ ] **Step 4: Verify Heroes overlay — render**

Click `🦸 Heroes`. The overlay opens with:
- Title `🦸 Hero Command` + available-stars chip on the right
- Left rail: 4 cards. The currently selected hero (Rael by default) has the cyan inspecting border AND the green `✓ SELECTED` badge.
- Locked heroes (Dax/Vex/Mira) appear dimmed with a `Clear Map N` line below the role
- Right pane shows the inspected hero's branch tree with a stars header `★ X / Y spent on {shortName}`

- [ ] **Step 5: Verify hero swap**

If multiple heroes are unlocked, click an unlocked card. Confirm:
- The cyan border AND the green badge both move to that card
- The tree pane swaps to the new hero's nodes
- Close the overlay, then click PLAY. The game should load with the new hero — verify by looking at the HUD portrait/level when the level loads.

If only Rael is unlocked, manually unlock Engineer first: in DevTools console, run:
```js
const save = JSON.parse(localStorage.lastlight_save || '{}');
save.maps = { ...(save.maps || {}), 2: { stars: 1 } };
localStorage.lastlight_save = JSON.stringify(save);
location.reload();
```

- [ ] **Step 6: Verify locked-hero preview**

Click a locked hero card (e.g. Vex if still locked). Confirm:
- The cyan inspecting border moves to that card
- The green `✓ SELECTED` badge stays on whoever was previously selected (does NOT move)
- The tree pane shows the locked hero's nodes
- An orange dashed banner reads `🔒 Clear Map N to unlock {displayName}`
- Clicking any node in this state does nothing (no purchase happens)

- [ ] **Step 7: Verify purchase + refund**

Switch back to Rael (or any unlocked hero with affordable nodes). Click an affordable node:
- The node turns green with a Refund button
- The available-stars chip in the title bar decreases by the node cost

Click the Refund button. Confirm the stars chip rises and the node returns to affordable.

- [ ] **Step 8: Verify close + persistence**

Click the `✕ Close` button. The overlay hides. Reload the page. Reopen the Heroes overlay. Confirm the previously selected hero still has the `✓ SELECTED` badge (persistence via SaveManager).

- [ ] **Step 9: Stop the dev server**

Ctrl-C in the terminal.

- [ ] **Step 10: No commit needed** (this task is verification only). Report any issues found and fix them before moving on.

---

## Task 11: Lint + final suite + push

**Files:** none modified (unless lint surfaces issues).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — count is the prior count (e.g., ~468 plus the additions from this PR).

- [ ] **Step 2: Lint changed files (if eslint configured)**

Run: `ls eslint.config.js .eslintrc* 2>/dev/null`
If a config exists, run: `npx eslint src/ui/HeroManagementOverlay.js src/ui/upgradeNode.js src/ui/UpgradeTreeOverlay.js src/scenes/MapSelectScene.js src/data/heroes.js`
If no config exists, skip — matches the project's current "lint skipped" posture (per session notes).

- [ ] **Step 3: Review the diff**

Run: `git log --oneline origin/feature/phase-3-tower-system..HEAD`
Expected: roughly 9 commits (one per task that committed code; verification tasks don't commit). Skim the diff with `git diff origin/feature/phase-3-tower-system..HEAD --stat` to make sure nothing extra is included.

- [ ] **Step 4: Push the branch**

Confirm with the user before pushing. Then:

Run: `git push -u origin feature/hero-mgmt-overlay`

- [ ] **Step 5: Open the PR (after user confirms)**

Use the `commit-commands:pr` skill or `gh pr create` with base `feature/phase-3-tower-system`. Title: `feat(ui): Hero Management overlay — combine hero swap + per-hero upgrades`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §3.1 meta-bar Heroes button | Task 5 (markup), Task 9 (binding) |
| §3.2 remove featured-panel picker | Task 5 (markup + CSS removal), Task 9 (drop `_renderHeroPicker`) |
| §3.3 new overlay markup + CSS | Task 5 |
| §3.3 rail card structure (portrait, name, role, unlock hint, badge, inspecting) | Task 6 |
| §3.3 tree pane (header, banner, nodes) | Task 6 |
| §3.4 retitle Upgrades → Doctrine + slim branches | Task 3 + Task 5 |
| §4.1 state model (`_inspectedHeroId`, open-resets) | Task 6 + Task 7 |
| §4.2 HeroManagementOverlay class | Task 6 + Task 7 + Task 8 |
| §4.3 extract renderUpgradeNode | Task 2 + Task 3 |
| §4.4 MapSelectScene modifications | Task 9 |
| §4.4 UpgradeTreeOverlay modifications | Task 3 |
| §4.4 index.html modifications | Task 5 |
| §4.5 HEROES.role field | Task 1 |
| §5 click semantics | Task 7 |
| §6 visual states | Task 5 (CSS) + Task 6 (DOM classes) + Task 7 (state transitions) |
| §7.1 upgradeNode tests | Task 2 |
| §7.2 HeroManagementOverlay tests | Tasks 6, 7, 8 |
| §7.3 MapSelectScene test rename | Task 9 |
| §7.4 UpgradeTreeOverlay test | Task 4 |
| §9 acceptance criteria 1–8 | Task 10 (manual browser verification) |
| §9 acceptance criterion 9 (all tests pass) | Task 11 |

All sections covered.

**Type / signature consistency:**

- `renderUpgradeNode(node, upgradeMgr, heroDefs, onChange)` — defined in Task 2, called in Task 3 (`UpgradeTreeOverlay`) and Task 6 (`HeroManagementOverlay`) with the same signature.
- `HeroManagementOverlay` constructor takes `(upgradeMgr, saveMgr)` — Task 6 defines, Task 9 calls with that order.
- DOM ids `#hero-mgmt-overlay`, `#hero-rail`, `#hero-tree`, `#hero-mgmt-avail`, `#hero-mgmt-close`, `#open-heroes` — defined in Task 5, referenced consistently in Tasks 6, 9.
- CSS classes `.ho-card`, `.ho-card.inspecting`, `.ho-card.locked`, `.ho-card-portrait`, `.ho-card-meta`, `.ho-card-name`, `.ho-card-role`, `.ho-card-unlock`, `.ho-card-badge`, `.ho-tree-head`, `.ho-tree-head-sub`, `.ho-tree-head-stars`, `.ho-tree-banner` — defined in Task 5, applied in Task 6, asserted in Tasks 6 and 7.

**Placeholder scan:** No TBD / TODO / "implement later" markers found. Every step has the actual content or command.

**Verified-method check:**

- `SaveManager.getSelectedHero` / `setSelectedHero` / `isHeroUnlocked` / `setStars` / `getStars` / `getTotalStars` / `isUnlocked` / `getStats` — all exist in current codebase.
- `UpgradeManager.getAvailableStars` / `getNodeState` / `purchase` / `refund` / `getPurchasedUpgrades` — all exist (verified in `src/systems/UpgradeManager.js`).
- `UPGRADES[*].branch` / `.cost` / `.requires` / `.starThreshold` / `.heroUnlock` — all exist.
- `HEROES[*].displayName` / `.shortName` / `.portraitChar` / `.bodyColor` / `.strokeColor` / `.unlockMapAfter` — all exist.
- `HEROES[*].role` — added in Task 1 (does NOT exist before Task 1).
- `HERO_ORDER` — exists.
