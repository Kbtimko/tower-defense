import { describe, it, expect, vi } from 'vitest';
import { applyWorldCamera } from './worldCamera.js';
import { RAIL_WIDTH, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

const mockCamera = () => ({ setViewport: vi.fn(), setZoom: vi.fn(), centerOn: vi.fn() });
const rect = { x: RAIL_WIDTH, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };

describe('applyWorldCamera', () => {
  it("k=1 matches today's viewport", () => {
    const cam = mockCamera();
    applyWorldCamera(cam, rect, 1);
    expect(cam.setViewport).toHaveBeenCalledWith(RAIL_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT);
    expect(cam.setZoom).toHaveBeenCalledWith(1);
    expect(cam.centerOn).toHaveBeenCalledWith(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  });

  it('k=2 doubles the viewport and zooms 2', () => {
    const cam = mockCamera();
    applyWorldCamera(cam, rect, 2);
    expect(cam.setViewport).toHaveBeenCalledWith(RAIL_WIDTH * 2, 0, WORLD_WIDTH * 2, WORLD_HEIGHT * 2);
    expect(cam.setZoom).toHaveBeenCalledWith(2);
    expect(cam.centerOn).toHaveBeenCalledWith(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  });
});
