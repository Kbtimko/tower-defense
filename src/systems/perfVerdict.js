// Pure pass/fail for one perf run: [] means pass. Messages name the measured value and the limit.
export function perfVerdict(stats, run) {
  if (!stats.frames) return ['no frames recorded in the sample window'];
  const out = [];
  if (stats.fps < run.minFps) out.push(`fps ${stats.fps} under the ${run.minFps} minimum`);
  if (stats.p95 > run.maxP95Ms) out.push(`p95 ${stats.p95}ms over the ${run.maxP95Ms}ms limit`);
  return out;
}
