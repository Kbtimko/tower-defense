import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';

export default class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    this._selectedType = null;
    this._speedFast    = false;

    document.getElementById('hud').style.display        = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';
    document.getElementById('game-msg').style.display   = 'none';

    this._bindDOMEvents();
    this._subscribeToGameEvents();
    document.getElementById('speed-btn').textContent = '⏩ 2x';

    // Read initial state from GameScene (already running, systems are ready)
    const gs = this.scene.get('GameScene');
    if (gs && gs.economy) {
      this._onHudUpdate({
        gold: gs.economy.gold, lives: gs.economy.lives,
        wave: gs.waveMgr.currentWave, waveCount: MAPS[gs.mapId].waveCount,
        kills: gs.kills,
      });
      this._onWaveState({
        active: gs.waveMgr.active, done: gs.waveMgr.done,
        currentWave: gs.waveMgr.currentWave,
      });
    }
  }

  shutdown() {
    document.getElementById('hud').style.display        = 'none';
    document.getElementById('bottom-bar').style.display = 'none';

    this.game.events.off('hud:update',       this._onHudUpdate,  this);
    this.game.events.off('wave:state',        this._onWaveState,  this);
    this.game.events.off('tower:panel-open',  this._onPanelOpen,  this);
    this.game.events.off('tower:panel-close', this._onPanelClose, this);
    this.game.events.off('game:victory',      this._onVictory,    this);
    this.game.events.off('game:defeat',       this._onDefeat,     this);

    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
  }

  _bindDOMEvents() {
    document.querySelectorAll('.tower-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (this._selectedType === type) {
          this._selectedType = null;
          document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
          this.game.events.emit('ui:tower-type-select', { type: null });
        } else {
          this._selectedType = type;
          document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.game.events.emit('ui:tower-type-select', { type });
        }
      });
    });

    document.getElementById('wave-btn').addEventListener('click',
      () => this.game.events.emit('ui:wave-start'));
    document.getElementById('speed-btn').addEventListener('click',
      () => this._onSpeedToggle());
    document.getElementById('panel-upgrade-btn').addEventListener('click',
      () => this.game.events.emit('ui:tower-upgrade'));
    document.getElementById('panel-sell-btn').addEventListener('click',
      () => this.game.events.emit('ui:tower-sell'));
    document.getElementById('msg-btn').addEventListener('click',
      () => this.game.events.emit('ui:restart'));
  }

  _onSpeedToggle() {
    this._speedFast = !this._speedFast;
    document.getElementById('speed-btn').textContent = this._speedFast ? '⏸ 1x' : '⏩ 2x';
    this.game.events.emit('ui:speed-toggle');
  }

  _subscribeToGameEvents() {
    this.game.events.on('hud:update',       this._onHudUpdate,  this);
    this.game.events.on('wave:state',        this._onWaveState,  this);
    this.game.events.on('tower:panel-open',  this._onPanelOpen,  this);
    this.game.events.on('tower:panel-close', this._onPanelClose, this);
    this.game.events.on('game:victory',      this._onVictory,    this);
    this.game.events.on('game:defeat',       this._onDefeat,     this);
  }

  _onHudUpdate({ gold, lives, wave, waveCount, kills }) {
    document.getElementById('stat-lives').textContent = lives;
    document.getElementById('stat-gold').textContent  = gold;
    document.getElementById('stat-wave').textContent  = `${wave}/${waveCount}`;
    document.getElementById('stat-kills').textContent = kills;
    document.querySelectorAll('.tower-btn').forEach(btn => {
      const cost = TOWER_DEFS[btn.dataset.type]?.cost ?? Infinity;
      btn.style.opacity = gold >= cost ? '1' : '0.4';
    });
  }

  _onWaveState({ active, done, currentWave }) {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (done) {
      btn.disabled = true;  btn.textContent = 'All Waves Done';
    } else if (active) {
      btn.disabled = true;  btn.textContent = `Wave ${currentWave} in progress...`;
    } else {
      btn.disabled = false; btn.textContent = `▶ Send Wave ${currentWave + 1}`;
    }
  }

  _onPanelOpen({ tower, def, x, y, mapId }) {
    const map = MAPS[mapId];
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name;
    document.getElementById('panel-dmg').textContent  = 'Damage: ' + tower.damage;
    document.getElementById('panel-rng').textContent  = 'Range: ' + tower.range;
    document.getElementById('panel-spd').textContent  = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const nextLevel  = tower.level + 1;
    if (tower.level >= 4) {
      upgradeBtn.textContent = 'MAX LEVEL';
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = map.maxTierAllowed < 2 ? 3 : 5;
      upgradeBtn.textContent = `🔒 Unlocked on Map ${unlockMap}`;
      upgradeBtn.className   = 'upgrade-btn maxed';
    } else {
      const tierDef = def['tier' + nextLevel];
      upgradeBtn.textContent = `Upgrade 💰${tierDef.cost}: ${tierDef.label}`;
      upgradeBtn.className   = 'upgrade-btn';
    }
    document.getElementById('panel-sell-btn').textContent = `💰 Sell (${Math.floor(tower.totalCost * 0.6)}g)`;

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(x + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(y - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';

    // Deselect tower build buttons when panel opens
    this._selectedType = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  _onPanelClose() {
    document.getElementById('tower-panel').style.display = 'none';
  }

  _onVictory({ kills, waveCount }) {
    document.getElementById('msg-title').textContent  = '🏆 Victory!';
    document.getElementById('msg-body').textContent   = `Survived all ${waveCount} waves! Kills: ${kills}`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _onDefeat({ wave }) {
    document.getElementById('msg-title').textContent  = '💀 Defeat';
    document.getElementById('msg-body').textContent   = `The line did not hold. Wave ${wave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }
}
