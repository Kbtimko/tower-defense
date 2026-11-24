import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadingLabel, attachLoadingBar } from './loadingBar.js';
import { setRenderScale } from '../systems/renderScale.js';
import { CANVAS_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

afterEach(() => setRenderScale(1));

describe('loadingLabel', () => {
  it('shows whole percents', () => {
    expect(loadingLabel(0)).toBe('Loading 0%');
    expect(loadingLabel(0.426)).toBe('Loading 43%');
    expect(loadingLabel(1)).toBe('Loading 100%');
  });

  it('clamps out-of-range and missing progress', () => {
    expect(loadingLabel(-1)).toBe('Loading 0%');
    expect(loadingLabel(1.5)).toBe('Loading 100%');
    expect(loadingLabel(NaN)).toBe('Loading 0%');
    expect(loadingLabel(undefined)).toBe('Loading 0%');
  });
});

describe('attachLoadingBar', () => {
  it('lays out in logical px and zooms the camera at k=2', () => {
    setRenderScale(2);
    const gfx = { clear: vi.fn(), fillStyle: vi.fn().mockReturnThis(), fillRect: vi.fn(), lineStyle: vi.fn().mockReturnThis(), strokeRect: vi.fn(), destroy: vi.fn() };
    const label = { setOrigin: vi.fn().mockReturnThis(), setText: vi.fn(), destroy: vi.fn() };
    const camera = { setViewport: vi.fn(), setZoom: vi.fn(), centerOn: vi.fn() };
    const scene = {
      scale: { width: CANVAS_WIDTH * 2, height: WORLD_HEIGHT * 2 },
      cameras: { main: camera },
      add: { graphics: () => gfx, text: vi.fn(() => label) },
      load: { on: vi.fn(), once: vi.fn(), off: vi.fn() },
    };
    attachLoadingBar(scene);
    expect(scene.add.text.mock.calls[0][0]).toBe(CANVAS_WIDTH / 2);
    expect(camera.setZoom).toHaveBeenCalledWith(2);
    expect(camera.setViewport).toHaveBeenCalledWith(0, 0, CANVAS_WIDTH * 2, WORLD_HEIGHT * 2);
  });
});
