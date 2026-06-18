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
import { Hero } from '../entities/Hero.js';
import { SaveManager } from '../systems/SaveManager.js';
import { UpgradeManager } from '../systems/UpgradeManager.js';
import { StoryManager }    from '../systems/StoryManager.js';
import { DamageNumberOverlay } from '../systems/DamageNumberOverlay.js';
import { ShakeController }    from '../systems/ShakeController.js';
import { ParticleSpawner }    from '../systems/ParticleSpawner.js';
import { applyFireRateMod, clearFireRateMod } from '../systems/fireRateMods.js';
import { STORY_PANELS }    from '../data/story.js';
import { starsDisplay }    from '../utils/display.js';
import { soldierSource, heroAbilitySource } from '../data/sourceBuilders.js';
import { AreaEffectsManager } from '../systems/AreaEffectsManager.js';
import { describeMatchups, TIER4_OVERRIDES } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { InspectController } from './InspectController.js';
import { SentryTurret } from '../entities/SentryTurret.js';
import { renderPath } from '../systems/PathRenderer.js';
import { renderPlatforms } from '../systems/PlatformRenderer.js';
import { AmbientBackgroundLayer } from '../systems/AmbientBackgroundLayer.js';
import { computeBlockerPlacements } from '../systems/BlockerPlacement.js';
import { BLOCKER_TYPES } from '../data/blockerTypes.js';

const PROJ_COLORS        = { archer: 0xcd853f, mage: 0xdd00ff, cannon: 0x888888, ice: 0x00eeff };
const ENEMY_MELEE_DAMAGE = 20;
const MELEE_RANGE        = 30;

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.mapId  = data?.mapId  ?? 0;
    this.heroId = data?.heroId ?? 'rael';
  }

  create() {
    this.events.on('shutdown', this.shutdown, this);

    // Phase 8 — Audio & Polish systems
    const am = this.game.registry.get('audio');
    if (am) am.playMusic(this.mapId ?? 0);

    this.damageNumbers    = new DamageNumberOverlay(this);
    this.shakeCtl         = new ShakeController(this);
    this.particleSpawner  = new ParticleSpawner(this);
    this._enemiesOnPath   = 0;
    this._bossMusicTriggered = false;

    const map = MAPS[this.mapId];
    const { width, height } = this.scale;

    // Systems
    this.saveMgr     = new SaveManager();
    this.upgradeMgr  = new UpgradeManager(this.saveMgr);
    const mods       = this.upgradeMgr.getModifiers(this.heroId);
    this.killGoldMult = mods.killGoldMult;
    this.rewardMult = map.rewardMult ?? 1;

    this.pathMgr  = new PathManager(map.waypoints, map.towerSlots, width, height);
    this.economy  = new EconomyManager(
      map.startGold  + mods.startGoldBonus,
      map.startLives + mods.startLivesBonus,
      this.events,
    );
    this.waveMgr  = new WaveManager(MAP_WAVES[this.mapId] ?? MAP_WAVES[0], this.events);
    this.storyMgr = new StoryManager(STORY_PANELS);
    this.placementManager = new TowerPlacementManager(
      this.pathMgr.buildZones,
      this.economy,
      (type, scene, opts) => type === 'barracks'
        ? new Barracks(scene, opts)
        : new Tower(scene, opts),
      mods,
    );

    // Hero
    const heroSpawn               = this.pathMgr.path[0];
    this.hero                     = new Hero(
      this,
      {
        x:          heroSpawn.x,
        y:          heroSpawn.y,
        heroId:     this.heroId,
        pathPoints: this.pathMgr.getPathPoints(),
      },
      mods,
    );
    this.aimMode                  = false;
    this._heroOverchargeWasActive = false;
    this._heroCooldownAccum       = 0;

    // Entity arrays
    this.enemies     = [];
    this._sentries   = [];
    this._areaEffects = new AreaEffectsManager(this);
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

    // Solid-color fallback (visible if the bitmap PNG isn't present)
    this.cameras.main.setBackgroundColor(map.background);

    // Bitmap backdrop (depth 0) — Phaser logs 404 if PNG missing; game still runs.
    const bgKey = `bg_map_${map.id}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(width / 2, height / 2, bgKey)
        .setDisplaySize(width, height)
        .setDepth(0);
    }

    // Static layers (depth 10) — blockers → platforms → path. Painted once.
    this._staticLayers = this.add.graphics().setDepth(10);
    this._renderStaticLayers(map);

    // Ambient motion layer (depth 5) — between the bitmap and the static
    // layers, so it reads as deep environment and never overlaps gameplay.
    this._ambient = map.ambientFx ? new AmbientBackgroundLayer(this, map.ambientFx) : null;

    // Per-frame graphics (depth 30) — cleared + redrawn every frame; sits on
    // top of the static layer so hover indicators stay visible.
    this.gfx = this.add.graphics().setDepth(30);

    // Static IN/OUT text labels
    const p = this.pathMgr.path;
    this.add.text(p[0].x, p[0].y, 'IN',  { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
    this.add.text(p[p.length-1].x, p[p.length-1].y, 'OUT', { fontSize: '10px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);

    this.inspector = new InspectController(this);
    this.input.on('pointermove', (p) => this.inspector.onPointerMove(p.worldX, p.worldY));

    // Phaser input
    this.input.on('pointerdown', this._onPointerDown, this);

    // Scene events from systems
    this.events.on('enemy:spawn',    this._spawnEnemy,  this);
    this.events.on('economy:update', this._updateHUD,   this);
    this.events.on('game:defeat',    this._onDefeat,    this);

    this._userPaused = false;

    // Show DOM UI
    document.getElementById('hud').style.display        = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';
    document.getElementById('game-msg').style.display   = 'none';
    // Clear .disabled left over from a previous game-over (shutdown clones the
    // node but cloneNode preserves classes — without this, a second play in
    // the same tab opens with Exit + Pause permanently dead).
    document.getElementById('exit-btn').classList.remove('disabled');
    document.getElementById('pause-btn').classList.remove('disabled');

    // Wire DOM buttons (use once-registered named functions; shutdown() cleans up via clone)
    this._bindDOMEvents();
    this._updateHUD();
    this._updateWaveButton();

    // Relay hero scene events to game bus for UIScene
    this.events.on('hero:level-up', ({ level }) => {
      this.game.events.emit('hero:level-up', { level });
    }, this);

    // Launch UIScene now that GameScene state is ready. UIScene.create reads
    // the active GameScene's hero.def + economy on first paint.
    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene');

    // Initialise HUD portrait/colors/ability icons for the active hero
    this.game.events.emit('hero:hud-init', { heroId: this.heroId, def: this.hero.def });

    // Unlock abilities for the hero's starting level (200ms gives HUD time to process hud-init)
    this.time.delayedCall(200, () => {
      this.game.events.emit('hero:level-up', { level: this.hero.level });
    });

    // Wire ability dispatch
    this.game.events.on('ui:ability', this._onAbility, this);
    this.game.events.on('ui:pause-toggle', this._onPauseToggle, this);

    if (import.meta.env.DEV) window.__game = this;
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
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
    document.getElementById('exit-btn').addEventListener('click', () => this._showConfirmExit());
    document.getElementById('msg-cancel-btn').addEventListener('click', () => {
      document.getElementById('game-msg').style.display = 'none';
      if (!this._userPaused) this.scene.resume();
    });
    document.getElementById('pause-btn').addEventListener('click', () => this._onPauseToggle());
  }

  _showConfirmExit() {
    if (this.over || this.won) return;
    this.scene.pause();
    document.getElementById('msg-title').textContent        = 'Abandon level?';
    document.getElementById('msg-body').textContent         = 'Progress on this level will be lost.';
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';
    document.getElementById('game-msg').style.display       = 'block';
  }

  _onPauseToggle() {
    if (this.over || this.won) return;
    this._userPaused = !this._userPaused;
    const btn     = document.getElementById('pause-btn');
    const overlay = document.getElementById('paused-overlay');
    if (this._userPaused) {
      this.scene.pause();
      overlay.classList.add('shown');
      btn.textContent = '▶ Resume';
    } else {
      this.scene.resume();
      overlay.classList.remove('shown');
      btn.textContent = '⏸ Pause';
    }
  }

  shutdown() {
    this.inspector?.destroy();
    if (import.meta.env.DEV) window.__game = null;
    this.game.events.off('ui:ability', this._onAbility, this);
    this.game.events.off('ui:pause-toggle', this._onPauseToggle, this);
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','pause-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','msg-cancel-btn','exit-btn','panel-reposition-btn','story-dismiss'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display          = 'none';
    document.getElementById('bottom-bar').style.display   = 'none';
    document.getElementById('tower-panel').style.display  = 'none';
    document.getElementById('game-msg').style.display     = 'none';
    document.getElementById('paused-overlay').classList.remove('shown');
    const am = this.game.registry.get('audio');
    if (am) am.stopMusic(500);
    if (this.damageNumbers) this.damageNumbers.destroy();
    if (this.shakeCtl)      this.shakeCtl.destroy();
    for (const s of this._sentries) s.destroy();
    this._sentries = [];
    if (this._areaEffects) this._areaEffects.destroyAll();
    this._staticLayers?.destroy();
    this._staticLayers = null;
    this._ambient?.destroy();
    this._ambient = null;
  }

  // ─── Update loop ───────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.over || this.won) return;
    const dt    = (delta / 1000) * this.speed;
    const dtMs  = delta * this.speed;
    this._ambient?.update(dtMs);

    this.waveMgr.update(dtMs);
    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._updateSoldiers(dt);
    this._updateHero(dt);
    this._updateSentries(dt);
    this._areaEffects.update(dt, this.enemies);
    this._updateParticles(dt);
    this._checkWaveComplete();
    this.inspector?.refresh();

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
    if (this.waveMgr.isEarlyEligible) {
      const bonus = this._computeEarlyBonus();
      if (bonus > 0) {
        this.economy.earn(bonus);
        this._toast(`+${bonus}g`);
      }
    } else if (this.waveMgr.active) {
      return;
    }

    const am = this.game.registry.get('audio');
    if (am) am.playSfx('wave-start');
    this.waveMgr.startWave();
    this._updateWaveButton();
  }

  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy(this, { def, scaleFactor, startX: start.x, startY: start.y }));

    this._enemiesOnPath++;
    if (this._enemiesOnPath === 1) {
      const am = this.game.registry.get('audio');
      if (am) am.setCombatActive(true);
    }

    if (!this._bossMusicTriggered && def.type === 'titan'
        && (this.mapId === 4 || this.mapId === 9)) {
      const am = this.game.registry.get('audio');
      const theme = this.mapId === 4 ? 'boss-mid' : 'boss-final';
      if (am) am.playMusic(theme);
      this._bossMusicTriggered = true;
    }
  }

  _checkWaveComplete() {
    if (!this.waveMgr.active) return;
    if (this.waveMgr.hasQueuedEnemies || this.enemies.length > 0) return;
    this.waveMgr.active = false;
    this.economy.earn(38);
    if (this.waveMgr.done) {
      this._onVictory();
    } else {
      const map   = MAPS[this.mapId];
      const panel = this.storyMgr.getPanelForWave(map.storyKey, this.waveMgr.currentWave);
      if (panel) {
        this.storyMgr.showBanner(panel, () => this._updateWaveButton());
      } else {
        this._updateWaveButton();
      }
    }
  }

  // ─── Enemies ───────────────────────────────────────────────────────────────

  _updateEnemies(dt) {
    const path = this.pathMgr.path;
    for (const enemy of this.enemies) {
      enemy.update(dt);
      if (enemy.statusEffects.stun.active) continue; // stun is full freeze: skip movement and melee
      const blocker = this._checkSoldierBlock(enemy);
      if (blocker) {
        blocker.takeDamage(ENEMY_MELEE_DAMAGE * dt);
        if (blocker.attackTimer <= 0) {
          this._dealDamage(enemy, blocker.damage, false, { source: soldierSource(blocker) });
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
        const am = this.game.registry.get('audio');
        if (am) am.playSfx('life-lost');
        this.economy.loseLife();
      }
    }
    const dying = this.enemies.filter(e => e.dead);
    this.enemies = this.enemies.filter(e => !e.dead);
    const removed = dying.length;
    for (const enemy of dying) this._fadeOutDeadEnemy(enemy);
    if (removed > 0) {
      this._enemiesOnPath = Math.max(0, this._enemiesOnPath - removed);
      if (this._enemiesOnPath === 0) {
        const am = this.game.registry.get('audio');
        if (am) am.setCombatActive(false);
      }
      this._updateWaveButton();
    }
  }

  _fadeOutDeadEnemy(enemy) {
    this.tweens.add({
      targets: enemy,
      alpha: 0,
      duration: 300,
      onComplete: () => enemy.destroy(),
    });
  }

  _destroyDeadProjectile(p) {
    if (p.destroyTrail) p.destroyTrail();
    p.destroy();
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

  _updateHero(dt) {
    const aliveBeforeHero = this.enemies.filter(e => !e.dead);
    this.hero.update(dt, this.enemies);
    for (const e of aliveBeforeHero) {
      if (e.dead) {
        this.economy.earn(this._killReward(e.reward));
        this.kills++;
        this._updateHUD();
      }
    }

    // Detect overcharge flip
    if (this.hero.overchargeActive !== this._heroOverchargeWasActive) {
      this._heroOverchargeWasActive = this.hero.overchargeActive;
      this._applyOvercharge(this.hero.overchargeActive);
    }

    // Emit HP/level for UIScene
    this.game.events.emit('hero:update', {
      hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
    });

    // Cooldown tick (once per second)
    this._heroCooldownAccum += dt;
    if (this._heroCooldownAccum >= 1) {
      this._heroCooldownAccum -= 1;
      this.game.events.emit('hero:cooldown-tick', {
        q: Math.ceil(this.hero._timers.q),
        w: Math.ceil(this.hero._timers.w),
        e: Math.ceil(this.hero._timers.e),
      });
    }
  }

  _onAbility({ slot }) {
    const a = this.hero.def.abilities[slot];
    if (!a) return;

    if (a.aim) {
      if (this.hero.dead) return;
      if (this.hero._timers[slot] > 0) return;
      if (this.hero.level < this.hero.def.stats.abilityUnlockLevels[slot]) return;
      this.aimMode  = true;
      this._aimSlot = slot;
      this.game.events.emit('hero:aim-mode');
      return;
    }

    const result = this.hero.fireAbility(slot);
    if (!result) return;
    this._applyAbilityResult(slot, result);
  }

  _applyAbilityResult(slot, result) {
    switch (result.kind) {
      case 'overcharge':
        // SFX + tower buff handled reactively in _updateHero → _applyOvercharge
        break;
      case 'emp': {
        const am = this.game?.registry?.get('audio');
        if (am) am.playSfx('hero-emp');
        for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
        const EMP_RADIUS = 120;
        if (this.particleSpawner) this.particleSpawner.spawnHeroAbilityVFX('emp', this.hero.x, this.hero.y, EMP_RADIUS);
        this.events.emit('emp-pulse', { x: this.hero.x, y: this.hero.y, radius: EMP_RADIUS });
        break;
      }
      case 'airstrike':       this._handleAirstrike(result);    break;
      case 'deploy_turret':   this._handleDeployTurret(result); break;   // wired in T13
      case 'flame_wave':      this._handleFlameWave(result);    break;   // wired in T15
      case 'immolate':        this._handleImmolate(result);     break;   // wired in T15
      case 'firefield':       this._handleFirefield(result);    break;   // wired in T15
      case 'mark':            this._handleMark(result);         break;   // wired in T14
      case 'volley':          this._handleVolley(result);       break;   // wired in T14
      case 'phase_sprint':    this._handlePhaseSprint(result);  break;   // wired in T14
      case 'repair':          this._handleRepair(result);       break;   // wired in T13
      case 'power_surge':     this._handlePowerSurge(result);   break;   // wired in T13
      // unknown kind — no-op
    }
  }

  _triggerAimAbility(x, y) {
    if (!this._aimSlot) { this.aimMode = false; return; }
    const slot   = this._aimSlot;
    const result = this.hero.fireAbility(slot, { x, y });
    this._aimSlot = null;
    this.aimMode  = false;
    this.game.events.emit('hero:aim-cancel');
    if (!result) return;
    this._applyAbilityResult(slot, result);
  }

  _handleAirstrike(result) {
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-airstrike');
    if (this.particleSpawner) this.particleSpawner.spawnHeroAbilityVFX('airstrike', result.x, result.y, result.radius);
    this.events.emit('airstrike-impact', { x: result.x, y: result.y });
    for (const e of this.enemies) {
      if (Math.hypot(e.x - result.x, e.y - result.y) <= result.radius) {
        this._dealDamage(e, result.damage, true, { isAoe: true, abilityLabel: 'AIRSTRIKE', source: heroAbilitySource('rael', 'airstrike') });
      }
    }
    // Particle burst at impact point (kept as in-game additional flair)
    this._addParticle(result.x, result.y, 0xff6400, 18);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this._addParticle(
        result.x + Math.cos(angle) * 28,
        result.y + Math.sin(angle) * 28,
        0xff8800,
        8
      );
    }
  }

  _updateSentries(dt) {
    this._sentries = this._sentries.filter(s => s.update(dt, this.enemies));
  }

  _handleDeployTurret(result) {
    for (const s of this._sentries) s.destroy();
    this._sentries = [new SentryTurret(this, { x: result.x, y: result.y, ownerHeroId: this.hero.heroId })];
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-overcharge');
  }

  _handleRepair(result) {
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + result.healHero);
    this.hero._redrawHpBar();
    for (const tower of this.placementManager.getTowers()) {
      if (tower.type !== 'barracks') continue;
      for (const soldier of tower.soldiers) {
        if (soldier.dead) continue;
        if (Math.hypot(soldier.x - this.hero.x, soldier.y - this.hero.y) <= result.soldierRadius) {
          soldier.heal();
        }
      }
    }
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }

  _handlePowerSurge(result) {
    const affected = [];
    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - result.x, tower.y - result.y) <= result.radius) {
        applyFireRateMod(tower, 'powerSurge', result.fireRateMult);
        affected.push(tower);
      }
    }
    this.time.delayedCall(result.duration * 1000, () => {
      for (const t of affected) clearFireRateMod(t, 'powerSurge');
    });
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-overcharge');
  }
  _handleMark(result) {
    if (result.target && !result.target.dead) {
      result.target.applyStatus({ type:'vulnerable', duration: result.duration, multiplier: result.multiplier });
    }
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-attack');
  }

  _handleVolley(result) {
    let hits = 0;
    const g = this.add.graphics().setDepth(5);
    g.lineStyle(2, 0x3fb950, 1);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (hits >= result.maxTargets) break;
      if (Math.hypot(e.x - result.x, e.y - result.y) <= result.range) {
        if (typeof g.lineBetween === 'function') {
          g.lineBetween(result.x, result.y, e.x, e.y);
        }
        this._dealDamage(e, result.damage, false);
        hits++;
      }
    }
    this.time.delayedCall(250, () => g.destroy());
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-attack');
  }

  _handlePhaseSprint(result) {
    this.hero.cloaked         = true;
    this.hero._cloakTimer     = result.cloakDuration;
    this.hero._moveSpeedMult  = result.speedMult;
    const am = this.game?.registry?.get('audio');
    if (am) am.playSfx('hero-overcharge');
  }
  _handleFlameWave(result) {
    const facingAngle = result.facingX >= 0 ? 0 : Math.PI;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - result.x, dy = e.y - result.y;
      const dist = Math.hypot(dx, dy);
      if (dist > result.length) continue;
      const angleToEnemy = Math.atan2(dy, dx);
      let diff = Math.abs(angleToEnemy - facingAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff <= result.halfAngle) {
        this._dealDamage(e, result.damage, false);
        e.applyStatus({ type:'burn', duration: result.burn.duration, dps: result.burn.dps });
      }
    }
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0xff6600, 0.4);
    g.beginPath();
    g.moveTo(result.x, result.y);
    const dir = result.facingX >= 0 ? 1 : -1;
    g.lineTo(result.x + result.length * dir * Math.cos(result.halfAngle), result.y - result.length * Math.sin(result.halfAngle));
    g.lineTo(result.x + result.length * dir * Math.cos(result.halfAngle), result.y + result.length * Math.sin(result.halfAngle));
    g.closePath();
    g.fillPath();
    this.time.delayedCall(250, () => g.destroy());
  }

  _handleImmolate(result) {
    this.hero._attackDamageMult = result.attackDamageMult;
    if (this.hero._attackDmgRevertEvt) {
      this.hero._attackDmgRevertEvt.remove(false);
    }
    this._areaEffects.add({
      followsTarget: this.hero,
      radius: result.radius, duration: result.duration, dps: result.dps,
      sourceTag: heroAbilitySource(this.hero.heroId, 'immolate'),
      drawFn: (g) => {
        g.clear();
        g.lineStyle(2, 0xff6600, 0.6);
        g.strokeCircle(0, 0, result.radius);
      },
    });
    this.hero._attackDmgRevertEvt = this.time.delayedCall(result.duration * 1000, () => {
      this.hero._attackDamageMult = 1.0;
      this.hero._attackDmgRevertEvt = null;
    });
  }

  _handleFirefield(result) {
    this._areaEffects.add({
      x: result.x, y: result.y,
      radius: result.radius, duration: result.duration, dps: result.dps,
      slowFactor: result.slowFactor,
      sourceTag: heroAbilitySource(this.hero.heroId, 'firefield'),
      drawFn: (g) => {
        g.clear();
        g.fillStyle(0xff4400, 0.25);
        g.fillCircle(0, 0, result.radius);
        g.lineStyle(2, 0xff6600, 0.5);
        g.strokeCircle(0, 0, result.radius);
      },
    });
  }

  _triggerAirstrike(x, y) { this._triggerAimAbility(x, y); }

  _applyOvercharge(active) {
    if (active) {
      const am = this.game.registry.get('audio');
      if (am) am.playSfx('hero-overcharge');
    }
    for (const tower of this.placementManager.getTowers()) {
      if (!tower.fireRate) continue;
      if (active) {
        applyFireRateMod(tower, 'overcharge', 1.5);
        if (this.particleSpawner) this.particleSpawner.spawnHeroAbilityVFX('overcharge', tower.x, tower.y, 0);
      } else {
        clearFireRateMod(tower, 'overcharge');
      }
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
        const am = this.game.registry.get('audio');
        if (am) am.playSfx(`tower-fire-${tower.type}`);
        if (this.particleSpawner) this.particleSpawner.spawnMuzzleFlash(tower.x, tower.y, tower.type);
        this.projectiles.push(new Projectile(this, {
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
          towerType: tower.type,
          tier: tower.level, branch: tower.branch,
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
    for (const p of this.projectiles) {
      if (p.dead) this._destroyDeadProjectile(p);
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  _onProjectileHit(proj) {
    const source = { kind: 'tower', type: proj.towerType, tier: proj.tier, branch: proj.branch };
    if (proj.splashRadius > 0) {
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - proj.targetX, enemy.y - proj.targetY) <= proj.splashRadius) {
          this._dealDamage(enemy, proj.damage, proj.pierce, { source, isAoe: true });
        }
      }
      this._addParticle(proj.targetX, proj.targetY, 0xff8800, 14);
    } else if (proj.target && !proj.target.dead) {
      this._dealDamage(proj.target, proj.damage, proj.pierce, { source });
      if (proj.slowFactor > 0) proj.target.applyStatus({ type: 'slow', duration: 2, factor: proj.slowFactor });
      this._addParticle(proj.targetX, proj.targetY, proj.color, 7);
    }
  }

  _dealDamage(enemy, damage, pierce, opts = {}) {
    enemy.takeDamage(damage, { pierce, ...opts });
    if (enemy.dead) {
      this.economy.earn(this._killReward(enemy.reward));
      this.kills++;
      this._updateHUD();
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

    // 1. Aim mode takes priority
    if (this.aimMode) {
      this._triggerAimAbility(mx, my);
      return;
    }

    // 2. Barracks reposition mode
    if (this.repositionMode && this.repositioningBarracks) {
      const barracks = this.repositioningBarracks;
      // Use getNearestSlot (added in Task 11) with requireFree=true and a
      // 60px reposition snap range (looser than the 22px placement radius
      // because the player is dragging, not single-clicking a target).
      const slot = this.placementManager.getNearestSlot(mx, my, 60, true);
      if (!slot) {
        // No valid target — cancel reposition silently
        this.repositionMode = false;
        this.repositioningBarracks = null;
        return;
      }
      // Free the old slot, occupy the new one, move barracks.
      const zones = this.placementManager.getZones();
      zones[barracks.zoneIndex].occupied = false;
      zones[slot.slotIndex].occupied = true;
      barracks.zoneIndex = slot.slotIndex;
      barracks.setPosition(slot.x, slot.y);
      this.repositionMode = false;
      this.repositioningBarracks = null;
      return;
    }

    // 3. Tower click
    for (const tower of this.placementManager.getTowers()) {
      if (Math.hypot(tower.x - mx, tower.y - my) < 22) {
        this.selectedType = null;
        this._deselectButtons();
        this._openTowerPanel(tower, mx, my);
        return;
      }
    }
    // No tower hit — dismiss any open panel before continuing
    this._closeTowerPanel();

    // 4. Inspect click (enemy or hero)
    if (this.inspector?.tryClickInspect(mx, my)) return;

    // 5. Tower placement — snap to the nearest free slot within disc radius
    if (this.selectedType) {
      const slot = this.placementManager.getNearestSlot(mx, my, 22, true);
      if (slot) {
        const tower = this.placementManager.placeTower(slot.slotIndex, this.selectedType, this);
        if (!tower) { this._toast('Not enough gold!'); return; }
        if (this.selectedType === 'barracks') {
          tower.soldierPathProgress = this.pathMgr.getNearestPathProgress(slot.x, slot.y);
          tower.spawnSoldiers(this, this.pathMgr.getPathPoints());
        }
      }
      return;
    }

    // 6. Move hero (path-constrained)
    if (!this.hero.dead) {
      if (this.pathMgr.isOnPath(mx, my, 40)) {
        const progress = this.pathMgr.getNearestPathProgress(mx, my);
        this.hero.moveToProgress(progress);
      } else {
        this._toast('Hero can only move along the path');
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

    // Phase 9b: Matchup line — uses safe DOM construction (no innerHTML)
    const matchupsEl = document.getElementById('panel-matchups');
    matchupsEl.replaceChildren();
    const m = describeMatchups({ kind: 'tower', type: tower.type, tier: tower.level, branch: tower.branch });
    const renderEnemyNames = (types) =>
      types.map(t => (ENEMY_DEFS[t]?.name ?? t).replace(/^Veth\s+/, '')).join(', ');
    if (m.effective.length) {
      const line = document.createElement('span');
      line.className = 'mu-good';
      line.textContent = `Effective vs: ${renderEnemyNames(m.effective)}`;
      matchupsEl.appendChild(line);
    }
    if (m.weak.length) {
      const line = document.createElement('span');
      line.className = 'mu-bad';
      line.textContent = `Weak vs: ${renderEnemyNames(m.weak)}`;
      matchupsEl.appendChild(line);
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
    const towerType = Object.keys(TOWER_DEFS).find(k => TOWER_DEFS[k] === def);
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

      card.append(label, effect);

      const headline = headlineOverride(towerType, branch);
      if (headline) {
        const matchup = document.createElement('div');
        matchup.className = 'branch-matchup';
        matchup.textContent = `⚡ ${headline.value}× vs ${headline.name}`;
        card.appendChild(matchup);
      }

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

      card.append(cost, btn);
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
    if (tower.type === 'barracks') {
      tower._rebuildSoldiers(this, this.pathMgr.getPathPoints());
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
      return;
    }
    if (this.waveMgr.active && this.waveMgr.isEarlyEligible) {
      const bonus = this._computeEarlyBonus();
      btn.disabled = false;
      btn.textContent = bonus > 0
        ? `▶ Send Wave ${this.waveMgr.currentWave + 1} (+${bonus}g)`
        : `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
      return;
    }
    if (this.waveMgr.active) {
      btn.disabled = true; btn.textContent = `Wave ${this.waveMgr.currentWave} in progress...`;
      return;
    }
    btn.disabled = false; btn.textContent = `▶ Send Wave ${this.waveMgr.currentWave + 1}`;
  }

  _killReward(reward) {
    return Math.round(reward * this.killGoldMult * this.rewardMult);
  }

  _computeEarlyBonus() {
    let sum = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      sum += (e.def && typeof e.def.reward === 'number') ? e.def.reward : 0;
    }
    return Math.floor(0.5 * sum);
  }

  // ─── Game end ──────────────────────────────────────────────────────────────

  _onVictory() {
    if (this.won) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('victory');
    this.won = true;
    this._commitStats(true);
    const map   = MAPS[this.mapId];
    const pct   = this.economy.lives / map.startLives;
    const stars = pct >= 0.8 ? 3 : pct >= 0.5 ? 2 : 1;
    this.saveMgr.setStars(this.mapId, stars);
    const panel = this.storyMgr.getUnlockPanel(map.storyKey);
    if (panel) {
      this.storyMgr.showBanner(panel, () => this._showVictoryOverlay(stars));
    } else {
      this._showVictoryOverlay(stars);
    }
  }

  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('exit-btn').classList.add('disabled');
    document.getElementById('pause-btn').classList.add('disabled');
    document.getElementById('game-msg').style.display = 'block';
  }

  _onDefeat() {
    if (this.over) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('exit-btn').classList.add('disabled');
    document.getElementById('pause-btn').classList.add('disabled');
    document.getElementById('game-msg').style.display = 'block';
  }

  _commitStats(isVictory) {
    const s = this.saveMgr.getStats();
    this.saveMgr.setStats({
      kills:       s.kills + this.kills,
      gamesPlayed: s.gamesPlayed + 1,
      victories:   s.victories + (isVictory ? 1 : 0),
      defeats:     s.defeats + (isVictory ? 0 : 1),
      bestWave:    Math.max(s.bestWave, this.waveMgr.currentWave),
    });
  }

  _toast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#f39c12;padding:6px 16px;border-radius:6px;font-size:13px;z-index:30;pointer-events:none;';
    el.textContent = msg;
    document.getElementById('game').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _renderStaticLayers(map) {
    const g = this._staticLayers;
    g.clear();

    // Spec §4 depth order within the static layer (draw order = visual stacking):
    // blockers (bottom) → platforms → path (top).

    // Blockers key off path BENDS and renderPath samples the curve internally,
    // so both take the raw waypoints. (Enemy movement uses the dense pathMgr.path.)
    // Blockers at every interior waypoint
    const placements = computeBlockerPlacements(this.pathMgr.waypoints, map.blockerVocab, map.blockerSeed);
    for (const p of placements) {
      const type = BLOCKER_TYPES[p.type];
      if (!type) continue;
      const tint = type.defaultTint(map.id);
      type.draw(g, p.x, p.y, p.scale, tint);
    }

    // Explicit per-map blockers at fixed normalized positions — pinch-point
    // mounds that channel the single path on open terrain. Same vocab as the
    // auto-placements, but hand-authored coords ({ type, x, y, scale? }).
    const { width, height } = this.scale;
    for (const b of map.blockers ?? []) {
      const type = BLOCKER_TYPES[b.type];
      if (!type) continue;
      type.draw(g, b.x * width, b.y * height, b.scale ?? 1, type.defaultTint(map.id));
    }

    // Platforms
    renderPlatforms(g, this.pathMgr.buildZones, map.id);

    // Path on top so it sits above platforms/blockers per spec §4.
    renderPath(g, this.pathMgr.waypoints, map.pathRenderStyle);
  }

  _drawPath() {
    // Path itself is now drawn by PathRenderer in _renderStaticLayers.
    // This method only draws the per-frame IN/OUT colored dots (under the
    // static text labels) on top of the static layer.
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

function headlineOverride(towerType, branch) {
  const cells = TIER4_OVERRIDES[towerType]?.[branch];
  if (!cells || Object.keys(cells).length === 0) return null;
  let bestEnemy = null;
  let bestVal = -Infinity;
  for (const enemy of Object.keys(cells).sort()) { // alphabetical tiebreak
    const v = cells[enemy];
    if (v > bestVal) { bestVal = v; bestEnemy = enemy; }
  }
  const niceName = (ENEMY_DEFS[bestEnemy]?.name ?? bestEnemy).replace(/^Veth\s+/, '');
  return { enemy: bestEnemy, value: bestVal, name: niceName };
}
