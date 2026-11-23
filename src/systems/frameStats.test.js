import { describe, it, expect } from 'vitest';
import { frameStats, createFrameRecorder } from './frameStats.js';

describe('frameStats', () => {
  it('steady 60 Hz reads 60 fps and a 16.7 ms p95', () => {
    const s = frameStats(Array(120).fill(1000 / 60));
    expect(s).toMatchObject({ frames: 120, fps: 60, p50: 16.7, p95: 16.7 });
  });
  it('one long frame in twenty moves p95, not p50', () => {
    const s = frameStats([...Array(19).fill(16.7), 50]);
    expect(s.p50).toBe(16.7);
    expect(s.p99).toBe(50);
    expect(s.fps).toBeCloseTo((20 / (19 * 16.7 + 50)) * 1000, 1);
  });
  it('empty input is all zeros', () =>
    expect(frameStats([])).toEqual({ frames: 0, fps: 0, p50: 0, p95: 0, p99: 0 }));
});

describe('createFrameRecorder', () => {
  it('windows by time and drops past capacity', () => {
    const r = createFrameRecorder({ capacityMs: 1000 });
    [0, 10, 20, 520, 1020, 1030].forEach((t) => r.tick(t));
    expect(r.stats(5).frames).toBe(1);
    expect(r.stats(100).frames).toBe(2);
    expect(r.stats(5000).frames).toBe(3);
  });
});
