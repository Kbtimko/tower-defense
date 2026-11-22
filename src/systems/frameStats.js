const round1 = (n) => Math.round(n * 10) / 10;

// Nearest-rank percentile on an ascending-sorted array.
function percentile(sorted, p) {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function frameStats(intervalsMs) {
  const frames = intervalsMs.length;
  if (frames === 0) return { frames: 0, fps: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const totalMs = intervalsMs.reduce((a, b) => a + b, 0);
  return {
    frames,
    fps: totalMs > 0 ? round1(frames / (totalMs / 1000)) : 0,
    p50: round1(percentile(sorted, 50)),
    p95: round1(percentile(sorted, 95)),
    p99: round1(percentile(sorted, 99)),
  };
}

// Pure: callers feed timestamps, so it needs no rAF or clock to test.
export function createFrameRecorder({ capacityMs }) {
  let last = null;
  let samples = []; // { end, dt }, ascending by end
  return {
    tick(nowMs) {
      if (last !== null) {
        samples.push({ end: nowMs, dt: nowMs - last });
        const cutoff = nowMs - capacityMs;
        let drop = 0;
        while (drop < samples.length && samples[drop].end < cutoff) drop++;
        if (drop > 0) samples = samples.slice(drop);
      }
      last = nowMs;
    },
    stats(windowMs) {
      if (last === null) return frameStats([]);
      const from = last - windowMs;
      return frameStats(samples.filter((s) => s.end >= from).map((s) => s.dt));
    },
  };
}
