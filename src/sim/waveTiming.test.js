// Wave timing in the headless model (#51). The shipped game sends the next wave
// a countdown after the previous wave's last spawn, so waves can overlap; the
// legacy 'onClear' mode must still reproduce the pre-#51 numbers exactly,
// because calibration compares the two to keep every map no harder than today.
import { describe, it, expect } from 'vitest';
import { simulateMap } from './simulate.js';
import { bestStrategy, CANDIDATE_STRATEGIES, strategyLabel, strategyPlan } from './strategy.js';
import { findWinMultiplier } from './deficit.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import golden from './__fixtures__/legacyGolden.json';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

// Only the keys the golden recorded: new log fields are allowed, changed old
// ones are not.
function legacyView(run, want) {
  const entryKeys = Object.keys(want.waveLog[0]);
  return { ...pick(run, Object.keys(want)), waveLog: run.waveLog.map(e => pick(e, entryKeys)) };
}

describe("waveTiming 'onClear' reproduces the pre-#51 simulator", () => {
  for (const map of MAPS) {
    const waves = MAP_WAVES[map.id];
    if (!waves) continue;
    for (const s of CANDIDATE_STRATEGIES) {
      const key = `${map.id}:${strategyLabel(s)}`;
      it(`onClear parity ${key}`, () => {
        const want = golden[key];
        const run = simulateMap({ map, waves, buildPlan: strategyPlan(s), waveTiming: 'onClear' });
        expect(legacyView(run, want)).toEqual(want);
      });
    }
  }

  it('covers every golden key', () => {
    expect(Object.keys(golden)).toHaveLength(50);
  });

  it('keeps the legacy timeout quirks the golden never reaches', () => {
    // No golden run times out, so pin the timeout path directly: the bonus is
    // paid anyway, survivors carry into the next wave, and a timed-out final
    // wave still counts as won. Undefended corridor, 5-s cap, 25.6-s walk.
    const corridor = {
      id: 97, name: 'Corridor', startGold: 100, startLives: 30,
      rewardMult: 1, maxTierAllowed: 1,
      waypoints: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
      towerSlots: [[0.5, 0.5]],
    };
    const waves = [
      [{ type: 'drone', count: 1, interval: 900 }],
      [{ type: 'drone', count: 1, interval: 900 }],
    ];
    const r = simulateMap({
      map: corridor, waves, buildPlan: () => [], hero: null,
      maxSecondsPerWave: 5, waveTiming: 'onClear',
    });
    expect(r.won).toBe(true);
    expect(r.livesRemaining).toBe(30);
    expect(r.waveLog.map(e => e.timedOut)).toEqual([true, true]);
    expect(r.goldFinal).toBe(corridor.startGold + 2 * 38);
    expect(r.waveLog[1].overlapped).toBe(1);
  });
});

describe("waveTiming 'countdown'", () => {
  const plan = strategyPlan(CANDIDATE_STRATEGIES[0]);

  it('countdown sends at spawnsDone + L', () => {
    // dt = 1/32 s is exact in binary (31.25 ms), so 30 s is exactly 960 ticks.
    // At the default 1/30 s the summed float overshoots and the count lands one
    // tick either side, which would hide an off-by-one-tick start.
    const dt = 1 / 32;
    const tickMs = dt * 1000;
    const map = { ...MAPS[0], waveCountdownSec: 30 };
    const r = simulateMap({ map, waves: MAP_WAVES[0], buildPlan: plan, dt });
    expect(r.waveLog.length).toBeGreaterThan(2);
    for (let n = 0; n + 1 < r.waveLog.length; n++) {
      const gap = r.waveLog[n + 1].sentAtMs - r.waveLog[n].spawnsDoneAtMs;
      // Never early, and late by less than one tick: a countdown ticked on its
      // own start frame would send one tick short of 30 s.
      expect(gap).toBeGreaterThanOrEqual(30000 - 1e-6);
      expect(gap).toBeLessThan(30000 + tickMs);
    }
  });

  it('overlap happens', () => {
    const map = { ...MAPS[0] };
    delete map.waveCountdownSec;
    const r = simulateMap({ map, waves: MAP_WAVES[0], buildPlan: plan });
    expect(r.overlapSends).toBeGreaterThan(0);
    expect(r.waveLog.some(e => e.overlapped > 0)).toBe(true);
  });

  it('clear bonus per board-clear', () => {
    // No defence at all, and a drone needs ~25.6 s to walk 1280 px — longer
    // than the 20-s default countdown — so wave 2 is sent while wave 1's drone
    // is still on the board and the two leave it together: one board-clear.
    const corridor = {
      id: 98, name: 'Corridor', startGold: 100, startLives: 30,
      rewardMult: 0.7, maxTierAllowed: 1,
      waypoints: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
      towerSlots: [[0.5, 0.5]],
    };
    const waves = [
      [{ type: 'drone', count: 1, interval: 900 }],
      [{ type: 'drone', count: 1, interval: 900 }],
    ];
    const r = simulateMap({ map: corridor, waves, buildPlan: () => [], hero: null });
    expect(r.waveLog[1].overlapped).toBe(1);
    expect(r.kills).toBe(0);
    expect(r.boardClears).toBe(1);
    expect(r.goldFinal).toBe(corridor.startGold + Math.round(38 * corridor.rewardMult));
  });

  it('logs spawns-done reward before rewardMult, in both modes', () => {
    // Wave 1 of map 0 is pure drones; everything spawned is alive at the last
    // spawn unless already killed, so the sum is a whole multiple of 14.
    for (const waveTiming of ['onClear', 'countdown']) {
      const r = simulateMap({ map: MAPS[0], waves: MAP_WAVES[0], buildPlan: plan, waveTiming });
      const first = r.waveLog[0];
      expect(first.sentAtMs).toBe(0);
      expect(first.spawnsDoneAtMs).toBeGreaterThan(0);
      expect(first.rewardAliveAtSpawnsDone).toBeGreaterThan(0);
      expect(first.rewardAliveAtSpawnsDone % 14).toBe(0);
    }
  });
});

describe('findWinMultiplier forwards waveTiming', () => {
  it("probes in the mode it is given", () => {
    // Map 0 at the default 20-s countdown is lost at 1x but won under
    // 'onClear' (golden): the precondition makes the fixture prove it can tell.
    const map = { ...MAPS[0] };
    delete map.waveCountdownSec;
    const buildPlan = strategyPlan(CANDIDATE_STRATEGIES[0]);
    expect(golden[`0:${strategyLabel(CANDIDATE_STRATEGIES[0])}`].won).toBe(true);
    expect(simulateMap({ map, waves: MAP_WAVES[0], buildPlan }).won).toBe(false);
    expect(findWinMultiplier(map, MAP_WAVES[0], { buildPlan, waveTiming: 'onClear' })).toBe(1);
  });
});

describe('bestStrategy forwards waveTiming', () => {
  it("returns the legacy run for the best strategy under 'onClear'", () => {
    const map = MAPS[0];
    const { best } = bestStrategy(map, MAP_WAVES[0], { waveTiming: 'onClear' });
    const want = golden[`${map.id}:${strategyLabel(best.strategy)}`];
    expect(legacyView(best.run, want)).toEqual(want);
  });
});
