import { describe, expect, it } from 'vitest';
import { CANVAS_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { pipelineConfig } from './rendererConfig.js';

// Mirrors PipelineManager.boot's square-target loop: qty steps of frameInc up
// to the short side, three targets per step beyond the first.
const squareTargets = (w, h, frameInc) => 3 * (Math.ceil(Math.min(w, h) / frameInc) - 1);

describe('pipelineConfig', () => {
  for (const k of [1, 2]) {
    const w = CANVAS_WIDTH * k;
    const h = WORLD_HEIGHT * k;
    describe(`k = ${k}`, () => {
      const cfg = pipelineConfig({ canvasWidth: w, canvasHeight: h });
      it('hides frameInc from enumeration (boot would new() an enumerable value)', () => {
        expect(Object.keys(cfg)).toEqual([]);
        const seen = [];
        for (const key in cfg) seen.push(key);
        expect(seen).toEqual([]);
      });
      it('still exposes frameInc as an own property for GetFastValue', () => {
        expect(Object.prototype.hasOwnProperty.call(cfg, 'frameInc')).toBe(true);
        expect(cfg.frameInc).toBe(Math.max(w, h));
      });
      it('leaves Phaser no square render targets to allocate', () => {
        expect(squareTargets(w, h, cfg.frameInc)).toBe(0);
      });
    });
  }
});
