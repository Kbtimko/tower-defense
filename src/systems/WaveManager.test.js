import { describe, it, expect, vi } from 'vitest';
import { WaveManager, waveScaleFactor } from './WaveManager.js';

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

describe('WaveManager — startWave permits early restart', () => {
  it('allows a second startWave once the spawn queue drains while the wave is active', () => {
    const emitter = makeEmitter();
    const wm = new WaveManager(tinyWaves(), emitter);
    wm.startWave();
    wm.update(100); // drain wave 1's spawn queue
    expect(wm.active).toBe(true);
    expect(wm.hasQueuedEnemies).toBe(false);

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

describe('waveScaleFactor', () => {
  it('is 1 on the first wave', () => {
    expect(waveScaleFactor(0)).toBe(1);
  });

  it('grows 13% of base per wave', () => {
    expect(waveScaleFactor(1)).toBeCloseTo(1.13);
    expect(waveScaleFactor(10)).toBeCloseTo(2.3);
  });

  it('is what WaveManager actually applies to spawned enemies', () => {
    // The whole point of exporting it: the sim must not keep a second copy.
    const emitter = makeEmitter();
    const wm = new WaveManager([[{ type: 'drone', count: 1, interval: 0 }]], emitter);
    const waveIndexAtStart = wm.currentWave; // startWave() reads currentWave before incrementing it
    wm.startWave();
    wm.update(1000);
    const [, spawnPayload] = emitter.emit.mock.calls.find(([event]) => event === 'enemy:spawn');
    expect(spawnPayload.scaleFactor).toBe(waveScaleFactor(waveIndexAtStart));
  });
});
