import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { SaveManager } from '../systems/SaveManager.js';
import { starsDisplay } from '../utils/display.js';

export default class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelectScene'); }

  create() {
    this.events.on('shutdown', this.shutdown, this);

    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._saveMgr = new SaveManager();

    // Default to highest unlocked map
    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._saveMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateSidebar();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
  }

  _populateSidebar() {
    const sidebar = document.getElementById('map-sidebar');
    sidebar.replaceChildren();

    for (const map of MAPS) {
      const unlocked = this._saveMgr.isUnlocked(map.id);

      const row = document.createElement('div');
      row.className = 'map-row ' + (unlocked ? 'unlocked' : 'locked');
      if (unlocked && map.id === this._selectedId) row.classList.add('active');

      const nameEl = document.createElement('div');
      nameEl.className   = 'map-row-name';
      nameEl.textContent = unlocked
        ? (map.id + 1) + ' · ' + map.name
        : '🔒 Map ' + (map.id + 1);

      const starsEl = document.createElement('div');
      starsEl.className = 'map-row-stars';
      if (unlocked) {
        const stars = this._saveMgr.getStars(map.id);
        starsEl.textContent = stars > 0 ? starsDisplay(stars) : '—';
      }

      row.append(nameEl, starsEl);
      if (unlocked) row.addEventListener('click', () => this._selectMap(map.id));
      sidebar.appendChild(row);
    }
  }

  _selectMap(mapId) {
    this._selectedId = mapId;
    document.querySelectorAll('.map-row.active').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.map-row')[mapId].classList.add('active');
    this._renderFeatured(mapId);
  }

  _renderFeatured(mapId) {
    const map   = MAPS[mapId];
    const stars = this._saveMgr.getStars(mapId);

    document.getElementById('featured-name').textContent  = map.name;
    document.getElementById('featured-stars').textContent = stars > 0 ? starsDisplay(stars) : '☆☆☆';
    document.getElementById('featured-blurb').textContent = map.blurb;
    document.getElementById('featured-tier').textContent  =
      'Towers upgrade to Tier ' + map.maxTierAllowed + ' on this map';
  }

  _bindPlay() {
    // Clone removes any prior event listener before re-adding
    const old = document.getElementById('featured-play');
    const btn  = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      this.scene.start('GameScene', { mapId: this._selectedId });
    });
  }

  shutdown() {
    document.getElementById('map-select').style.display = 'none';
  }
}
