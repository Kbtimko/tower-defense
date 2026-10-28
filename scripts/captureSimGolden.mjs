#!/usr/bin/env node
// Snapshots simulateMap's results for every map × candidate strategy so the
// wave-timing refactor (#51) can prove its legacy 'onClear' mode reproduces
// today's numbers exactly. Re-run only to deliberately re-baseline.
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { simulateMap } from '../src/sim/simulate.js';
import { CANDIDATE_STRATEGIES, strategyLabel, strategyPlan } from '../src/sim/strategy.js';

const OUT = new URL('../src/sim/__fixtures__/legacyGolden.json', import.meta.url);

const golden = {};
for (const map of MAPS) {
  const waves = MAP_WAVES[map.id];
  if (!waves) continue;
  for (const s of CANDIDATE_STRATEGIES) {
    golden[`${map.id}:${strategyLabel(s)}`] = simulateMap({ map, waves, buildPlan: strategyPlan(s) });
  }
}

writeFileSync(OUT, `${JSON.stringify(golden, null, 2)}\n`);
console.log(`wrote ${Object.keys(golden).length} keys to ${OUT.pathname}`);
