import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsOverlay } from './SettingsOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.style.display = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'settings-close';
  closeBtn.textContent = 'CLOSE';
  overlay.appendChild(closeBtn);

  for (const ch of ['master', 'sfx', 'music']) {
    const input = document.createElement('input');
    input.id = `vol-${ch}`;
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    overlay.appendChild(input);

    const val = document.createElement('span');
    val.id = `vol-${ch}-val`;
    overlay.appendChild(val);
  }

  const mute = document.createElement('input');
  mute.id = 'mute-all';
  mute.type = 'checkbox';
  overlay.appendChild(mute);

  const ambient = document.createElement('input');
  ambient.id = 'ambient-motion';
  ambient.type = 'checkbox';
  overlay.appendChild(ambient);

  document.body.appendChild(overlay);
}

function makeGame(initial = true) {
  const store = { ambientMotion: initial, save: { setSettings: vi.fn() } };
  return {
    _store: store,
    registry: {
      get: (k) => store[k],
      set: (k, v) => { store[k] = v; },
    },
  };
}

function makeAm() {
  return {
    settings: { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false },
    getSettings() { return { ...this.settings }; },
    setMasterVolume: vi.fn(function (v) { this.settings.masterVol = v; }),
    setSfxVolume:    vi.fn(function (v) { this.settings.sfxVol    = v; }),
    setMusicVolume:  vi.fn(function (v) { this.settings.musicVol  = v; }),
    setMuted:        vi.fn(function (v) { this.settings.muted     = v; }),
  };
}

beforeEach(() => setupDom());

describe('SettingsOverlay', () => {
  it('open() shows overlay and initializes sliders from AudioManager', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    expect(document.getElementById('settings-overlay').style.display).toBe('flex');
    expect(document.getElementById('vol-master').value).toBe('80');
    expect(document.getElementById('vol-sfx').value).toBe('100');
    expect(document.getElementById('vol-music').value).toBe('60');
    expect(document.getElementById('mute-all').checked).toBe(false);
  });

  it('slider input updates AudioManager + displayed value', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const input = document.getElementById('vol-master');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).toHaveBeenCalledWith(0.42);
    expect(document.getElementById('vol-master-val').textContent).toBe('42');
  });

  it('mute checkbox toggles AudioManager.setMuted', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const cb = document.getElementById('mute-all');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(am.setMuted).toHaveBeenCalledWith(true);
  });

  it('close() hides overlay and removes listeners', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    ov.close();
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
    am.setMasterVolume.mockClear();
    document.getElementById('vol-master').value = '50';
    document.getElementById('vol-master').dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).not.toHaveBeenCalled();
    // Reopen and verify ONE active set, not multiple stacked from open():
    // (this implicitly verifies close removed prior dynamic listeners too)
    am.setMasterVolume.mockClear();
    ov.open();
    const reopenInput = document.getElementById('vol-master');
    reopenInput.value = '55';
    reopenInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).toHaveBeenCalledTimes(1);
  });

  it('calling open() while already open is a no-op (no listener accumulation)', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    ov.open(); // double-open should not add a second set of listeners
    am.setMasterVolume.mockClear();
    const input = document.getElementById('vol-master');
    input.value = '37';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).toHaveBeenCalledTimes(1);
  });

  it('close-button click closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.getElementById('settings-close').click();
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('Esc key closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('clicking the backdrop (overlay element itself) closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const overlay = document.getElementById('settings-overlay');
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.style.display).toBe('none');
  });

  it('clicking a slider inside the overlay does NOT close it', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.getElementById('vol-master').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('settings-overlay').style.display).toBe('flex');
  });

  it('ambient-motion checkbox reflects the registry flag on open', () => {
    const am = makeAm();
    const game = makeGame(false);
    const ov = new SettingsOverlay(am, game);
    ov.open();
    expect(document.getElementById('ambient-motion').checked).toBe(false);
  });

  it('toggling ambient-motion updates the registry and persists', () => {
    const am = makeAm();
    const game = makeGame(true);
    const ov = new SettingsOverlay(am, game);
    ov.open();
    const cb = document.getElementById('ambient-motion');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.registry.get('ambientMotion')).toBe(false);
    expect(game._store.save.setSettings).toHaveBeenCalledWith({ ambientMotion: false });
  });
});
