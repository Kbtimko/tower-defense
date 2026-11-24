import '@fontsource/orbitron/latin-700.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-700.css';
import { PALETTE, MIX, FONTS, FONT_FACES, TYPE_SCALE, SPACING, EFFECTS } from '../data/theme.js';

const BLACK = '#000000';
const VARIANTS = ['neutral', 'primary', 'danger', 'currency'];

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Rounds each channel half-up (Math.round), so the 0.5 mix of 00 and ff is 0x80.
export function mixHex(a, b, t) {
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca
    .map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function hexToInt(hex) {
  return parseInt(hex.slice(1), 16);
}

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG 2.x contrast ratio; symmetric in its arguments.
export function contrastRatio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function deriveShades(palette, mix) {
  const shades = {
    textMuted: mixHex(palette.text, palette.panel, mix.textMuted),
    textDim: mixHex(palette.text, palette.panel, mix.textDim),
    faceDisabled: mixHex(palette.panel, palette.panelEdge, mix.faceDisabled),
    bevelHi: mixHex(palette.panelEdge, palette.text, mix.bevelHi),
    bevelLo: mixHex(palette.panel, BLACK, mix.bevelLo),
  };
  const hues = {
    neutral: palette.panelEdge,
    primary: palette.accent,
    danger: palette.danger,
    currency: palette.currency,
  };
  const inks = { neutral: palette.text, primary: palette.accent, danger: palette.danger, currency: palette.currency };
  for (const v of VARIANTS) {
    const face = v === 'neutral'
      ? mixHex(palette.panel, palette.panelEdge, mix.faceNeutral)
      : mixHex(palette.panel, hues[v], mix.faceTint);
    shades[`face_${v}`] = face;
    shades[`faceHover_${v}`] = mixHex(face, hues[v], mix.hover);
    shades[`facePressed_${v}`] = mixHex(face, palette.panel, mix.press);
    shades[`edge_${v}`] = hues[v];
    shades[`edgeHover_${v}`] = mixHex(hues[v], palette.text, mix.edgeHover);
    shades[`glow_${v}`] = mixHex(face, hues[v], mix.glow);
    shades[`ink_${v}`] = inks[v];
  }
  return shades;
}

const kebab = (s) => s.replace(/_/g, '-').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeCssVars() {
  const vars = { '--ui-u': '1px' };
  for (const [k, v] of Object.entries(PALETTE)) vars[`--ui-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(deriveShades(PALETTE, MIX))) vars[`--ui-${kebab(k)}`] = v;
  vars['--ui-font-heading'] = FONTS.heading;
  vars['--ui-font-body'] = FONTS.body;
  for (const [k, v] of Object.entries(TYPE_SCALE)) vars[`--ui-fs-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(SPACING)) vars[`--ui-sp-${k}`] = `${v}px`;
  vars['--ui-scanline-alpha'] = String(EFFECTS.scanlineAlpha);
  vars['--ui-sheen-alpha'] = String(EFFECTS.sheenAlpha);
  // Percentages, because the kit tints its glow with color-mix(), which takes a
  // percentage and (unlike a bare number) needs no calc() to get one.
  vars['--ui-glow-rest'] = `${EFFECTS.glowRest * 100}%`;
  vars['--ui-glow-hover'] = `${EFFECTS.glowHover * 100}%`;
  vars['--ui-glow-armed'] = `${EFFECTS.glowArmed * 100}%`;
  return vars;
}

export function applyTheme(doc) {
  const style = doc.documentElement.style;
  for (const [k, v] of Object.entries(themeCssVars())) style.setProperty(k, v);
}

// Never rejects: a blocked or missing face just leaves the fallback stack in
// place. jsdom has no document.fonts, hence the optional chain.
export async function loadThemeFonts(doc) {
  const fonts = doc?.fonts;
  if (!fonts?.load) return;
  await Promise.allSettled(
    FONT_FACES.map(({ family, weight }) => Promise.resolve().then(() => fonts.load(`${weight} 16px "${family}"`))),
  );
}
