const DEBOUNCE_MS = 300;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class AudioManager {
  constructor(game, saveManager) {
    this._game        = game;
    this._save        = saveManager;
    this._sfxCache    = new Map(); // key -> Phaser.Sound.BaseSound
    this._settings    = saveManager.getSettings();
    this._pendingSave = null;
    this._saveTimer   = null;
  }

  // Public getters
  getSettings() {
    return { ...this._settings };
  }

  getEffectiveVolume(channel) {
    if (this._settings.muted) return 0;
    const ch = channel === 'music' ? this._settings.musicVol : this._settings.sfxVol;
    return this._settings.masterVol * ch;
  }

  // Setters
  setMasterVolume(v) { this._setField('masterVol', clamp(v, 0, 1)); }
  setSfxVolume(v)    { this._setField('sfxVol',    clamp(v, 0, 1)); }
  setMusicVolume(v)  { this._setField('musicVol',  clamp(v, 0, 1)); }
  setMuted(v)        { this._setField('muted',     Boolean(v)); }

  applySettings(settings) {
    this._settings = { ...this._settings, ...settings };
  }

  playSfx(key, opts = {}) {
    let sound = this._sfxCache.get(key);
    if (!sound) {
      sound = this._game.sound.add(key);
      this._sfxCache.set(key, sound);
    }
    const volume = this.getEffectiveVolume('sfx') * (opts.volume ?? 1);
    sound.play({ ...opts, volume });
  }

  // Internal
  _setField(name, value) {
    this._settings[name] = value;
    this._reapplyActiveVolumes();
    this._pendingSave = { ...(this._pendingSave || {}), [name]: value };
    this._scheduleSave();
  }

  _reapplyActiveVolumes() {
    const sfxVol   = this.getEffectiveVolume('sfx');
    const musicVol = this.getEffectiveVolume('music');
    for (const s of this._game.sound.sounds) {
      if (!s.isPlaying) continue;
      const v = s.__channel === 'music' ? musicVol : sfxVol;
      s.setVolume(v);
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      if (this._pendingSave) {
        this._save.setSettings(this._pendingSave);
        this._pendingSave = null;
      }
      this._saveTimer = null;
    }, DEBOUNCE_MS);
  }
}
