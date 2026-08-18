import { HEROES } from '../data/heroes.js';

const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';
const MAP_COUNT   = 10;
const VERSION     = 4;

function defaultSettings() {
  return { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false, ambientMotion: null };
}

function freshEnvelope() {
  return {
    version:        VERSION,
    maps:           new Array(MAP_COUNT).fill(0),
    upgrades:       [],
    stats:          { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
    settings:       defaultSettings(),
    selectedHeroId: 'rael',
    seenStoryBeats: {},
  };
}

const CMD_TO_RAEL = {
  'cmd_battle_hardened': 'rael_hp',
  'cmd_veteran':         'rael_veteran',
  'cmd_rapid_redeploy':  'rael_rapid_redeploy',
  'cmd_elite':           'rael_elite',
};

function migrateV2toV3(env) {
  return {
    ...env,
    version:        3,
    upgrades:       (env.upgrades || []).map(id => CMD_TO_RAEL[id] ?? id),
    selectedHeroId: env.selectedHeroId ?? 'rael',
  };
}

function migrateV3toV4(env) {
  return {
    ...env,
    version:        4,
    seenStoryBeats: env.seenStoryBeats ?? {},
  };
}

export class SaveManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    // 1. Current versioned envelope
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT
            && (parsed.version === 1 || parsed.version === 2 || parsed.version === 3 || parsed.version === 4)) {
          let normalized = this._normalize(parsed);
          if (parsed.version === 1) {
            normalized = migrateV3toV4(migrateV2toV3({ ...normalized, version: 2 }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } else if (parsed.version === 2) {
            normalized = migrateV3toV4(migrateV2toV3(normalized));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } else if (parsed.version === 3) {
            normalized = migrateV3toV4(normalized);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
          return normalized;
        }
        if (parsed && typeof parsed.version === 'number' && parsed.version > VERSION
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
          console.warn(
            `SaveManager: encountered future save version ${parsed.version}; loading as-is, fields may be ignored.`,
          );
          return this._normalize(parsed);
        }
      }
    } catch (_) { /* fall through to migration / fresh */ }

    // 2. Legacy bare-array migration
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr) && arr.length === MAP_COUNT) {
          const env = freshEnvelope();
          env.maps = arr.slice();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
          localStorage.removeItem(LEGACY_KEY);
          return env;
        }
      }
    } catch (_) { /* fall through to fresh */ }

    // 3. Fresh
    const fresh = freshEnvelope();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  _normalize(parsed) {
    const env = freshEnvelope();
    env.maps     = parsed.maps.slice();
    env.upgrades = Array.isArray(parsed.upgrades) ? parsed.upgrades.slice() : [];
    if (parsed.stats && typeof parsed.stats === 'object') {
      env.stats = { ...env.stats, ...parsed.stats };
    }
    if (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)) {
      env.settings = { ...env.settings, ...parsed.settings };
    }
    if (typeof parsed.selectedHeroId === 'string') env.selectedHeroId = parsed.selectedHeroId;
    if (parsed.seenStoryBeats && typeof parsed.seenStoryBeats === 'object'
        && !Array.isArray(parsed.seenStoryBeats)) {
      env.seenStoryBeats = { ...parsed.seenStoryBeats };
    }
    return env;
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  // ─── Map stars ───
  getStars(mapId) {
    return this._data.maps[mapId] ?? 0;
  }

  setStars(mapId, stars) {
    if (stars > this._data.maps[mapId]) {
      this._data.maps[mapId] = stars;
      this._save();
    }
  }

  isUnlocked(mapId) {
    if (mapId === 0) return true;
    return this._data.maps[mapId - 1] > 0;
  }

  getTotalStars() {
    return this._data.maps.reduce((sum, s) => sum + s, 0);
  }

  // ─── Upgrades ───
  getPurchasedUpgrades() {
    return this._data.upgrades.slice();
  }

  setPurchasedUpgrades(ids) {
    this._data.upgrades = ids.slice();
    this._save();
  }

  // ─── Stats ───
  getStats() {
    return { ...this._data.stats };
  }

  setStats(stats) {
    this._data.stats = { ...this._data.stats, ...stats };
    this._save();
  }

  // ─── Settings ───
  getSettings() {
    return { ...this._data.settings };
  }

  setSettings(partial) {
    this._data.settings = { ...this._data.settings, ...partial };
    this._save();
  }

  // ─── Hero selection ───
  getSelectedHero() {
    const id = this._data.selectedHeroId;
    return (id && HEROES[id]) ? id : 'rael';
  }

  setSelectedHero(id) {
    if (!HEROES[id]) return;
    this._data.selectedHeroId = id;
    this._save();
  }

  isHeroUnlocked(heroId) {
    const def = HEROES[heroId];
    if (!def) return false;
    if (def.unlockMapAfter == null) return true;
    return this.getStars(def.unlockMapAfter) > 0;
  }

  // ─── Story beats ───
  hasSeenBeat(id) {
    return !!this._data.seenStoryBeats[id];
  }

  markBeatSeen(id) {
    if (this._data.seenStoryBeats[id]) return;
    this._data.seenStoryBeats[id] = true;
    this._save();
  }

  getSeenBeats() {
    return { ...this._data.seenStoryBeats };
  }
}
