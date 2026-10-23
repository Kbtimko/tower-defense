import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpaceCanvas } from './SpaceCanvas.js';

const ctx = { setTransform: vi.fn() };

function setHidden(value) {
  Object.defineProperty(document, 'hidden', { value, configurable: true });
}

describe('SpaceCanvas', () => {
  let frames;

  beforeEach(() => {
    // A queue with real cancel semantics, so a cancelled frame never runs.
    frames = [];
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      const id = ++nextId;
      const frame = (now) => fn(now);
      frame.id = id;
      frames.push(frame);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => { frames = frames.filter((f) => f.id !== id); }));
    setHidden(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops when getContext("2d") is null (jsdom)', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const add = vi.spyOn(document, 'addEventListener');
    const draw = vi.fn();
    const space = new SpaceCanvas(canvas, { maxDpr: 2 });
    space.start(draw);
    space.redraw();
    space.destroy();
    expect(frames).toHaveLength(0);
    expect(draw).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('draws each frame and stops after destroy', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
    const draw = vi.fn();
    const space = new SpaceCanvas(canvas, { maxDpr: 2 });
    space.start(draw);
    frames.shift()(1000);
    expect(draw).toHaveBeenCalledTimes(1);
    space.destroy();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    for (let i = 0; i < 3 && frames.length; i++) frames.shift()(2000);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('pauses while document.hidden and resumes without a catch-up dt', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
    const draw = vi.fn();
    const space = new SpaceCanvas(canvas, { maxDpr: 2 });
    space.start(draw);
    frames.shift()(1000);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 3 && frames.length; i++) frames.shift()(5000);
    expect(draw).toHaveBeenCalledTimes(1);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    frames.shift()(60000);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[1][1]).toBe(0);
    space.destroy();
  });

  it('visibilitychange listener is added and removed as a pair', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const space = new SpaceCanvas(canvas, { maxDpr: 2 });
    space.start(() => {});
    space.destroy();
    const added = add.mock.calls.filter(([t]) => t === 'visibilitychange');
    const removed = remove.mock.calls.filter(([t]) => t === 'visibilitychange');
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(removed[0][1]).toBe(added[0][1]);
  });

  it('caps the backing store at maxDpr', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
    Object.defineProperty(canvas, 'clientWidth', { value: 100 });
    Object.defineProperty(canvas, 'clientHeight', { value: 50 });
    vi.stubGlobal('devicePixelRatio', 3);
    const draw = vi.fn();
    const space = new SpaceCanvas(canvas, { maxDpr: 2 });
    space.start(draw);
    frames.shift()(1000);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(draw).toHaveBeenCalledWith(ctx, 0, 100, 50);
    space.destroy();
  });
});
