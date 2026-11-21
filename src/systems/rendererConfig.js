// Phaser's PipelineManager.boot (3.90, PipelineManager.js ~403-431) pre-allocates
// three square PreFX RenderTargets per `frameInc` step up to the canvas's short
// side, each with a GL texture + framebuffer at once. At k = 2 that is hundreds
// of MB of GPU memory on every device. The game's only preFX use (the backdrop
// grade) is larger than any square target, so it always renders through the
// full-size ones; a frameInc >= the canvas's long side leaves no square targets.
//
// frameInc is NON-enumerable on purpose: boot reads it with GetFastValue
// (hasOwnProperty, so non-enumerable still works) but then `for...in`s the same
// object and `new`s every enumerable value as a pipeline class, which would
// throw on a number. Re-check both behaviours on any Phaser upgrade.
export function pipelineConfig({ canvasWidth, canvasHeight }) {
  const cfg = {};
  Object.defineProperty(cfg, 'frameInc', {
    value: Math.max(canvasWidth, canvasHeight),
    enumerable: false,
  });
  return cfg;
}
