// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shootBestFrame, marchTimeProblem } from './captureCore.mjs';

afterEach(() => vi.restoreAllMocks());

// Walks the page's reported sim time up then stalls it, and moves Date.now past the
// deadline after `okChecks` loop checks.
function stalledPage(simSeq) {
  let polls = 0;
  return {
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    screenshot: async () => {},
    locator: () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 1920, height: 1080 }) }),
    evaluate: async (fn) => {
      if (String(fn).includes('matchMedia')) return true;
      return { crowd: [], simMs: simSeq[Math.min(polls++, simSeq.length - 1)] };
    },
  };
}

describe('shootBestFrame deadline', () => {
  it('reports the latest simMs the page showed, not the best frame\'s', async () => {
    let calls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (++calls <= 6 ? 0 : 1e12));
    const page = stalledPage([100, 200, 300]);
    await expect(shootBestFrame(page, { fromSimMs: 0, toSimMs: 1000, file: 'x.png', midBand: { from: 0.15, to: 0.85 }, label: 'map 1 shot' }))
      .rejects.toThrow(/map 1 shot: sim time never reached 1000 ms \(stopped at 300 ms\)/);
  });
});

describe('marchTimeProblem', () => {
  // 150 px at 60 px/s is 2500 ms of game time.
  const base = { arcPx: 150, speed: 60, toleranceMs: 200 };
  it('passes an on-speed march, and one frame either side (inclusive)', () => {
    expect(marchTimeProblem({ ...base, elapsedMs: 2500 })).toBeNull();
    expect(marchTimeProblem({ ...base, elapsedMs: 2300 })).toBeNull();
    expect(marchTimeProblem({ ...base, elapsedMs: 2700 })).toBeNull();
  });
  it('flags a march one ms past a frame late or early', () => {
    expect(marchTimeProblem({ ...base, elapsedMs: 2701 })).toMatch(/2701/);
    expect(marchTimeProblem({ ...base, elapsedMs: 2299 })).toMatch(/2299/);
  });
  it('flags a slow march (0.7x speed) and a near-teleport, naming expected and tolerance', () => {
    const slow = marchTimeProblem({ ...base, elapsedMs: 3571 });
    expect(slow).toMatch(/3571/);
    expect(slow).toMatch(/150 px/);
    expect(slow).toMatch(/2500/);
    expect(slow).toMatch(/200/);
    expect(marchTimeProblem({ ...base, elapsedMs: 17 })).toMatch(/17 ms/);
  });
});
