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
  ambient.id = 'reduce-motion';
  ambient.type = 'checkbox';
  overlay.appendChild(ambient);

  const graphics = document.createElement('select');
  graphics.id = 'graphics-quality';
  for (const v of ['auto', 'high', 'low']) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    graphics.appendChild(o);
  }
  overlay.appendChild(graphics);

  const autoSend = document.createElement('input');
  autoSend.id = 'auto-send';
  autoSend.type = 'checkbox';
  overlay.appendChild(autoSend);

  document.body.appendChild(overlay);
}

function makeGame(initial = true, graphics = 'auto') {
  const store = {
    ambientMotion: initial, mapGrade: initial, autoSend: initial,
    graphicsEnv: { webgl: true, touch: true },
    save: { setSettings: vi.fn(), getSettings: () => ({ graphics }) },
  };
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

  // Reduce motion is the inverse of ambientMotion: checked = ambientMotion false.
  it('reduce-motion is checked when ambientMotion is false, unchecked when true', () => {
    const off = new SettingsOverlay(makeAm(), makeGame(false));
    off.open();
    expect(document.getElementById('reduce-motion').checked).toBe(true);
    off.close();
    new SettingsOverlay(makeAm(), makeGame(true)).open();
    expect(document.getElementById('reduce-motion').checked).toBe(false);
  });

  it('checking reduce-motion sets ambientMotion false in the registry and the save', () => {
    const game = makeGame(true);
    new SettingsOverlay(makeAm(), game).open();
    const cb = document.getElementById('reduce-motion');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.registry.get('ambientMotion')).toBe(false);
    expect(game._store.save.setSettings).toHaveBeenCalledWith({ ambientMotion: false });
  });

  it('the old ambient-motion and map-grade controls are gone from the fixture contract', () => {
    expect(document.getElementById('ambient-motion')).toBeNull();
    expect(document.getElementById('map-grade')).toBeNull();
  });

  it('graphics-quality shows the saved level on open', () => {
    new SettingsOverlay(makeAm(), makeGame(true, 'low')).open();
    expect(document.getElementById('graphics-quality').value).toBe('low');
  });

  it('choosing High saves graphics and sets mapGrade, ambientFx and particleScale live', () => {
    const game = makeGame(true, 'low');
    game._store.mapGrade = false;
    game._store.ambientFx = false;
    game._store.particleScale = 0.5;
    new SettingsOverlay(makeAm(), game).open();
    const sel = document.getElementById('graphics-quality');
    sel.value = 'high';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game._store.save.setSettings).toHaveBeenCalledWith({ graphics: 'high' });
    expect(game.registry.get('mapGrade')).toBe(true);
    expect(game.registry.get('ambientFx')).toBe(true);
    expect(game.registry.get('particleScale')).toBe(1);
  });

  it('choosing Low turns grading and ambient off and halves particles', () => {
    const game = makeGame(true, 'high');
    new SettingsOverlay(makeAm(), game).open();
    const sel = document.getElementById('graphics-quality');
    sel.value = 'low';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.registry.get('mapGrade')).toBe(false);
    expect(game.registry.get('ambientFx')).toBe(false);
    expect(game.registry.get('particleScale')).toBe(0.5);
  });

  it('close() removes both listeners: later changes do not touch the registry', () => {
    const game = makeGame(true, 'high');
    const ov = new SettingsOverlay(makeAm(), game);
    ov.open();
    ov.close();
    const sel = document.getElementById('graphics-quality');
    sel.value = 'low';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const cb = document.getElementById('reduce-motion');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game._store.mapGrade).toBe(true);
    expect(game._store.ambientMotion).toBe(true);
    expect(game._store.save.setSettings).not.toHaveBeenCalled();
  });

  // Both polarities: an unwired checkbox starts unchecked, so the false case
  // alone would pass with no handler at all.
  it('auto-send checkbox reflects the registry flag on open', () => {
    const on = new SettingsOverlay(makeAm(), makeGame(true));
    on.open();
    expect(document.getElementById('auto-send').checked).toBe(true);
    on.close();
    new SettingsOverlay(makeAm(), makeGame(false)).open();
    expect(document.getElementById('auto-send').checked).toBe(false);
  });

  it('toggling auto-send updates the registry and persists', () => {
    const game = makeGame(true);
    new SettingsOverlay(makeAm(), game).open();
    const cb = document.getElementById('auto-send');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.registry.get('autoSend')).toBe(false);
    expect(game._store.save.setSettings).toHaveBeenCalledWith({ autoSend: false });
  });
});
