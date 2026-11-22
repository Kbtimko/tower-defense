import { describe, it, expect, vi } from 'vitest';
import { installFpsMeter } from './FpsMeter.js';

describe('installFpsMeter', () => {
  it('does nothing without ?fps=1', () => {
    const win = { location: { search: '?map=3' }, requestAnimationFrame: vi.fn() };
    expect(installFpsMeter(win)).toBeNull();
    expect(document.getElementById('fps-meter')).toBeNull();
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
    expect(win.__fps).toBeUndefined();
  });
  it('with ?fps=1 mounts the meter and exposes __fps.stats', () => {
    const win = { location: { search: '?fps=1' }, requestAnimationFrame: vi.fn() };
    const m = installFpsMeter(win);
    expect(document.getElementById('fps-meter')).not.toBeNull();
    expect(typeof win.__fps.stats).toBe('function');
    m.destroy();
    expect(document.getElementById('fps-meter')).toBeNull();
  });
});
