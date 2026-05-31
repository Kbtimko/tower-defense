import { describeEnemyMatchups } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HEROES } from '../data/heroes.js';

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

  onPointerMove(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) { this._showPeek('enemy', enemy, mx, my); return; }
    if (this._hitTestHero(mx, my)) { this._showPeek('hero', this.scene.hero, mx, my); return; }
    this._hidePeek();
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
    this._hidePeek();
    this._showPanel(spec.kind);
    if (spec.kind === 'enemy') this._renderEnemyPanel(spec.target);
    else                       this._renderHeroPanel(spec.target);
    this._positionPanelForTarget(spec);
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
    const displayName = (t) => {
      if (typeof t === 'string' && t.startsWith('hero:')) {
        const id = t.slice(5);
        return HEROES[id]?.shortName ?? id;
      }
      return TOWER_DEFS[t]?.name ?? t;
    };
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

    document.getElementById('hi-level').textContent = `Level: ${hero.level} / ${hero.def.stats.maxLevel} · Kills: ${hero.killCount}`;
    document.getElementById('hi-attack').textContent = `Attack: ${hero.def.stats.attackDamage} dmg @ ${hero.def.stats.attackRange} range`;

    this._renderHeroAbilities(hero);
    this._renderHeroMatchups(hero);
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

    const timerField = { q: 'overchargeTimer', w: 'airstrikeTimer', e: 'empTimer' };
    const abilities = Object.entries(hero.def.abilities).map(([slot, ab]) => ({
      slot,
      label: `${slot.toUpperCase()} ${ab.label}`,
      timer: hero[timerField[slot]] ?? 0,
      unlockLvl: hero.def.stats.abilityUnlockLevels[slot],
    }));

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

  _renderHeroMatchups(hero) {
    const el = document.getElementById('hi-matchups');
    el.replaceChildren();
    for (const [enemyType, mult] of Object.entries(hero.def.matchups)) {
      if (mult === 1.0) continue;
      const line = document.createElement('span');
      line.className = mult >= 1 ? 'mu-good' : 'mu-bad';
      const enemyName = (ENEMY_DEFS[enemyType]?.name ?? enemyType).replace(/^Veth\s+/, '');
      line.textContent = `${mult}× vs ${enemyName}`;
      el.appendChild(line);
    }
  }

  _showPeek(kind, target, mx, my) {
    this.peekTarget = target;
    const peek = document.getElementById('inspect-peek');
    peek.replaceChildren();
    const header = document.createElement('strong');
    if (kind === 'enemy') {
      header.textContent = target.def.name;
      peek.appendChild(header);

      const stat = document.createElement('div');
      stat.textContent = `HP ${Math.ceil(target.hp)} / ${target.maxHp} · Armor ${target.def.armor}`;
      peek.appendChild(stat);

      const { vulnerableTo, resists } = describeEnemyMatchups(target.def.type);
      const displayName = (t) => {
        if (typeof t === 'string' && t.startsWith('hero:')) {
          const id = t.slice(5);
          return HEROES[id]?.shortName ?? id;
        }
        return TOWER_DEFS[t]?.name ?? t;
      };
      if (vulnerableTo.length) {
        const v = document.createElement('div');
        v.textContent = `Weak: ${displayName(vulnerableTo[0])}`;
        peek.appendChild(v);
      }
      if (resists.length) {
        const r = document.createElement('div');
        r.textContent = `Resist: ${displayName(resists[0])}`;
        peek.appendChild(r);
      }
    } else {
      header.textContent = `🛡️ ${target.def.displayName}`;
      peek.appendChild(header);
      const stat = document.createElement('div');
      stat.textContent = `HP ${Math.ceil(target.hp)} / ${target.maxHp} · Level ${target.level}`;
      peek.appendChild(stat);
    }
    this._positionPanel(peek, mx, my);
    peek.style.display = 'block';
  }

  _hidePeek() {
    this.peekTarget = null;
    document.getElementById('inspect-peek').style.display = 'none';
  }

  _positionPanel(el, targetX, targetY) {
    let left = targetX + 24;
    let top  = Math.max(0, targetY - 60);

    const vw = (typeof window !== 'undefined' && window.innerWidth)  ? window.innerWidth  : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    const w = el.offsetWidth  || 220;
    const h = el.offsetHeight || 100;

    if (left + w > vw) left = Math.max(0, targetX - w - 24);
    if (top + h > vh)  top  = Math.max(0, vh - h - 8);

    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
  }

  _positionPanelForTarget(spec) {
    const el = spec.kind === 'enemy'
      ? document.getElementById('enemy-inspector')
      : document.getElementById('hero-inspector');
    this._positionPanel(el, spec.target.x, spec.target.y);
  }
}
