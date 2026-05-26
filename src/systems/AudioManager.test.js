import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioManager } from './AudioManager.js';
import { SaveManager } from './SaveManager.js';

function makeGame() {
  return {
    sound: { sounds: [], add: () => ({ play() {}, stop() {}, setVolume() {} }) },
    registry: new Map(),
  };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });

describe('AudioManager volume & mute', () => {
  it('defaults match SaveManager defaults on first load', () => {
    const sm = new SaveManager();
    const am = new AudioManager(makeGame(), sm);
    expect(am.getSettings()).toEqual({
      masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false,
    });
  });

  it('setMasterVolume clamps to [0,1]', () => {
    const am = new AudioManager(makeGame(), new SaveManager());
    am.setMasterVolume(1.5);
    expect(am.getSettings().masterVol).toBe(1);
    am.setMasterVolume(-0.5);
    expect(am.getSettings().masterVol).toBe(0);
  });

  it('effective volume = master x channel x (muted ? 0 : 1)', () => {
    const am = new AudioManager(makeGame(), new SaveManager());
    am.setMasterVolume(0.5); am.setSfxVolume(0.4);
    expect(am.getEffectiveVolume('sfx')).toBeCloseTo(0.2);
    am.setMuted(true);
    expect(am.getEffectiveVolume('sfx')).toBe(0);
    am.setMuted(false);
    expect(am.getEffectiveVolume('sfx')).toBeCloseTo(0.2);
  });

  it('setMasterVolume persists via SaveManager after 300ms debounce', () => {
    const sm = new SaveManager();
    const am = new AudioManager(makeGame(), sm);
    am.setMasterVolume(0.3);
    expect(sm.getSettings().masterVol).toBe(0.8); // not yet flushed
    vi.advanceTimersByTime(300);
    expect(sm.getSettings().masterVol).toBe(0.3);
  });

  it('rapid slider drags only persist once after the debounce window', () => {
    const sm = new SaveManager();
    const spy = vi.spyOn(sm, 'setSettings');
    const am = new AudioManager(makeGame(), sm);
    am.setMasterVolume(0.1);
    am.setMasterVolume(0.2);
    am.setMasterVolume(0.3);
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ masterVol: 0.3 });
  });
});
