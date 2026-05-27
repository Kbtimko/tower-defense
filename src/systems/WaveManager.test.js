import { describe, it, expect, vi } from 'vitest';
import { WaveManager } from './WaveManager.js';

function makeEmitter() {
  return { emit: vi.fn() };
}

function tinyWaves() {
  // 2 waves of 1 drone each, easy to drain
  return [
    [{ type: 'drone', count: 1, interval: 0 }],
    [{ type: 'drone', count: 1, interval: 0 }],
  ];
}

describe('WaveManager — isEarlyEligible', () => {
  it('is false before any wave starts', () => {
    const wm = new WaveManager(tinyWaves(), makeEmitter());
    expect(wm.isEarlyEligible).toBe(false);
  });

  it('is false while the spawn queue still has entries', () => {
    const wm = new WaveManager(
      [[{ type: 'drone', count: 2, interval: 1000 }]],
      makeEmitter(),
    );
    wm.startWave();
    expect(wm._spawnQ.length).toBeGreaterThan(0);
    expect(wm.isEarlyEligible).toBe(false);
  });

  it('is true once the spawn queue empties while active is still true', () => {
    const wm = new WaveManager(
      [[{ type: 'drone', count: 1, interval: 0 }]],
      makeEmitter(),
    );
    wm.startWave();
    // Drain the queue: one update tick is enough since interval is 0
    wm.update(100);
    expect(wm._spawnQ.length).toBe(0);
    expect(wm.active).toBe(true);
    expect(wm.isEarlyEligible).toBe(true);
  });

  it('is false again after active flips back to false (between waves)', () => {
    const wm = new WaveManager(tinyWaves(), makeEmitter());
    wm.startWave();
    wm.update(100);
    wm.active = false; // simulating GameScene._checkWaveComplete
    expect(wm.isEarlyEligible).toBe(false);
  });
});

describe('WaveManager — startWave permits early restart', () => {
  it('allows a second startWave when isEarlyEligible is true', () => {
    const emitter = makeEmitter();
    const wm = new WaveManager(tinyWaves(), emitter);
    wm.startWave();
    wm.update(100); // drain wave 1's spawn queue
    expect(wm.isEarlyEligible).toBe(true);

    wm.startWave(); // early-send wave 2

    expect(wm.currentWave).toBe(2);
    expect(wm._spawnQ.length).toBe(1); // wave 2 was queued
    expect(wm.active).toBe(true);
    const waveStartCalls = emitter.emit.mock.calls.filter(([ev]) => ev === 'wave:start');
    expect(waveStartCalls).toHaveLength(2);
  });

  it('still rejects startWave while the previous wave is still spawning', () => {
    const emitter = makeEmitter();
    const wm = new WaveManager(
      [
        [{ type: 'drone', count: 3, interval: 1000 }],
        [{ type: 'drone', count: 1, interval: 0 }],
      ],
      emitter,
    );
    wm.startWave();
    expect(wm._spawnQ.length).toBe(3);
    const queueBefore = wm._spawnQ.length;
    const currentBefore = wm.currentWave;

    wm.startWave(); // should be a no-op

    expect(wm.currentWave).toBe(currentBefore);
    expect(wm._spawnQ.length).toBe(queueBefore);
  });

  it('still rejects startWave when done', () => {
    const wm = new WaveManager([[{ type: 'drone', count: 1, interval: 0 }]], makeEmitter());
    wm.startWave();
    wm.update(100);
    wm.active = false;
    expect(wm.done).toBe(true);
    const currentBefore = wm.currentWave;
    wm.startWave();
    expect(wm.currentWave).toBe(currentBefore);
  });
});
