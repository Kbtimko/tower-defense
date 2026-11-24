import { radialMetrics, layoutRadial, circleFitScale } from '../systems/radialLayout.js';
import { createConfirmGate } from '../systems/confirmGate.js';
import { attachLongPress } from './longPress.js';
import { isKeyboardFocus } from './keyboardFocus.js';
import { RAIL_WIDTH, HUD_CELL, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { RADIAL_MARGIN, RADIAL_TEXT_INSET } from '../data/radial.js';
import { CONFIRM_WINDOW_MS } from '../data/input.js';

// The hub is reported to the callbacks as this pseudo-item, so the owner
// decides what a hub tap or hub peek means (close / tower inspector).
export const RADIAL_HUB = 'hub';
const HUB_ITEM = Object.freeze({ id: RADIAL_HUB });

// A fat-fingered tap on these costs gold or a tower, so touch/pen needs two.
const CONFIRMABLE = new Set(['upgrade', 'branchA', 'branchB', 'sell']);
const VARIANT_CLASS = { currency: 'ui-btn--currency', danger: 'ui-btn--danger', primary: 'ui-btn--primary', neutral: null };
const STATE_CLASS = { ready: null, disabled: 'is-disabled', locked: 'is-disabled', maxed: 'maxed' };
const ITEM_CLASS = 'ui-btn radial-item';
const HUB_CLASS = 'ui-btn';
const ARMED_CAPTION = 'Tap again';
// Shrinking is near-linear (emoji, hinting, rewraps), so a pass can land a hair wide.
const FIT_PASSES = 4;
// The map in world px: the radial is clamped to it, then shifted by the left
// rail because #hud-layer is laid out over the whole canvas in game px.
const MAP_BOUNDS = { left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };

const isTouchLike = (t) => t === 'touch' || t === 'pen';
// Everything a preview or peek renders from; a refresh that changes none of it is silent.
const sameItem = (a, b) => a === b || (!!a && !!b && a.id === b.id && a.label === b.label && a.name === b.name && a.cost === b.cost && a.state === b.state);

// Writes only on change: refresh runs on every gold tick, and a churned node
// under a press in progress would swallow its click.
function setAttr(el, name, value) {
  if (value === null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function setText(el, text) {
  if (el.textContent === text) return false;
  el.textContent = text;
  return true;
}

/**
 * Presenter over the static #radial markup (6 .radial-item buttons + #radial-hub).
 *
 * Callbacks:
 * - onActivate(item): a ready item (after the touch confirm where it applies),
 *   a not-ready item (so the owner can toast "Not enough gold!" or the lock text;
 *   it never arms), or `{ id: RADIAL_HUB }` for a hub tap.
 * - onPreview(item | null): draw / clear the range preview (hover, focus, press).
 * - onPeek(item | null, anchorRect): show the item peek (or, for the hub item,
 *   the tower inspector) beside `anchorRect`, the radial footprint in page px.
 *   null means the peek gesture ended; the owner applies its own linger.
 *
 * Escape is deliberately not handled here: GameScene's global Escape already
 * closes any mode, and handling it twice would double-close.
 */
export class RadialMenu {
  constructor(doc, { onActivate, onPreview, onPeek }) {
    this._doc = doc;
    this._root = doc.getElementById('radial');
    this._buttons = [...this._root.querySelectorAll('.radial-item')];
    this._hub = doc.getElementById('radial-hub');
    this._cb = { onActivate, onPreview, onPeek };
    this._metrics = radialMetrics(HUD_CELL);
    this._gate = createConfirmGate();
    this._items = [];
    this._hubLines = [];
    this._kind = null;
    this._target = null;
    this._anchor = null;
    this._pointerType = 'mouse';
    this._pressedInside = false;
    this._armed = null;
    this._confirmTimer = null;
    this._previewing = false;
    this._previewBtn = null;
    this._previewItem = null;
    this._peeking = false;
    this._peekBtn = null;
    this._peekItem = null;
    this._wire();
  }

  get isOpen() { return this._kind !== null; }
  get kind() { return this._kind; }
  get target() { return this._target; }
  // The item waiting for its confirming second tap, so the owner's peek can say so.
  get armedId() { return this._armed; }

  open({ kind, anchor, items, hub, target = null }) {
    this._disarm();
    this._hidePeek();
    this._clearPreview();
    this._kind = kind;
    this._target = target;
    this._anchor = anchor;
    // A retarget is a fresh radial: the press that caused it must not count.
    this._pressedInside = false;
    this._root.dataset.kind = kind;
    this._render(items, hub);
    this._root.hidden = false;
    // Measured only now: a hidden face has no size, so a fit during _render is a no-op.
    for (const btn of this._visibleFaces()) this._fitFace(btn);
  }

  // Gold changed or the tower was upgraded. A confirm survives only when the
  // armed item is unchanged and still ready: a new label or cost is a different
  // purchase, and an unaffordable one must not run on the next tap.
  refresh(items, hub) {
    if (!this.isOpen) return;
    const active = this._doc.activeElement;
    const focusedId = this._root.contains(active) ? this._idOf(active) : null;
    if (this._armed) {
      const before = this._items.find((i) => i?.id === this._armed);
      const after = items.find((i) => i.id === this._armed);
      const same = after && after.state === 'ready' && after.label === before?.label && after.cost === before?.cost;
      if (!same) this._disarm();
    }
    this._render(items, hub);
    if (focusedId) this._restoreFocus(focusedId);
    this._resync();
  }

  // A hovered or focused slot can hold a different item after a re-render
  // (upgrade -> branch A) or the same item in a new state (affordable now), so
  // a stale preview or peek must not linger.
  _resync() {
    if (this._previewing) {
      const item = this._itemFor(this._previewBtn);
      if (!item) this._clearPreview();
      else if (!sameItem(item, this._previewItem)) this._preview(this._previewBtn);
    }
    if (this._peeking && this._peekBtn) {
      const item = this._itemFor(this._peekBtn);
      if (!item) this._hidePeek();
      else if (!sameItem(item, this._peekItem)) this._showPeek(this._peekBtn);
    }
  }

  close() {
    if (!this.isOpen) return;
    this._disarm();
    this._hidePeek();
    const active = this._doc.activeElement;
    if (this._root.contains(active)) active.blur();
    this._clearPreview();
    this._root.hidden = true;
    this._root.removeAttribute('data-kind');
    this._kind = null;
    this._target = null;
    this._anchor = null;
    // A late timer or event on a hidden button must resolve to nothing.
    this._items = [];
  }

  // Shutdown: every listener off as a pair, timers cleared, markup back to
  // exactly what index.html ships, so the next scene's menu starts clean.
  destroy() {
    this.close();
    for (const [el, evt, fn] of this._listeners) el.removeEventListener(evt, fn);
    for (const detach of this._detachers) detach();
    this._listeners = [];
    this._detachers = [];
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
    for (const btn of this._buttons) this._resetItem(btn);
    this._resetHub();
  }

  _wire() {
    this._listeners = [
      [this._root, 'pointerdown', (e) => { this._pointerType = e.pointerType; this._pressedInside = true; }],
      [this._root, 'click', (e) => this._onClick(e)],
      [this._root, 'keydown', (e) => this._onKeyDown(e)],
    ];
    this._detachers = [];
    for (const btn of [...this._buttons, this._hub]) {
      this._listeners.push(
        [btn, 'pointerenter', (e) => this._onEnter(btn, e)],
        [btn, 'pointerleave', (e) => this._onLeave(e)],
        [btn, 'pointerdown', (e) => this._onPress(btn, e)],
        [btn, 'pointerup', (e) => this._onRelease(e)],
        [btn, 'pointercancel', (e) => this._onRelease(e)],
        [btn, 'focus', (e) => this._onFocus(btn, e)],
        [btn, 'blur', () => { this._clearPreview(); this._hidePeek(); }],
      );
      // The swallowed click means a long-press never builds, arms or closes.
      this._detachers.push(attachLongPress(btn, {
        onLongPress: () => this._showPeek(btn),
        onEnd: () => this._hidePeek(),
      }));
    }
    for (const [el, evt, fn] of this._listeners) el.addEventListener(evt, fn);
  }

  _itemFor(btn) {
    if (btn === this._hub) return HUB_ITEM;
    return this._items[this._buttons.indexOf(btn)] ?? null;
  }

  _idOf(el) { return el === this._hub ? RADIAL_HUB : el.dataset?.id ?? null; }

  _onClick(e) {
    const btn = e.target.closest?.('button');
    if (!btn || !this._root.contains(btn)) return;
    const keyboard = e.detail === 0;
    // The release (or compat click) of the tap that OPENED the radial lands on
    // whatever item now sits under the finger; only a press that began on the
    // radial after it appeared may activate.
    if (!keyboard && !this._pressedInside) return;
    const item = this._itemFor(btn);
    if (!item) return;
    const touchLike = !keyboard && isTouchLike(this._pointerType);
    if (item === HUB_ITEM || item.state !== 'ready' || !CONFIRMABLE.has(item.id) || !touchLike) {
      this._disarm();
      this._cb.onActivate(item);
      return;
    }
    if (this._armed && this._armed !== item.id) this._disarm();
    if (this._gate.press(item.id, Date.now()) === 'confirmed') {
      this._disarm();
      this._cb.onActivate(item);
      return;
    }
    this._arm(item, btn);
  }

  _arm(item, btn) {
    this._armed = item.id;
    this._paintItem(btn, item);
    clearTimeout(this._confirmTimer);
    this._confirmTimer = setTimeout(() => this._disarm(), CONFIRM_WINDOW_MS);
    this._showPeek(btn);
  }

  _disarm() {
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
    this._gate.reset();
    if (!this._armed) return;
    const id = this._armed;
    this._armed = null;
    const i = this._items.findIndex((it) => it?.id === id);
    if (i !== -1) this._paintItem(this._buttons[i], this._items[i]);
    this._hidePeek();
  }

  // Items then the hub, in DOM order (= slot order), skipping unused slots.
  // Not-ready items stay in the cycle: they are aria-disabled, not disabled.
  _onKeyDown(e) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const order = [...this._buttons.filter((b) => !b.hidden), this._hub];
    const at = order.indexOf(this._doc.activeElement);
    const next = at === -1 ? 0 : (at + step + order.length) % order.length;
    order[next].focus();
  }

  // A phone has no hover, so a touch press is how an item is read: the peek
  // shows on press and the owner lingers it after release. The click that
  // follows still activates or arms (and an arm re-shows the peek).
  _onPress(btn, e) {
    this._preview(btn);
    if (isTouchLike(e.pointerType)) this._showPeek(btn);
  }

  // A mouse release must not drop the hover peek it is still over.
  _onRelease(e) {
    this._clearPreview();
    if (isTouchLike(e.pointerType)) this._hidePeek();
  }

  // A touch pointerenter fires on every tap; only a mouse hovers.
  _onEnter(btn, e) {
    if (e.pointerType !== 'mouse') return;
    this._preview(btn);
    this._showPeek(btn);
  }

  // Touch fires pointerleave after release and before click, which would hide
  // the peek a confirm arm is about to open.
  _onLeave(e) {
    if (e.pointerType !== 'mouse') return;
    this._clearPreview();
    this._hidePeek();
  }

  // Pointer focus is ignored: Android focuses a tapped button after pointerup,
  // so a preview started here would never see its release. Hover and press
  // already preview for pointers.
  _onFocus(btn, e) {
    if (!isKeyboardFocus(e)) return;
    this._preview(btn);
    this._showPeek(btn);
  }

  _preview(btn) {
    if (!this.isOpen) return;
    const item = this._itemFor(btn);
    if (!item || item === HUB_ITEM) return;
    this._previewing = true;
    this._previewBtn = btn;
    this._previewItem = item;
    this._cb.onPreview(item);
  }

  _clearPreview() {
    if (!this._previewing) return;
    this._previewing = false;
    this._previewBtn = null;
    this._previewItem = null;
    this._cb.onPreview(null);
  }

  // Long-press timers can fire after the radial closed (defeat, a D5 close).
  _showPeek(btn) {
    if (!this.isOpen) return;
    const item = this._itemFor(btn);
    if (!item) return;
    this._peeking = true;
    this._peekBtn = btn;
    this._peekItem = item;
    this._cb.onPeek(item, this._footprintRect());
  }

  _hidePeek() {
    if (!this._peeking) return;
    this._peeking = false;
    this._peekBtn = null;
    this._peekItem = null;
    this._cb.onPeek(null);
  }

  // Peeks sit beside the whole radial so they never cover another item.
  _footprintRect() {
    const rects = [...this._buttons.filter((b) => !b.hidden), this._hub].map((b) => b.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, width: right - left, height: bottom - top };
  }

  _restoreFocus(id) {
    if (id === RADIAL_HUB) return;
    const find = (want) => this._buttons.find((b) => !b.hidden && b.dataset.id === want);
    // Buying T3 turns the upgrade slot into the two branches: land on the first.
    const el = find(id) ?? (id === 'upgrade' ? find('branchA') : null) ?? this._hub;
    if (this._doc.activeElement !== el) el.focus();
  }

  _render(items, hubLines) {
    this._items = items;
    this._hubLines = hubLines;
    const { centre, items: points } = layoutRadial({
      anchor: this._anchor, angles: items.map((i) => i.slot), metrics: this._metrics,
      bounds: MAP_BOUNDS, margin: RADIAL_MARGIN,
    });
    this._buttons.forEach((btn, i) => {
      if (i >= items.length) { this._resetItem(btn); btn.hidden = true; return; }
      btn.hidden = false;
      this._place(btn, points[i]);
      this._paintItem(btn, items[i]);
    });
    this._place(this._hub, centre);
    this._paintHub();
  }

  _place(el, { x, y }) {
    el.style.left = `${RAIL_WIDTH + x}px`;
    el.style.top = `${y}px`;
  }

  _paintItem(btn, item) {
    const armed = this._armed === item.id;
    setAttr(btn, 'class', [ITEM_CLASS, VARIANT_CLASS[item.variant], STATE_CLASS[item.state], armed && 'confirming']
      .filter(Boolean).join(' '));
    setAttr(btn, 'data-id', item.id);
    setAttr(btn, 'data-state', item.state);
    setAttr(btn, 'aria-label', item.ariaLabel);
    setAttr(btn, 'aria-disabled', item.state === 'ready' ? null : 'true');
    let icon = btn.querySelector('.radial-icon');
    let iconChanged = false;
    if (item.icon) {
      if (!icon) icon = btn.insertBefore(this._span('radial-icon'), btn.firstChild);
      iconChanged = setText(icon, item.icon);
    } else if (icon) { icon.remove(); iconChanged = true; }
    const label = btn.querySelector('.radial-label') ?? btn.appendChild(this._span('radial-label'));
    if (setText(label, armed ? ARMED_CAPTION : item.label) || iconChanged) this._fitFace(btn);
  }

  _paintHub() {
    const lines = this._hubLines;
    const spans = [...this._hub.querySelectorAll('.radial-hub-line')];
    while (spans.length > lines.length) spans.pop().remove();
    while (spans.length < lines.length) spans.push(this._hub.appendChild(this._span('radial-hub-line')));
    const changed = spans.filter((span, i) => setText(span, lines[i]));
    setAttr(this._hub, 'aria-label', lines.join(', '));
    if (changed.length) this._fitFace(this._hub);
  }

  _visibleFaces() {
    return [...this._buttons.filter((b) => !b.hidden), this._hub];
  }

  // Shrinks every text line of a round face, together, until each line box
  // lies inside the circle: a label that fits the square box can still clip
  // past the curve near the top or bottom. Shrinking moves lines inward and
  // can rewrap them, so a few passes re-measure.
  _fitFace(btn) {
    const spans = [...btn.children];
    for (const s of spans) s.style.removeProperty('font-size');
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const box = btn.getBoundingClientRect();
      if (!box.width) return;
      const circle = { cx: box.left + box.width / 2, cy: box.top + box.height / 2, r: (box.width / 2) * RADIAL_TEXT_INSET };
      const lines = spans.flatMap((s) => {
        const range = this._doc.createRange();
        range.selectNodeContents(s);
        return [...range.getClientRects()];
      });
      const k = circleFitScale(circle, lines);
      if (k >= 1) return;
      for (const s of spans) {
        const px = parseFloat(getComputedStyle(s).fontSize);
        if (px) s.style.fontSize = `${Math.floor(px * k * 4) / 4}px`;
      }
    }
  }

  _span(cls) {
    const s = this._doc.createElement('span');
    s.className = cls;
    return s;
  }

  _resetItem(btn) {
    btn.className = ITEM_CLASS;
    btn.hidden = false;
    for (const a of ['style', 'data-id', 'data-state', 'aria-label', 'aria-disabled']) btn.removeAttribute(a);
    btn.replaceChildren();
  }

  _resetHub() {
    this._hub.className = HUB_CLASS;
    for (const a of ['style', 'aria-label']) this._hub.removeAttribute(a);
    this._hub.replaceChildren();
  }
}
