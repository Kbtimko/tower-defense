// One shared hover card, reused by every ability anchor on the page.
//
// The model is supplied by a getter called at hover time, not a snapshot taken
// at attach time: cooldown and hero level change between renders, and a card
// that showed stale state would be worse than no card.
export class AbilityTooltip {
  constructor() {
    this._el        = document.getElementById('ability-card');
    this._listeners = [];
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
    for (const [evt, fn] of [['pointerenter', show], ['pointerleave', hide], ['focusin', show], ['focusout', hide]]) {
      anchor.addEventListener(evt, fn);
      this._listeners.push({ el: anchor, evt, fn });
    }
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

    this._position(anchor);
    this._el.classList.add('shown');
    this._el.setAttribute('aria-hidden', 'false');
  }

  // Positioned above the anchor, clamped into the viewport. getBoundingClientRect
  // returns zeros under jsdom, which is harmless — the tests assert content.
  _position(anchor) {
    const r = anchor.getBoundingClientRect();
    this._el.style.left = `${Math.max(8, r.left)}px`;
    this._el.style.top  = `${Math.max(8, r.top - this._el.offsetHeight - 10)}px`;
  }

  hide() {
    if (!this._el) return;
    this._el.classList.remove('shown');
    this._el.setAttribute('aria-hidden', 'true');
  }

  detachAll() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
    this.hide();
  }

  destroy() {
    this.detachAll();
    document.removeEventListener('keydown', this._onEsc);
  }
}
