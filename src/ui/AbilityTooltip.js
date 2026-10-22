import { attachLongPress } from './longPress.js';
import { PEEK_LINGER_MS, PANEL_EDGE_MARGIN } from '../data/input.js';
import { isKeyboardFocus } from './keyboardFocus.js';

// One shared hover card, reused by every ability anchor on the page.
//
// The model is supplied by a getter called at hover time, not a snapshot taken
// at attach time: cooldown and hero level change between renders, and a card
// that showed stale state would be worse than no card.
export class AbilityTooltip {
  constructor() {
    this._el        = document.getElementById('ability-card');
    this._listeners = [];
    this._detachers = [];
    this._lingerTimer = null;
    this._onEsc     = (e) => { if (e.key === 'Escape') this.hide(); };
    document.addEventListener('keydown', this._onEsc);
  }

  // focusin/focusout (not focus/blur): the anchor passed in is often a
  // wrapper around a sometimes-disabled button (ability buttons go disabled
  // when locked or on cooldown, and disabled controls fire no pointer events
  // in Chrome/Safari — same reason the wave popover wraps #wave-btn). focus/
  // blur don't bubble from the button to the wrapper, so tabbing onto the
  // button would never show the card; focusin/focusout do bubble.
  attach(anchor, getModel) {
    if (!anchor) return;
    const show = () => this._show(anchor, getModel());
    const hide = () => this.hide();
    // A touch fires pointerenter on every tap, which would flash the card on
    // the ability's primary action; touch peeks via long-press instead.
    const hoverShow = (e) => { if (e.pointerType === 'mouse') show(); };
    const hoverHide = (e) => { if (e.pointerType === 'mouse') hide(); };
    // Keyboard focus only: a tap focuses the tabindex wrapper too.
    const focusShow = (e) => { if (isKeyboardFocus(e)) show(); };
    for (const [evt, fn] of [['pointerenter', hoverShow], ['pointerleave', hoverHide], ['focusin', focusShow], ['focusout', hide]]) {
      anchor.addEventListener(evt, fn);
      this._listeners.push({ el: anchor, evt, fn });
    }
    this._detachers.push(attachLongPress(anchor, {
      onLongPress: show,
      onEnd: () => {
        this._clearLinger();
        this._lingerTimer = setTimeout(hide, PEEK_LINGER_MS);
      },
    }));
  }

  _clearLinger() {
    if (this._lingerTimer !== null) { clearTimeout(this._lingerTimer); this._lingerTimer = null; }
  }

  _show(anchor, model) {
    if (!this._el || !model) return;
    this._el.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ac-head';
    const icon = document.createElement('span');
    icon.className   = 'ac-icon';
    icon.textContent = model.icon;
    const label = document.createElement('span');
    label.className   = 'ac-label';
    label.textContent = model.label;
    const key = document.createElement('span');
    key.className   = 'ac-key';
    key.textContent = model.hotkey;
    head.append(icon, label, key);

    const effect = document.createElement('div');
    effect.className   = 'ac-effect';
    effect.textContent = model.effect;

    const meta = document.createElement('div');
    meta.className = 'ac-meta';
    // "unlocks at level N" only means something while the ability is still
    // locked by level; once it's available (or on cooldown, which implies
    // available), the unlock level is no longer news and just reads as odd
    // ("Overcharge · unlocks at level 1" on a level-5 hero).
    meta.textContent = model.state === 'cooldown'
      ? `Ready in ${model.cooldownRemaining}s · ${model.cooldown}s cooldown`
      : model.state === 'locked_level'
        ? `${model.cooldown}s cooldown · unlocks at level ${model.unlockLevel}`
        : `${model.cooldown}s cooldown`;

    this._el.append(head, effect, meta);

    if (model.lockReason) {
      const lock = document.createElement('div');
      lock.className   = 'ac-lock';
      lock.textContent = `🔒 ${model.lockReason}`;
      this._el.appendChild(lock);
    }

    // Shown BEFORE positioning: the card is display:none until then, so its
    // offsetHeight/Width would measure 0 and it would hang off the viewport.
    this._el.classList.add('shown');
    this._el.setAttribute('aria-hidden', 'false');
    this._position(anchor);
  }

  // Positioned above the anchor, clamped on all four edges into the viewport.
  // Must run on the shown element so its size is real.
  _position(anchor) {
    const r  = anchor.getBoundingClientRect();
    const w  = this._el.offsetWidth;
    const h  = this._el.offsetHeight;
    const m  = PANEL_EDGE_MARGIN;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
    this._el.style.left = `${clamp(r.left, m, window.innerWidth - w - m)}px`;
    this._el.style.top  = `${clamp(r.top - h - 10, m, window.innerHeight - h - m)}px`;
  }

  hide() {
    this._clearLinger();
    if (!this._el) return;
    this._el.classList.remove('shown');
    this._el.setAttribute('aria-hidden', 'true');
  }

  detachAll() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
    for (const detach of this._detachers) detach();
    this._detachers = [];
    this.hide();
  }

  destroy() {
    this.detachAll();
    document.removeEventListener('keydown', this._onEsc);
  }
}
