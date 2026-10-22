import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; this.visible = true; this.active = true; this.list = []; }
        add(c) { this.list.push(...[].concat(c)); return this; }
        setDepth(d) { this.depth = d; return this; }
        setVisible(v) { this.visible = v; return this; }
        setActive(v) { this.active = v; return this; }
        destroy() { this.destroyed = true; }
      },
    },
  },
}));

import { Projectile } from './Projectile.js';
import { projectileFx, arcOffset } from '../systems/fxResolve.js';
import { PROJECTILE_FX, PROJECTILE_SHAPES } from '../data/fx.js';
import { PROJECTILE_HIT_RADIUS } from '../data/towers.js';

const makeGfx = () => {
  const calls = [];
  return new Proxy({ calls, visible: true, rotation: 0, y: 0, scale: 1,
    setVisible(v) { this.visible = v; return this; },
    setScale(s) { this.scale = s; return this; },
    setTint() { return this; }, setBlendMode() { return this; },
    setPosition() { return this; }, setDisplaySize() { return this; },
    setRotation(r) { this.rotation = r; return this; },
    setY(y) { this.y = y; return this; },
  }, { get: (t, p) => (p in t ? t[p] : (...a) => { calls.push([p, ...a]); return t; }) });
};
const makeScene = (extra = {}) => ({
  add: { graphics: makeGfx, image: makeGfx, existing() {} },
  ...extra,
});
const opts = (o = {}) => ({ x: 0, y: 0, target: { x: 100, y: 0 }, damage: 5, towerType: 'archer', ...o });

describe('Projectile', () => {
  it('reset re-initialises gameplay fields and resolves fx', () => {
    const p = new Projectile(makeScene(), opts());
    p.dead = true;
    p.reset(opts({ x: 10, y: 20, target: { x: 40, y: 60 }, damage: 9, splashRadius: 30, slowFactor: 0.5,
      pierce: true, towerType: 'cannon', tier: 4, branch: 'A', color: 0x123456 }));
    expect([p.x, p.y, p.targetX, p.targetY]).toEqual([10, 20, 40, 60]);
    expect(p).toMatchObject({ damage: 9, splashRadius: 30, slowFactor: 0.5, pierce: true,
      towerType: 'cannon', tier: 4, branch: 'A', color: 0x123456, dead: false, speed: 280 });
    expect(p.fx).toEqual(projectileFx('cannon', 4, 'A'));
    expect(p.startDist).toBeCloseTo(50 - PROJECTILE_HIT_RADIUS);
    expect(p.visible && p.active).toBe(true);
  });

  it('startDist is at least 1 when fired at point-blank', () => {
    const p = new Projectile(makeScene(), opts({ target: { x: 0, y: 0 } }));
    expect(p.startDist).toBe(1);
  });

  it('fxType picks visuals only; towerType stays the gameplay type', () => {
    const p = new Projectile(makeScene(), opts({ towerType: 'archer', fxType: 'sentry' }));
    expect(p.towerType).toBe('archer');
    expect(p.fx).toEqual(projectileFx('sentry', 1, null));
  });

  it('draws every shape in PROJECTILE_FX without throwing', () => {
    for (const type of Object.keys(PROJECTILE_FX)) {
      expect(() => new Projectile(makeScene(), opts({ towerType: type }))).not.toThrow();
    }
  });

  it('deactivate hides the projectile', () => {
    const p = new Projectile(makeScene(), opts());
    p.deactivate();
    expect(p.visible).toBe(false);
    expect(p.active).toBe(false);
  });

  it('reset clears the trail accumulator', () => {
    const p = new Projectile(makeScene(), opts());
    p._trailAcc = 0.7;
    p.reset(opts());
    expect(p._trailAcc).toBe(0);
  });

  it('updateVisual rotates toward target without moving the ground position', () => {
    const p = new Projectile(makeScene(), opts({ target: { x: 0, y: 50 } }));
    p.updateVisual();
    expect(p.art.rotation).toBeCloseTo(Math.PI / 2);
    expect([p.x, p.y]).toEqual([0, 0]);
  });

  it('cannon arc lifts the body child mid-flight and lands at zero offset', () => {
    const p = new Projectile(makeScene(), opts({ towerType: 'cannon', target: { x: 100, y: 0 } }));
    p.x = (100 - PROJECTILE_HIT_RADIUS) / 2; p.updateVisual();
    expect(p.art.y).toBeCloseTo(-arcOffset(0.5, p.fx.arc));
    expect(p.y).toBe(0);
    p.x = 100; p.updateVisual();
    expect(p.art.y).toBeCloseTo(0);
  });

  it('cannon shell is grounded at the hit radius and peaks midway to it', () => {
    const p = new Projectile(makeScene(), opts({ towerType: 'cannon', target: { x: 200, y: 0 } }));
    p.x = 200 - PROJECTILE_HIT_RADIUS; p.updateVisual();
    expect(p.art.y).toBeCloseTo(0);
    p.x = (200 - PROJECTILE_HIT_RADIUS) / 2; p.updateVisual();
    expect(p.art.y).toBeCloseTo(-p.fx.arc);
  });

  it('every shape draws on the body and only bolt shows the glow', () => {
    for (const shape of PROJECTILE_SHAPES) {
      const type = Object.keys(PROJECTILE_FX).find((t) => PROJECTILE_FX[t].shape === shape);
      expect(type, `no tower uses shape ${shape}`).toBeDefined();
      const p = new Projectile(makeScene(), opts({ towerType: type }));
      expect(p.art.calls.length, shape).toBeGreaterThan(0);
      expect(p.glow.visible, shape).toBe(shape === 'bolt');
    }
  });

  it('drawnY is the ground y plus the art lift', () => {
    const p = new Projectile(makeScene(), opts({ towerType: 'cannon', target: { x: 200, y: 0 } }));
    p.y = 30; p.x = 95; p.updateVisual();
    expect(p.drawnY).toBeCloseTo(30 + p.art.y);
    expect(p.drawnY).toBeLessThan(30);
  });

  it('non-arc shapes never lift', () => {
    const p = new Projectile(makeScene(), opts({ target: { x: 100, y: 0 } }));
    p.x = 50; p.updateVisual();
    expect(p.art.y).toBe(0);
  });

  it('shadow is shown only for shadowed fx and shrinks as height rises', () => {
    const arrow = new Projectile(makeScene(), opts());
    expect(arrow.shadow.visible).toBe(false);
    const c = new Projectile(makeScene(), opts({ towerType: 'cannon' }));
    expect(c.shadow.visible).toBe(true);
    c.x = 0; c.updateVisual();
    const ground = c.shadow.scale;
    c.x = 50; c.updateVisual();
    expect(c.shadow.scale).toBeLessThan(ground);
  });
});
