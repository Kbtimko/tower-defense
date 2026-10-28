#!/usr/bin/env node
// Auto-send calibration (#51). Run: npm run calibrate:autosend [-- --map N]
//
// REPORT ONLY — never edits src/data. It prints the goldPerSecond to use and,
// per map, the smallest countdown L at which auto-send is no harder than the old
// send-on-clear timing. Slow (minutes); never part of `npm test`. Progress goes
// to stderr, the table to stdout, so `> file` captures just the table.
//
// Search: every whole second 20..120 (a coarse scan missed true minima, since the
// sim is not monotone); a candidate L must also match at L+1 and L+2 to rule out
// a lucky single point. L+1/L+2 are only probes, so L itself never exceeds 120.
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { WAVE_COUNTDOWN } from '../src/data/waveCountdown.js';
import { simulateMap } from '../src/sim/simulate.js';
import { bestStrategy, strategyLabel, strategyPlan } from '../src/sim/strategy.js';
import { verdict } from '../src/sim/verdict.js';
import { matchesBefore, afterSame } from '../src/sim/autosendMatch.js';

const MIN_L = WAVE_COUNTDOWN.defaultSec;
const MAX_L = 120;

const args = process.argv.slice(2);
const mapArg = args.indexOf('--map');
const onlyMap = mapArg !== -1 ? Number(args[mapArg + 1]) : null;
const log = msg => process.stderr.write(`${msg}\n`);

const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const cell = (map, x) => {
  const kept = Math.round((x.run.livesRemaining / map.startLives) * 100);
  const m = x.multiplier === null ? '>8x' : `${x.multiplier}x`;
  return `${m}, ${kept}% kept, ${verdict(x.run, map.startLives).tag}`;
};

const targets = MAPS.filter(m => (onlyMap === null || m.id === onlyMap) && MAP_WAVES[m.id]);
const samples = [];
const results = [];

for (const map of targets) {
  const waves = MAP_WAVES[map.id];
  const t0 = Date.now();
  log(`map ${map.id} (${map.name}): before (onClear)...`);
  const before = bestStrategy(map, waves, { waveTiming: 'onClear' }).best;
  // Sample at the win multiplier: the 1x run of a losing map ends early and would
  // drop its later waves from the median.
  const sampleRun = simulateMap({
    map, waves, buildPlan: strategyPlan(before.strategy),
    damageMult: before.multiplier ?? 1, waveTiming: 'onClear',
  });
  for (const e of sampleRun.waveLog) {
    if (e.rewardAliveAtSpawnsDone != null) samples.push(0.5 * e.rewardAliveAtSpawnsDone);
  }

  const cache = new Map();
  const evalL = L => {
    if (!cache.has(L)) {
      const m = { ...map, waveCountdownSec: L };
      const afterBest = bestStrategy(m, waves, { waveTiming: 'countdown' }).best;
      const same = afterSame(m, waves, before.strategy);
      const match = matchesBefore(before, afterBest, map.startLives)
                 && matchesBefore(before, same, map.startLives);
      cache.set(L, { L, afterBest, afterSame: same, match });
      log(`  map ${map.id} L=${L}: ${match ? 'match' : 'no'}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    return cache.get(L);
  };
  const stable = L => evalL(L).match && evalL(L + 1).match && evalL(L + 2).match;

  let chosen = null;
  for (let L = MIN_L; L <= MAX_L; L++) {
    if (stable(L)) { chosen = L; break; }
  }
  results.push({ map, before, chosen, at: chosen === null ? null : cache.get(chosen), seconds: (Date.now() - t0) / 1000 });
  log(`map ${map.id}: ${chosen === null ? `NONE <=${MAX_L}` : `L=${chosen}`} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── goldPerSecond ──────────────────────────────────────────────────────────
// 0.5 x reward alive at the instant the countdown would start = what today's
// bonus pays at its best moment, before rewardMult.
samples.sort((a, b) => a - b);
console.log('\ngoldPerSecond — 0.5 x rewardAliveAtSpawnsDone per wave, onClear best strategy');
if (samples.length === 0) {
  console.log('  no samples');
} else {
  const M = quantile(samples, 0.5);
  console.log(`  samples ${samples.length}   median M ${M}   p25 ${quantile(samples, 0.25)}   p75 ${quantile(samples, 0.75)}`);
  console.log(`  goldPerSecond = round(M / ${WAVE_COUNTDOWN.defaultSec}, 2) = ${(Math.round((M / WAVE_COUNTDOWN.defaultSec) * 100) / 100).toFixed(2)}`
            + (onlyMap === null ? '' : '   (single map only — pool SAMPLES across maps for the real figure)'));
  console.log(`SAMPLES ${JSON.stringify(samples)}`);
}

// ── Per-map length ─────────────────────────────────────────────────────────
console.log('\nPer-map countdown — smallest L where afterBest AND afterSame match before, at L, L+1, L+2\n');
for (const { map, before, chosen, at, seconds } of results) {
  console.log(`map ${map.id} ${map.name}: L = ${chosen === null ? `NONE <=${MAX_L}` : chosen}   (${seconds.toFixed(0)}s)`);
  console.log(`  before    ${cell(map, before)}  [${strategyLabel(before.strategy)}]`);
  if (at) {
    console.log(`  afterBest ${cell(map, at.afterBest)}  [${strategyLabel(at.afterBest.strategy)}]`);
    console.log(`  afterSame ${cell(map, at.afterSame)}  [${strategyLabel(before.strategy)}]`);
  }
}
console.log('\n' + pad('#', 3) + padL('L', 8));
for (const { map, chosen } of results) console.log(pad(map.id, 3) + padL(chosen === null ? 'NONE' : chosen, 8));
