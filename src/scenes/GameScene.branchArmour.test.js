// The tier-4 branch cards' armour line. Exercises the REAL
// GameScene.prototype._renderBranchPicker against real DOM, as
// GameScene.armourPanel.test.js does for the tower panel.

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

const UNLOCKED = { maxTierAllowed: 4 };
let container;

function render(def, map = UNLOCKED, ctx = {}) {
  GameScene.prototype._renderBranchPicker.call(ctx, container, def, map);
  const [a, b] = container.querySelectorAll('.branch-card');
  return { a, b };
}

describe('branch card armour line', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('warns on Permafrost and stays silent on Shatter — the ice choice the line exists for', () => {
    const { a, b } = render(TOWER_DEFS.ice);
    const line = a.querySelector('.branch-armour');
    expect(line).not.toBeNull();
    // Permafrost 28 vs colossus 15 → 13 through (54%), vs titan 20 → 8 (71%).
    expect(line.textContent).toContain('Colossus 54%');
    expect(line.textContent).toContain('Titan 71%');
    expect(line.querySelectorAll('.ar-heavy').length).toBe(2);
    expect(b.querySelector('.branch-armour')).toBeNull();
  });

  // Sniper branches out-damage every armour value, so this passes with or
  // without pierce; the pierce guarantee is pinned by the next test.
  it('renders no armour line when neither branch is blunted', () => {
    const { a, b } = render(TOWER_DEFS.sniper);
    expect(a.querySelector('.branch-armour')).toBeNull();
    expect(b.querySelector('.branch-armour')).toBeNull();
  });

  it('lets a branch that grants pierce silence the line', () => {
    const def = {
      ...TOWER_DEFS.ice,
      tier4A: { ...TOWER_DEFS.ice.tier4A, pierce: true },
    };
    const { a } = render(def);
    expect(a.querySelector('.branch-armour')).toBeNull();
  });

  it('applies the tower damage multiplier the branch will actually land with', () => {
    // ars_overcharge (1.06) makes Permafrost round(28*1.06) = 30 on upgrade
    // (Tower.js upgrade), so armour eats 15/30 of a colossus hit and 20/30 of
    // a titan hit — not the 54%/71% the unscaled table damage would print.
    const { a } = render(TOWER_DEFS.ice, UNLOCKED, { selectedTower: { _damageMult: 1.06 } });
    const line = a.querySelector('.branch-armour');
    expect(line.textContent).toContain('Colossus 50%');
    expect(line.textContent).toContain('Titan 67%');
  });

  it('still shows the armour line on a locked card, so the choice is legible before it unlocks', () => {
    const { a } = render(TOWER_DEFS.ice, { maxTierAllowed: 3 });
    expect(a.querySelector('.branch-armour')).not.toBeNull();
  });
});
