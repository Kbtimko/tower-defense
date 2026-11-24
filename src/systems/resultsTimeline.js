import { RESULTS } from '../data/results.js';

const CHIP_COUNT = 4;
const STAR_COUNT = 3;

// The pure reveal schedule (ms from open). The DOM layer only paints these numbers.
export function resultsTimeline(result, cfg = RESULTS) {
  const victory = result === 'victory';
  const beat = (at, ms) => ({ at, ms });

  const stars = victory
    ? Array.from({ length: STAR_COUNT }, (_, i) => beat(cfg.starsAtMs + i * cfg.starEachMs, cfg.starMs))
    : [];
  const chipsAt = victory
    ? cfg.starsAtMs + (STAR_COUNT - 1) * cfg.starEachMs + cfg.starMs
    : cfg.defeatChipsAtMs;
  const chips = Array.from({ length: CHIP_COUNT }, (_, i) => beat(chipsAt + i * cfg.chipEachMs, cfg.chipMs));
  const chipsEnd = chips[CHIP_COUNT - 1].at + cfg.chipMs;

  const caption = beat(chipsEnd - cfg.captionOverlapMs, cfg.captionMs);
  const actions = beat(caption.at + caption.ms + cfg.actionsGapMs, cfg.actionsMs);

  return {
    banner: beat(0, cfg.bannerMs),
    shake: victory ? null : beat(cfg.shakeAtMs, cfg.shakeMs),
    stars,
    chips,
    newBest: victory
      ? chips.map((c) => beat(c.at + c.ms + cfg.newBestDelayMs, cfg.newBestMs))
      : null,
    caption,
    actions,
    endMs: actions.at + actions.ms,
  };
}
