import { perfVerdict } from './perfVerdict.js';
import { PERF_BUDGET } from '../data/perfBudget.js';
const phone = PERF_BUDGET.runs.find(r => r.id === 'phone');
it('passes at the limits', () => expect(perfVerdict({ frames: 360, fps: 30, p95: 34 }, phone)).toEqual([]));
it('fails on fps, on p95, and on no frames, naming value and limit', () => {
  expect(perfVerdict({ frames: 300, fps: 25.8, p95: 33 }, phone)[0]).toMatch(/25\.8.*30/);
  expect(perfVerdict({ frames: 400, fps: 33, p95: 50 }, phone)[0]).toMatch(/50.*34/);
  expect(perfVerdict({ frames: 0, fps: 0, p95: 0 }, phone).length).toBeGreaterThan(0);
});
it('budget matches the spec', () => expect(PERF_BUDGET.runs.map(r => [r.device, r.cpuThrottle, r.minFps, r.maxP95Ms]))
  .toEqual([['desktop1440x2', 1, 57, 20], ['iphone', 4, 30, 34]]));
