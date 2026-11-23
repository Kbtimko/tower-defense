// Tunables for the ?fps=1 meter. capacityMs bounds recorder memory yet still
// covers the longest window the perf gate reads; windowMs smooths the readout.
export const FPS_METER = { capacityMs: 20000, windowMs: 2000, refreshMs: 500 };
