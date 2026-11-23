import { describe, it, expect } from 'vitest';
import { inMiddleBand, centroidOf, coverCrop } from './releaseMedia.js';

const BAND = { from: 0.15, to: 0.85 };
const BOARD = { x0: 134, y0: 75, x1: 1787, y1: 1003 };
const CROP = { cropWidth: 1134, cropHeight: 900 };

describe('inMiddleBand', () => {
  it('includes both edges and excludes just outside them', () => {
    expect(inMiddleBand(0.15, BAND)).toBe(true);
    expect(inMiddleBand(0.85, BAND)).toBe(true);
    expect(inMiddleBand(0.1499, BAND)).toBe(false);
    expect(inMiddleBand(0.8501, BAND)).toBe(false);
    expect(inMiddleBand(0.5, BAND)).toBe(true);
  });
});

describe('centroidOf', () => {
  it('averages points and is null for none', () => {
    expect(centroidOf([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
    expect(centroidOf([])).toBeNull();
  });
});

describe('coverCrop', () => {
  it('centres on the centroid when it fits', () => {
    const r = coverCrop(CROP, { board: BOARD, centroid: { x: 960, y: 540 } });
    expect(r).toEqual({ left: 393, top: 90, width: 1134, height: 900 });
  });

  it('shifts, never shrinks, at each board edge', () => {
    const at = (x, y) => coverCrop(CROP, { board: BOARD, centroid: { x, y } });
    expect(at(0, 540).left).toBe(BOARD.x0);
    expect(at(5000, 540).left).toBe(BOARD.x1 - CROP.cropWidth);
    expect(at(960, 0).top).toBe(BOARD.y0);
    expect(at(960, 5000).top).toBe(BOARD.y1 - CROP.cropHeight);
    for (const [x, y] of [[0, 0], [5000, 0], [0, 5000], [5000, 5000], [960, 540]]) {
      const r = at(x, y);
      expect([r.width, r.height]).toEqual([CROP.cropWidth, CROP.cropHeight]);
      expect(r.left).toBeGreaterThanOrEqual(BOARD.x0);
      expect(r.top).toBeGreaterThanOrEqual(BOARD.y0);
      expect(r.left + r.width).toBeLessThanOrEqual(BOARD.x1);
      expect(r.top + r.height).toBeLessThanOrEqual(BOARD.y1);
    }
  });

  it('falls back to the board centre for a null centroid', () => {
    const centre = coverCrop(CROP, { board: BOARD, centroid: { x: (BOARD.x0 + BOARD.x1) / 2, y: (BOARD.y0 + BOARD.y1) / 2 } });
    expect(coverCrop(CROP, { board: BOARD, centroid: null })).toEqual(centre);
    expect(coverCrop(CROP, { board: BOARD, centroid: undefined })).toEqual(centre);
  });
});
