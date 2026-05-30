import { describeEnemyMatchups, HERO_MULTIPLIERS } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_STATS } from '../entities/Hero.js';

export class InspectController {
  constructor(scene) {
    this.scene = scene;
    this.pinned = null;       // { kind: 'enemy'|'hero', target } | null
    this.peekTarget = null;

    document.getElementById('ei-close').addEventListener('click', () => this.dismiss());
    document.getElementById('hi-close').addEventListener('click', () => this.dismiss());

    this._onKeyDown = (e) => { if (e.key === 'Escape') this.dismiss(); };
    window.addEventListener('keydown', this._onKeyDown);
  }

  // Called by GameScene._onPointerDown. Returns true if click was consumed.
  tryClickInspect(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) { this.pin({ kind: 'enemy', target: enemy }); return true; }
    if (this._hitTestHero(mx, my)) {
      this.pin({ kind: 'hero', target: this.scene.hero });
      return true;
    }
    return false;
  }

  // Hover handler — STUB; populated in Task 7.
  onPointerMove(_mx, _my) {
    // Task 7 will implement peek display.
  }

  refresh() {
    if (!this.pinned) return;
    if (this.pinned.kind === 'enemy') {
      const e = this.pinned.target;
      if (e.dead || !this.scene.enemies.includes(e)) {
        this.dismiss();
        return;
      }
      this._renderEnemyPanel(e);
    } else if (this.pinned.kind === 'hero') {
      this._renderHeroPanel(this.pinned.target);
    }
  }

  pin(spec) {
    if (this.pinned && this.pinned.target === spec.target) {
      this.dismiss();
      return;
    }
    this.pinned = spec;
    this._showPanel(spec.kind);
    if (spec.kind === 'enemy') this._renderEnemyPanel(spec.target);
    else                       this._renderHeroPanel(spec.target);
  }

  dismiss() {
    this.pinned = null;
    document.getElementById('enemy-inspector').style.display = 'none';
    document.getElementById('hero-inspector').style.display = 'none';
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _hitTestEnemy(mx, my) {
    for (const e of this.scene.enemies) {
      if (e.dead) continue;
      const r = (e.def?.radius ?? 0) + 4;
      if (Math.hypot(e.x - mx, e.y - my) <= r) return e;
    }
    return null;
  }

  _hitTestHero(mx, my) {
    const h = this.scene.hero;
    if (!h || h.dead) return false;
    return Math.hypot(h.x - mx, h.y - my) <= 18;
  }

  _showPanel(kind) {
    if (kind === 'enemy') {
      document.getElementById('enemy-inspector').style.display = 'block';
      document.getElementById('hero-inspector').style.display = 'none';
    } else {
      document.getElementById('hero-inspector').style.display = 'block';
      document.getElementById('enemy-inspector').style.display = 'none';
    }
  }

  _renderEnemyPanel(enemy) {
    const def = enemy.def;
    const icon = def.icon ?? '?';
    document.getElementById('ei-name').textContent = `${icon} ${def.name}`;

    const hpfill = document.getElementById('ei-hpfill');
    hpfill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
    document.getElementById('ei-hp-label').textContent = `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;

    document.getElementById('ei-stats').textContent = `Speed: ${def.speed} · Armor: ${def.armor}`;
    document.getElementById('ei-meta').textContent  = `Reward: ${def.reward}g · ${def.flying ? 'Flying' : 'Ground'}`;
    document.getElementById('ei-status').textContent = `Status: ${this._statusText(enemy)}`;

    this._renderEnemyMatchups(def.type);
  }

  _statusText(enemy) {
    const parts = [];
    const slow = enemy.statusEffects?.slow;
    const stun = enemy.statusEffects?.stun;
    if (slow?.active) parts.push(`❄ slowed (${slow.timer.toFixed(1)}s)`);
    if (stun?.active) parts.push(`⚡ stunned (${stun.timer.toFixed(1)}s)`);
    return parts.length ? parts.join(', ') : '—';
  }

  _renderEnemyMatchups(enemyType) {
    const el = document.getElementById('ei-matchups');
    el.replaceChildren();
    const { vulnerableTo, resists } = describeEnemyMatchups(enemyType);
    const displayName = (type) =>
      type === 'hero' ? 'Hero' : (TOWER_DEFS[type]?.name ?? type);
    if (vulnerableTo.length) {
      const line = document.createElement('span');
      line.className = 'mu-good';
      line.textContent = `Vulnerable to: ${vulnerableTo.map(displayName).join(', ')}`;
      el.appendChild(line);
    }
    if (resists.length) {
      const line = document.createElement('span');
      line.className = 'mu-bad';
      line.textContent = `Resists: ${resists.map(displayName).join(', ')}`;
      el.appendChild(line);
    }
  }

  _renderHeroPanel(hero) {
    const hpfill = document.getElementById('hi-hpfill');
    hpfill.style.width = `${Math.max(0, (hero.hp / hero.maxHp) * 100)}%`;
    document.getElementById('hi-hp-label').textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;

    document.getElementById('hi-level').textContent = `Level: ${hero.level} / ${HERO_STATS.maxLevel} · Kills: ${hero.killCount}`;
    document.getElementById('hi-attack').textContent = `Attack: ${HERO_STATS.attackDamage} dmg @ ${HERO_STATS.attackRange} range`;

    this._renderHeroAbilities(hero);
    this._renderHeroMatchups();
  }

  _renderHeroAbilities(hero) {
    const el = document.getElementById('hi-abilities');
    el.replaceChildren();

    if (hero.dead) {
      const respawn = document.createElement('div');
      respawn.className = 'ab-line';
      respawn.textContent = `Respawning ${Math.ceil(hero.respawnTimer)}s`;
      el.appendChild(respawn);
      return;
    }

    const abilities = [
      { slot: 'q', label: 'Q Overcharge', timer: hero.overchargeTimer, unlockLvl: HERO_STATS.abilityUnlockLevels.q },
      { slot: 'w', label: 'W Airstrike',  timer: hero.airstrikeTimer,  unlockLvl: HERO_STATS.abilityUnlockLevels.w },
      { slot: 'e', label: 'E EMP Pulse',  timer: hero.empTimer,        unlockLvl: HERO_STATS.abilityUnlockLevels.e },
    ];

    for (const ab of abilities) {
      const line = document.createElement('div');
      line.className = 'ab-line';
      const name = document.createElement('span');
      name.textContent = ab.label;
      const state = document.createElement('span');
      if (hero.level < ab.unlockLvl) {
        line.classList.add('locked');
        state.textContent = `🔒 (lvl ${ab.unlockLvl})`;
      } else if (ab.timer > 0) {
        state.textContent = `${Math.ceil(ab.timer)}s`;
      } else {
        state.textContent = 'ready';
      }
      line.appendChild(name);
      line.appendChild(state);
      el.appendChild(line);
    }
  }

  _renderHeroMatchups() {
    const el = document.getElementById('hi-matchups');
    el.replaceChildren();
    for (const [enemyType, mult] of Object.entries(HERO_MULTIPLIERS)) {
      if (mult === 1.0) continue;
      const line = document.createElement('span');
      line.className = mult >= 1 ? 'mu-good' : 'mu-bad';
      const enemyName = (ENEMY_DEFS[enemyType]?.name ?? enemyType).replace(/^Veth\s+/, '');
      line.textContent = `${mult}× vs ${enemyName}`;
      el.appendChild(line);
    }
  }
}
