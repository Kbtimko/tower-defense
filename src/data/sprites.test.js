import { describe, it, expect, afterEach } from 'vitest';
import { SPRITE_MANIFEST, getSpriteConfig, mergeVariants } from './sprites.js';
import { SPRITE_VARIANTS } from './spriteVariants.js';
import { VARIANT_KEYS } from '../assets/artJob.js';
import { TOWER_DEFS } from './towers.js';
import { HEROES } from './heroes.js';
import { setRenderScale } from '../systems/renderScale.js';

describe('SPRITE_MANIFEST', () => {
  it('registers every tower and hero under its runtime id', () => {
    for (const t of Object.keys(TOWER_DEFS)) expect(getSpriteConfig('tower', t)).not.toBeNull();
    for (const h of Object.keys(HEROES))     expect(getSpriteConfig('hero', h)).not.toBeNull();
    expect(getSpriteConfig('soldier', 'default')).not.toBeNull();
    expect(getSpriteConfig('sentry',  'default')).not.toBeNull();
  });

  it('gives every one-shot state more than one frame', () => {
    // A single-frame one-shot never fires animationcomplete, so the entity
    // would stay stuck on that frame forever (and a dead enemy never destroys).
    for (const e of SPRITE_MANIFEST) {
      for (const st of ['attack', 'death']) {
        if (!e.states[st]) continue;
        expect(e.states[st].frames, `${e.category}/${e.type} ${st}`).toBeGreaterThan(1);
      }
    }
  });

  it('has a looping state to revert to after every one-shot', () => {
    for (const e of SPRITE_MANIFEST) {
      if (!e.states.attack) continue;
      expect(Boolean(e.states.idle || e.states.move),
             `${e.category}/${e.type}`).toBe(true);
    }
  });

  it('declares a square frame for every state', () => {
    for (const e of SPRITE_MANIFEST) {
      for (const [st, def] of Object.entries(e.states)) {
        expect(def.frameWidth, `${e.category}/${e.type} ${st}`).toBe(def.frameHeight);
      }
    }
  });
});

describe('mergeVariants', () => {
  const base = [
    { category: 'tower', type: 'archer', states: { idle: { path: 'a.png' } }, variants: { t2: { states: {} } } },
    { category: 'tower', type: 'cannon', states: {} },
  ];
  const t4a = { states: { idle: { path: 'v.png' } } };

  it('adds variants to the matching entry without mutating the input', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    const out = mergeVariants(base, { 'tower/archer': { t4a } });
    expect(out[0].variants).toEqual({ t2: { states: {} }, t4a });
    expect(out[1]).toEqual(base[1]);
    expect(out).not.toBe(base);
    expect(out[0]).not.toBe(base[0]);
    expect(base).toEqual(snapshot);
  });

  it('is a no-op for empty variants', () => {
    expect(mergeVariants(base, {})).toEqual(base);
  });
});

describe('SPRITE_VARIANTS contract', () => {
  it('names existing manifest entries and valid variant keys', () => {
    for (const [key, variants] of Object.entries(SPRITE_VARIANTS)) {
      const [cat, type] = key.split('/');
      expect(getSpriteConfig(cat, type), key).not.toBeNull();
      for (const v of Object.keys(variants)) expect(VARIANT_KEYS, `${key} ${v}`).toContain(v);
    }
  });
});

describe('getSpriteConfig by render scale', () => {
  afterEach(() => setRenderScale(1));

  it('at k=2 resolves the archer to its @2x art at half the scale', () => {
    const base = getSpriteConfig('tower', 'archer');
    setRenderScale(2);
    const at2 = getSpriteConfig('tower', 'archer');
    expect(at2.scale).toBeCloseTo(base.scale / 2, 6);
    expect(at2.states.idle.path.endsWith('@2x.png')).toBe(true);
  });
});

describe('soldier size (4.5)', () => {
  // Spec value: 0.36 pre-4.5 x 1.5, so squads read at a glance.
  it('soldier draws at 1.5x its pre-4.5 size', () => {
    expect(getSpriteConfig('soldier', 'default').scale).toBeCloseTo(0.54, 5);
    const PRE_45 = 0.36;
    for (const e of SPRITE_MANIFEST.filter((m) => m.category === 'soldier')) {
      if (e.scale !== undefined) expect(e.scale, e.type).toBeCloseTo(PRE_45 * 1.5, 5);
    }
  });
});
