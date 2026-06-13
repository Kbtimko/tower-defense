const DEBOUNCE_MS = 300;

export const SFX_KEYS = [
  'tower-fire-archer', 'tower-fire-cannon', 'tower-fire-mage',
  'tower-fire-ice', 'tower-fire-sniper', 'tower-fire-barracks',
  'tower-place', 'tower-upgrade', 'tower-sell',
  'enemy-hit', 'enemy-death-small', 'enemy-death-large',
  'hero-attack', 'hero-death', 'hero-respawn',
  'hero-overcharge', 'hero-airstrike', 'hero-emp',
  'wave-start', 'life-lost', 'victory', 'defeat', 'ui-click',
];

export const MUSIC_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-ambient`),
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-combat`),
  'boss-mid', 'boss-final',
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function getOrCreateAudioManager(game, saveManager) {
  let am = game.registry.get('audio');
  if (!am) {
    am = new AudioManager(game, saveManager);
    game.registry.set('audio', am);
  }
  return am;
}

export class AudioManager {
  constructor(game, saveManager) {
    this._game        = game;
    this._save        = saveManager;
    this._sfxCache    = new Map(); // key -> Phaser.Sound.BaseSound
    this._music = { ambient: null, combat: null, boss: null, combatActive: false };
    this._fadeTimers = new Set();
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

  loadAssets(scene) {
    for (const key of SFX_KEYS) {
      scene.load.audio(key, `audio/sfx/${key}.mp3`);
    }
    for (const key of MUSIC_KEYS) {
      scene.load.audio(key, `audio/music/${key}.mp3`);
    }
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
      if (s.__channel === 'music') {
        if (s === this._music.combat && !this._music.combatActive) {
          s.setVolume(0);
        } else {
          s.setVolume(musicVol);
        }
      } else {
        s.setVolume(sfxVol);
      }
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

  // Music
  playMusic(id) {
    if (id === 'boss-mid' || id === 'boss-final') {
      this._stopLayers();
      this._music.boss = this._addMusic(id);
      if (this._music.boss) this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    this._stopLayers();
    this._music.combatActive = false;
    this._music.ambient = this._addMusic(`map-${id}-ambient`);
    if (this._music.ambient) this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
    this._music.combat = this._addMusic(`map-${id}-combat`);
    if (this._music.combat) this._music.combat.play({ volume: 0, loop: true });
  }

  setCombatActive(active) {
    if (this._music.boss || !this._music.combat) return;
    this._music.combatActive = Boolean(active);
    const target = active ? this.getEffectiveVolume('music') : 0;
    this._fadeTo(this._music.combat, target, 1500);
  }

  stopMusic(fadeMs = 500) {
    for (const k of ['ambient', 'combat', 'boss']) {
      const s = this._music[k];
      if (!s) continue;
      this._fadeTo(s, 0, fadeMs, () => { s.stop(); });
    }
    this._music = { ambient: null, combat: null, boss: null, combatActive: false };
  }

  _stopLayers() {
    for (const k of ['ambient', 'combat', 'boss']) {
      const s = this._music[k];
      if (s) {
        if (s.__fadeTimer) {
          clearInterval(s.__fadeTimer);
          this._fadeTimers.delete(s.__fadeTimer);
          s.__fadeTimer = null;
        }
        s.stop();
      }
      this._music[k] = null;
    }
  }

  _addMusic(key) {
    if (!this._game.cache.audio.has(key)) {
      if (!this._missingMusicWarned) this._missingMusicWarned = new Set();
      if (!this._missingMusicWarned.has(key)) {
        console.warn(`[AudioManager] music key "${key}" not found in cache — skipping`);
        this._missingMusicWarned.add(key);
      }
      return null;
    }
    const sound = this._game.sound.add(key);
    sound.__channel = 'music';
    return sound;
  }

  _fadeTo(sound, targetVol, durationMs, onDone) {
    if (sound.__fadeTimer) {
      clearInterval(sound.__fadeTimer);
      sound.__fadeTimer = null;
    }
    const steps   = Math.max(1, Math.round(durationMs / 50));
    const start   = sound.volume ?? 0;
    const delta   = (targetVol - start) / steps;
    let   i       = 0;
    const timer = setInterval(() => {
      i++;
      const v = i >= steps ? targetVol : start + delta * i;
      sound.setVolume(v);
      if (i >= steps) {
        clearInterval(timer);
        sound.__fadeTimer = null;
        this._fadeTimers.delete(timer);
        if (onDone) onDone();
      }
    }, 50);
    sound.__fadeTimer = timer;
    this._fadeTimers.add(timer);
  }
}
