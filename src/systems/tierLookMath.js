import { TIER_SCALE, TIER_CORE, TIER_EMBERS } from '../data/tierLooks.js';
import { tierVariant } from './spriteKeys.js';
import { SHADOW } from '../data/grounding.js';

// Pure maths for the tier marks (#49). Must not import src/ui/: the Node
// capture harness imports this module too.

const PIPS_BY_VARIANT = { t1: 1, t2: 2, t3: 3, t4a: 'A', t4b: 'B' };
const frac = (x) => x - Math.floor(x);
// Cosine-shaped so t=0 sits at the rest end of every cycle.
const wave = (tSec, periodS) => (1 - Math.cos((2 * Math.PI * tSec) / periodS)) / 2;
const easeOut = (p) => 1 - (1 - p) * (1 - p);

// `art`: the tower's sprite is loaded, so the core glow is not drawn (#73a).
export function expectedTowerLook(level, branch, { art = false } = {}) {
  const variant = tierVariant(level, branch);
  const marked = level >= TIER_CORE.fromTier;
  let ring = null;
  if (variant === 't4a') ring = 'solid';
  else if (variant === 't4b') ring = 'dashed';
  const pips = PIPS_BY_VARIANT[variant];
  return {
    scale: TIER_SCALE.tower[variant],
    core: marked && !art,
    embers: level >= TIER_EMBERS.fromTier ? TIER_EMBERS.count : 0,
    ring,
    pips,
  };
}

// Scaling about the sprite centre would lift the foot; this keeps it planted.
export function pivotOffsetY(footY, s) {
  return (1 - s) * footY;
}

export function corePulse(tSec, cfg, reduced) {
  if (reduced) return cfg.stillAlpha;
  return cfg.alpha[0] + (cfg.alpha[1] - cfg.alpha[0]) * wave(tSec, cfg.periodS);
}

export function emberPose(tSec, i, cfg, ground, reduced) {
  const phase = reduced ? cfg.stillRiseFrac : frac(tSec / cfg.periodS + i / cfg.count);
  let alpha = cfg.stillAlpha;
  if (!reduced) alpha = phase < cfg.fadeInFrac ? phase / cfg.fadeInFrac : (1 - phase) / (1 - cfg.fadeInFrac);
  return {
    dx: cfg.xFrac[i] * ground.width,
    dy: ground.footY - cfg.startFrac * ground.height - easeOut(phase) * cfg.riseFrac * ground.height,
    alpha,
  };
}

export function ringBreath(tSec, cfg, reduced) {
  if (reduced) return { k: 1, alpha: cfg.alpha };
  const u = wave(tSec, cfg.breathe.periodS);
  return {
    k: 1 + (cfg.breathe.scale - 1) * u,
    alpha: cfg.alpha + (cfg.breathe.alphaLow - cfg.alpha) * u,
  };
}

export function ellipseDashes({ cx = 0, cy = 0, rx, ry, dashes, duty, phase, segPerDash = 4 }) {
  // Normalise so phase p and p+1 give bit-identical points (E38).
  const ph = frac(phase);
  const span = (2 * Math.PI * duty) / dashes;
  const out = [];
  for (let j = 0; j < dashes; j++) {
    // One unit of phase is one full lap, so phase = t / spin.periodS laps once per period.
    const start = 2 * Math.PI * (j / dashes + ph);
    const arc = [];
    for (let s = 0; s <= segPerDash; s++) {
      const a = start + (span * s) / segPerDash;
      arc.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    out.push(arc);
  }
  return out;
}

// Pad-fit guards (R25): two towers on neighbouring pads must not stack their
// contact shadows (at the map's cap scale) or their T4 rings (at peak breath).
export function footprintClash(a, b, s) {
  const W = ((a.width + b.width) / 2) * s * SHADOW.widthRatio;
  const dx = b.x - a.x;
  const dy = (b.y + b.footY) - (a.y + a.footY);
  return (dx / W) ** 2 + (dy / (SHADOW.heightRatio * W)) ** 2 < 1;
}

// Rings are centred on the foot, not the pad, so footY shifts the vertical gap.
export function ringCrossing(a, b, ring) {
  const k = ring.breathe.scale;
  const dx = b.x - a.x;
  const dy = (b.y + b.footY) - (a.y + a.footY);
  return (dx / (2 * ring.rx * k)) ** 2 + (dy / (2 * ring.ry * k)) ** 2 < 1;
}
