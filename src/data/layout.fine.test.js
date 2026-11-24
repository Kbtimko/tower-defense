import { describe, it, expect, vi, afterEach } from 'vitest';
import { POINTER_FINE_QUERY } from './mobile.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
});

describe('layout under a fine pointer', () => {
  async function load() {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q === POINTER_FINE_QUERY }));
    vi.resetModules();
    const layout = await import('./layout.js');
    const hud = await import('../ui/hudLayer.js');
    return { layout, hud };
  }

  it('resolves the 104-px rail metrics at module load', async () => {
    const { layout } = await load();
    expect(layout.POINTER_FINE).toBe(true);
    expect(layout.CANVAS_WIDTH).toBe(1488);
    expect(layout.RAIL_WIDTH).toBe(104);
    expect(layout.HUD_CELL).toBe(52);
    expect(layout.HUD_K).toBe(52 / 88);
  });

  it('publishes the fine metrics as CSS custom properties', async () => {
    const { hud } = await load();
    hud.applyHudLayerSize(document);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--rail-w')).toBe('104px');
    expect(s.getPropertyValue('--hud-cell')).toBe('52px');
    expect(s.getPropertyValue('--canvas-w')).toBe('1488px');
    expect(s.getPropertyValue('--hud-k')).toBe(String(52 / 88));
  });

  it('mapRectIn insets by the 104-px rail at the FIT scale', async () => {
    const { hud } = await load();
    const gameRect = { left: 0, top: 0, width: 1440, height: 700 };
    const canvasRect = { left: 0, top: 0, width: 1440, height: 696.8 };
    const m = hud.mapRectIn({ gameRect, canvasRect });
    expect(m.left).toBeCloseTo(100.65, 1);
    expect(m.width).toBeCloseTo(1238.7, 1);
  });
});
