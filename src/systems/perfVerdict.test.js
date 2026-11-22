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

import { perfExitCode, unmeasurableReason } from './perfVerdict.js';
const ok = { load: 2, renderer: 'ANGLE (Apple, Apple M4)', gameRendererType: 2, failures: [] };
describe('perfExitCode: 0 pass, 1 a verdict failed, 2 the machine cannot give meaningful numbers', () => {
  it('passes when every run is clean', () => expect(perfExitCode([ok, ok], 6)).toBe(0));
  it('a failed verdict is 1', () => expect(perfExitCode([ok, { ...ok, failures: ['fps 20'] }], 6)).toBe(1));
  it('an infrastructure error in any run is 2, even beside a verdict failure', () => {
    expect(perfExitCode([ok, { ...ok, error: 'timeout' }], 6)).toBe(2);
    expect(perfExitCode([{ ...ok, failures: ['fps 20'] }, { error: 'timeout', load: 1 }], 6)).toBe(2);
  });
  it('load at or over the limit at ANY run start is 2', () => {
    expect(perfExitCode([ok, { ...ok, load: 6 }], 6)).toBe(2);
    expect(perfExitCode([{ ...ok, load: 5.99 }], 6)).toBe(0);
  });
  it('an unmeasurable renderer is 2', () => expect(perfExitCode([{ ...ok, unmeasurable: 'x' }], 6)).toBe(2));
  it('no results at all is 2', () => expect(perfExitCode([], 6)).toBe(2));
});
describe('unmeasurableReason', () => {
  it('accepts a hardware renderer on the game WebGL path', () => expect(unmeasurableReason(ok.renderer, 2)).toBeNull());
  it('rejects SwiftShader, n/a, and empty renderers', () => {
    expect(unmeasurableReason('ANGLE (Google, Vulkan, SwiftShader)', 2)).toMatch(/software/i);
    expect(unmeasurableReason('n/a', 2)).toMatch(/WebGL/);
    expect(unmeasurableReason('', 2)).toMatch(/WebGL/);
  });
  it('rejects a game that fell back to Canvas (type 1) or has no renderer', () => {
    expect(unmeasurableReason(ok.renderer, 1)).toMatch(/Canvas/);
    expect(unmeasurableReason(ok.renderer, undefined)).toMatch(/Canvas|renderer/);
  });
});
