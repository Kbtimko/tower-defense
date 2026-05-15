import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { makeWaves } from '../data/waves.js';
import { PathManager } from '../systems/PathManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { Tower } from '../entities/Tower.js';
import { Barracks } from '../entities/Barracks.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';

const PROJ_COLORS = { archer: 0xcd853f, mage: 0xdd00ff, cannon: 0x888888, ice: 0x00eeff };

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
    this.waveMgr  = new WaveManager(makeWaves(this.mapId), this.events);

    // Entity arrays
    this.towers      = [];
    this.enemies     = [];
    this.projectiles = [];
    this.particles   = [];
    this.kills       = 0;
    this.speed       = 1;
    this.over        = false;
    this.won         = false;
    this.selectedType   = null;
    this.selectedTower  = null;

    this.cameras.main.setBackgroundColor(map.background);

    // Graphics layers — path drawn once, zones reactive, particles every frame
    this.pathGfx     = this.add.graphics().setDepth(0);
    this.zoneGfx     = this.add.graphics().setDepth(1);
    this.particleGfx = this.add.graphics().setDepth(5);

    // Draw path once (static for the lifetime of the scene)
    this.pathMgr.renderPath(this.pathGfx, map.pathColor);
    const p = this.pathMgr.path;
    this.pathGfx.fillStyle(0x27ae60, 1); this.pathGfx.fillCircle(p[0].x, p[0].y, 13);
    this.pathGfx.fillStyle(0xc0392b, 1); this.pathGfx.fillCircle(p[p.length-1].x, p[p.length-1].y, 13);

    // IN/OUT text labels
    this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
    this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);

    // Phaser input
    this.input.on('pointerdown', this._onPointerDown, this);

    // Scene events from systems
    this.events.on('enemy:spawn',    this._spawnEnemy,      this);
    this.events.on('economy:update', this._onEconomyUpdate, this);
    this.events.on('game:defeat',    this._handleDefeat,    this);

    // Events from UIScene → GameScene
    this.game.events.on('ui:wave-start',        () => this._startWave(),                          this);
    this.game.events.on('ui:speed-toggle',      () => { this.speed = this.speed === 1 ? 2 : 1; }, this);
    this.game.events.on('ui:tower-type-select', ({ type }) => this._onTowerTypeSelect(type),       this);
    this.game.events.on('ui:tower-upgrade', ({ branch } = {}) => this._upgradeSelectedTower(branch ?? null), this);
    this.game.events.on('ui:tower-sell',        () => this._sellSelectedTower(),                   this);
    this.game.events.on('ui:restart',           () => this.scene.restart({ mapId: this.mapId }),   this);

    // Launch UIScene — reads initial state from this scene in its own create()
    this.scene.launch('UIScene');
    this._redrawZones();
  }

  shutdown() {
    this.game.events.off('ui:wave-start',        null, this);
    this.game.events.off('ui:speed-toggle',      null, this);
    this.game.events.off('ui:tower-type-select', null, this);
    this.game.events.off('ui:tower-upgrade',     null, this);
    this.game.events.off('ui:tower-sell',        null, this);
    this.game.events.off('ui:restart',           null, this);
    this.scene.stop('UIScene');
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
    this._updateParticles(dt);
    this._checkWaveComplete();

    this.particleGfx.clear();
    this._drawParticles();
  }

  // ─── Wave ──────────────────────────────────────────────────────────────────

  _startWave() {
    if (this.waveMgr.active) return;
    this.waveMgr.startWave();
    this._emitWaveState();
  }

  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy(this, { def, scaleFactor, startX: start.x, startY: start.y }));
  }

  _checkWaveComplete() {
    if (!this.waveMgr.active) return;
    if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
    this.waveMgr.active = false;
    this.economy.earn(38);
    this._emitWaveState();
    if (this.waveMgr.done) this._handleVictory();
  }

  // ─── Enemies ───────────────────────────────────────────────────────────────

  _updateEnemies(dt) {
    const path = this.pathMgr.path;
    for (const enemy of this.enemies) {
      enemy.update(dt);
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
    for (const e of this.enemies) { if (e.dead) e.destroy(); }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  // ─── Towers ────────────────────────────────────────────────────────────────

  _updateTowers(dt) {
    for (const tower of this.towers) {
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
        this.projectiles.push(new Projectile(this, {
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
    for (const p of this.projectiles) { if (p.dead) p.destroy(); }
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
    for (const tower of this.towers) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        if (this.selectedTower) this.selectedTower.hideRange();
        this._panelX = mx; this._panelY = my;
        this.game.events.emit('tower:panel-open', {
          tower, def: TOWER_DEFS[tower.type], x: mx, y: my, mapId: this.mapId,
        });
        tower.showRange();
        this.selectedTower = tower;
        return;
      }
    }
    if (this.selectedTower) { this.selectedTower.hideRange(); this.selectedTower = null; }
    this.game.events.emit('tower:panel-close');
    if (!this.selectedType) return;
    const def = TOWER_DEFS[this.selectedType];
    for (const zone of this.pathMgr.buildZones) {
      if (!zone.occupied && Math.hypot(zone.cx - mx, zone.cy - my) < zone.radius + 8) {
        if (!this.economy.spend(def.cost)) { this._toast('Not enough gold!'); return; }
        const zoneIndex = this.pathMgr.buildZones.indexOf(zone);
        let tower;
        if (this.selectedType === 'barracks') {
          tower = new Barracks(this, { type: this.selectedType, x: zone.cx, y: zone.cy, def, zoneIndex });
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(zone.cx, zone.cy);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        } else {
          tower = new Tower(this, { type: this.selectedType, x: zone.cx, y: zone.cy, def, zoneIndex });
        }
        this.towers.push(tower);
        zone.occupied = true;
        this._redrawZones();
        return;
      }
    }
  }

  // ─── Tower panel ───────────────────────────────────────────────────────────

  _upgradeSelectedTower(branch = null) {
    if (!this.selectedTower) return;
    const tower     = this.selectedTower;
    const def       = TOWER_DEFS[tower.type];
    const map       = MAPS[this.mapId];
    const nextLevel = tower.level + 1;
    if (tower.level >= 4 || nextLevel > map.maxTierAllowed) return;
    const key     = nextLevel === 4 && branch ? `tier4${branch}` : `tier${nextLevel}`;
    const tierDef = def[key];
    if (!tierDef || !this.economy.spend(tierDef.cost)) { this._toast('Not enough gold!'); return; }
    tower.totalCost += tierDef.cost;
    tower.upgrade(nextLevel, branch);
    if (tower.type === 'barracks') {
      tower._rebuildSoldiers(this, this.pathMgr.getPathPoints());
    }
    this.game.events.emit('tower:panel-open', {
      tower, def, x: this._panelX, y: this._panelY, mapId: this.mapId,
    });
  }

  _sellSelectedTower() {
    if (!this.selectedTower) return;
    const tower  = this.selectedTower;
    const refund = tower.sell();
    this.economy.earn(refund);
    this.towers = this.towers.filter(t => t !== tower);
    this.pathMgr.buildZones[tower.zoneIndex].occupied = false;
    this.selectedTower = null;
    this.game.events.emit('tower:panel-close');
    this._redrawZones();
  }

  // ─── Game end ──────────────────────────────────────────────────────────────

  _toast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#f39c12;padding:6px 16px;border-radius:6px;font-size:13px;z-index:30;pointer-events:none;';
    el.textContent = msg;
    document.getElementById('game').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ─── Event helpers ─────────────────────────────────────────────────────────

  _emitHudUpdate() {
    this.game.events.emit('hud:update', {
      gold: this.economy.gold, lives: this.economy.lives,
      wave: this.waveMgr.currentWave, waveCount: MAPS[this.mapId].waveCount,
      kills: this.kills,
    });
  }

  _emitWaveState() {
    this.game.events.emit('wave:state', {
      active: this.waveMgr.active, done: this.waveMgr.done,
      currentWave: this.waveMgr.currentWave,
    });
  }

  _onEconomyUpdate() {
    this._emitHudUpdate();
    this._redrawZones();
  }

  _handleDefeat() {
    this.over = true;
    this.game.events.emit('game:defeat', { wave: this.waveMgr.currentWave });
  }

  _handleVictory() {
    this.won = true;
    this.game.events.emit('game:victory', { kills: this.kills, waveCount: MAPS[this.mapId].waveCount });
  }

  _onTowerTypeSelect(type) {
    this.selectedType = type;
    if (type !== null) {
      if (this.selectedTower) this.selectedTower.hideRange();
      this.selectedTower = null;
      this.game.events.emit('tower:panel-close');
    }
    this._redrawZones();
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _redrawZones() {
    const canAfford = this.selectedType && this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
    this.zoneGfx.clear();
    for (const zone of this.pathMgr.buildZones) {
      if (zone.occupied) continue;
      const color = this.selectedType ? (canAfford ? 0xffd700 : 0x884444) : 0x444444;
      const alpha = this.selectedType ? 1 : 0.3;
      this.zoneGfx.lineStyle(this.selectedType ? 2 : 1, color, alpha);
      this.zoneGfx.strokeCircle(zone.cx, zone.cy, zone.radius);
      if (this.selectedType && canAfford) {
        this.zoneGfx.fillStyle(0xffd700, 0.07); this.zoneGfx.fillCircle(zone.cx, zone.cy, zone.radius);
      }
    }
  }

  _drawParticles() {
    for (const p of this.particles) {
      this.particleGfx.lineStyle(2, p.color, p.alpha);
      this.particleGfx.strokeCircle(p.x, p.y, p.radius);
    }
  }
}
