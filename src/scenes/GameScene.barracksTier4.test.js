// Backlog #44: tapping a tier-3 barracks on a tier-4 map threw in
// _setUpgradeButton (barracks has tier4A/tier4B, never a plain tier4), so the
// panel never opened and the barracks could not be sold or repositioned.
// Exercises the REAL GameScene.prototype._openTowerPanel against the real
// #tower-panel markup from index.html.

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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import GameScene from './GameScene.js';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const panelMarkup = html.slice(
  html.indexOf('<div id="tower-panel"'),
  html.indexOf('</div>', html.indexOf('id="panel-sell-btn"')) + '</div>'.length,
);

const mapIdWithTier = (pred) =>
  Object.keys(MAPS).find(id => pred(MAPS[id].maxTierAllowed));
const TIER4_MAP = mapIdWithTier(t => t >= 4);
const TIER3_MAP = mapIdWithTier(t => t === 3);

function tier3Barracks() {
  return {
    type: 'barracks', level: 3, branch: null, totalCost: 260,
    soldierStats: TOWER_DEFS.barracks.soldierStats.tier3,
  };
}

function open(tower, mapId) {
  const ctx = Object.create(GameScene.prototype);
  ctx.mapId = mapId;
  ctx._openTowerPanel(tower, 100, 100);
  return ctx;
}

describe('tier-3 barracks panel (#44)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="game"></div>' + panelMarkup;
  });

  it('opens on a tier-4 map and offers the two tier-4 paths', () => {
    expect(TIER4_MAP).toBeDefined();
    open(tier3Barracks(), TIER4_MAP);
    expect(document.getElementById('tower-panel').style.display).toBe('block');
    const picker = document.getElementById('panel-branch-picker');
    expect(picker.style.display).toBe('block');
    const labels = [...picker.querySelectorAll('.branch-label')].map(e => e.textContent);
    expect(labels).toEqual([TOWER_DEFS.barracks.tier4A.label, TOWER_DEFS.barracks.tier4B.label]);
    expect(document.getElementById('panel-upgrade-btn').style.display).toBe('none');
    expect(document.getElementById('panel-sell-btn').textContent).toContain('Sell');
  });

  it('shows the paths locked on a tier-3 map, like every other tower', () => {
    expect(TIER3_MAP).toBeDefined();
    open(tier3Barracks(), TIER3_MAP);
    expect(document.getElementById('tower-panel').style.display).toBe('block');
    const buttons = document.querySelectorAll('#panel-branch-picker .branch-choose-btn');
    expect(buttons.length).toBe(2);
    buttons.forEach(b => expect(b.disabled).toBe(true));
    // Built in JS, so the kit classes ride in the className string (3.1).
    buttons.forEach(b => expect([...b.classList]).toEqual(expect.arrayContaining(['ui-btn', 'ui-btn--currency'])));
  });

  it('buys the chosen path: Vanguard soldiers block flyers', () => {
    const tower = tier3Barracks();
    const ctx = open(tower, TIER4_MAP);
    let bought = null;
    ctx.placementManager = {
      upgradeTower: (t, tier, branch) => {
        bought = { tier, branch };
        t.level = tier; t.branch = branch;
        t.soldierStats = TOWER_DEFS.barracks.soldierStats['tier4' + branch];
        return true;
      },
    };
    ctx.pathMgr = { getPathPoints: () => [] };
    // _playTowerPop skips the scale pop under reduced motion.
    ctx.game = { registry: { get: (k) => (k === 'ambientMotion' ? false : undefined) } };
    tower._rebuildSoldiers = () => {};
    document.querySelector('#panel-branch-picker .branch-choose-btn').click();
    expect(bought).toEqual({ tier: 4, branch: 'A' });
    expect(document.getElementById('panel-name').textContent)
      .toContain(TOWER_DEFS.barracks.tier4A.label);
    expect(document.getElementById('panel-soldier-blocks').textContent).toBe('Blocks: Ground + Air');
    expect(document.getElementById('panel-upgrade-btn').textContent).toBe('MAX LEVEL');
    // _setUpgradeButton rewrites className; the kit must survive it.
    expect([...document.getElementById('panel-upgrade-btn').classList])
      .toEqual(expect.arrayContaining(['ui-btn', 'ui-btn--currency', 'maxed']));
  });
});
