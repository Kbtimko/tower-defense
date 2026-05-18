const STORAGE_KEY = 'lastlight_progress';
const MAP_COUNT   = 10;

export class ProgressManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Array(MAP_COUNT).fill(0);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === MAP_COUNT) return parsed;
    } catch (_) { /* ignore corrupt data */ }
    return new Array(MAP_COUNT).fill(0);
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  getStars(mapId) {
    return this._data[mapId] ?? 0;
  }

  setStars(mapId, stars) {
    if (stars > this._data[mapId]) {
      this._data[mapId] = stars;
      this._save();
    }
  }

  isUnlocked(mapId) {
    if (mapId === 0) return true;
    return this._data[mapId - 1] > 0;
  }

  // Unlock is implicit: isUnlocked(N+1) reads getStars(N) > 0.
  // setStars() already persisted the result, so this is a semantic no-op.
  unlockNext(mapId) {}
}
