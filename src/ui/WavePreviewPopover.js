// Popover showing what the Send Wave button would send.
//
// The hover target is the WRAPPER, not the button: _updateWaveButton disables
// #wave-btn for the whole of an active wave, and Chrome and Safari fire no
// pointer events on a disabled control. Hovering the button would go dead
// exactly when a player most wants to see what is coming.

// vulnerableTo/resists arrive from describeEnemy as {kind, type, name, icon}
// objects mixing towers and heroes — already display-ready, so no prefix
// parsing happens here, but the two kinds must render distinguishably (a
// hero like Dax is not a tower a player can build) so formatCounters is
// shared with CodexOverlay rather than reimplemented as a flat join here.
import { formatCounters } from './matchupText.js';
import { attachLongPress } from './longPress.js';
import { isKeyboardFocus } from './keyboardFocus.js';

export class WavePreviewPopover {
  constructor() {
    this._wrap    = document.getElementById('wave-btn-wrap');
    this._el      = document.getElementById('wave-preview');
    this._summary = null;

    // Touch fires pointerenter on every tap, which would open the popover over
    // a plain Send Wave tap; hover is for mice. Touch opens via long-press.
    this._onEnter = (e) => { if (e.pointerType === 'mouse') this.show(); };
    this._onLeave = (e) => { if (e.pointerType === 'mouse') this.hide(); };
    // Keyboard focus only: a tap focuses the tabindex wrapper too.
    this._onFocusIn  = (e) => { if (isKeyboardFocus(e)) this.show(); };
    this._onFocusOut = () => this.hide();
    this._onEsc   = (e) => { if (e.key === 'Escape') this.hide(); };

    // Any pointerdown outside dismisses — the touch equivalent of pointerleave.
    this._onOutside = (e) => {
      if (this._wrap && !this._wrap.contains(e.target)) this.hide();
    };

    if (this._wrap) {
      this._wrap.addEventListener('pointerenter', this._onEnter);
      this._wrap.addEventListener('pointerleave', this._onLeave);
      // focus/blur don't bubble, so with tabindex on the wrapper AND a focusable
      // #wave-btn inside it, tabbing onto the button would fire blur on the
      // wrapper and immediately close the popover the instant focus reaches the
      // button. focusin/focusout bubble, so focus anywhere inside keeps it open.
      this._wrap.addEventListener('focusin',      this._onFocusIn);
      this._wrap.addEventListener('focusout',     this._onFocusOut);
      // The wrapper, so a long-press over the button itself peeks too; the
      // helper swallows the click so the peek never also sends the wave.
      this._detachLongPress = attachLongPress(this._wrap, { onLongPress: () => this.show() });
    }
    document.addEventListener('keydown',     this._onEsc);
    document.addEventListener('pointerdown', this._onOutside);
  }

  setWave(summary) {
    this._summary = summary;
    if (!this._el) return;
    if (!summary) { this.hide(); this._el.replaceChildren(); return; }
    this._render(summary);
  }

  _render(summary) {
    this._el.replaceChildren();

    const title = document.createElement('div');
    title.className   = 'wp-title';
    title.textContent = `Wave ${summary.waveNumber} · ${summary.totalCount} enemies`;
    this._el.appendChild(title);

    for (const g of summary.groups) {
      const row = document.createElement('div');
      row.className = 'wp-row';
      const icon = document.createElement('span');
      icon.className   = 'wp-icon';
      icon.textContent = g.icon;
      const name = document.createElement('span');
      name.className   = 'wp-name';
      name.textContent = g.name;
      const count = document.createElement('span');
      count.className   = 'wp-count';
      count.textContent = `×${g.count}`;
      row.append(icon, name, count);
      this._el.appendChild(row);

      const stats = document.createElement('div');
      stats.className = 'wp-stats';
      const bits = [`${g.hp} HP`, g.armor > 0 ? `${g.armor} armour` : 'no armour', g.flying ? 'flying' : 'ground'];
      stats.textContent = bits.join(' · ');
      this._el.appendChild(stats);

      if (g.vulnerableTo.length) {
        const weak = document.createElement('div');
        weak.className   = 'wp-match';
        weak.textContent = `weak to ${formatCounters(g.vulnerableTo)}`;
        this._el.appendChild(weak);
      }
      if (g.resists.length) {
        const res = document.createElement('div');
        res.className   = 'wp-match resist';
        res.textContent = `resists ${formatCounters(g.resists)}`;
        this._el.appendChild(res);
      }
    }
  }

  show() {
    if (!this._el || !this._summary) return;
    this._el.classList.add('shown');
    this._el.setAttribute('aria-hidden', 'false');
  }

  hide() {
    if (!this._el) return;
    this._el.classList.remove('shown');
    this._el.setAttribute('aria-hidden', 'true');
  }

  destroy() {
    if (this._wrap) {
      this._wrap.removeEventListener('pointerenter', this._onEnter);
      this._wrap.removeEventListener('pointerleave', this._onLeave);
      this._wrap.removeEventListener('focusin',      this._onFocusIn);
      this._wrap.removeEventListener('focusout',     this._onFocusOut);
      this._detachLongPress?.();
    }
    document.removeEventListener('keydown',     this._onEsc);
    document.removeEventListener('pointerdown', this._onOutside);
    this.hide();
    this._summary = null;
  }
}
