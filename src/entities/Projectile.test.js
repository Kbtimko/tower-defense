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
import { PROJECTILE_FX } from '../data/fx.js';

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
    expect(p.startDist).toBeCloseTo(50);
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

  it('deactivate hides the projectile and destroys its trail', () => {
    const trail = { destroy: vi.fn() };
    const scene = makeScene({ particleSpawner: { spawnProjectileTrail: () => trail } });
    const p = new Projectile(scene, opts());
    p.deactivate();
    expect(p.visible).toBe(false);
    expect(p.active).toBe(false);
    expect(trail.destroy).toHaveBeenCalledOnce();
  });

  it('reset destroys the previous trail before making a new one', () => {
    const trails = [];
    const scene = makeScene({ particleSpawner: { spawnProjectileTrail: () => { const t = { destroy: vi.fn() }; trails.push(t); return t; } } });
    const p = new Projectile(scene, opts());
    p.reset(opts());
    expect(trails).toHaveLength(2);
    expect(trails[0].destroy).toHaveBeenCalledOnce();
    expect(trails[1].destroy).not.toHaveBeenCalled();
  });

  it('updateVisual rotates toward target without moving the ground position', () => {
    const p = new Projectile(makeScene(), opts({ target: { x: 0, y: 50 } }));
    p.updateVisual();
    expect(p.art.rotation).toBeCloseTo(Math.PI / 2);
    expect([p.x, p.y]).toEqual([0, 0]);
  });

  it('cannon arc lifts the body child mid-flight and lands at zero offset', () => {
    const p = new Projectile(makeScene(), opts({ towerType: 'cannon', target: { x: 100, y: 0 } }));
    p.x = 50; p.updateVisual();
    expect(p.art.y).toBeCloseTo(-arcOffset(0.5, p.fx.arc));
    expect(p.y).toBe(0);
    p.x = 100; p.updateVisual();
    expect(p.art.y).toBeCloseTo(0);
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
