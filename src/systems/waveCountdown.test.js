import { WaveCountdown, countdownMsFor, shouldStartCountdown, lastSpawnMs } from './waveCountdown.js';
import { WAVE_COUNTDOWN } from '../data/waveCountdown.js';
import { MAP_WAVES } from '../data/waves.js';
import { WaveManager } from './WaveManager.js';

const started = (total = 20000, wave = 1) => {
  const c = new WaveCountdown();
  c.start(total, wave);
  return c;
};

describe('WAVE_COUNTDOWN', () => {
  it('is frozen with the agreed shape', () => {
    expect(Object.isFrozen(WAVE_COUNTDOWN)).toBe(true);
    expect(WAVE_COUNTDOWN.defaultSec).toBe(20);
    expect(WAVE_COUNTDOWN.warnSec).toBe(5);
    expect(WAVE_COUNTDOWN.ringQuantum).toBe(0.005);
  });
});

describe('WaveCountdown start/tick/clamp', () => {
  it('counts down by the summed dt', () => {
    const c = started();
    c.tick(5000); c.tick(2500);
    expect(c.remainingMs).toBe(20000 - 7500);
    expect(c.running).toBe(true);
    expect(c.startedFor).toBe(1);
  });
  it('E13: a huge delta clamps at 0, never negative, and stays running', () => {
    const c = started();
    c.tick(60000);
    expect(c.remainingMs).toBe(0);
    expect(c.running).toBe(true);
  });
  it('tick before start is a no-op', () => {
    const c = new WaveCountdown();
    c.tick(1000);
    expect(c.remainingMs).toBe(0);
  });
  it('fraction runs 1 -> 0', () => {
    const c = started(20000);
    expect(c.fraction).toBe(1);
    c.tick(5000);
    expect(c.fraction).toBe(0.75);
    c.tick(60000);
    expect(c.fraction).toBe(0);
  });
});

describe('hold / resume', () => {
  it('a held tick is a no-op; resume continues', () => {
    const c = started();
    c.tick(1000);
    c.hold();
    c.tick(5000);
    expect(c.remainingMs).toBe(19000);
    expect(c.held).toBe(true);
    c.resume();
    c.tick(1000);
    expect(c.remainingMs).toBe(18000);
  });
});

describe('cancel / no re-arm', () => {
  it('cancel stops running but keeps startedFor so the same wave never re-arms', () => {
    const c = started(20000, 3);
    c.cancel();
    expect(c.running).toBe(false);
    expect(c.startedFor).toBe(3);
    expect(shouldStartCountdown({ spawnsDone: true, done: false, currentWave: 3, startedFor: c.startedFor })).toBe(false);
    expect(shouldStartCountdown({ spawnsDone: true, done: false, currentWave: 4, startedFor: c.startedFor })).toBe(true);
  });
  it('cancelled countdown ignores ticks', () => {
    const c = started();
    c.cancel();
    c.tick(5000);
    expect(c.remainingMs).toBe(20000);
  });
});

describe('shouldStartCountdown', () => {
  const base = { spawnsDone: true, done: false, currentWave: 1, startedFor: null };
  it('starts when the spawn queue is empty', () => expect(shouldStartCountdown(base)).toBe(true));
  it('no trigger when done (final wave)', () => expect(shouldStartCountdown({ ...base, done: true })).toBe(false));
  it('no trigger before wave 1 (currentWave 0)', () => expect(shouldStartCountdown({ ...base, currentWave: 0 })).toBe(false));
  it('no trigger while the wave is still spawning', () => expect(shouldStartCountdown({ ...base, spawnsDone: false })).toBe(false));
  it('starts even when the board cleared on the spawns-done frame (wave already inactive)', () => {
    // Derive both inputs from a real WaveManager in that state, so the trigger is fed
    // what callers pass (!hasQueuedEnemies), not a hand-picked boolean.
    const wm = new WaveManager([[{ type: 'drone', count: 1, interval: 900 }], [{ type: 'drone', count: 1, interval: 900 }]], { emit() {} });
    wm.startWave();
    wm.update(16);              // the lone drone spawns: queue empty
    wm.active = false;          // _checkWaveComplete: board cleared the same frame
    // A trigger gated on `active` (spawning finished while the wave runs) misses this frame.
    expect(wm.active && !wm.hasQueuedEnemies).toBe(false);
    const inputs = { spawnsDone: !wm.hasQueuedEnemies, done: wm.done, currentWave: wm.currentWave };
    expect(shouldStartCountdown({ ...inputs, startedFor: null })).toBe(true);
    const c = new WaveCountdown();
    c.start(20000, wm.currentWave);
    expect(shouldStartCountdown({ ...inputs, startedFor: c.startedFor })).toBe(false);
    c.cancel();
    expect(shouldStartCountdown({ ...inputs, startedFor: c.startedFor })).toBe(false);
  });
});

describe('displaySeconds / isWarning (E20)', () => {
  it.each([[20000, 20], [19001, 20], [1, 1], [0, 0], [1000, 1], [1001, 2]])('remaining %i -> %i s', (ms, secs) => {
    const c = started(20000);
    c.tick(20000 - ms);
    expect(c.displaySeconds).toBe(secs);
  });
  it('warns at 5000, not 5001, not 0', () => {
    const at = (ms) => { const c = started(20000); c.tick(20000 - ms); return c.isWarning(5000); };
    expect(at(5000)).toBe(true);
    expect(at(5001)).toBe(false);
    expect(at(0)).toBe(false);
    expect(at(1)).toBe(true);
  });
});

describe('bonus', () => {
  const at = (ms) => { const c = started(20000); c.tick(20000 - ms); return c; };
  it('full: 20 s x 1.75 x 1 = 35', () => expect(at(20000).bonus({ goldPerSecond: 1.75, rewardMult: 1 })).toBe(35));
  it('fractional floors, never rounds: 19.5 s -> 34', () => expect(at(19500).bonus({ goldPerSecond: 1.75, rewardMult: 1 })).toBe(34));
  it('E10: 0.4 s pays 0', () => expect(at(400).bonus({ goldPerSecond: 1.75, rewardMult: 1 })).toBe(0));
  it('rewardMult 0.5 halves before flooring: 20 s -> 17', () => expect(at(20000).bonus({ goldPerSecond: 1.75, rewardMult: 0.5 })).toBe(17));
  it('pays nothing when not running', () => {
    const c = at(20000);
    c.cancel();
    expect(c.bonus({ goldPerSecond: 1.75, rewardMult: 1 })).toBe(0);
  });
});

describe('shouldAutoSend matrix', () => {
  for (const enabled of [true, false]) for (const held of [true, false]) for (const rem of [0, 1]) {
    const want = enabled && !held && rem === 0;
    it(`enabled=${enabled} held=${held} remaining=${rem} -> ${want}`, () => {
      const c = started(20000);
      c.tick(20000 - rem);
      if (held) c.hold();
      expect(c.shouldAutoSend(enabled)).toBe(want);
    });
  }
  it('false when not running even at zero', () => {
    const c = started(20000);
    c.tick(20000);
    c.cancel();
    expect(c.shouldAutoSend(true)).toBe(false);
  });
});

describe('countdownMsFor (E14)', () => {
  it.each([[{}], [{ waveCountdownSec: 0 }], [{ waveCountdownSec: -5 }], [{ waveCountdownSec: NaN }], [{ waveCountdownSec: '30' }]])('%j -> default', (map) => {
    expect(countdownMsFor(map)).toBe(WAVE_COUNTDOWN.defaultSec * 1000);
    expect(countdownMsFor(map)).toBe(20000);
  });
  it('uses a valid per-map value', () => expect(countdownMsFor({ waveCountdownSec: 45 })).toBe(45000));
});

describe('lastSpawnMs', () => {
  it('map 0 wave 1 = (count-1) x interval', () => {
    const [g] = MAP_WAVES[0][0];
    expect(MAP_WAVES[0][0]).toHaveLength(1);
    expect(lastSpawnMs(MAP_WAVES[0][0])).toBe((g.count - 1) * g.interval);
  });
  it('two groups accumulate sequentially', () => {
    const wave = [{ type: 'drone', count: 3, interval: 1000 }, { type: 'brute', count: 2, interval: 500 }];
    // delays: 0,1000,2000 | 3000,3500 -> last = 3500
    expect(lastSpawnMs(wave)).toBe(3500);
  });
  it('E15: a single-enemy wave -> 0', () => {
    expect(lastSpawnMs([{ type: 'drone', count: 1, interval: 1200 }])).toBe(0);
  });
});
