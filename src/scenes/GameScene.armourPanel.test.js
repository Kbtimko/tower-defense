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

  it('shows the absorbed fraction, not a fabricated mid-formula damage arrow', () => {
    // Ice T1 (8) vs brute/colossus/titan armour (8/15/20) floors to 1 against
    // all three, absorbing 7 of the 8 raw damage: (8-1)/8 = 87.5% -> 88%.
    render({ type: 'ice', damage: TOWER_DEFS.ice.damage, pierce: false });
    expect(el.textContent).toContain('88%');
    expect(el.textContent).not.toContain('→');
  });

  it('marks a floored row apart from a heavy one', () => {
    render({ type: 'archer', damage: TOWER_DEFS.archer.damage, pierce: false });
    expect(el.querySelector('.ar-floor')).not.toBeNull();
    expect(el.querySelector('.ar-heavy')).not.toBeNull();
  });

  it('renders nothing for a high-damage tower armour barely dents', () => {
    // Sniper's raw damage alone already puts every armoured enemy in band
    // 'none' (highest absorption ~25%, under the 0.5 heavy threshold), so
    // this passes regardless of pierce — it does not exercise the pierce
    // path. The pierce guarantee is pinned by the tier-4-branch test below.
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
    // ice T3 (18) still floors vs titan (20): (18-1)/18 = 94%. It only
    // heavily absorbs colossus (armour 15, after=3): (18-3)/18 = 83%.
    expect(el.textContent).toContain('94%');    // titan, floored
    expect(el.textContent).toContain('83%');    // colossus, heavy
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
