import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { SaveManager } from '../systems/SaveManager.js';
import { starsDisplay } from '../utils/display.js';
import { classifyOverworld } from '../systems/overworldState.js';
import { UpgradeManager }         from '../systems/UpgradeManager.js';
import { UpgradeTreeOverlay }     from '../ui/UpgradeTreeOverlay.js';
import { SettingsOverlay }        from '../ui/SettingsOverlay.js';
import { HeroManagementOverlay }  from '../ui/HeroManagementOverlay.js';

export default class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelectScene'); }

  create() {
    this.events.on('shutdown', this.shutdown, this);

    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._saveMgr    = new SaveManager();
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);
    this._heroOverlay = new HeroManagementOverlay(this._upgradeMgr, this._saveMgr);

    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._saveMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateOverworld();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
    this._renderMetaBar();
    this._renderStats();
    this._bindUpgrades();
    this._bindHeroes();
    this._bindSettings();
  }

  _populateOverworld() {
    const container = document.getElementById('map-overworld');
    container.replaceChildren();

    const entries = MAPS.map(m => ({
      id: m.id,
      unlocked: this._saveMgr.isUnlocked(m.id),
      stars: this._saveMgr.getStars(m.id),
    }));
    const nodes = classifyOverworld(entries, MAPS.length - 1);
    const pts = MAPS.map(m => m.overworldPos);

    // SVG connector layer: dim full path + gold between consecutive unlocked nodes.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ow-connectors');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    const dim = document.createElementNS(NS, 'polyline');
    dim.setAttribute('class', 'ow-path-dim');
    dim.setAttribute('points', pts.map(([x, y]) => `${x * 100},${y * 100}`).join(' '));
    svg.appendChild(dim);

    const unlockedById = new Map(nodes.map(n => [n.id, n.unlocked]));
    for (let i = 0; i < pts.length - 1; i++) {
      if (unlockedById.get(i) && unlockedById.get(i + 1)) {
        const seg = document.createElementNS(NS, 'line');
        seg.setAttribute('class', 'ow-path-lit');
        seg.setAttribute('x1', pts[i][0] * 100);
        seg.setAttribute('y1', pts[i][1] * 100);
        seg.setAttribute('x2', pts[i + 1][0] * 100);
        seg.setAttribute('y2', pts[i + 1][1] * 100);
        svg.appendChild(seg);
      }
    }
    container.appendChild(svg);

    // Nodes.
    for (const node of nodes) {
      const map = MAPS[node.id];
      const el = document.createElement('div');
      el.className = `ow-node ${node.state}` + (node.isFinal ? ' final' : '');
      if (node.id === this._selectedId && node.state !== 'locked') el.classList.add('active');
      el.dataset.mapId = String(node.id);
      el.style.left = `${map.overworldPos[0] * 100}%`;
      el.style.top  = `${map.overworldPos[1] * 100}%`;

      const art = document.createElement('img');
      art.className   = 'ow-node-art';
      art.src         = `assets/overworld/${map.overworldArt}`;
      art.alt         = map.name;
      art.onerror     = () => { art.remove(); el.classList.add('ow-node-fallback'); };
      el.appendChild(art);

      const num = document.createElement('div');
      num.className   = 'ow-node-num';
      num.textContent = node.state === 'locked' ? '🔒' : String(node.id + 1);
      el.appendChild(num);

      const starsEl = document.createElement('div');
      starsEl.className = 'ow-node-stars';
      if (node.unlocked) starsEl.textContent = node.stars > 0 ? starsDisplay(node.stars) : '—';
      el.appendChild(starsEl);

      if (node.unlocked) el.addEventListener('click', () => this._selectMap(node.id));
      container.appendChild(el);
    }
  }

  _selectMap(mapId) {
    this._selectedId = mapId;
    document.querySelectorAll('.ow-node.active').forEach(n => n.classList.remove('active'));
    const sel = document.querySelector(`.ow-node[data-map-id="${mapId}"]`);
    if (sel) sel.classList.add('active');
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
    // Clone removes any prior event listener before re-adding (across scene re-entries).
    const old = document.getElementById('featured-play');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      this.scene.start('GameScene', {
        mapId:  this._selectedId,
        heroId: this._saveMgr.getSelectedHero(),
      });
    });
  }

  _renderMetaBar() {
    document.getElementById('total-stars').textContent =
      `★ ${this._saveMgr.getTotalStars()} / 30`;
  }

  _renderStats() {
    const s   = this._saveMgr.getStats();
    const el  = document.getElementById('lifetime-stats');
    el.replaceChildren();
    const chips = [
      ['Kills',       s.kills],
      ['Games',       s.gamesPlayed],
      ['Victories',   s.victories],
      ['Defeats',     s.defeats],
      ['Best Wave',   s.bestWave],
      ['Total Stars', this._saveMgr.getTotalStars()],
    ];
    for (const [label, value] of chips) {
      const chip = document.createElement('div');
      chip.className = 'stat-chip';
      const valEl = document.createElement('span');
      valEl.className   = 'stat-chip-val';
      valEl.textContent = value;
      const lblEl = document.createElement('span');
      lblEl.className   = 'stat-chip-lbl';
      lblEl.textContent = label;
      chip.append(valEl, lblEl);
      el.appendChild(chip);
    }
  }

  _bindUpgrades() {
    // Clone removes any prior listener before re-adding (matches _bindPlay).
    const old = document.getElementById('open-upgrades');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._overlay.open());
  }

  _bindHeroes() {
    // Clone removes any prior listener before re-adding (matches _bindUpgrades).
    const old = document.getElementById('open-heroes');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._heroOverlay.open());
  }

  _bindSettings() {
    // Clone removes any prior listener before re-adding (matches _bindUpgrades).
    const old = document.getElementById('open-settings');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      const am = this.game.registry.get('audio');
      if (!am) return;
      if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am, this.game);
      this._settingsOverlay.open();
    });
  }

  shutdown() {
    // Call close() on overlays so their event listeners are torn down before the
    // DOM persists into the next scene. Direct style mutation would leak listeners.
    if (this._heroOverlay) this._heroOverlay.close();
    document.getElementById('map-select').style.display          = 'none';
    document.getElementById('upgrade-overlay').style.display     = 'none';
    document.getElementById('settings-overlay').style.display    = 'none';
  }
}
