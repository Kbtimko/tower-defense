import Phaser from 'phaser';
import { AbilityTooltip } from '../ui/AbilityTooltip.js';
import { attachHint } from '../ui/HintPeek.js';
import { describeAbility } from '../systems/entityDescriptors.js';
import { cooldownFraction } from '../systems/juiceMath.js';

export default class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    // `once`, not `on`: the scene emitter outlives a shutdown, so `on` stacks
    // another copy every time create() runs and shutdown() then runs once per
    // entry. Same root cause as the GameScene spawn-duplication bug.
    this.events.once('shutdown', this.shutdown, this);

    this._onKeyDown    = null;

    // Phaser reuses this one UIScene instance across maps; reset the XP
    // tooltip memo so the previous map's damage-needed figures don't linger.
    this._heroXpPct    = null;
    this._heroXpAtMax  = null;
    this._heroXpLevel  = null;
    this._heroXpHint   = '';

    document.getElementById('hud-layer').style.display = 'block';
    document.getElementById('game-msg').style.display  = 'none';

    this._bindDOMEvents();
    this._subscribeToGameEvents();

    // UIScene owns the hero card, so it (not GameScene) attaches and detaches
    // this hint: UIScene outlives levels and GameScene's shutdown clone would
    // strip a foreign listener.
    this._detachHeroHint?.();
    this._detachHeroHint = attachHint(document.getElementById('hero-section'), () => this._heroXpHint);

    // GameScene paints the stats and wave button itself before launching this
    // scene; only the hero HUD is owned here.
    const gs = this.scene.get('GameScene');
    if (gs && gs.hero?.def) {
      this._onHeroHudInit({ heroId: gs.heroId, def: gs.hero.def });
    }
  }

  shutdown() {
    document.getElementById('hud-layer').style.display = 'none';

    this.game.events.off('hero:hud-init',      this._onHeroHudInit,       this);
    this.game.events.off('hero:update',        this._onHeroUpdate,        this);
    this.game.events.off('hero:level-up',      this._onHeroLevelUp,       this);
    this.game.events.off('hero:aim-mode',      this._onHeroAimMode,       this);
    this.game.events.off('hero:aim-cancel',    this._onHeroAimCancel,     this);
    this.game.events.off('hero:cooldown-tick', this._onHeroCooldownTick,  this);
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);

    this._abilityTip?.destroy();
    this._abilityTip = null;
    this._detachHeroHint?.();
    this._detachHeroHint = null;

    // Only the ids this scene binds. GameScene binds the rest itself, and
    // cloning one here would strip GameScene's handler along with ours.
    ['ability-q','ability-w','ability-e'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
  }

  _bindDOMEvents() {
    // Ability button clicks
    ['q', 'w', 'e'].forEach(slot => {
      const btn = document.getElementById('ability-' + slot);
      if (btn) btn.addEventListener('click', () => this.game.events.emit('ui:ability', { slot }));
    });

    // Keyboard shortcuts
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        this.game.events.emit('ui:pause-toggle');
        return;
      }
      // GameScene ignores this unless a build/aim/reposition mode is active.
      if (e.key === 'Escape') {
        this.game.events.emit('ui:cancel');
        return;
      }
      const key = e.key.toLowerCase();
      if (['q', 'w', 'e'].includes(key)) {
        this.game.events.emit('ui:ability', { slot: key });
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _subscribeToGameEvents() {
    this.game.events.on('hero:hud-init',      this._onHeroHudInit,       this);
    this.game.events.on('hero:update',        this._onHeroUpdate,        this);
    this.game.events.on('hero:level-up',      this._onHeroLevelUp,       this);
    this.game.events.on('hero:aim-mode',      this._onHeroAimMode,       this);
    this.game.events.on('hero:aim-cancel',    this._onHeroAimCancel,     this);
    this.game.events.on('hero:cooldown-tick', this._onHeroCooldownTick,  this);
  }

  toCssColor(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }

  _onHeroHudInit({ heroId, def }) {
    this._heroDef   = def;
    this._heroLevel = 1;
    this._heroCds   = { q: 0, w: 0, e: 0 };
    // The shutdown cloneNode copies an inline --cd into the next level's buttons,
    // and a stale max would skew the first sweep.
    this._cdMax = {};
    for (const id of ['ability-q', 'ability-w', 'ability-e']) {
      document.getElementById(id)?.style.removeProperty('--cd');
    }

    const portrait = document.getElementById('hero-portrait');
    if (portrait) {
      portrait.textContent       = def.portraitChar;
      portrait.style.background  = this.toCssColor(def.bodyColor);
      portrait.style.borderColor = this.toCssColor(def.strokeColor);
      portrait.style.color       = this.toCssColor(def.strokeColor);
    }

    const levelEl = document.getElementById('hero-level');
    if (levelEl) levelEl.textContent = `${def.shortName} L1`;

    const fill = document.getElementById('hero-hp-fill');
    if (fill) fill.style.background = this.toCssColor(def.strokeColor);

    for (const slot of ['q', 'w', 'e']) {
      const a   = def.abilities[slot];
      const btn = document.getElementById(`ability-${slot}`);
      if (!btn) continue;
      const keyEl  = btn.querySelector('.ability-key');
      const nameEl = btn.querySelector('.ability-name');
      if (keyEl)  keyEl.textContent  = slot.toUpperCase();
      if (nameEl) nameEl.textContent = a.icon;
      // The face is only a key + glyph and native title= is gone (#42a), so
      // assistive tech gets the name and effect here. The focusable wrapper
      // carries it too: a disabled button is skipped by focus.
      const spoken = `${slot.toUpperCase()}: ${a.label}. ${a.tooltip}`;
      btn.setAttribute('aria-label', spoken);
      document.getElementById(`ability-${slot}-wrap`)?.setAttribute('aria-label', spoken);
      btn.classList.add('locked');
      btn.disabled = true;
    }

    // Live state is read at hover time, so the card always matches the button.
    this._abilityTip?.detachAll();
    this._abilityTip ??= new AbilityTooltip();
    for (const slot of ['q', 'w', 'e']) {
      // Attach to the wrapper, not the button: the button goes `disabled`
      // whenever the ability is locked or cooling down, and Chrome/Safari
      // fire no pointer events on a disabled control — exactly when a player
      // most needs the card. Falls back to the button if markup ever drifts.
      const btn  = document.getElementById(`ability-${slot}`);
      const wrap = document.getElementById(`ability-${slot}-wrap`) ?? btn;
      this._abilityTip.attach(wrap, () => describeAbility(def, slot, {
        level:             this._heroLevel,
        heroUnlocked:      true,     // an in-level hero is by definition unlocked
        cooldownRemaining: this._heroCds[slot],
      }));
    }
  }

  _onHeroUpdate({ hp, maxHp, xp }) {
    const fill = document.getElementById('hero-hp-fill');
    if (fill) fill.style.width = ((hp / maxHp) * 100).toFixed(1) + '%';
    this._renderHeroXp(xp);
  }

  // The bar moves every frame; the tooltip string only changes when the whole
  // percent does, so it is rebuilt on that boundary rather than 60 times a second.
  _renderHeroXp(xp) {
    if (!xp) return;
    const fill = document.getElementById('hero-xp-fill');
    if (fill) fill.style.width = (xp.progress * 100).toFixed(1) + '%';

    const pct = Math.floor(xp.progress * 100);
    if (pct === this._heroXpPct && xp.atMax === this._heroXpAtMax && xp.level === this._heroXpLevel) return;
    this._heroXpPct   = pct;
    this._heroXpAtMax = xp.atMax;
    this._heroXpLevel = xp.level;

    this._heroXpHint = xp.atMax
      ? `Level ${xp.level} — MAX`
      : `Level ${xp.level} — ${pct}% to Level ${xp.level + 1}`
        + ` · damage dealt ${Math.round(xp.current).toLocaleString('en-US')}`
        + ` / ${Math.round(xp.needed).toLocaleString('en-US')}`;
  }

  _onHeroLevelUp({ level }) {
    this._heroLevel = level;
    const name = this._heroDef?.shortName ?? 'Rael';
    const cap  = this._heroDef?.stats?.maxLevel ?? 5;
    document.getElementById('hero-level').textContent =
      level >= cap ? `${name} L${level} · MAX` : `${name} L${level}`;
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
    this._heroCds = { q, w, e };
    this._setAbilityCd('ability-q', q);
    this._setAbilityCd('ability-w', w);
    this._setAbilityCd('ability-e', e);
  }

  _setAbilityCd(id, secs) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const cdEl = btn.querySelector('.ability-cd');
    if (secs > 0) {
      // Max is seeded from the hero def (fallback: first non-zero tick); the wedge is remaining/max.
      this._cdMax ??= {};
      // Seed from the hero def so a mid-cooldown start can't skew the sweep.
      this._cdMax[id] ||= this._heroDef?.abilities?.[id.slice(-1)]?.cooldown ?? secs;
      btn.style.setProperty('--cd', cooldownFraction(secs, this._cdMax[id]));
      btn.disabled = true;
      if (cdEl) cdEl.textContent = secs + 's';
    } else {
      if (this._cdMax) this._cdMax[id] = 0;
      btn.style.removeProperty('--cd');
      if (!btn.classList.contains('locked')) btn.disabled = false;
      if (cdEl) cdEl.textContent = '';
    }
  }
}
