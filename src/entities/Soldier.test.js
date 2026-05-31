import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor() { this.x = 0; this.y = 0; this.visible = true; }
        add() {}
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

import { Soldier } from './Soldier.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {}, lineStyle() {}, strokeCircle() {},
  setVisible() { return this; },
});
const makeScene = () => ({
  add: { graphics: () => makeGraphics(), existing: () => {} },
});

function makeSoldier() {
  return new Soldier(makeScene(), {
    barracks:     { level: 1, branch: null },
    pathProgress: 0,
    pathPoints:   [{x:0,y:0},{x:10,y:0}],
    soldierStats: { hp: 50, damage: 5, respawnDuration: 8, canBlockFlyers: false },
  });
}

describe('Soldier.heal', () => {
  it('restores hp to maxHp when alive', () => {
    const s = makeSoldier();
    s.hp = 10;
    s.heal();
    expect(s.hp).toBe(s.maxHp);
  });

  it('does nothing when dead', () => {
    const s = makeSoldier();
    s.takeDamage(999);
    expect(s.dead).toBe(true);
    const hpBeforeHeal = s.hp;
    s.heal();
    expect(s.dead).toBe(true);
    expect(s.hp).toBe(hpBeforeHeal);
  });

  it('redraws the HP bar after healing', () => {
    const s = makeSoldier();
    s.hp = 10;
    let cleared = false;
    s._hpBar.clear = () => { cleared = true; };
    s.heal();
    expect(cleared).toBe(true);
  });
});
