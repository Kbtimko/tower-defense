// Theme tokens. PALETTE is docs/art-bible.md §2 verbatim (a test reads the bible
// and compares); everything else is derived from it by mixing, so the UI can
// never grow a hue the bible doesn't name.
export const PALETTE = Object.freeze({
  panel: '#0f1424',
  panelEdge: '#2a3a4a',
  accent: '#4fc3f7',
  currency: '#ffd700',
  danger: '#f07a7a',
  text: '#e8e0d0',
  slow: '#7fe9ff',
  burn: '#ff8a1f',
  stun: '#ffe14d',
  armour: '#9fb3c8',
  heal: '#5dff9a',
  gold: '#ffd700',
});

// Mix ratios (0 = first colour, 1 = second) for deriveShades. Tune here; the
// contrast test fails if a ratio drops an ink below 4.5:1 on its face.
export const MIX = Object.freeze({
  textMuted: 0.3, // text -> panel
  textDim: 0.55, // text -> panel
  faceNeutral: 0.3, // panel -> panelEdge
  faceTint: 0.06, // panel -> variant hue
  faceDisabled: 0.12, // panel -> panelEdge
  hover: 0.04, // face -> edge, one step lighter
  edgeHover: 0.35, // edge -> text: the ring carries hover (neutral's face step is 1/255)
  press: 0.5, // face -> panel, one step darker
  glow: 0.45, // face -> edge
  bevelHi: 0.4, // panelEdge -> text
  bevelLo: 0.55, // panel -> black
});

export const FONTS = Object.freeze({
  heading: '"Orbitron", "Bahnschrift", "Segoe UI", system-ui, sans-serif',
  body: '"Rajdhani", "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif-condensed, "Bahnschrift SemiCondensed", "Helvetica Neue", Arial, sans-serif',
});

// Must match the @fontsource imports in src/ui/theme.js (a test enforces it).
export const FONT_FACES = Object.freeze([
  Object.freeze({ family: 'Orbitron', weight: 700 }),
  Object.freeze({ family: 'Rajdhani', weight: 500 }),
  Object.freeze({ family: 'Rajdhani', weight: 700 }),
]);

// CSS px. xs is 11: Rajdhani's thin strokes vanish below that on navy.
export const TYPE_SCALE = Object.freeze({ xs: 11, sm: 13, md: 15, lg: 18, xl: 24, title: 32 });

export const SPACING = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 });

export const EFFECTS = Object.freeze({
  scanlineAlpha: 0.03, // moiré risk rises with this; 0 is the kill switch
  sheenAlpha: 0.05,
  glowRest: 0.5,
  glowHover: 0.8,
  glowArmed: 0.9, // two-step confirm: the strongest glow the kit paints
  bevelAlpha: 1,
});
