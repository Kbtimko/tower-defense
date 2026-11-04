import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor() { this.x = 0; this.y = 0; this.visible = true; this.list = []; }
        add(child) { this.list.push(...[].concat(child)); return this; }
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

import { Soldier } from './Soldier.js';
import { SOLDIER_FORMATION, WALK_BOB } from '../data/soldiers.js';
import { formationOffsets } from '../systems/soldierFormation.js';

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

// A barracks-shaped stub owning a real squad on a straight road running right.
const ROAD = [{ x: 0, y: 100 }, { x: 600, y: 100 }];
function makeSquad({ at = 0.5, count = 3, path = ROAD } = {}) {
  const barracks = { level: 1, branch: null, soldierPathProgress: at, soldiers: [] };
  for (let i = 0; i < count; i++) {
    barracks.soldiers.push(new Soldier(makeScene(), {
      barracks, pathProgress: at, pathPoints: path,
      soldierStats: { hp: 50, damage: 5, respawnDuration: 8, canBlockFlyers: false },
    }));
  }
  return barracks;
}
// Stands in for registered art so state/facing calls are observable.
const ART_WIDTH = 17.28;
function withSpySprite(s) {
  s._sprite = {
    active: true, states: [], facings: [],
    getDisplaySize: () => ({ width: ART_WIDTH, height: ART_WIDTH }),
    setState(n) { this.states.push(n); },
    setFacing(d) { this.facings.push(d); },
    sprite: { setVisible() {} },
  };
  return s._sprite;
}

describe('Soldier render offset (R12)', () => {
  it('draws every child inside _view, not on the logical container', () => {
    const [s] = makeSquad().soldiers;
    expect(s.list).toEqual([s._view]);
    expect(s._view.list).toContain(s._body);
    expect(s._view.list).toContain(s._hpBar);
  });

  it('keeps the container on the road while _view carries the formation offset', () => {
    const b = makeSquad();
    for (const s of b.soldiers) s.update(0.016);
    const offsets = b.soldiers.map(s => ({ dx: s._view.x, dy: s._view.y }));
    for (const s of b.soldiers) { expect(s.x).toBeCloseTo(300); expect(s.y).toBe(100); }
    // At rest the lead faces upstream (S4): one spacing toward lower progress.
    expect(offsets[0].dx).toBeCloseTo(-SOLDIER_FORMATION.fallbackSpacingPx);
    expect(offsets[1].dy).not.toBe(0);
    expect(new Set(offsets.map(o => `${o.dx},${o.dy}`)).size).toBe(3);
  });

  it('sizes the spacing from the art when it is active', () => {
    const b = makeSquad();
    withSpySprite(b.soldiers[0]);
    b.soldiers[0].update(0.016);
    expect(b.soldiers[0]._view.x).toBeCloseTo(-SOLDIER_FORMATION.spacingFrac * ART_WIDTH);
  });

  it('drawnPosition() is the logical point plus the view offset', () => {
    const b = makeSquad();
    b.soldierPathProgress = 0.8;
    const s = b.soldiers[1];
    s.update(0.1);
    s.update(0.05);
    expect(s._view.x).not.toBe(0);
    expect(s.drawnPosition()).toEqual({ x: s.x + s._view.x, y: s.y + s._view.y });
  });
});

describe('Soldier march animation (R14)', () => {
  it("plays 'move' while marching and 'idle' once arrived", () => {
    const b = makeSquad();
    const spy = withSpySprite(b.soldiers[0]);
    b.soldierPathProgress = 0.52; // 12 px
    b.soldiers[0].update(0.1);
    expect(spy.states.at(-1)).toBe('move');
    b.soldiers[0].update(0.1);
    b.soldiers[0].update(0.1);
    expect(b.soldiers[0].pathProgress).toBe(0.52);
    expect(spy.states.at(-1)).toBe('idle');
  });

  it("plays 'idle' when halted by an enemy", () => {
    const b = makeSquad();
    const spy = withSpySprite(b.soldiers[0]);
    b.soldierPathProgress = 0.8;
    const enemy = { x: b.soldiers[0].x, y: 100, dead: false, def: {} };
    b.soldiers[0].update(0.1, [enemy]);
    expect(b.soldiers[0].pathProgress).toBe(0.5);
    expect(spy.states.at(-1)).toBe('idle');
  });

  it('bobs while marching, and not at all under reduced motion', () => {
    const lead = (b) => formationOffsets(b.soldiers.length, { x: 1, y: 0 }, SOLDIER_FORMATION.fallbackSpacingPx,
      SOLDIER_FORMATION.flankBackFrac)[0];
    const bobs = (reducedMotion) => {
      const b = makeSquad();
      b.soldierPathProgress = 0.9;
      const out = [];
      for (let i = 0; i < 6; i++) {
        b.soldiers[0].update(0.03, [], { reducedMotion });
        out.push(b.soldiers[0]._view.y - lead(b).dy);
      }
      return out;
    };
    expect(Math.max(...bobs(false).map(Math.abs))).toBeGreaterThan(0.5);
    expect(Math.max(...bobs(false).map(Math.abs))).toBeLessThanOrEqual(WALK_BOB.amplitudePx);
    expect(bobs(true).every(v => v === 0)).toBe(true);
  });

  it('E6: faces the way it walks and flips when walking back', () => {
    const b = makeSquad();
    const spy = withSpySprite(b.soldiers[0]);
    b.soldierPathProgress = 0.8;
    b.soldiers[0].update(0.1);
    expect(spy.facings.at(-1)).toBeGreaterThan(0);
    b.soldierPathProgress = 0.2;
    b.soldiers[0].update(0.1);
    expect(spy.facings.at(-1)).toBeLessThan(0);
  });

  it('E6: facing is deadzoned on a steep road', () => {
    // dx is 1/10 of dy: a real but tiny leftward-or-rightward lean that must not mirror the art.
    const b = makeSquad({ path: [{ x: 0, y: 0 }, { x: 10, y: 100 }] });
    const spy = withSpySprite(b.soldiers[0]);
    b.soldierPathProgress = 0.9;
    b.soldiers[0].update(0.1);
    b.soldierPathProgress = 0.1;
    b.soldiers[0].update(0.1);
    expect(spy.facings.length).toBeGreaterThan(0);
    expect(spy.facings.every(d => d === 0)).toBe(true);
  });

  it('S4: at rest the soldier faces upstream', () => {
    const b = makeSquad();
    const spy = withSpySprite(b.soldiers[0]);
    b.soldiers[0].update(0.016);
    expect(spy.facings.at(-1)).toBeLessThan(0);
  });
});
