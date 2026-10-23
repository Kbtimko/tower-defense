// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mixHex, contrastRatio, hexToInt, deriveShades, themeCssVars, applyTheme, loadThemeFonts,
} from './theme.js';
import { PALETTE, MIX, FONT_FACES, EFFECTS } from '../data/theme.js';

describe('helpers', () => {
  it('mixHex endpoints and rounded midpoint', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    // 127.5 rounds half-up to 128 = 0x80
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('contrastRatio is 21 for black/white and symmetric', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });
  it('hexToInt', () => {
    expect(hexToInt('#0f1424')).toBe(0x0f1424);
  });
});

describe('publishing', () => {
  it('every var key starts with --ui- and includes the required ones', () => {
    const vars = themeCssVars();
    for (const k of Object.keys(vars)) expect(k.startsWith('--ui-')).toBe(true);
    for (const k of ['--ui-u', '--ui-font-heading', '--ui-font-body', '--ui-fs-xs', '--ui-face-disabled',
      '--ui-text-muted', '--ui-text-dim', '--ui-bevel-hi', '--ui-bevel-lo', '--ui-scanline-alpha',
      '--ui-face-primary', '--ui-edge-danger', '--ui-glow-currency', '--ui-ink-neutral']) {
      expect(vars).toHaveProperty(k);
    }
    expect(vars['--ui-u']).toBe('1px');
  });
  it('applyTheme sets each on documentElement', () => {
    applyTheme(document);
    for (const [k, v] of Object.entries(themeCssVars())) {
      expect(document.documentElement.style.getPropertyValue(k)).toBe(v);
    }
  });
});

describe('loadThemeFonts', () => {
  it('resolves without document.fonts', async () => {
    await expect(loadThemeFonts({})).resolves.toBeUndefined();
  });
  it('loads every face and resolves even when load rejects', async () => {
    const calls = [];
    const doc = { fonts: { load: (q) => { calls.push(q); return Promise.reject(new Error('blocked')); } } };
    await expect(loadThemeFonts(doc)).resolves.toBeUndefined();
    expect(calls).toHaveLength(FONT_FACES.length);
  });
  it('resolves when load throws synchronously', async () => {
    const doc = { fonts: { load: () => { throw new Error('boom'); } } };
    await expect(loadThemeFonts(doc)).resolves.toBeUndefined();
  });
});

// Worst case behind text: the scanline and the sheen both lighten the face.
const composite = (face) => {
  const over = (hex, a) => mixHex(hex, '#ffffff', a);
  return over(over(face, EFFECTS.scanlineAlpha), EFFECTS.sheenAlpha);
};

describe('contrast', () => {
  const s = deriveShades(PALETTE, MIX);
  const pairs = [];
  for (const [name, ink] of [['text', PALETTE.text], ['text-muted', s.textMuted],
    ['accent', PALETTE.accent], ['currency', PALETTE.currency], ['danger', PALETTE.danger]]) {
    pairs.push([`${name} on panel`, ink, PALETTE.panel]);
  }
  for (const v of ['neutral', 'primary', 'danger', 'currency']) {
    pairs.push([`${v} ink on face`, s[`ink_${v}`], s[`face_${v}`]]);
    pairs.push([`${v} ink on hover face`, s[`ink_${v}`], s[`faceHover_${v}`]]);
  }
  it.each(pairs)('%s >= 4.5', (_n, ink, face) => {
    expect(contrastRatio(ink, composite(face))).toBeGreaterThanOrEqual(4.5);
  });
  it('disabled text-dim on face-disabled >= 3', () => {
    expect(contrastRatio(s.textDim, s.faceDisabled)).toBeGreaterThanOrEqual(3);
  });
  it('scanline alpha stays subtle', () => {
    expect(EFFECTS.scanlineAlpha).toBeLessThanOrEqual(0.04);
  });
});

// Neutral's face-hover is 1/255 off its face, so the ring has to carry hover
// for every variant. RGB distance, because a bright hue (gold) lifts mostly
// in one channel.
describe('hover ring', () => {
  const s = deriveShades(PALETTE, MIX);
  const dist = (a, b) => {
    const ch = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [ch(a), ch(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  it.each(['neutral', 'primary', 'danger', 'currency'])('%s ring moves >= 40 RGB on hover', (v) => {
    expect(dist(s[`edge_${v}`], s[`edgeHover_${v}`])).toBeGreaterThanOrEqual(40);
  });
});

describe('sync guards', () => {
  it('PALETTE UI tokens equal the art-bible §2 UI table', () => {
    const md = readFileSync(resolve(process.cwd(), 'docs/art-bible.md'), 'utf8');
    const section = md.split('### UI')[1].split('###')[0];
    const rows = [...section.matchAll(/^\|\s*([a-z-]+)\s*\|\s*`(#[0-9a-f]{6})`/gm)];
    expect(rows.length).toBe(6);
    const camel = (t) => t.replace(/-(\w)/g, (_m, c) => c.toUpperCase());
    for (const [, token, hex] of rows) expect(PALETTE[camel(token)]).toBe(hex);
  });
  it('FONT_FACES matches the @fontsource imports', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/ui/theme.js'), 'utf8');
    const imported = [...src.matchAll(/@fontsource\/([a-z0-9-]+)\/latin-(\d+)\.css/g)]
      .map(([, f, w]) => `${f}:${w}`).sort();
    const declared = FONT_FACES.map((f) => `${f.family.toLowerCase()}:${f.weight}`).sort();
    expect(imported).toEqual(declared);
  });
});
