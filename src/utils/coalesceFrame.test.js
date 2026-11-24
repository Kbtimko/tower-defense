import { describe, it, expect, vi } from 'vitest';
import { coalesceFrame } from './coalesceFrame.js';

describe('coalesceFrame', () => {
  const manualRaf = () => {
    const frames = [];
    return { raf: cb => frames.push(cb), flush: () => frames.splice(0).forEach(cb => cb()), frames };
  };

  it('runs once per frame however many calls precede it', () => {
    const { raf, flush, frames } = manualRaf();
    const fn = vi.fn();
    const run = coalesceFrame(fn, raf);
    run(); run(); run();
    expect(frames).toHaveLength(1);
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('accepts a new call after the frame has run', () => {
    const { raf, flush } = manualRaf();
    const fn = vi.fn();
    const run = coalesceFrame(fn, raf);
    run(); flush();
    run(); flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('re-arms even if fn throws', () => {
    const { raf, flush } = manualRaf();
    const fn = vi.fn(() => { throw new Error('boom'); });
    const run = coalesceFrame(fn, raf);
    run();
    expect(flush).toThrow();
    run();
    expect(() => flush()).toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
