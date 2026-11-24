import { describeEnemyMatchups } from '../data/weaknessMatrix.js';
import { shortEnemyName } from '../systems/entityDescriptors.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HEROES } from '../data/heroes.js';
import { worldToPageCss, clampPanelWithin, placeBeside } from '../systems/viewport.js';
import { mapRectPage } from '../ui/hudLayer.js';
import { PANEL_EDGE_MARGIN, PEEK_GAP_PX, TAP_TOWER_RADIUS } from '../data/input.js';
import { heroAttackDamage } from '../systems/heroLeveling.js';
import { describeTowerDetail } from '../systems/towerDetail.js';
import { appendArmourRows } from '../ui/armourRows.js';

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

  // Side-effect-free: the tap pipeline asks this before deciding to pin.
  inspectableAt(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) return { kind: 'enemy', target: enemy };
    if (this._hitTestHero(mx, my)) return { kind: 'hero', target: this.scene.hero };
    return null;
  }

  // Touch long-press only. Kept out of inspectableAt on purpose: a TAP on a
  // tower must reach the tap pipeline (it opens the ring), so only a held press
  // falls back to inspecting one. Side-effect-free, like inspectableAt.
  longPressTargetAt(mx, my) {
    const tower = this._towers().find(t => Math.hypot(t.x - mx, t.y - my) < TAP_TOWER_RADIUS);
    return tower ? { kind: 'tower', target: tower } : null;
  }

  // Called by GameScene._onTap. Returns true if the tap was consumed — including
  // a same-target dismiss — so it agrees with inspectableAt by construction.
  tryClickInspect(mx, my) {
    const hit = this.inspectableAt(mx, my);
    if (!hit) return false;
    this.pin(hit);
    return true;
  }

  onPointerMove(mx, my) {
    const hit = this.inspectableAt(mx, my);
    if (hit) this._showPeek(hit.kind, hit.target, mx, my);
    else     this.hidePeek();
  }

  // Touch long-press: `hit` was taken at the press, so a target that walked out
  // of its hit radius during the hold is still the one shown — at where it is
  // now. Returns false (no peek) if it died or left the field meanwhile.
  peekHit(hit) {
    const t = hit.target;
    if (hit.kind === 'tower') {
      // Sold during the hold: nothing left to describe.
      if (!this._towers().includes(t)) return false;
      this.peekTower(t, this._towerRectPage(t));
      return true;
    }
    const live = hit.kind === 'enemy'
      ? !t.dead && this.scene.enemies.includes(t)
      : !t.dead;
    if (!live) return false;
    this._showPeek(hit.kind, t, t.x, t.y);
    return true;
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
    this.hidePeek();
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

  _towers() {
    return this.scene.placementManager?.getTowers() ?? [];
  }

  // The tower's tap footprint in page px, so the card clears the sprite.
  _towerRectPage(tower) {
    const a = worldToPageCss(this.scene?.scale, tower.x - TAP_TOWER_RADIUS, tower.y - TAP_TOWER_RADIUS);
    const b = worldToPageCss(this.scene?.scale, tower.x + TAP_TOWER_RADIUS, tower.y + TAP_TOWER_RADIUS);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
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
    this._renderHeroXp(hero);
    // The CURRENT figure, not the level-1 base: levelling scales attack damage,
    // and a panel showing the base would understate a level-5 hero by 80%.
    const attack = Math.round(heroAttackDamage(hero.def.stats, hero.level));
    document.getElementById('hi-attack').textContent = `Attack: ${attack} dmg @ ${hero.def.stats.attackRange} range`;

    this._renderHeroAbilities(hero);
    this._renderHeroMatchups(hero);
  }

  // Progress toward the next level. The HUD has carried this since PR #69, but
  // only as a bare bar under the HP bar; the card is where you go to actually
  // study the hero, and it showed the level with no sense of how close the next
  // one was. Same numbers, spelled out.
  //
  // xpProgress() owns the maths (damage dealt as a fraction of the map's HP
  // budget) — this only formats it, so the card cannot drift from the HUD.
  _renderHeroXp(hero) {
    const fill  = document.getElementById('hi-xpfill');
    const label = document.getElementById('hi-xp-label');
    if (!fill || !label) return;

    const xp = hero.xpProgress?.();
    if (!xp) return;

    fill.style.width = `${(xp.progress * 100).toFixed(1)}%`;

    if (xp.atMax) {
      label.textContent = 'MAX';
    } else if (xp.needed > 0) {
      const n = (v) => Math.round(v).toLocaleString('en-US');
      label.textContent = `${n(xp.current)} / ${n(xp.needed)} to Level ${xp.level + 1}`;
    } else {
      // A map with no wave table has no HP budget to pace against, so there is
      // no denominator to show — an em dash rather than a meaningless "0 / 0".
      label.textContent = '—';
    }
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

    const abilities = Object.entries(hero.def.abilities).map(([slot, ab]) => ({
      slot,
      label: `${slot.toUpperCase()} ${ab.label}`,
      timer: hero._timers?.[slot] ?? 0,
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
      const enemyName = shortEnemyName(enemyType);
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
    const peekCss = worldToPageCss(this.scene?.scale, mx, my);
    this._positionPanel(peek, peekCss.x, peekCss.y);
    peek.style.display = 'block';
  }

  hidePeek() {
    this.peekTarget = null;
    document.getElementById('inspect-peek').style.display = 'none';
    document.getElementById('tower-inspector').style.display = 'none';
  }

  // Peek-only (never pinned): a tap on a tower opens the ring, so there is no
  // free gesture left to pin with. `anchorRect` is in page px — the tower on the
  // canvas, or the ring hub — and the card opens beside it, not over it.
  peekTower(tower, anchorRect) {
    this.peekTarget = tower;
    document.getElementById('inspect-peek').style.display = 'none';
    const d = describeTowerDetail(tower);
    document.getElementById('ti-name').textContent = d.name;
    document.getElementById('ti-level').textContent = d.level;

    const stats = document.getElementById('ti-stats');
    stats.replaceChildren(...d.stats.map((text) => {
      const line = document.createElement('div');
      line.className = 'inspector-stat';
      line.textContent = text;
      return line;
    }));

    const matchups = document.getElementById('ti-matchups');
    matchups.replaceChildren(...d.matchups.map(({ tone, text }) => {
      const line = document.createElement('span');
      line.className = tone === 'good' ? 'mu-good' : 'mu-bad';
      line.textContent = text;
      return line;
    }));

    const armour = document.getElementById('ti-armour');
    armour.replaceChildren();
    if (d.armour) {
      const head = document.createElement('span');
      head.className = 'ar-head';
      head.textContent = d.armour.head;
      appendArmourRows(head, d.armour.rows);
      armour.appendChild(head);
    }
    armour.style.display = d.armour ? '' : 'none';

    const el = document.getElementById('tower-inspector');
    // Measured once populated and displayed: display:none reports 0.
    el.style.display = 'block';
    const size = { width: el.offsetWidth || 220, height: el.offsetHeight || 100 };
    const spot = placeBeside(anchorRect, size, mapRectPage(document), PEEK_GAP_PX, PANEL_EDGE_MARGIN);
    el.style.left = `${spot.left}px`;
    el.style.top  = `${spot.top}px`;
  }

  _positionPanel(el, targetX, targetY) {
    const map = mapRectPage(document);
    const size = { width: el.offsetWidth || 220, height: el.offsetHeight || 100 };
    let left = targetX + 24;
    // Prefer opening to the target's left over sliding on top of it.
    if (left + size.width > map.left + map.width) left = targetX - size.width - 24;
    const spot = clampPanelWithin(
      { left, top: Math.max(0, targetY - 60) }, size, map, PANEL_EDGE_MARGIN,
    );
    el.style.left = `${spot.left}px`;
    el.style.top  = `${spot.top}px`;
  }

  _positionPanelForTarget(spec) {
    const el = spec.kind === 'enemy'
      ? document.getElementById('enemy-inspector')
      : document.getElementById('hero-inspector');
    const css = worldToPageCss(this.scene?.scale, spec.target.x, spec.target.y);
    this._positionPanel(el, css.x, css.y);
  }
}
