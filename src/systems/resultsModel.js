import { MAPS } from '../data/maps.js';
import { RESULT_LINES, RESULTS_COPY, RESULT_SPEAKERS } from '../data/results.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { formatCount, formatDuration } from '../utils/display.js';

const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function pickResultLine({ result, stars, final, mapId, wave }, lines = RESULT_LINES) {
  if (result === 'defeat') return lines.defeat[(mapId + wave) % lines.defeat.length];
  const pool = (final ? lines.final : lines.victory)[stars];
  return pool[mapId % pool.length];
}

export function longestResultLine(lines = RESULT_LINES) {
  const all = [
    ...Object.values(lines.victory).flat(),
    ...Object.values(lines.final).flat(),
    ...lines.defeat,
  ];
  return all.reduce((a, b) => (b.length > a.length ? b : a));
}

function chipsFor(run, win, newBest, copy) {
  const first = win
    ? { id: 'lives', value: `${run.lives}/${run.startLives}`, newBest: newBest.livesLost === true }
    : { id: 'wave', value: `${run.wave}/${run.waveCount}`, newBest: false };
  return [
    first,
    { id: 'kills', value: formatCount(run.kills), newBest: false },
    { id: 'gold', value: formatCount(run.goldEarned), newBest: false },
    { id: 'time', value: formatDuration(run.timeMs), newBest: win && newBest.time === true },
  ].map((c) => ({ ...c, label: copy.chips[c.id] }));
}

function actionsFor(win, final, copy) {
  const ids = !win ? ['retry', 'map'] : final ? ['map', 'retry'] : ['next', 'retry', 'map'];
  return ids.map((id, i) => ({
    id, label: copy.actions[id], name: copy.actionNames[id], primary: i === 0,
  }));
}

function announce({ win, stars, starsLabel, chips, newBest, banner, speakerName, line }) {
  const spoken = chips.map((c, i) => {
    const label = i === 0 ? sentence(c.label) : c.label.toLowerCase();
    return `${label} ${c.value.replace('/', ' of ')}`;
  }).join(', ');
  const parts = [win ? `${sentence(banner)} ${starsLabel}.` : `${sentence(banner)}.`, `${spoken}.`];
  if (win && newBest.livesLost) parts.push('New best: fewest lives lost.');
  if (win && newBest.time) parts.push('New best time.');
  parts.push(`${speakerName}: ${line}`);
  return parts.join(' ');
}

export function resultsModel(
  run,
  { maps = MAPS, lines = RESULT_LINES, copy = RESULTS_COPY, speakers = RESULT_SPEAKERS } = {},
) {
  const win = run.result === 'victory';
  const final = run.mapId === maps.length - 1;
  const newBest = run.newBest ?? {};
  const stars = win ? run.stars : 0;
  const starsLabel = win ? `${stars} of 3 stars` : '';
  const speaker = speakers[run.result];
  const line = pickResultLine({ result: run.result, stars, final, mapId: run.mapId, wave: run.wave }, lines);
  const chips = chipsFor(run, win, newBest, copy);
  const bannerText = copy.banner[run.result];

  return {
    result: run.result,
    final,
    kicker: win && final ? copy.campaignComplete : copy.kicker(run.mapId + 1, maps[run.mapId].name),
    bannerText,
    stars,
    starsLabel,
    chips,
    speaker,
    line,
    actions: actionsFor(win, final, copy),
    announcement: announce({
      win, stars, starsLabel, chips, newBest, banner: bannerText,
      speakerName: STORY_SPEAKERS[speaker].name, line,
    }),
  };
}
