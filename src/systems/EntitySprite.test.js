import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake manifest so we can exercise the active path (real manifest is empty).
vi.mock('../data/sprites.js', () => ({
  getSpriteConfig: (category, type) =>
    category === 'enemy' && type === 'drone'
      ? {
          category: 'enemy', type: 'drone', scale: 2, anchor: { x: 0.5, y: 0.5 },
          baseFacing: 'right',
          states: {
            move:   { path: 'x.png', frameWidth: 16, frameHeight: 16, frames: 4, frameRate: 8 },
            attack: { path: 'y.png', frameWidth: 16, frameHeight: 16, frames: 3, frameRate: 8 },
          },
        }
      : category === 'enemy' && type === 'phantom'
      ? {
          category: 'enemy', type: 'phantom', scale: 1, anchor: { x: 0.5, y: 0.5 },
          ground: { footY: 10, width: 20 },
          states: { move: { path: 'p.png', frameWidth: 16, frameHeight: 16, frames: 4, frameRate: 8 } },
        }
      : null,
  SPRITE_MANIFEST: [],
}));

import { EntitySprite } from './EntitySprite.js';
import { shadowSpec } from './grounding.js';

function makeSpriteStub() {
  const s = {
    flipX: false, texture: null, played: [],
    setOrigin: vi.fn(() => s), setScale: vi.fn(() => s),
    setTexture: vi.fn((k) => { s.texture = k; return s; }),
    setFlipX: vi.fn((v) => { s.flipX = v; return s; }),
    play: vi.fn((cfg) => { s.played.push(cfg.key ?? cfg); return s; }),
    on: vi.fn(() => s), once: vi.fn(() => s), destroy: vi.fn(),
    tint: null,
    setTintFill: vi.fn((c) => { s.tint = c; return s; }),
    clearTint: vi.fn(() => { s.tint = null; return s; }),
    setTint: vi.fn((c) => { s.tint = c; return s; }),
  };
  return s;
}

function makeImageStub() {
  const img = {
    setPosition: vi.fn((x, y) => { img.x = x; img.y = y; return img; }),
    setDisplaySize: vi.fn((w, h) => { img.w = w; img.h = h; return img; }),
    setAlpha: vi.fn((a) => { img.alpha = a; return img; }),
    destroy: vi.fn(),
  };
  return img;
}

function makeScene(registeredKeys) {
  const sprite = makeSpriteStub();
  return {
    sprite,
    add: { sprite: vi.fn(() => sprite), image: vi.fn(() => makeImageStub()) },
    textures: { exists: vi.fn(() => true) },
    anims: { exists: vi.fn(() => false), create: vi.fn(), generateFrameNumbers: vi.fn(() => []) },
    game: { registry: { get: vi.fn(() => registeredKeys) } },
  };
}

function makeContainer() {
  return { children: [], addAt: vi.fn(function (c, i) { this.children.splice(i, 0, c); }) };
}

describe('EntitySprite (inactive / fallback)', () => {
  it('is inactive when no keys are registered', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    expect(es.active).toBe(false);
    expect(scene.add.sprite).not.toHaveBeenCalled();
  });
  it('is inactive for an unknown entity', () => {
    const scene = makeScene(['sprite-enemy-drone-move']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'ghost' });
    expect(es.active).toBe(false);
  });
  it('no-ops setState/setFacing and calls back synchronously from playOnce', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone' });
    expect(() => es.setState('move')).not.toThrow();
    expect(() => es.setFacing(-1)).not.toThrow();
    const cb = vi.fn();
    es.playOnce('death', cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('EntitySprite (active)', () => {
  let scene, es;
  beforeEach(() => {
    scene = makeScene(['sprite-enemy-drone-move', 'sprite-enemy-drone-attack']);
    es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
  });
  it('creates a sprite, applies scale/anchor, and is active', () => {
    expect(es.active).toBe(true);
    expect(scene.add.sprite).toHaveBeenCalledTimes(1);
    expect(scene.sprite.setScale).toHaveBeenCalledWith(2);
    expect(scene.sprite.setOrigin).toHaveBeenCalledWith(0.5, 0.5);
  });
  it('registers one animation per registered spritesheet state', () => {
    expect(scene.anims.create).toHaveBeenCalledTimes(2); // move + attack
  });
  it('plays the initial looping state', () => {
    expect(scene.sprite.played).toContain('sprite-enemy-drone-move');
  });
  it('hasState reports only states with registered art', () => {
    expect(es.hasState('move')).toBe(true);
    expect(es.hasState('attack')).toBe(true);
    expect(es.hasState('death')).toBe(false);   // no death art in the fixture
  });

  it('setFacing flips relative to baseFacing right', () => {
    es.setFacing(-1);
    expect(scene.sprite.setFlipX).toHaveBeenCalledWith(true);
    es.setFacing(1);
    expect(scene.sprite.setFlipX).toHaveBeenCalledWith(false);
  });
  it('setState plays the requested registered animation', () => {
    es.setState('attack');
    expect(scene.sprite.played).toContain('sprite-enemy-drone-attack');
  });
  it('setState ignores an unregistered state', () => {
    es.setState('death');
    expect(scene.sprite.played).not.toContain('sprite-enemy-drone-death');
  });
});

describe('EntitySprite.setFlash', () => {
  const activeSprite = () => {
    const scene = makeScene(['sprite-enemy-drone-move', 'sprite-enemy-drone-attack']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    return { scene, es };
  };

  it('tints the sprite solid white while the flash holds', () => {
    const { scene, es } = activeSprite();
    es.setFlash(true);
    expect(scene.sprite.setTintFill).toHaveBeenCalledWith(0xffffff);
  });

  it('clears the tint when the flash ends', () => {
    const { scene, es } = activeSprite();
    es.setFlash(true);
    es.setFlash(false);
    expect(scene.sprite.clearTint).toHaveBeenCalled();
    expect(scene.sprite.tint).toBe(null);
  });

  it('does not re-tint on repeated calls while the flash holds', () => {
    const { scene, es } = activeSprite();
    es.setFlash(true);
    es.setFlash(true);
    es.setFlash(true);
    expect(scene.sprite.setTintFill).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the component is inactive', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone' });
    expect(() => es.setFlash(true)).not.toThrow();
  });
});

describe('EntitySprite contact shadow', () => {
  const keys = ['sprite-enemy-phantom-move', 'sprite-enemy-drone-move'];

  it('adds a shadow below the sprite, placed by shadowSpec', () => {
    const scene = makeScene(keys);
    const c = makeContainer();
    new EntitySprite(c, scene, { category: 'enemy', type: 'phantom', initialState: 'move' });
    const spec = shadowSpec({ footY: 10, width: 20 });
    const shadow = c.children[0];
    expect(c.children[1]).toBe(scene.sprite);
    expect(shadow).toMatchObject({ x: spec.x, y: spec.y, w: spec.width, h: spec.height, alpha: spec.alpha });
  });

  it('detaches and fades the shadow for a flyer', () => {
    const scene = makeScene(keys);
    const c = makeContainer();
    new EntitySprite(c, scene, { category: 'enemy', type: 'phantom', initialState: 'move', flying: true });
    const spec = shadowSpec({ footY: 10, width: 20 }, { flying: true });
    expect(c.children[0]).toMatchObject({ y: spec.y, alpha: spec.alpha });
  });

  it('adds no shadow when the art has no ground metrics', () => {
    const scene = makeScene(keys);
    const c = makeContainer();
    new EntitySprite(c, scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    expect(scene.add.image).not.toHaveBeenCalled();
    expect(c.children).toEqual([scene.sprite]);
  });

  it('destroys the shadow with the sprite', () => {
    const scene = makeScene(keys);
    const c = makeContainer();
    const es = new EntitySprite(c, scene, { category: 'enemy', type: 'phantom', initialState: 'move' });
    const shadow = c.children[0];
    es.destroy();
    expect(shadow.destroy).toHaveBeenCalled();
  });
});

describe('EntitySprite base tint and squash', () => {
  const activeSprite = () => {
    const scene = makeScene(['sprite-enemy-drone-move']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    return { scene, es };
  };

  it('multiply-tints (not fills) the sprite with the base tint', () => {
    const { scene, es } = activeSprite();
    es.setBaseTint(0x7fe9ff);
    expect(scene.sprite.setTint).toHaveBeenCalledWith(0x7fe9ff);
    expect(scene.sprite.setTintFill).not.toHaveBeenCalled();
  });

  it('a flash during a base tint returns to the base tint, not white', () => {
    const { scene, es } = activeSprite();
    es.setBaseTint(0x7fe9ff);
    es.setFlash(true);
    expect(scene.sprite.tint).toBe(0xffffff);
    es.setFlash(false);
    expect(scene.sprite.tint).toBe(0x7fe9ff);
  });

  it('changing the base tint mid-flash does not break the flash, and applies once it ends', () => {
    const { scene, es } = activeSprite();
    es.setFlash(true);
    scene.sprite.setTint.mockClear();
    es.setBaseTint(0xff8a1f);
    expect(scene.sprite.setTint).not.toHaveBeenCalled();
    es.setFlash(false);
    expect(scene.sprite.tint).toBe(0xff8a1f);
  });

  it('null base tint clears the tint', () => {
    const { scene, es } = activeSprite();
    es.setBaseTint(0x7fe9ff);
    es.setBaseTint(null);
    expect(scene.sprite.clearTint).toHaveBeenCalled();
    expect(scene.sprite.tint).toBe(null);
  });

  it('setSquash multiplies the manifest scale and (1,1) restores it exactly', () => {
    const { scene, es } = activeSprite();
    es.setSquash(1.18, 0.82);
    expect(scene.sprite.setScale).toHaveBeenLastCalledWith(2 * 1.18, 2 * 0.82);
    es.setSquash(1, 1);
    expect(scene.sprite.setScale).toHaveBeenLastCalledWith(2, 2);
  });

  it('tint and squash are no-ops when inactive', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone' });
    expect(() => { es.setBaseTint(0xffffff); es.setSquash(1.1, 0.9); }).not.toThrow();
  });
});
