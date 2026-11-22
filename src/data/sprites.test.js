import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
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

// 4.3 enemy refresh: new art must not change how big the enemies read on the map.
// Targets are the pre-refresh footprints, measured from commit 047b599
// (src/data/sprites.js ground.width, and the old move sheet's frame-0 alpha bbox
// x scale). The titan went from an upright to a horizontal silhouette, so its
// ground width is no longer comparable; its longest drawn side is held instead
// (spec: 104, inside the old 104-112 range).
describe('enemy footprints hold their pre-4.3 size', () => {
  const within = (actual, target, tol) => Math.abs(actual - target) / target <= tol;

  // Minimal 8-bit RGBA non-interlaced PNG decode: just enough to read frame 0's
  // alpha bbox without adding an image dependency.
  function drawnExtent(entry) {
    const st = entry.states.move;
    const buf = readFileSync(resolve(process.cwd(), 'public', st.path));
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    let pos = 8; const idat = [];
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
      if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
      pos += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * 4, px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], row = y * (stride + 1) + 1;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? px[y * stride + i - 4] : 0;
        const b = y ? px[(y - 1) * stride + i] : 0;
        const c = i >= 4 && y ? px[(y - 1) * stride + i - 4] : 0;
        const x = raw[row + i];
        let v;
        if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b;
        else if (f === 3) v = x + ((a + b) >> 1);
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        px[y * stride + i] = v & 255;
      }
    }
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < st.frameHeight; y++) for (let x = 0; x < st.frameWidth; x++) {
      if (px[y * stride + x * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { w: (x1 - x0 + 1) * entry.scale, h: (y1 - y0 + 1) * entry.scale };
  }

  it.each([['drone', 32.2, 32.4], ['phantom', 30.2, 30.2]])(
    '%s ground width is within 5%% of %s and its drawn longest side within 15%% of %s', (type, ground, drawn) => {
      const e = getSpriteConfig('enemy', type);
      expect(within(e.ground.width, ground, 0.05), `${type} ground.width ${e.ground.width}`).toBe(true);
      const d = drawnExtent(e);
      expect(within(Math.max(d.w, d.h), drawn, 0.15), `${type} drawn ${d.w.toFixed(1)}x${d.h.toFixed(1)}`).toBe(true);
    });

  it('titan longest drawn side is within 5% of 104', () => {
    const e = getSpriteConfig('enemy', 'titan');
    const d = drawnExtent(e);
    expect(within(Math.max(d.w, d.h), 104, 0.05), `titan drawn ${d.w.toFixed(1)}x${d.h.toFixed(1)}`).toBe(true);
  });
});
