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
      : null,
  SPRITE_MANIFEST: [],
}));

import { EntitySprite } from './EntitySprite.js';

function makeSpriteStub() {
  const s = {
    flipX: false, texture: null, played: [],
    setOrigin: vi.fn(() => s), setScale: vi.fn(() => s),
    setTexture: vi.fn((k) => { s.texture = k; return s; }),
    setFlipX: vi.fn((v) => { s.flipX = v; return s; }),
    play: vi.fn((cfg) => { s.played.push(cfg.key ?? cfg); return s; }),
    on: vi.fn(() => s), once: vi.fn(() => s), destroy: vi.fn(),
  };
  return s;
}

function makeScene(registeredKeys) {
  const sprite = makeSpriteStub();
  return {
    sprite,
    add: { sprite: vi.fn(() => sprite) },
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
