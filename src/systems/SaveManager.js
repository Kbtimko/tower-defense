const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';
const MAP_COUNT   = 10;
const VERSION     = 1;

function freshEnvelope() {
  return {
    version:  VERSION,
    maps:     new Array(MAP_COUNT).fill(0),
    upgrades: [],
    stats:    { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
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
        if (parsed && parsed.version === VERSION
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
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
    return freshEnvelope();
  }

  _normalize(parsed) {
    const env = freshEnvelope();
    env.maps     = parsed.maps.slice();
    env.upgrades = Array.isArray(parsed.upgrades) ? parsed.upgrades.slice() : [];
    if (parsed.stats && typeof parsed.stats === 'object') {
      env.stats = { ...env.stats, ...parsed.stats };
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
}
