import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { PathManager } from '../systems/PathManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { TowerPlacementManager } from '../systems/TowerPlacementManager.js';
import { Tower } from '../entities/Tower.js';
import { Barracks } from '../entities/Barracks.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';

const PROJ_COLORS = { archer: 0xcd853f, mage: 0xdd00ff, cannon: 0x888888, ice: 0x00eeff };
const ENEMY_MELEE_DAMAGE = 20; // damage/second dealt by any enemy to a blocking soldier
const MELEE_RANGE        = 30; // pixels — enemy halts this close to a living soldier

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.mapId = data?.mapId ?? 0;
  }

  create() {
    const map = MAPS[this.mapId];
    const { width, height } = this.scale;

    // Systems
    this.pathMgr  = new PathManager(map.waypoints, width, height);
    this.economy  = new EconomyManager(map.startGold, map.startLives, this.events);
    this.waveMgr  = new WaveManager(MAP_WAVES[this.mapId] ?? MAP_WAVES[0], this.events);
    this.placementManager = new TowerPlacementManager(
      this.pathMgr.buildZones,
      this.economy,
      (type, scene, opts) => type === 'barracks'
        ? new Barracks(scene, opts)
        : new Tower(scene, opts)
    );

    // Entity arrays
    this.enemies     = [];
    this.projectiles = [];
    this.particles   = [];
    this.kills       = 0;
    this.speed       = 1;
    this.over        = false;
    this.won         = false;
    this.selectedType   = null;
    this.selectedTower  = null;
    this._openTowerId   = null;

    // Reposition mode state
    this.repositionMode        = false;
    this.repositioningBarracks = null;

    // Phaser graphics (cleared + redrawn every frame)
    this.gfx = this.add.graphics();
    this.cameras.main.setBackgroundColor(map.background);

    // Static IN/OUT text labels
    const p = this.pathMgr.path;
    this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
    this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);

    // Phaser input
    this.input.on('pointerdown', this._onPointerDown, this);

    // Scene events from systems
    this.events.on('enemy:spawn',    this._spawnEnemy,  this);
    this.events.on('economy:update', this._updateHUD,   this);
    this.events.on('game:defeat',    this._onDefeat,    this);

    // Show DOM UI
    document.getElementById('hud').style.display        = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';
    document.getElementById('game-msg').style.display   = 'none';

    // Wire DOM buttons (use once-registered named functions; shutdown() cleans up via clone)
    this._bindDOMEvents();
    this._updateHUD();
    this._updateWaveButton();
  }

  _bindDOMEvents() {
    document.querySelectorAll('.tower-btn').forEach(btn => {
      btn.addEventListener('click', () => this._selectTowerType(btn.dataset.type, btn));
    });
    document.getElementById('wave-btn').addEventListener('click',          () => this._startWave());
    document.getElementById('speed-btn').addEventListener('click',         () => this._toggleSpeed());
    document.getElementById('panel-upgrade-btn').addEventListener('click', () => this._upgradeSelectedTower());
    document.getElementById('panel-sell-btn').addEventListener('click',    () => this._sellSelectedTower());
    document.getElementById('panel-reposition-btn').addEventListener('click', () => this._startReposition());
    document.getElementById('msg-btn').addEventListener('click',           () => this.scene.restart({ mapId: this.mapId }));
  }

  shutdown() {
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display        = 'none';
    document.getElementById('bottom-bar').style.display = 'none';
  }

  // ─── Update loop ───────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.over || this.won) return;
    const dt    = (delta / 1000) * this.speed;
    const dtMs  = delta * this.speed;

    this.waveMgr.update(dtMs);
    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._updateSoldiers(dt);
    this._updateParticles(dt);
    this._checkWaveComplete();

    this.gfx.clear();
    this._drawPath();
    this._drawZones();
    this._drawTowers();
    this._drawEnemies();
    this._drawProjectiles();
    this._drawParticles();
  }

  // ─── Wave ──────────────────────────────────────────────────────────────────

  _startWave() {
    if (this.waveMgr.active) return;
    this.waveMgr.startWave();
    this._updateWaveButton();
  }

  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy({ def, scaleFactor, startX: start.x, startY: start.y }));
  }

  _checkWaveComplete() {
    if (!this.waveMgr.active) return;
    if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
    this.waveMgr.active = false;
    this.economy.earn(38);
    this._updateWaveButton();
    if (this.waveMgr.done) this._onVictory();
  }

  // ─── Enemies ───────────────────────────────────────────────────────────────

  _updateEnemies(dt) {
    const path = this.pathMgr.path;
    for (const enemy of this.enemies) {
      enemy.update(dt);
      const blocker = this._checkSoldierBlock(enemy);
      if (blocker) {
        blocker.takeDamage(ENEMY_MELEE_DAMAGE * dt);
        if (blocker.attackTimer <= 0) {
          this._dealDamage(enemy, blocker.damage, false);
          blocker.attackTimer = 1 / blocker.attackRate;
        }
        if (enemy.dead) continue;
        continue;
      }
      let rem = enemy.currentSpeed * dt;
      while (rem > 0 && enemy.waypointIndex < path.length - 1) {
        const tgt = path[enemy.waypointIndex + 1];
        const dx = tgt.x - enemy.x, dy = tgt.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= rem) {
          enemy.x = tgt.x; enemy.y = tgt.y;
          enemy.waypointIndex++;
          rem -= dist;
        } else {
          enemy.x += (dx / dist) * rem; enemy.y += (dy / dist) * rem;
          rem = 0;
        }
      }
      if (enemy.waypointIndex >= path.length - 1) {
        enemy.dead = true;
        this.economy.loseLife();
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _checkSoldierBlock(enemy) {
    for (const tower of this.placementManager.getTowers()) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) {
        if (soldier.dead) continue;
        if (enemy.def.flying && !soldier.canBlockFlyers) continue;
        if (Math.hypot(enemy.x - soldier.x, enemy.y - soldier.y) < MELEE_RANGE) return soldier;
      }
    }
    return null;
  }

  _updateSoldiers(dt) {
    for (const tower of this.placementManager.getTowers()) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) soldier.update(dt);
    }
  }

  // ─── Towers ────────────────────────────────────────────────────────────────

  _updateTowers(dt) {
    for (const tower of this.placementManager.getTowers()) {
      if (!tower.fireRate) continue;
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      let best = null, bestProg = -1;
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.range
            && enemy.waypointIndex > bestProg) {
          best = enemy; bestProg = enemy.waypointIndex;
        }
      }
      if (best) {
        this.projectiles.push(new Projectile({
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
        }));
        tower.cooldown = 1 / tower.fireRate;
      }
    }
  }

  // ─── Projectiles ───────────────────────────────────────────────────────────

  _updateProjectiles(dt) {
    for (const proj of this.projectiles) {
      if (proj.target && !proj.target.dead) {
        proj.targetX = proj.target.x;
        proj.targetY = proj.target.y;
      }
      const dx = proj.targetX - proj.x, dy = proj.targetY - proj.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        this._onProjectileHit(proj);
        proj.dead = true;
      } else {
        const step = Math.min(proj.speed * dt, dist);
        proj.x += (dx / dist) * step;
        proj.y += (dy / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  _onProjectileHit(proj) {
    if (proj.splashRadius > 0) {
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - proj.targetX, enemy.y - proj.targetY) <= proj.splashRadius) {
          this._dealDamage(enemy, proj.damage, proj.pierce);
        }
      }
      this._addParticle(proj.targetX, proj.targetY, 0xff8800, 14);
    } else if (proj.target && !proj.target.dead) {
      this._dealDamage(proj.target, proj.damage, proj.pierce);
      if (proj.slowFactor > 0) proj.target.applyStatus({ type: 'slow', duration: 2, factor: proj.slowFactor });
      this._addParticle(proj.targetX, proj.targetY, proj.color, 7);
    }
  }

  _dealDamage(enemy, damage, pierce) {
    enemy.takeDamage(damage, pierce);
    if (enemy.dead) {
      this.economy.earn(enemy.reward);
      this.kills++;
      this._emitHudUpdate();
      // Central flash
      this._addParticle(enemy.x, enemy.y, enemy.def.color, 10);
      // Radial burst
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        this._addParticle(
          enemy.x + Math.cos(angle) * enemy.def.radius * 0.8,
          enemy.y + Math.sin(angle) * enemy.def.radius * 0.8,
          enemy.def.color,
          5
        );
      }
    }
  }

  // ─── Particles ─────────────────────────────────────────────────────────────

  _addParticle(x, y, color, size) {
    this.particles.push({ x, y, color, radius: size * 0.3, maxLife: 0.3, life: 0.3, alpha: 1 });
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt; p.radius += dt * 28; p.alpha = Math.max(0, p.life / p.maxLife);
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _onPointerDown(pointer) {
    const mx = pointer.x, my = pointer.y;

    // Handle reposition mode
    if (this.repositionMode && this.repositioningBarracks) {
      const b = this.repositioningBarracks;
      for (const pt of this.pathMgr.getPathPoints()) {
        if (Math.hypot(pt.x - b.x, pt.y - b.y) <= b.range) {
          if (Math.hypot(pt.x - mx, pt.y - my) < 8) {
            const newProgress = this.pathMgr.getNearestPathProgress(mx, my);
            b.repositionSoldiers(newProgress, this.pathMgr.getPathPoints());
            this.repositionMode = false;
            this.repositioningBarracks = null;
            this._openTowerPanel(b, mx, my);
            return;
          }
        }
      }
      this._toast('Click on the path within Barracks range!');
      this.repositionMode = false;
      this.repositioningBarracks = null;
      return;
    }

    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        this._deselectButtons();
        this._openTowerPanel(tower, mx, my);
        return;
      }
    }
    this._closeTowerPanel();
    if (!this.selectedType) return;
    const zones = this.placementManager.getZones();
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
        const tower = this.placementManager.placeTower(i, this.selectedType, this);
        if (!tower) { this._toast('Not enough gold!'); return; }
        return;
      }
    }
  }

  _selectTowerType(type, btn) {
    if (this.selectedType === type) { this.selectedType = null; this._deselectButtons(); return; }
    this.selectedType = type;
    this.selectedTower = null;
    this._closeTowerPanel();
    this._deselectButtons();
    btn.classList.add('selected');
  }

  _deselectButtons() {
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  // ─── Tower panel ───────────────────────────────────────────────────────────

  _openTowerPanel(tower, mx, my) {
    this._openTowerId = tower.id ?? null;
    this.selectedTower = tower;
    const def = TOWER_DEFS[tower.type];
    const map = MAPS[this.mapId];

    const branchLabel = tower.branch ? ` · ${def['tier4' + tower.branch]?.label ?? ''}` : '';
    document.getElementById('panel-name').textContent = def.icon + ' ' + def.name + branchLabel;
    document.getElementById('panel-lvl').textContent  = 'Level: ' + tower.level + '/4';

    if (tower.type === 'barracks') {
      document.getElementById('panel-std-stats').style.display      = 'none';
      document.getElementById('panel-barracks-stats').style.display = 'block';
      const ss = tower.soldierStats;
      document.getElementById('panel-soldier-count').textContent   = 'Soldiers: '  + ss.count;
      document.getElementById('panel-soldier-hp').textContent      = 'HP: '        + ss.hp        + ' each';
      document.getElementById('panel-soldier-dmg').textContent     = 'DMG: '       + ss.damage    + ' each';
      document.getElementById('panel-soldier-respawn').textContent = 'Respawn: '   + ss.respawnDuration + 's';
      document.getElementById('panel-soldier-blocks').textContent  = 'Blocks: '    + (ss.canBlockFlyers ? 'Ground + Air' : 'Ground');
    } else {
      document.getElementById('panel-std-stats').style.display      = 'block';
      document.getElementById('panel-barracks-stats').style.display = 'none';
      document.getElementById('panel-dmg').textContent = 'Damage: '    + tower.damage;
      document.getElementById('panel-rng').textContent = 'Range: '     + tower.range;
      document.getElementById('panel-spd').textContent = 'Fire rate: ' + (tower.fireRate * 100).toFixed(0) + '%';
    }

    const upgradeBtn = document.getElementById('panel-upgrade-btn');
    const picker     = document.getElementById('panel-branch-picker');
    picker.style.display = 'none';
    picker.replaceChildren();
    upgradeBtn.style.display = '';

    if (tower.level === 3 && !tower.branch && tower.type !== 'barracks') {
      upgradeBtn.style.display = 'none';
      picker.style.display     = 'block';
      this._renderBranchPicker(picker, def, map);
    } else {
      this._setUpgradeButton(upgradeBtn, tower, def, map);
    }

    document.getElementById('panel-reposition-btn').style.display =
      tower.type === 'barracks' ? 'block' : 'none';

    document.getElementById('panel-sell-btn').textContent =
      '💰 Sell (' + Math.floor(tower.totalCost * 0.6) + 'g)';

    const gameRect = document.getElementById('game').getBoundingClientRect();
    const panel    = document.getElementById('tower-panel');
    panel.style.left    = Math.min(mx + 10, gameRect.width  - 180) + 'px';
    panel.style.top     = Math.min(my - 10, gameRect.height - 220) + 'px';
    panel.style.display = 'block';

    this.selectedType = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
  }

  _closeTowerPanel() {
    document.getElementById('tower-panel').style.display         = 'none';
    document.getElementById('panel-branch-picker').style.display = 'none';
    document.getElementById('panel-branch-picker').replaceChildren();
    document.getElementById('panel-upgrade-btn').style.display   = '';
    document.getElementById('panel-std-stats').style.display     = 'block';
    document.getElementById('panel-barracks-stats').style.display = 'none';
    document.getElementById('panel-reposition-btn').style.display = 'none';
    this.selectedTower = null;
  }

  _setUpgradeButton(btn, tower, def, map) {
    const nextLevel = tower.level + 1;
    if (tower.level >= 4) {
      btn.textContent = 'MAX LEVEL';
      btn.className   = 'upgrade-btn maxed';
    } else if (nextLevel > map.maxTierAllowed) {
      const unlockMap = map.maxTierAllowed < 2 ? 3 : 5;
      btn.textContent = '🔒 Unlocked on Map ' + unlockMap;
      btn.className   = 'upgrade-btn maxed';
    } else {
      const tierDef   = def['tier' + nextLevel];
      btn.textContent = 'Upgrade 💰' + tierDef.cost + ': ' + tierDef.label;
      btn.className   = 'upgrade-btn';
    }
  }

  _renderBranchPicker(container, def, map) {
    const tierLocked = map.maxTierAllowed < 4;

    const header = document.createElement('div');
    header.className   = 'branch-header';
    header.textContent = '⚡ Choose Tier 4 Path';
    container.appendChild(header);

    const cards = document.createElement('div');
    cards.className = 'branch-cards';

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
      btn.className   = 'upgrade-btn branch-choose-btn';
      btn.textContent = 'Choose';
      if (tierLocked) {
        btn.disabled = true;
        btn.title    = 'Unlocked on Map 5';
      }
      btn.addEventListener('click', () =>
        this._upgradeSelectedTower(branch));

      card.append(label, effect, cost, btn);
      cards.appendChild(card);
    }
    container.appendChild(cards);
  }

  _upgradeSelectedTower(branch = null) {
    if (!this.selectedTower) return;
    const tower = this.selectedTower;
    const map   = MAPS[this.mapId];
    const nextLevel = tower.level + 1;
    if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
    if (!this.placementManager.upgradeTower(tower, nextLevel, branch)) {
      this._toast('Not enough gold!');
      return;
    }
    const panel = document.getElementById('tower-panel');
    this._openTowerPanel(tower, parseInt(panel.style.left), parseInt(panel.style.top));
  }

  _sellSelectedTower() {
    if (!this.selectedTower) return;
    this.placementManager.sellTower(this.selectedTower);
    this.selectedTower = null;
    this._closeTowerPanel();
  }

  _startReposition() {
    if (!this.selectedTower || this.selectedTower.type !== 'barracks') return;
    const barracks = this.selectedTower;
    document.getElementById('tower-panel').style.display = 'none';
    this.repositionMode = true;
    this.repositioningBarracks = barracks;
    this._redrawZones();
    this._toast('Click on the path within Barracks range to reposition soldiers');
  }

  _toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    document.getElementById('speed-btn').textContent = this.speed === 1 ? '⏩ 2x' : '⏸ 1x';
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  _updateHUD() {
    document.getElementById('stat-lives').textContent = this.economy.lives;
    document.getElementById('stat-gold').textContent  = this.economy.gold;
    document.getElementById('stat-wave').textContent  = `${this.waveMgr.currentWave}/${MAPS[this.mapId].waveCount}`;
    document.getElementById('stat-kills').textContent = this.kills;
  }

  _updateWaveButton() {
    const btn = document.getElementById('wave-btn');
    if (!btn) return;
    if (this.waveMgr.done) {
      btn.disabled = true; btn.textContent = 'All Waves Done';
    } else if (this.waveMgr.active) {
      btn.disabled = true; btn.textContent = `Wave ${this.waveMgr.currentWave} in progress...`;
    } else {
      btn.disabled = false; btn.textContent = `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
    }
  }

  // ─── Game end ──────────────────────────────────────────────────────────────

  _onVictory() {
    this.won = true;
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  = `Survived all ${MAPS[this.mapId].waveCount} waves! Kills: ${this.kills}`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _onDefeat() {
    this.over = true;
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }

  _toast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#f39c12;padding:6px 16px;border-radius:6px;font-size:13px;z-index:30;pointer-events:none;';
    el.textContent = msg;
    document.getElementById('game').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _drawPath() {
    const map = MAPS[this.mapId];
    this.pathMgr.renderPath(this.gfx, map.pathColor);
    const p = this.pathMgr.path;
    this.gfx.fillStyle(0x27ae60, 1); this.gfx.fillCircle(p[0].x, p[0].y, 13);
    this.gfx.fillStyle(0xc0392b, 1); this.gfx.fillCircle(p[p.length-1].x, p[p.length-1].y, 13);
  }

  _drawZones() {
    const canAfford = this.selectedType && this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
    for (const zone of this.placementManager.getZones()) {
      if (zone.occupied) continue;
      const color = this.selectedType ? (canAfford ? 0xffd700 : 0x884444) : 0x444444;
      const alpha = this.selectedType ? 1 : 0.3;
      this.gfx.lineStyle(this.selectedType ? 2 : 1, color, alpha);
      this.gfx.strokeCircle(zone.cx, zone.cy, zone.radius);
      if (this.selectedType && canAfford) {
        this.gfx.fillStyle(0xffd700, 0.07); this.gfx.fillCircle(zone.cx, zone.cy, zone.radius);
      }
    }

    if (this.repositionMode && this.repositioningBarracks) {
      const b = this.repositioningBarracks;
      this.gfx.lineStyle(2, 0x4fc3f7, 0.7);
      this.gfx.strokeCircle(b.x, b.y, b.range);
      for (const pt of this.pathMgr.getPathPoints()) {
        if (Math.hypot(pt.x - b.x, pt.y - b.y) <= b.range) {
          this.gfx.fillStyle(0x4fc3f7, 0.45);
          this.gfx.fillCircle(pt.x, pt.y, 6);
        }
      }
    }
  }

  _drawTowers() {
    for (const tower of this.placementManager.getTowers()) {
      if (this.selectedTower === tower) {
        this.gfx.lineStyle(1, 0xffd700, 0.25); this.gfx.strokeCircle(tower.x, tower.y, tower.range);
      }
      this.gfx.fillStyle(0x2a2a3a, 1); this.gfx.fillCircle(tower.x, tower.y, 18);
      this.gfx.lineStyle(2.5, TOWER_DEFS[tower.type].color, 1);
      this.gfx.strokeCircle(tower.x, tower.y, 18);
    }
  }

  _drawEnemies() {
    for (const enemy of this.enemies) {
      const r = enemy.def.radius;
      this.gfx.fillStyle(0x000000, 0.25);
      this.gfx.fillEllipse(enemy.x, enemy.y + r + 2, r * 1.5, 6);
      this.gfx.fillStyle(enemy.def.color, 1);
      this.gfx.fillCircle(enemy.x, enemy.y, r);
      if (enemy.statusEffects.slow.active) {
        this.gfx.lineStyle(2, 0x00eeff, 1); this.gfx.strokeCircle(enemy.x, enemy.y, r);
      }
      // HP bar
      const bw = r * 2.2, bh = 4, bx = enemy.x - bw / 2, by = enemy.y - r - 8;
      const pct = enemy.hp / enemy.maxHp;
      this.gfx.fillStyle(0x222222, 1); this.gfx.fillRect(bx, by, bw, bh);
      this.gfx.fillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xf39c12 : 0xe74c3c, 1);
      this.gfx.fillRect(bx, by, bw * pct, bh);
    }
  }

  _drawProjectiles() {
    for (const proj of this.projectiles) {
      this.gfx.fillStyle(proj.color, 1);
      this.gfx.fillCircle(proj.x, proj.y, proj.splashRadius > 0 ? 5 : 3);
      if (proj.slowFactor > 0) {
        this.gfx.lineStyle(1, 0xaaffff, 1);
        this.gfx.strokeCircle(proj.x, proj.y, proj.slowFactor > 0 ? 5 : 3);
      }
    }
  }

  _drawParticles() {
    for (const p of this.particles) {
      this.gfx.lineStyle(2, p.color, p.alpha);
      this.gfx.strokeCircle(p.x, p.y, p.radius);
    }
  }

  _redrawZones() {
    // Placeholder — redrawn every frame in update()
  }
}
