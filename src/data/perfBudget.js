// The performance gate's limits (roadmap 6.1). Measured on the real GPU, busiest
// wave of each map; the phone run throttles the CPU 4x to stand in for a mid-range phone.
export const PERF_BUDGET = {
  maxLoad: 6, warmupSimMs: 3000, sampleMs: 12000,
  runs: [
    { id: 'desktop', device: 'desktop1440x2', cpuThrottle: 1, minFps: 57, maxP95Ms: 20 },
    { id: 'phone',   device: 'iphone',        cpuThrottle: 4, minFps: 30, maxP95Ms: 34 },
  ],
};
