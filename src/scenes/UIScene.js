import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { describeMatchups } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';

export default class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    this.events.on('shutdown', this.shutdown, this);

    this._selectedType = null;
    this._speedFast    = false;
    this._openTower    = null;
    this._onKeyDown    = null;

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
    this.game.events.off('ui:barracks-reposition', this._onBarracksReposition, this);
    this.game.events.off('hero:update',        this._onHeroUpdate,        this);
    this.game.events.off('hero:level-up',      this._onHeroLevelUp,       this);
    this.game.events.off('hero:aim-mode',      this._onHeroAimMode,       this);
    this.game.events.off('hero:aim-cancel',    this._onHeroAimCancel,     this);
    this.game.events.off('hero:cooldown-tick', this._onHeroCooldownTick,  this);
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);

    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn','ability-q','ability-w','ability-e'].forEach(id => {
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

      btn.addEventListener('mouseenter', () => {
        const type = btn.dataset.type;
        const def  = TOWER_DEFS[type];
        if (!def) return;
        const m = describeMatchups({ kind: 'tower', type, tier: 1, branch: null });
        const renderEnemyNames = (types) =>
          types.map(t => (ENEMY_DEFS[t]?.name ?? t).replace(/^Veth\s+/, '')).join(', ');
        const tt = document.getElementById('tower-tooltip');
        tt.replaceChildren();
        const header = document.createElement('strong');
        header.textContent = `${def.icon} ${def.name} — ${def.cost}g`;
        tt.appendChild(header);
        if (m.effective.length) {
          const line = document.createElement('span');
          line.className = 'tt-line-good';
          line.textContent = `Effective vs: ${renderEnemyNames(m.effective)}`;
          tt.appendChild(line);
        }
        if (m.weak.length) {
          const line = document.createElement('span');
          line.className = 'tt-line-bad';
          line.textContent = `Weak vs: ${renderEnemyNames(m.weak)}`;
          tt.appendChild(line);
        }
        const rect = btn.getBoundingClientRect();
        tt.style.left = `${rect.left}px`;
        tt.style.top  = `${rect.top - tt.offsetHeight - 6}px`;
        tt.style.display = 'block';
        // After display:block, offsetHeight is now real; reposition once.
        requestAnimationFrame(() => {
          tt.style.top = `${rect.top - tt.offsetHeight - 6}px`;
        });
      });

      btn.addEventListener('mouseleave', () => {
        const tt = document.getElementById('tower-tooltip');
        tt.style.display = 'none';
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
    document.getElementById('panel-reposition-btn').addEventListener('click',
      () => this.game.events.emit('ui:barracks-reposition'));

    // Ability button clicks
    ['q', 'w', 'e'].forEach(slot => {
      const btn = document.getElementById('ability-' + slot);
      if (btn) btn.addEventListener('click', () => this.game.events.emit('ui:ability', { slot }));
    });

    // Keyboard shortcuts
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (['q', 'w', 'e'].includes(key)) {
        this.game.events.emit('ui:ability', { slot: key });
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _onSpeedToggle() {
    this._speedFast = !this._speedFast;
    document.getElementById('speed-btn').textContent = this._speedFast ? '⏸ 1x' : '⏩ 2x';
    this.game.events.emit('ui:speed-toggle');
  }

  _onBarracksReposition() {
    document.getElementById('tower-panel').style.display = 'none';
  }

  _subscribeToGameEvents() {
    this.game.events.on('hud:update',       this._onHudUpdate,  this);
    this.game.events.on('wave:state',        this._onWaveState,  this);
    this.game.events.on('tower:panel-open',  this._onPanelOpen,  this);
    this.game.events.on('tower:panel-close', this._onPanelClose, this);
    this.game.events.on('game:victory',      this._onVictory,    this);
    this.game.events.on('game:defeat',       this._onDefeat,     this);
    this.game.events.on('ui:barracks-reposition', this._onBarracksReposition, this);
    this.game.events.on('hero:update',        this._onHeroUpdate,        this);
    this.game.events.on('hero:level-up',      this._onHeroLevelUp,       this);
    this.game.events.on('hero:aim-mode',      this._onHeroAimMode,       this);
    this.game.events.on('hero:aim-cancel',    this._onHeroAimCancel,     this);
    this.game.events.on('hero:cooldown-tick', this._onHeroCooldownTick,  this);
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
    this._openTower = tower;
    const map = MAPS[mapId];

    const branchLabel = tower.branch ? ` · ${def['tier4' + tower.branch]?.label ?? ''}` : '';
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name + branchLabel;
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    if (tower.type === 'barracks') {
      document.getElementById('panel-std-stats').style.display      = 'none';
      document.getElementById('panel-barracks-stats').style.display = 'block';
      const ss = tower.soldierStats;
      document.getElementById('panel-soldier-count').textContent   = ss.count;
      document.getElementById('panel-soldier-hp').textContent      = ss.hp;
      document.getElementById('panel-soldier-dmg').textContent     = ss.damage;
      document.getElementById('panel-soldier-respawn').textContent = ss.respawnDuration;
      document.getElementById('panel-soldier-blocks').textContent  = ss.canBlockFlyers ? 'Ground + Air' : 'Ground';
      document.getElementById('panel-reposition-btn').style.display = 'block';
    } else {
      document.getElementById('panel-std-stats').style.display      = 'block';
      document.getElementById('panel-barracks-stats').style.display = 'none';
      document.getElementById('panel-reposition-btn').style.display = 'none';
      document.getElementById('panel-dmg').textContent = 'Damage: '    + tower.damage;
      document.getElementById('panel-rng').textContent = 'Range: '     + tower.range;
      document.getElementById('panel-spd').textContent = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    }

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const picker     = document.getElementById('panel-branch-picker');
    picker.style.display = 'none';
    picker.querySelector('.branch-cards').replaceChildren();
    upgradeBtn.style.display = '';

    if (tower.level === 3 && !tower.branch) {
      upgradeBtn.style.display = 'none';
      picker.style.display     = 'block';
      this._renderBranchPicker(picker.querySelector('.branch-cards'), def, map);
    } else {
      this._setUpgradeButton(upgradeBtn, tower, def, map);
    }

    document.getElementById('panel-sell-btn').textContent =
      '💰 Sell (' + Math.floor(tower.totalCost * 0.6) + 'g)';

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(x + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(y - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';

    this._selectedType = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  _setUpgradeButton(btn, tower, def, map) {
    const nextLevel = tower.level + 1;
    if (tower.level >= 4) {
      btn.disabled    = true;
      btn.textContent = 'MAX LEVEL';
      btn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = nextLevel <= 3 ? 3 : 5;
      btn.disabled    = true;
      btn.textContent = '🔒 Unlocked on Map ' + unlockMap;
      btn.className   = 'upgrade-btn maxed';
    } else {
      btn.disabled    = false;
      const tierDef   = def['tier' + nextLevel];
      btn.textContent = 'Upgrade 💰' + tierDef.cost + ': ' + tierDef.label;
      btn.className   = 'upgrade-btn';
    }
  }

  _renderBranchPicker(container, def, map) {
    const tierLocked = map.maxTierAllowed < 4;
    for (const [branch, tierDef] of [['A', def.tier4A], ['B', def.tier4B]]) {
      const card = document.createElement('div');
      card.className = tierLocked ? 'branch-card locked' : 'branch-card';

      const label = document.createElement('div');
      label.className   = 'branch-label';
      label.textContent = tierDef.label;

      const effect = document.createElement('div');
      effect.className   = 'branch-effect';
      effect.textContent = tierDef.passiveEffect;

      const cost = document.createElement('div');
      cost.className   = 'branch-cost';
      cost.textContent = tierDef.cost + 'g';

      const btn = document.createElement('button');
      btn.className   = 'upgrade-btn';
      btn.textContent = 'Choose';
      if (tierLocked) {
        btn.disabled = true;
        btn.title    = 'Unlocked on Map 5';
      }
      btn.addEventListener('click', () =>
        this.game.events.emit('ui:tower-upgrade', { branch }));

      card.append(label, effect, cost, btn);
      container.appendChild(card);
    }
  }

  _onPanelClose() {
    document.getElementById('tower-panel').style.display          = 'none';
    const picker = document.getElementById('panel-branch-picker');
    picker.style.display = 'none';
    picker.querySelector('.branch-cards').replaceChildren();
    document.getElementById('panel-upgrade-btn').style.display    = '';
    document.getElementById('panel-std-stats').style.display      = 'block';
    document.getElementById('panel-barracks-stats').style.display = 'none';
    document.getElementById('panel-reposition-btn').style.display = 'none';
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

  _onHeroUpdate({ hp, maxHp }) {
    const fill = document.getElementById('hero-hp-fill');
    if (fill) fill.style.width = ((hp / maxHp) * 100).toFixed(1) + '%';
  }

  _onHeroLevelUp({ level }) {
    document.getElementById('hero-level').textContent = 'Rael L' + level;
    if (level >= 1) {
      const q = document.getElementById('ability-q');
      if (q) { q.classList.remove('locked'); q.disabled = false; }
    }
    if (level >= 2) {
      const w = document.getElementById('ability-w');
      if (w) { w.classList.remove('locked'); w.disabled = false; }
    }
    if (level >= 3) {
      const e = document.getElementById('ability-e');
      if (e) { e.classList.remove('locked'); e.disabled = false; }
    }
  }

  _onHeroAimMode() {
    document.body.style.cursor = 'crosshair';
    const w = document.getElementById('ability-w');
    if (w) w.style.outline = '2px solid #ff6400';
  }

  _onHeroAimCancel() {
    document.body.style.cursor = '';
    const w = document.getElementById('ability-w');
    if (w) w.style.outline = '';
  }

  _onHeroCooldownTick({ q, w, e }) {
    this._setAbilityCd('ability-q', q);
    this._setAbilityCd('ability-w', w);
    this._setAbilityCd('ability-e', e);
  }

  _setAbilityCd(id, secs) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const cdEl = btn.querySelector('.ability-cd');
    if (secs > 0) {
      btn.disabled = true;
      if (cdEl) cdEl.textContent = secs + 's';
    } else {
      if (!btn.classList.contains('locked')) btn.disabled = false;
      if (cdEl) cdEl.textContent = '';
    }
  }
}
