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
      : category === 'tower' && type === 'archer'
      ? {
          category: 'tower', type: 'archer', scale: 0.6, anchor: { x: 0.5, y: 0.5 },
          ground: { footY: 40, width: 36 },
          states: {
            idle:   { path: 'a_idle.png',   frameWidth: 64, frameHeight: 64, frames: 4, frameRate: 6 },
            attack: { path: 'a_attack.png', frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
          },
        }
      : category === 'tower' && type === 'mage'
      ? {
          category: 'tower', type: 'mage', scale: 0.6, anchor: { x: 0.5, y: 0.5 },
          ground: { footY: 30, width: 30 },
          states: { idle: { path: 'm_idle.png', frameWidth: 64, frameHeight: 64, frames: 1 } },
          variants: {
            t4a: {
              scale: 0.8, anchor: { x: 0.5, y: 0.6 }, ground: { footY: 34, width: 40 },
              states: { idle: { path: 'm_idle_4a.png', frameWidth: 96, frameHeight: 96, frames: 6, frameRate: 9 } },
            },
          },
        }
      : null,
  SPRITE_MANIFEST: [],
}));

import { EntitySprite } from './EntitySprite.js';
import { shadowSpec } from './grounding.js';

function makeSpriteStub() {
  const s = {
    flipX: false, texture: null, played: [], x: 0, y: 0, scaleX: 1, scaleY: 1,
    setOrigin: vi.fn(() => s), setScale: vi.fn(() => s),
    setTexture: vi.fn((k) => { s.texture = k; return s; }),
    setFlipX: vi.fn((v) => { s.flipX = v; return s; }),
    play: vi.fn((cfg) => { s.played.push(cfg.key ?? cfg); return s; }),
    on: vi.fn(() => s), once: vi.fn(() => s), destroy: vi.fn(),
    tint: null,
    setTintFill: vi.fn((c) => { s.tint = c; return s; }),
    clearTint: vi.fn(() => { s.tint = null; return s; }),
    setTint: vi.fn((c) => { s.tint = c; return s; }),
    displayWidth: 32, displayHeight: 32,
  };
  s.setScale = vi.fn((x, y = x) => {
    s.scaleX = x; s.scaleY = y; s.displayWidth = 16 * x; s.displayHeight = 16 * y; return s;
  });
  s.setY = vi.fn((v) => { s.y = v; return s; });
  s.setPosition = vi.fn((x, y = x) => { s.x = x; s.y = y; return s; });
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

  it('getDisplaySize reports the unsquashed size while squashed', () => {
    const { es } = activeSprite();
    es.setSquash(1, 1);
    const rest = es.getDisplaySize();
    es.setSquash(1.18, 0.82);
    const squashed = es.getDisplaySize();
    expect(squashed.width).toBeCloseTo(rest.width);
    expect(squashed.height).toBeCloseTo(rest.height);
  });

  it('tint and squash are no-ops when inactive', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone' });
    expect(() => { es.setBaseTint(0xffffff); es.setSquash(1.1, 0.9); }).not.toThrow();
  });
});

describe('EntitySprite tier scale (foot pivot)', () => {
  const ARCHER_KEYS = ['sprite-tower-archer-idle', 'sprite-tower-archer-attack'];
  const make = () => {
    const scene = makeScene(ARCHER_KEYS);
    const c = makeContainer();
    const es = new EntitySprite(c, scene, { category: 'tower', type: 'archer' });
    return { scene, es, shadow: c.children[0] };
  };

  it('scales from the foot: the art grows but its foot stays on the pad (S1)', () => {
    const { scene, es, shadow } = make();
    const base = { w: shadow.w, h: shadow.h, x: shadow.x, y: shadow.y };
    es.setTierScale(1.4);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6 * 1.4);
    expect(scene.sprite.scaleY).toBeCloseTo(0.6 * 1.4);
    expect(scene.sprite.y).toBeCloseTo((1 - 1.4) * 40);
    // The foot sits footY·s below the sprite's origin; it must land where the T1 foot was.
    expect(scene.sprite.y + 40 * 1.4 - 40).toBeCloseTo(0);
    expect(shadow.w).toBeCloseTo(base.w * 1.4);
    expect(shadow.h).toBeCloseTo(base.h * 1.4);
    expect(shadow.x).toBe(base.x);
    expect(shadow.y).toBe(base.y);
  });

  it('is idempotent and never compounds across calls', () => {
    const { scene, es, shadow } = make();
    const baseW = shadow.w;
    es.setTierScale(1.4);
    es.setTierScale(1.4);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6 * 1.4);
    expect(shadow.w).toBeCloseTo(baseW * 1.4);
    es.setTierScale(1);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6);
    expect(scene.sprite.y).toBeCloseTo(0);
    expect(shadow.w).toBeCloseTo(baseW);
  });

  it('the squash multiplies on top of the tier scale and (1,1) lands on it (C5, E8)', () => {
    const { scene, es } = make();
    es.setTierScale(1.4);
    es.setSquash(1.2, 0.8);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6 * 1.4 * 1.2);
    expect(scene.sprite.scaleY).toBeCloseTo(0.6 * 1.4 * 0.8);
    es.setSquash(1, 1);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6 * 1.4);
    expect(scene.sprite.scaleY).toBeCloseTo(0.6 * 1.4);
  });

  it('a tier change mid-pop keeps the squash (E7)', () => {
    const { scene, es } = make();
    es.setSquash(1.2, 0.8);
    es.setTierScale(1.25);
    expect(scene.sprite.scaleX).toBeCloseTo(0.6 * 1.25 * 1.2);
    expect(scene.sprite.scaleY).toBeCloseTo(0.6 * 1.25 * 0.8);
  });

  it('getDisplaySize includes the tier scale but not the squash', () => {
    const { es } = make();
    const t1 = es.getDisplaySize();
    es.setTierScale(1.25);
    es.setSquash(1.18, 0.82);
    const sized = es.getDisplaySize();
    expect(sized.width).toBeCloseTo(t1.width * 1.25);
    expect(sized.height).toBeCloseTo(t1.height * 1.25);
  });

  it('pivotOffsetY and groundSpec report the current tier (P1)', () => {
    const { es } = make();
    expect(es.tierScale()).toBe(1);
    expect(es.pivotOffsetY()).toBeCloseTo(0);
    es.setTierScale(1.4);
    expect(es.tierScale()).toBe(1.4);
    expect(es.pivotOffsetY()).toBeCloseTo((1 - 1.4) * 40);
    const g = es.groundSpec();
    expect(g.footY).toBe(40);
    expect(g.width).toBeCloseTo(36 * 1.4);
    expect(g.height).toBeCloseTo(2 * 1.4 * 40);
  });

  it('art without ground data scales from the centre and has no groundSpec', () => {
    const scene = makeScene(['sprite-enemy-drone-move']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'enemy', type: 'drone', initialState: 'move' });
    es.setTierScale(1.4);
    expect(scene.sprite.scaleX).toBeCloseTo(2 * 1.4);
    expect(scene.sprite.y).toBe(0);
    expect(es.pivotOffsetY()).toBe(0);
    expect(es.groundSpec()).toBe(null);
  });

  it('inactive: touches nothing, but still reports the requested tier', () => {
    const scene = makeScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer' });
    expect(es.groundSpec()).toBe(null);
    expect(es.pivotOffsetY()).toBe(0);
    expect(es.resolvedKey('idle')).toBe(null);
    expect(() => es.setTierScale(1.4)).not.toThrow();
    expect(es.tierScale()).toBe(1.4);
    expect(scene.sprite.setScale).not.toHaveBeenCalled();
    expect(scene.sprite.y).toBe(0);
    expect(scene.add.image).not.toHaveBeenCalled();
  });
});

describe('EntitySprite tier variants', () => {
  const BASE = 'sprite-tower-archer-idle';
  // A scene whose animation registry remembers what was created, so a second
  // entity of the same type reuses the first one's animations.
  const makeVariantScene = (keys) => {
    const scene = makeScene(keys);
    const created = new Set();
    scene.anims.exists = vi.fn((k) => created.has(k));
    scene.anims.create = vi.fn((cfg) => { created.add(cfg.key); });
    return scene;
  };

  it('t1 (the default) resolves to the base key: no -t1 key ever exists (E42)', () => {
    const scene = makeVariantScene([BASE]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer' });
    expect(es.resolvedKey('idle')).toBe(BASE);
    expect(scene.sprite.played).toEqual([BASE]);
    expect(scene.anims.create).toHaveBeenCalledWith(expect.objectContaining({ key: BASE }));
  });

  it('a registered variant key is used for texture, animation and play', () => {
    const scene = makeVariantScene([BASE, `${BASE}-t4a`]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer', variant: 't4a' });
    expect(es.resolvedKey('idle')).toBe(`${BASE}-t4a`);
    expect(scene.add.sprite).toHaveBeenCalledWith(0, 0, `${BASE}-t4a`);
    expect(scene.sprite.played).toEqual([`${BASE}-t4a`]);
    expect(scene.anims.generateFrameNumbers).toHaveBeenCalledWith(`${BASE}-t4a`, expect.anything());
    new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer', variant: 't4a' });
    const t4aCreates = scene.anims.create.mock.calls.filter(([cfg]) => cfg.key === `${BASE}-t4a`);
    expect(t4aCreates).toHaveLength(1);
  });

  it('a variant with only some states registered falls back per state (S2, E13)', () => {
    const scene = makeVariantScene([BASE, `${BASE}-t4a`, 'sprite-tower-archer-attack']);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer', variant: 't4a' });
    expect(es.resolvedKey('idle')).toBe(`${BASE}-t4a`);
    expect(es.resolvedKey('attack')).toBe('sprite-tower-archer-attack');
    es.playOnce('attack');
    expect(scene.sprite.played).toContain('sprite-tower-archer-attack');
  });

  it('setVariant switches the texture/animation key and is a no-op when unchanged', () => {
    const scene = makeVariantScene([BASE, `${BASE}-t4a`]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer' });
    expect(scene.sprite.played).toEqual([BASE]);
    es.setVariant('t4a');
    expect(es.resolvedKey('idle')).toBe(`${BASE}-t4a`);
    expect(scene.anims.create).toHaveBeenCalledWith(expect.objectContaining({ key: `${BASE}-t4a` }));
    expect(scene.sprite.played).toEqual([BASE, `${BASE}-t4a`]);
    es.setVariant('t4a');
    expect(scene.sprite.play).toHaveBeenCalledTimes(2);
  });

  it('setVariant re-applies the last state, not the initial one', () => {
    const keys = [BASE, 'sprite-tower-archer-attack', `${BASE}-t4a`, 'sprite-tower-archer-attack-t4a'];
    const scene = makeVariantScene(keys);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer' });
    es.setState('attack');
    es.setVariant('t4a');
    expect(scene.sprite.played.at(-1)).toBe('sprite-tower-archer-attack-t4a');
  });

  it('setVariant is a no-op when inactive', () => {
    const scene = makeVariantScene([]);
    const es = new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer' });
    expect(() => es.setVariant('t4a')).not.toThrow();
    expect(scene.sprite.play).not.toHaveBeenCalled();
  });

  it("a variant manifest entry's scale, anchor, ground and state defs override the base (R2, R3)", () => {
    const MAGE = 'sprite-tower-mage-idle';
    const scene = makeVariantScene([MAGE, `${MAGE}-t4a`]);
    const c = makeContainer();
    const es = new EntitySprite(c, scene, { category: 'tower', type: 'mage', variant: 't4a' });
    expect(scene.sprite.setScale).toHaveBeenCalledWith(0.8);
    expect(scene.sprite.setOrigin).toHaveBeenCalledWith(0.5, 0.6);
    // The base idle is a single image; the 4A idle is a 6-frame sheet.
    expect(scene.anims.create).toHaveBeenCalledWith(expect.objectContaining({ key: `${MAGE}-t4a`, frameRate: 9 }));
    expect(scene.sprite.played).toEqual([`${MAGE}-t4a`]);
    expect(c.children[0]).toMatchObject({ y: shadowSpec({ footY: 34, width: 40 }).y });
    expect(es.groundSpec()).toMatchObject({ footY: 34, width: 40 });
  });

  it('setVariant re-applies the variant anchor, scale, foot and shadow at the current tier, in either order (C1, R2)', () => {
    const MAGE = 'sprite-tower-mage-idle';
    const g4a = shadowSpec({ footY: 34, width: 40 });
    const run = (steps) => {
      const scene = makeVariantScene([MAGE, `${MAGE}-t4a`]);
      const c = makeContainer();
      const es = new EntitySprite(c, scene, { category: 'tower', type: 'mage' });
      steps(es);
      return { s: scene.sprite, shadow: c.children[0] };
    };
    const check = ({ s, shadow }) => {
      expect(s.setOrigin).toHaveBeenLastCalledWith(0.5, 0.6);
      expect(s.scaleX).toBeCloseTo(0.8 * 1.4);
      expect(s.scaleY).toBeCloseTo(0.8 * 1.4);
      expect(s.y).toBeCloseTo((1 - 1.4) * 34);
      expect(shadow.y).toBeCloseTo(g4a.y);
      expect(shadow.w).toBeCloseTo(g4a.width * 1.4);
      expect(shadow.h).toBeCloseTo(g4a.height * 1.4);
    };
    check(run((es) => { es.setTierScale(1.4); es.setVariant('t4a'); }));
    check(run((es) => { es.setVariant('t4a'); es.setTierScale(1.4); }));
  });

  it('a generated variant texture with no manifest variant entry keeps the base defs', () => {
    const scene = makeVariantScene([BASE, `${BASE}-t2`]);
    new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'archer', variant: 't2' });
    expect(scene.sprite.setScale).toHaveBeenCalledWith(0.6);
    expect(scene.anims.create).toHaveBeenCalledWith(expect.objectContaining({ key: `${BASE}-t2`, frameRate: 6 }));
  });

  it('the variant def only applies when the variant key loaded; a fallback uses the base def', () => {
    const MAGE = 'sprite-tower-mage-idle';
    const scene = makeVariantScene([MAGE]);
    new EntitySprite(makeContainer(), scene, { category: 'tower', type: 'mage', variant: 't4a' });
    // Base idle is a single image: shown via setTexture, no animation built for it.
    expect(scene.anims.create).not.toHaveBeenCalled();
    expect(scene.sprite.setTexture).toHaveBeenLastCalledWith(MAGE);
  });
});
