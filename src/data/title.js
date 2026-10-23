// Title screen tunables (spec 3.4). TitleScreen publishes the timings as --title-*
// custom properties so CSS animations and JS read one source.
export const TITLE = {
  sweepDelayMs: 300,
  sweepMs: 1600,
  settleMs: 600,
  // After the sweep starts, so the prompt never shows before the logo moves.
  promptDelayMs: 900,
  pulseMs: 2200,
  fontWaitMs: 600,
};

export const TITLE_PROMPT = { coarse: 'TAP TO START', fine: 'CLICK TO START' };

// Three parallax layers (z 0.15 / 0.4 / 1) as in title-flash.html: speed 14 px/s x z,
// size 0.5 + 1.1z, alpha 0.35 + 0.65z, a 25% twinkle at 2 rad/s.
const TITLE_DRIFT_PX_S = 14;
const layer = (z, count) => ({
  z,
  count,
  speed: TITLE_DRIFT_PX_S * z,
  size: 0.5 + 1.1 * z,
  alpha: 0.35 + 0.65 * z,
});

const TITLE_LAYERS = [layer(0.15, 54), layer(0.4, 53), layer(1, 53)];

// minFrameMs: the same cap as the world map, repaint once the fastest layer has
// moved 1 CSS px.
export const STARS_TITLE = {
  seed: 1,
  twinkle: { depth: 0.25, radPerS: 2 },
  layers: TITLE_LAYERS,
  minFrameMs: 1000 / Math.max(...TITLE_LAYERS.map(l => l.speed)),
};
