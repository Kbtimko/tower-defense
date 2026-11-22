import { describe, it, expect, afterEach } from 'vitest';
import { resolveEntry, resolveManifest, at2x } from './spriteResolution.js';
import { SPRITE_MANIFEST, spriteManifest } from '../data/sprites.js';
import { SPRITE_2X } from '../data/sprite2x.js';
import { setRenderScale } from './renderScale.js';

const has2x = p => SPRITE_2X.has(p);
const sheet = (path, w = 48) => ({ path, frameWidth: w, frameHeight: w, frames: 4, frameRate: 8 });
const entry = () => ({
  category: 'enemy', type: 'x', scale: 1.5, anchor: { x: 0.5, y: 0.9 }, baseFacing: 'right',
  ground: { footY: 10, width: 20 },
  states: { idle: sheet('a/idle.png'), death: sheet('a/death.png') },
  variants: {
    t2: { scale: 2, states: { idle: sheet('a/t2_idle.png', 64) } },
    t3: { states: { idle: sheet('a/t3_idle.png') } },
  },
});
const key = e => `${e.category}:${e.type}`;

afterEach(() => setRenderScale(1));

describe('at2x', () => {
  it('inserts @2x before the extension', () => expect(at2x('a/b.png')).toBe('a/b@2x.png'));
});

describe('resolveEntry', () => {
  it('k=1 returns the entry unchanged', () => {
    const e = entry();
    expect(resolveEntry(e, 1, () => true)).toBe(e);
  });

  it('k=2 with full coverage doubles frames, halves scale, points at @2x', () => {
    const e = entry();
    const r = resolveEntry(e, 2, () => true);
    expect(r.states.idle).toEqual({ ...e.states.idle, path: 'a/idle@2x.png', frameWidth: 96, frameHeight: 96 });
    expect(r.scale).toBe(0.75);
    expect(r.variants.t2.scale).toBe(1);
    expect(r.variants.t2.states.idle.frameWidth).toBe(128);
    expect(r.variants.t2.states.idle.path).toBe('a/t2_idle@2x.png');
    expect(r.variants.t3.scale).toBeUndefined();
    expect(r.variants.t3.states.idle.path).toBe('a/t3_idle@2x.png');
    expect(r.anchor).toBe(e.anchor);
    expect(r.ground).toBe(e.ground);
    expect(r.baseFacing).toBe('right');
    expect(r.states.idle.frames).toBe(4);
    expect(r.states.idle.frameRate).toBe(8);
  });

  it('does not mutate the input', () => {
    const e = entry();
    resolveEntry(e, 2, () => true);
    expect(e).toEqual(entry());
  });

  it('an entity with one uncovered sheet stays 1x in base and variants', () => {
    const e = entry();
    expect(resolveEntry(e, 2, p => p !== 'a/t3_idle.png')).toBe(e);
    expect(resolveEntry(e, 2, p => p !== 'a/death.png')).toBe(e);
  });
});

describe('real manifest at k=2', () => {
  const displayWidths = e => [
    ...Object.values(e.states ?? {}).map(d => d.frameWidth * (e.scale ?? 1)),
    ...Object.values(e.variants ?? {}).flatMap(v =>
      Object.values(v.states ?? {}).map(d => d.frameWidth * (v.scale ?? e.scale ?? 1))),
  ];

  it('display size is identical at k=1 and k=2 for every real manifest entry and variant', () => {
    const resolved = resolveManifest(SPRITE_MANIFEST, 2, has2x);
    SPRITE_MANIFEST.forEach((e, i) => {
      const a = displayWidths(e);
      const b = displayWidths(resolved[i]);
      expect(b).toHaveLength(a.length);
      b.forEach((w, j) => expect(w).toBeCloseTo(a[j], 6));
    });
  });

  it('no entity stays 1x at k=2', () => {
    const resolved = resolveManifest(SPRITE_MANIFEST, 2, has2x);
    const stayed = SPRITE_MANIFEST.filter((e, i) => resolved[i] === e).map(key);
    expect(stayed).toEqual([]);
  });

  it('every SPRITE_2X path is a manifest sheet path', () => {
    const paths = new Set(SPRITE_MANIFEST.flatMap(e => [
      ...Object.values(e.states ?? {}),
      ...Object.values(e.variants ?? {}).flatMap(v => Object.values(v.states ?? {})),
    ].map(d => d.path)));
    for (const p of SPRITE_2X) expect(paths.has(p)).toBe(true);
  });
});

describe('spriteManifest', () => {
  it('resolves at call time, not import time', () => {
    const archer = m => m.find(e => e.category === 'tower' && e.type === 'archer');
    const base = archer(SPRITE_MANIFEST);
    expect(base).toBeTruthy();
    expect(archer(spriteManifest())).toBe(base);
    setRenderScale(2);
    const first = Object.values(archer(spriteManifest()).states)[0].path;
    expect(first).toContain('@2x.png');
    expect(spriteManifest()).toBe(spriteManifest());
  });
});
