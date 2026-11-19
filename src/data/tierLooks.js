import { PALETTE } from './theme.js';
import { PROJECTILE_FX } from './fx.js';

// Tier looks (#49): how a tower or soldier reads stronger as it upgrades.
// These ship ahead of any bespoke art, so the marks are drawn in code and every
// number lives here. The mockup values are a reference, not maths: they are
// tuned in captures (spec R17, C11). Colours stay as PALETTE strings or numbers
// because this module is also read by plain-Node capture scripts, so it must
// not import src/ui/theme.js; consumers convert with hexToInt.

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const TIER_SCALE = deepFreeze({
  tower: { t1: 1, t2: 1.12, t3: 1.25, t4a: 1.4, t4b: 1.4 },
  soldier: { t1: 1, t2: 1.10, t3: 1.20, t4a: 1.3, t4b: 1.3 },
});

// Only drawn on art-less fallback towers; real tier art replaces it (#73a).
export const TIER_CORE = deepFreeze({
  fromTier: 2, sizeFrac: 0.5, hotFrac: 0.4, periodS: 1.1, alpha: [0.65, 1], stillAlpha: 1,
});

// sizePx is the display box of the 16-px soft `fx-ember` dot, whose bright core is a fraction of it: it must
// include the halo (4 px was near-invisible; the picked mockup drew a 4-px dot plus a 4-px glow).
// startFrac: embers start this fraction of drawn height above the foot (plan P2).
export const TIER_EMBERS = deepFreeze({
  fromTier: 3, count: 3, periodS: 1.8, xFrac: [-0.34, 0.08, 0.38], riseFrac: 0.85,
  sizePx: 10, fadeInFrac: 0.15, stillRiseFrac: 0.38, stillAlpha: 0.8, startFrac: 0.25,
});

export const TIER_RING = deepFreeze({
  rx: 25, ry: 12, lineWidth: 2, alpha: 0.85, depth: 10.55,
  breathe: { periodS: 1.4, scale: 1.07, alphaLow: 0.5 },
  spin: { periodS: 3, dashes: 12, duty: 0.55 },
});

export const TIER_PIPS = deepFreeze({
  radius: 2.5, gapPx: 2, outlinePx: 1.5, outline: PALETTE.panel, minY: 22, gapBelowFootPx: 4,
  badge: { fontPx: 11, padX: 2, padY: 1, cornerPx: 3, ink: PALETTE.panel },
});

// Stand-in ground spec for the Graphics fallback body; height is the drawn
// height the ember rise is measured against (plan P1).
export const TIER_FALLBACK_GROUND = deepFreeze({ footY: 18, width: 36, height: 36 });

export const SOLDIER_RECOLOR = deepFreeze({
  t2: { sepia: 0.35, saturate: 1.3, hueRotate: 0, brightness: 1.05 },
  t3: { sepia: 0.60, saturate: 1.6, hueRotate: -5, brightness: 1.10 },
  // starting point; tune toward the #6fb6ff family (C11, R26)
  t4a: { sepia: 0.90, saturate: 1.4, hueRotate: 170, brightness: 1.15 },
  t4b: { sepia: 0.90, saturate: 2.0, hueRotate: -8, brightness: 1.15 },
});

export const SOLDIER_4A_HUE = deepFreeze({
  target: '#6fb6ff', avoid: PALETTE.slow, minAvoidDeg: 12, maxTargetDeg: 15,
});

// Fill/stroke pairs: t2/t3 are the green-to-gold lerp at 0.35/0.60 (plan P3),
// so a green outline never rings a gold body.
export const SOLDIER_FALLBACK_BODY = deepFreeze({
  t1: { fill: 0x4caf50, stroke: 0x81c784 },
  t2: { fill: 0x8bbc4f, stroke: 0xadd38e },
  t3: { fill: 0xb7c54e, stroke: 0xcddb95 },
  t4a: { fill: 0x6fb6ff, stroke: 0xcfe8ff },
  t4b: { fill: 0xffd34d, stroke: 0xffe9a0 },
});

export const SOLDIER_SHIELD = deepFreeze({
  variant: 't4a', w: 6.5, h: 7.5, dx: 3.6, footLiftPx: 2.4,
  top: '#cfe8ff', bottom: '#6fb6ff', outline: PALETTE.panel,
});

// Derived from the projectile table so a tower has one accent colour, not two
// that can drift. Base colour only: branches do not recolour the mark.
export function towerAccent(type) {
  return PROJECTILE_FX[type].color;
}
