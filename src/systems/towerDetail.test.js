// Ported from GameScene.armourPanel.test.js and GameScene.branchArmour.test.js:
// the same cases, now against the pure description the tower inspector peek and
// the ring's branch peek render from.
import { describe, it, expect, beforeEach } from 'vitest';
import { describeTowerDetail, describeBranchPreview, describeUpgradeDelta } from './towerDetail.js';
import { appendArmourRows } from '../ui/armourRows.js';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { unlockMapNumber } from './radialItems.js';

const tower = (over) => ({ level: 1, branch: null, range: 120, fireRate: 1, ...over });
const armourText = (rows) => {
  const el = document.createElement('div');
  appendArmourRows(el, rows);
  return el;
};

describe('describeTowerDetail — armour line', () => {
  it('names every armoured enemy that blunts an ice T1', () => {
    const { armour } = describeTowerDetail(tower({ type: 'ice', damage: TOWER_DEFS.ice.damage }));
    const text = armourText(armour.rows).textContent;
    expect(text).toContain('Brute');
    expect(text).toContain('Colossus');
    expect(text).toContain('Titan');
  });

  it('strips the Veth prefix, matching the matchup line', () => {
    const { armour } = describeTowerDetail(tower({ type: 'ice', damage: TOWER_DEFS.ice.damage }));
    expect(armourText(armour.rows).textContent).not.toContain('Veth');
  });

  it('shows the absorbed fraction, not a fabricated mid-formula damage arrow', () => {
    // Ice T1 (8) floors to 1 against brute/colossus/titan: (8-1)/8 = 88%.
    const { armour } = describeTowerDetail(tower({ type: 'ice', damage: TOWER_DEFS.ice.damage }));
    const text = armourText(armour.rows).textContent;
    expect(text).toContain('88%');
    expect(text).not.toContain('→');
  });

  it('marks a floored row apart from a heavy one', () => {
    const { armour } = describeTowerDetail(tower({ type: 'archer', damage: TOWER_DEFS.archer.damage }));
    const el = armourText(armour.rows);
    expect(el.querySelector('.ar-floor')).not.toBeNull();
    expect(el.querySelector('.ar-heavy')).not.toBeNull();
  });

  it('is null for a high-damage tower armour barely dents', () => {
    expect(describeTowerDetail(tower({ type: 'sniper', damage: TOWER_DEFS.sniper.damage, pierce: true })).armour)
      .toBeNull();
  });

  it('is null for a tower armour barely touches', () => {
    expect(describeTowerDetail(tower({ type: 'cannon', damage: TOWER_DEFS.cannon.tier3.damage })).armour)
      .toBeNull();
  });

  it('uses soldier damage for a barracks, not the barracks own zero, and says so', () => {
    const ss = TOWER_DEFS.barracks.soldierStats.tier1;
    const { armour } = describeTowerDetail(tower({ type: 'barracks', damage: 0, soldierStats: ss }));
    expect(armourText(armour.rows).textContent).toContain('Titan');
    expect(armour.head).toContain('soldiers');
  });

  it('reads the live tower damage, not the tier-1 table', () => {
    const { armour } = describeTowerDetail(tower({ type: 'ice', level: 3, damage: TOWER_DEFS.ice.tier3.damage }));
    const el = armourText(armour.rows);
    expect(el.textContent).toContain('94%');    // titan, floored
    expect(el.textContent).toContain('83%');    // colossus, heavy
    expect(el.textContent).not.toContain('Brute');
    expect(el.querySelectorAll('.ar-floor').length).toBe(1);
  });

  it('honours a tier-4 branch that turns pierce on', () => {
    expect(describeTowerDetail(tower({ type: 'ice', damage: TOWER_DEFS.ice.tier3.damage, pierce: true })).armour)
      .toBeNull();
  });
});

describe('describeTowerDetail — header, stats and matchups', () => {
  it('names the tower with its icon, its tier and its branch label', () => {
    const d = describeTowerDetail(tower({ type: 'ice', level: 4, branch: 'A', damage: 28 }));
    expect(d.name).toBe(`${TOWER_DEFS.ice.icon} Ice · Permafrost`);
    expect(d.level).toBe('Level: 4/4');
  });

  it('lists damage, range and fire rate for a firing tower', () => {
    const d = describeTowerDetail(tower({ type: 'archer', damage: 25, range: 135, fireRate: 1 }));
    expect(d.stats).toEqual(['Damage: 25', 'Range: 135', 'Fire rate: 100%']);
  });

  it('lists soldier stats for a barracks', () => {
    const ss = TOWER_DEFS.barracks.soldierStats.tier1;
    const d = describeTowerDetail(tower({ type: 'barracks', damage: 0, soldierStats: ss }));
    expect(d.stats).toEqual([
      `Soldiers: ${ss.count}`, `HP: ${ss.hp} each`, `DMG: ${ss.damage} each`,
      `Respawn: ${ss.respawnDuration}s`, `Blocks: ${ss.canBlockFlyers ? 'Ground + Air' : 'Ground'}`,
    ]);
  });

  it('gives Effective/Weak matchup lines with their tone', () => {
    const d = describeTowerDetail(tower({ type: 'cannon', damage: 45 }));
    expect(d.matchups.find(m => m.tone === 'good').text).toMatch(/^Effective vs: /);
    expect(d.matchups.find(m => m.tone === 'bad').text).toMatch(/^Weak vs: /);
  });
});

describe('describeBranchPreview', () => {
  it('warns on Permafrost and stays silent on Shatter — the ice choice the line exists for', () => {
    const a = describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1, locked: false });
    const b = describeBranchPreview({ towerType: 'ice', branch: 'B', damageMult: 1, locked: false });
    const el = armourText(a.armourRows);
    expect(el.textContent).toContain('Colossus 54%');
    expect(el.textContent).toContain('Titan 71%');
    expect(el.querySelectorAll('.ar-heavy').length).toBe(2);
    expect(b.armourRows).toEqual([]);
  });

  it('carries the label and passive effect', () => {
    const a = describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1, locked: false });
    expect(a.label).toBe('Permafrost');
    expect(a.effect).toBe(TOWER_DEFS.ice.tier4A.passiveEffect);
  });

  it('renders no armour rows when neither branch is blunted', () => {
    for (const branch of ['A', 'B']) {
      expect(describeBranchPreview({ towerType: 'sniper', branch, damageMult: 1, locked: false }).armourRows)
        .toEqual([]);
    }
  });

  it('lets a branch that grants pierce silence the line', () => {
    const towerDefs = { ice: { ...TOWER_DEFS.ice, tier4A: { ...TOWER_DEFS.ice.tier4A, pierce: true } } };
    expect(describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1, locked: false, towerDefs }).armourRows)
      .toEqual([]);
  });

  it('applies the tower damage multiplier the branch will actually land with', () => {
    // round(28 * 1.06) = 30: armour eats 15/30 of a colossus hit, 20/30 of a titan hit.
    const a = describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1.06, locked: false });
    const text = armourText(a.armourRows).textContent;
    expect(text).toContain('Colossus 50%');
    expect(text).toContain('Titan 67%');
  });

  it('still describes armour on a locked branch, and names the unlock map', () => {
    const a = describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1, locked: true });
    expect(a.armourRows.length).toBeGreaterThan(0);
    expect(a.lockText).toBe(`🔒 Unlocked on Map ${unlockMapNumber(4, MAPS)}`);
  });

  it('has no lock text when unlocked', () => {
    expect(describeBranchPreview({ towerType: 'ice', branch: 'A', damageMult: 1, locked: false }).lockText)
      .toBeNull();
  });

  it('gives the strongest tier-4 override as the matchup headline, null when there is none', () => {
    const withOverride = Object.keys(TOWER_DEFS).flatMap(t => ['A', 'B'].map(b => [t, b]))
      .map(([towerType, branch]) => describeBranchPreview({ towerType, branch, damageMult: 1, locked: false }));
    expect(withOverride.some(p => /^⚡ [\d.]+× vs \S/.test(p.matchup ?? ''))).toBe(true);
    for (const p of withOverride) expect(p.matchup === null || p.matchup.startsWith('⚡ ')).toBe(true);
  });
});

describe('appendArmourRows', () => {
  let el;
  beforeEach(() => { el = document.createElement('div'); });

  it('separates rows with a middot and appends nothing for no rows', () => {
    const { armour } = describeTowerDetail(tower({ type: 'ice', damage: TOWER_DEFS.ice.damage }));
    appendArmourRows(el, armour.rows);
    expect(el.textContent.split(' · ').length).toBe(armour.rows.length);
    const empty = document.createElement('div');
    appendArmourRows(empty, []);
    expect(empty.childNodes.length).toBe(0);
  });
});

// The ring's upgrade peek: what the next tier changes, mirroring Tower.upgrade.
describe('describeUpgradeDelta', () => {
  it('gives damage and range deltas for a firing tower', () => {
    const t = tower({ type: 'archer', damage: 15, range: 120, _damageMult: 1, _rangeMult: 1 });
    expect(describeUpgradeDelta(t, 2)).toBe('DMG 15 → 25 · RNG 120 → 135');
  });
  it('applies the meta multipliers the upgraded tower will land with', () => {
    const t = tower({ type: 'archer', damage: 17, range: 132, _damageMult: 1.1, _rangeMult: 1.1 });
    expect(describeUpgradeDelta(t, 2)).toBe(`DMG 17 → ${Math.round(25 * 1.1)} · RNG 132 → ${Math.round(135 * 1.1)}`);
  });
  it('omits a stat the tier leaves alone', () => {
    // Volley (archer 4A) sets damage only.
    const t = tower({ type: 'archer', level: 3, damage: 40, range: 150, _damageMult: 1, _rangeMult: 1 });
    expect(describeUpgradeDelta(t, 4, 'A')).toBe('DMG 40 → 60');
  });
  it('gives soldier HP and damage deltas for a barracks', () => {
    const t = tower({ type: 'barracks', soldierStats: TOWER_DEFS.barracks.soldierStats.tier1 });
    expect(describeUpgradeDelta(t, 2)).toBe('HP 15 → 25 · DMG 20 → 35');
  });
});
