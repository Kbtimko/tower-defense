// Pure pass/fail for one perf run: [] means pass. Messages name the measured value and the limit.
export function perfVerdict(stats, run) {
  if (!stats.frames) return ['no frames recorded in the sample window'];
  const out = [];
  if (stats.fps < run.minFps) out.push(`fps ${stats.fps} under the ${run.minFps} minimum`);
  if (stats.p95 > run.maxP95Ms) out.push(`p95 ${stats.p95}ms over the ${run.maxP95Ms}ms limit`);
  return out;
}

// Exit code for the whole gate. 2 (the machine can't give meaningful numbers) outranks 1
// (a verdict failed): a failing number measured on a loaded host or a crashed run proves nothing.
export function perfExitCode(results, maxLoad) {
  if (!results.length) return 2;
  if (results.some(r => r.error || r.unmeasurable || r.load >= maxLoad)) return 2;
  return results.some(r => r.failures?.length) ? 1 : 0;
}

// Why a run's numbers can't be trusted, or null. `renderer` is the GPU string from a probe
// canvas; `gameRendererType` is the game's own Phaser renderer type (WEBGL = 2, CANVAS = 1),
// because a Canvas fallback would be timed as if it were the shipped WebGL path.
export function unmeasurableReason(renderer, gameRendererType) {
  if (/SwiftShader/i.test(renderer)) return `software GL (${renderer})`;
  if (!renderer || renderer === 'n/a') return 'no WebGL renderer info (no hardware GL)';
  if (gameRendererType !== 2) return `the game is not on WebGL (renderer type ${gameRendererType}; Canvas fallback)`;
  return null;
}
