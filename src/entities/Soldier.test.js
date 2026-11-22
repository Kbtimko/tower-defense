import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor() { this.x = 0; this.y = 0; this.visible = true; this.list = []; }
        add(child) { this.list.push(...[].concat(child)); return this; }
        addAt(child, i) { this.list.splice(i, 0, child); return this; }
        getIndex(child) { return this.list.indexOf(child); }
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

// A spy that still runs the real layout, so call counts show when it is recomputed.
vi.mock('../systems/soldierFormation.js', async (importOriginal) => {
  const real = await importOriginal();
  return { formationOffsets: vi.fn(real.formationOffsets) };
});

// A spy over the real manifest so one test can declare real 4A art.
vi.mock('../data/sprites.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, getSpriteConfig: vi.fn(real.getSpriteConfig) };
});

import { Soldier } from './Soldier.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { SOLDIER_SHIELD } from '../data/tierLooks.js';

// Derived so a future soldier resize doesn't strand hardcoded 0.36-era numbers.
const SOLDIER_ART = SPRITE_MANIFEST.find((m) => m.category === 'soldier' && m.type === 'default');
const SOLDIER_SCALE = SOLDIER_ART.scale;
import { SOLDIER_FORMATION, WALK_BOB } from '../data/soldiers.js';
import { formationOffsets } from '../systems/soldierFormation.js';
import { getSpriteConfig } from '../data/sprites.js';

// Records what was drawn and where the Graphics sits, so the tier look can be read back.
const makeGraphics = () => {
  const g = {
    calls: [], x: 0, y: 0, scaleX: 1, scaleY: 1, visible: true,
    setVisible(v) { g.visible = v; return g; },
    setScale(x, y = x) { g.scaleX = x; g.scaleY = y; return g; },
    setPosition(x, y) { g.x = x; g.y = y; return g; },
  };
  for (const m of ['clear', 'fillStyle', 'fillCircle', 'fillRect', 'lineStyle', 'strokeCircle',
                   'fillGradientStyle', 'fillTriangle', 'fillPoints', 'strokePoints']) {
    g[m] = (...args) => { g.calls.push([m, ...args]); return g; };
  }
  return g;
};
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
const ART_WIDTH = 48 * SOLDIER_SCALE;
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

describe('Soldier formation turns (ruling 9)', () => {
  const S = SOLDIER_FORMATION.fallbackSpacingPx;
  // Lead at rest sits one spacing upstream (-S); ordered downstream it belongs at +S.
  const orderDownstream = () => {
    const b = makeSquad();
    b.soldiers[0].update(0.02);
    expect(b.soldiers[0]._view.x).toBeCloseTo(-S);
    b.soldierPathProgress = 0.9;
    return b.soldiers[0];
  };

  it('eases the flip part-way on a short frame and lands by turnMs', () => {
    const s = orderDownstream();
    const stepMs = SOLDIER_FORMATION.turnMs / 6;
    s.update(stepMs / 1000);
    expect(s._view.x).toBeGreaterThan(-S + 0.1);
    expect(s._view.x).toBeLessThan(S - 0.1);
    for (let i = 0; i < 4; i++) s.update(stepMs / 1000);
    expect(s._view.x).toBeLessThan(S - 0.1); // 5/6 of turnMs: not there yet
    s.update(stepMs / 1000);
    expect(s._view.x).toBeCloseTo(S, 6);
  });

  it('snaps in one frame under reduced motion', () => {
    const s = orderDownstream();
    s.update(0.001, [], { reducedMotion: true });
    expect(s._view.x).toBeCloseTo(S, 9);
  });

  it('a soldier killed mid-march respawns straight into its rest slot (no ease)', () => {
    const s = orderDownstream();
    for (let i = 0; i < 3; i++) s.update(0.1); // marching: the lead is out front, downstream
    expect(s._view.x).toBeCloseTo(S, 6);
    s.takeDamage(1e9);
    s.respawn(); // back at the rally point (0.9), at rest: the lead belongs upstream
    s.update(0.001);
    expect(s._view.x).toBeCloseTo(-S, 9);
    expect(s._view.y).toBeCloseTo(0, 9);
  });

  it('does not ease the very first layout (no spread-out animation on spawn)', () => {
    const [s] = makeSquad().soldiers;
    s.update(0.001);
    expect(s._view.x).toBeCloseTo(-S, 9);
  });
});

describe('Soldier layout cost (minor 1)', () => {
  it('recomputes the formation while marching or when the squad changes, not every frame at rest', () => {
    const b = makeSquad();
    const [s] = b.soldiers;
    s.update(0.016);
    formationOffsets.mockClear();
    for (let i = 0; i < 5; i++) s.update(0.016);
    expect(formationOffsets).not.toHaveBeenCalled();
    b.soldiers.push(makeSquad().soldiers[0]);
    s.update(0.016);
    expect(formationOffsets).toHaveBeenCalledTimes(1);
    b.soldierPathProgress = 0.9;
    s.update(0.016);
    s.update(0.016);
    expect(formationOffsets).toHaveBeenCalledTimes(3);
  });
});

describe('Soldier outside its squad list (minor 2)', () => {
  it('draws with no offset instead of throwing', () => {
    const b = makeSquad();
    const stray = b.soldiers.pop();
    expect(() => stray.update(0.016)).not.toThrow();
    expect(stray._view.x).toBe(0);
    expect(stray._view.y).toBe(0);
  });
});

describe('Soldier tier look (R16, R16b, S9, S10)', () => {
  const BASE_KEYS = ['sprite-soldier-default-idle', 'sprite-soldier-default-attack'];
  const CELL = 48; // soldier frame width (src/data/sprites.js)
  // Real displayWidth follows the scale, so getDisplaySize() carries the tier scale.
  const makeSprite = () => ({
    x: 0, y: 0, scaleX: 1, scaleY: 1, flipX: false, visible: true,
    displayWidth: CELL, displayHeight: CELL,
    setOrigin() { return this; },
    setScale(x, y = x) {
      this.scaleX = x; this.scaleY = y;
      this.displayWidth = CELL * Math.abs(x); this.displayHeight = CELL * Math.abs(y);
      return this;
    },
    setFlipX(f) { this.flipX = f; return this; },
    setVisible(v) { this.visible = v; return this; },
    setTexture() {}, play() {}, on() {}, once() {}, destroy() {},
  });
  const makeImage = () => {
    const img = { destroy() {} };
    for (const m of ['setPosition', 'setDisplaySize', 'setAlpha', 'setVisible']) img[m] = () => img;
    return img;
  };
  const artScene = (spriteKeys) => ({
    add: { graphics: () => makeGraphics(), sprite: makeSprite, image: makeImage, existing() {} },
    anims: { exists: () => true, create() {}, generateFrameNumbers: () => [] },
    textures: { exists: () => true },
    game: { registry: { get: () => spriteKeys } },
  });
  const STATS = { hp: 50, damage: 5, respawnDuration: 8, canBlockFlyers: false };

  function squad({ level = 1, branch = null, keys = null, path = ROAD, at = 0.5 } = {}) {
    const barracks = { level, branch, soldierPathProgress: at, soldiers: [] };
    const scene = keys ? artScene(keys) : makeScene();
    barracks.soldiers.push(new Soldier(scene, { barracks, pathProgress: at, pathPoints: path, soldierStats: STATS }));
    return { barracks, s: barracks.soldiers[0] };
  }
  const lastFill = (g) => g.calls.filter(c => c[0] === 'fillStyle').at(-1)[1];

  it('takes the tier variant key and the tier scale on the art', () => {
    const { s } = squad({ level: 3, keys: [...BASE_KEYS, 'sprite-soldier-default-idle-t3'] });
    expect(s._sprite.active).toBe(true);
    expect(s._sprite.resolvedKey('idle')).toMatch(/-t3$/);
    expect(s._sprite.sprite.scaleX).toBeCloseTo(SOLDIER_SCALE * 1.2, 9);
  });

  it('E12: with no art the fallback body takes the tier colour and grows from its foot', () => {
    const { s } = squad({ level: 4, branch: 'B' });
    expect(s._sprite.active).toBe(false);
    expect(lastFill(s._body)).toBe(0xffd34d);
    expect(s._body.scaleX).toBeCloseTo(1.3, 9);
    expect(s._body.scaleY).toBeCloseTo(1.3, 9);
    expect(s._body.y).toBeCloseTo((1 - 1.3) * 4, 9);
  });

  it('T1 keeps the old green body at full size', () => {
    const { s } = squad();
    expect(lastFill(s._body)).toBe(0x4caf50);
    expect(s._body.scaleX).toBe(1);
    expect(s._body.y).toBeCloseTo(0, 9);
  });

  describe('S9: the 4A shield', () => {
    it('only Vanguard (4A) carries one', () => {
      expect(squad({ level: 4, branch: 'A' }).s._shield).not.toBeNull();
      expect(squad({ level: 4, branch: 'A', keys: BASE_KEYS }).s._shield).not.toBeNull();
      expect(squad({ level: 4, branch: 'B' }).s._shield).toBeNull();
      expect(squad({ level: 3 }).s._shield).toBeNull();
    });

    it('is left to the art when the manifest declares real 4A art', () => {
      const real = getSpriteConfig.getMockImplementation();
      getSpriteConfig.mockImplementation((c, t) => {
        const cfg = real(c, t);
        return c === 'soldier' ? { ...cfg, variants: { t4a: {} } } : cfg;
      });
      try {
        expect(squad({ level: 4, branch: 'A' }).s._shield).toBeNull();
      } finally {
        getSpriteConfig.mockImplementation(real);
      }
    });

    it('draws in _view above the sprite and body, below the HP bar', () => {
      const { s } = squad({ level: 4, branch: 'A', keys: BASE_KEYS });
      const at = (o) => s._view.list.indexOf(o);
      expect(at(s._shield)).toBeGreaterThan(at(s._sprite.sprite));
      expect(at(s._shield)).toBeGreaterThan(at(s._body));
      expect(at(s._shield)).toBe(at(s._hpBar) - 1);
    });

    it('stands on the foot (art ground line, or the fallback body bottom), scaled by the tier', () => {
      const art = squad({ level: 4, branch: 'A', keys: BASE_KEYS }).s;
      expect(art._shield.y).toBeCloseTo(SOLDIER_ART.ground.footY - SOLDIER_SHIELD.footLiftPx, 9);
      expect(art._shield.x).toBeCloseTo(SOLDIER_SHIELD.dx, 9);
      expect(art._shield.scaleX).toBeCloseTo(1.3, 9);
      expect(art._shield.scaleY).toBeCloseTo(1.3, 9);
      const fallback = squad({ level: 4, branch: 'A' }).s;
      expect(fallback._shield.y).toBeCloseTo(4 - SOLDIER_SHIELD.footLiftPx, 9);
    });

    it('is a gradient kite drawn with its bottom on its own origin', () => {
      const { s } = squad({ level: 4, branch: 'A' });
      const ys = s._shield.calls.filter(c => c[0] === 'fillTriangle').flatMap(c => [c[2], c[4], c[6]]);
      expect(ys.length).toBeGreaterThan(0);
      expect(Math.max(...ys)).toBeCloseTo(0, 9);
      expect(Math.min(...ys)).toBeCloseTo(-SOLDIER_SHIELD.h, 9);
      const grads = s._shield.calls.filter(c => c[0] === 'fillGradientStyle');
      const colours = new Set(grads.flatMap(c => c.slice(1, 5)));
      expect(colours.has(0xcfe8ff)).toBe(true); // top
      expect(colours.has(0x6fb6ff)).toBe(true); // bottom
      expect(s._shield.calls.some(c => c[0] === 'strokePoints')).toBe(true);
    });
  });

  for (const keys of [BASE_KEYS, null]) {
    const label = keys ? 'with art' : 'in the fallback';
    it(`E19/E20: the shield mirrors to the front ${label}, and a deadzone frame keeps the side`, () => {
      // Road runs left then turns straight down: x=600 -> 0 at y=0, then y=0 -> 600 at x=0.
      const L = [{ x: 600, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 600 }];
      const { barracks, s } = squad({ level: 4, branch: 'A', keys, path: L, at: 0.25 });
      expect(s._shield.x).toBeGreaterThan(0); // default: faces right
      barracks.soldierPathProgress = 0.75;
      s.update(0.1); // marching left
      expect(s._shield.scaleX).toBeLessThan(0);
      expect(s._shield.x).toBeLessThan(0);
      s.setPathProgress(0.6, L); // on the vertical leg: facingDirX gives 0
      s.update(0.1);
      expect(s._shield.scaleX).toBeCloseTo(-1.3, 9);
      expect(s._shield.x).toBeCloseTo(-SOLDIER_SHIELD.dx, 9);
    });

    it(`E41: the shield hides on death and shows on respawn ${label}`, () => {
      const { s } = squad({ level: 4, branch: 'A', keys });
      s.takeDamage(999);
      expect(s._shield.visible).toBe(false);
      expect(s.lookSnapshot()).toMatchObject({ shield: false, dead: true });
      s.respawn();
      expect(s._shield.visible).toBe(true);
      expect(s.lookSnapshot()).toMatchObject({ shield: true, dead: false });
    });
  }

  it('E17: dying and respawning keeps the look built for the barracks tier', () => {
    const { barracks, s } = squad({ level: 3, keys: [...BASE_KEYS, 'sprite-soldier-default-idle-t3'] });
    // A barracks change that did not rebuild this soldier must not restyle it.
    barracks.level = 4; barracks.branch = 'B';
    s.takeDamage(999);
    s.respawn();
    s.update(0.016);
    expect(s._variant).toBe('t3');
    expect(s._sprite.tierScale()).toBe(1.2);
    expect(s._sprite.sprite.scaleX).toBeCloseTo(SOLDIER_SCALE * 1.2, 9);
    expect(s._sprite.resolvedKey('idle')).toBe('sprite-soldier-default-idle-t3');
    expect(s.lookSnapshot().key).toBe('sprite-soldier-default-idle-t3');
  });

  it('lookSnapshot reports the tier, key, scale and shield', () => {
    const { s } = squad({ level: 4, branch: 'A', keys: BASE_KEYS });
    expect(s.lookSnapshot()).toEqual({
      level: 4, branch: 'A', key: 'sprite-soldier-default-idle', scale: 1.3, shield: true, dead: false,
    });
  });

  it('E16: formation spacing grows with the tier display width', () => {
    const t1 = squad({ keys: BASE_KEYS }).s;
    const t4 = squad({ level: 4, branch: 'B', keys: BASE_KEYS }).s;
    const t1Width = t1._sprite.getDisplaySize().width;
    expect(t1Width).toBeCloseTo(CELL * SOLDIER_SCALE, 9);
    expect(t4._targetLayout().spacing).toBeCloseTo(SOLDIER_FORMATION.spacingFrac * 1.3 * t1Width, 9);
  });
});

describe('4A shield proportion (4.5)', () => {
  const drawn = SOLDIER_ART.states.idle.frameWidth * SOLDIER_ART.scale;
  // Pre-4.5 ratios: shield tuned for the 48px frame drawn at scale 0.36.
  const PRE_W = 6.5 / (48 * 0.36);
  const PRE_DX = 3.6 / (48 * 0.36);
  it('keeps the shield width in proportion to the drawn soldier', () => {
    expect(SOLDIER_SHIELD.w / drawn).toBeGreaterThan(PRE_W * 0.95);
    expect(SOLDIER_SHIELD.w / drawn).toBeLessThan(PRE_W * 1.05);
  });
  it('keeps the shield offset in proportion to the drawn soldier', () => {
    expect(SOLDIER_SHIELD.dx / drawn).toBeGreaterThan(PRE_DX * 0.95);
    expect(SOLDIER_SHIELD.dx / drawn).toBeLessThan(PRE_DX * 1.05);
  });
});
