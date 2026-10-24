import { STORY_SEQUENCES, STORY_SPEAKERS } from '../data/story.js';
import { STORY_DIALOG, SPEAKER_LOOK_DEFAULTS } from '../data/storyDialog.js';
import { startFlow, primary, skip, tick, view } from '../systems/dialogFlow.js';
import { speakerLook } from '../systems/speakerLook.js';
import { portraitPath } from '../systems/portraitFallback.js';
import { isBrowserShortcut } from './browserShortcut.js';

const ONE_SHOT_CLASSES = ['sd-slam', 'sd-swap'];
const NO_PORTRAITS = new Set();
// The second tap of a double tap on the closing control. Touch events too: Phaser
// reads touchstart/touchend, not pointer events, so a pad would still take it.
const TAP_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'];
// Non-passive, or Chrome treats a document touchstart as passive and ignores preventDefault.
const TAP_SWALLOW_OPTS = { capture: true, passive: false };

// slamMs -> --sd-slam-ms: 450ms. JS stays the single source of the timings the
// CSS animates with (the --title-* precedent).
function publishTimings(el, cfg) {
  for (const [key, value] of Object.entries(cfg)) {
    if (typeof value !== 'number') continue;
    const unit = key.endsWith('Deg') ? 'deg' : 'ms';
    el.style.setProperty(`--sd-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, `${value}${unit}`);
  }
}

function setColourVar(el, name, value) {
  if (value) el.style.setProperty(name, value);
  else el.style.removeProperty(name);
}

// Re-runs a one-shot CSS animation class; the forced reflow restarts it even
// when the same class is re-added (offsetWidth is a harmless 0 under jsdom).
function replay(el, cls) {
  el.classList.remove(...ONE_SHOT_CLASSES);
  void el.offsetWidth;
  el.classList.add(cls);
}

export class StoryDialogOverlay {
  constructor({
    motion = () => true,
    now = () => performance.now(),
    raf = (cb) => requestAnimationFrame(cb),
    caf = (id) => cancelAnimationFrame(id),
  } = {}) {
    this._overlay  = document.getElementById('story-dialog');
    this._portrait = document.getElementById('story-dialog-portrait');
    this._name     = document.getElementById('story-dialog-name');
    this._text     = document.getElementById('story-dialog-text');
    this._typed    = this._text.querySelector('.sd-typed');
    this._rest     = this._text.querySelector('.sd-rest');
    this._live     = document.getElementById('story-dialog-live');
    this._next     = document.getElementById('story-dialog-next');
    this._skip     = document.getElementById('story-dialog-skip');
    this._motion = motion;
    this._now = now;
    this._raf = raf;
    this._caf = caf;
    this._flow = null;
    this._onComplete = null;
    this._returnFocus = null;
    this._frame = 0;
    this._liveFrame = 0;
    this._closedAt = 0;
    this._panelIndex = -1;
    this._shown = -1;
    this._chars = [];
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onFrame = this._onFrame.bind(this);
    this._swallowKeyup = this._swallowKeyup.bind(this);
    this._endKeyupSwallow = this._endKeyupSwallow.bind(this);
    this._swallowTap = this._swallowTap.bind(this);
    publishTimings(this._overlay, STORY_DIALOG);
  }

  play(sequenceId, onComplete) {
    // Interrupting an open sequence: complete the prior beat first so it is still
    // marked seen (its onComplete runs), then tear down its listeners. That
    // onComplete may chain a play() of its own, which is finished the same way.
    while (this._flow) this._finish();
    const seq = STORY_SEQUENCES[sequenceId];
    const cb = onComplete || (() => {});
    if (!seq || seq.panels.length === 0) { cb(); return; }
    // The reopened dialog covers the screen and judges its own taps; left on, the
    // swallow would eat them before the overlay sees them.
    this._removeTapSwallow();
    this._onComplete = cb;
    this._returnFocus = document.activeElement;
    this._overlay.addEventListener('click', this._onClick);
    document.addEventListener('keydown', this._onKeyDown, true);
    this._live.textContent = '';
    this._overlay.style.display = 'flex';
    this._next.focus();
    this._panelIndex = -1;
    this._shown = -1;
    this._render(startFlow(seq, this._now(), { motion: this._motion() }));
  }

  close() {
    this._overlay.removeEventListener('click', this._onClick);
    document.removeEventListener('keydown', this._onKeyDown, true);
    this._removeKeyupSwallow();
    this._removeTapSwallow();
    this._stopFrames();
    this._cancelLiveFrame();
    this._live.textContent = '';
    this._overlay.classList.remove(...ONE_SHOT_CLASSES);
    this._overlay.style.display = 'none';
    this._flow = null;
    this._onComplete = null;
    this._panelIndex = -1;
    this._shown = -1;
    this._restoreFocus();
  }

  // Click is the last event of a tap, so closing here leaves nothing of the
  // gesture to land on the map below.
  _onClick(e) {
    if (e.target.closest('#story-dialog-skip')) this._finishFromTap();
    else this._primary(() => this._finishFromTap());
  }

  // Capture phase on document: runs before UIScene's bubble listener, so no
  // game shortcut fires under the dialog. A key the entry guard already
  // prevented is the title's leftover, not a read.
  _onKeyDown(e) {
    if (e.defaultPrevented || isBrowserShortcut(e)) return;
    e.stopPropagation();
    const handled = this._keyAction(e);
    if (!handled) return;
    // Also stops a focused button's native activation, which would act twice.
    e.preventDefault();
    if (!e.repeat) handled();
  }

  _keyAction(e) {
    switch (e.key) {
      case 'Escape': return () => this._finishFromKey();
      case 'Enter':
      case ' ':
        return document.activeElement === this._skip
          ? () => this._finishFromKey()
          : () => this._primary(() => this._finishFromKey());
      case 'Tab': return () => this._wrapFocus(e.shiftKey);
      default: return null;
    }
  }

  _wrapFocus(backwards) {
    const active = document.activeElement;
    if (active === this._next) this._skip.focus();
    else if (active === this._skip) this._next.focus();
    else (backwards ? this._next : this._skip).focus();
  }

  _primary(onDone) {
    const next = primary(this._flow, this._now(), STORY_DIALOG);
    if (next.phase === 'done') onDone();
    else this._render(next);
  }

  _finish() {
    const cb = this._onComplete;
    this.close();
    if (cb) cb();
  }

  // A Space released after closing would activate whatever now has focus
  // (LAUNCH), so the closing key's keyup is swallowed. Armed before onComplete
  // so a chained play() keeps it.
  _finishFromKey() {
    const cb = this._onComplete;
    this.close();
    document.addEventListener('keyup', this._swallowKeyup, true);
    document.addEventListener('keydown', this._endKeyupSwallow, true);
    if (cb) cb();
  }

  // The overlay is gone once a tap closes it, so a double tap's second tap would
  // land beneath (LAUNCH, a pad). A timestamp, not a timer: taps inside the
  // advance guard are swallowed; armed before onComplete like the keyup tail.
  _finishFromTap() {
    const cb = this._onComplete;
    this.close();
    this._closedAt = this._now();
    for (const type of TAP_EVENTS) document.addEventListener(type, this._swallowTap, TAP_SWALLOW_OPTS);
    if (cb) cb();
  }

  // The first event past the guard passes through and ends the swallow.
  _swallowTap(e) {
    if (this._now() - this._closedAt >= STORY_DIALOG.advanceGuardMs) {
      this._removeTapSwallow();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  _removeTapSwallow() {
    for (const type of TAP_EVENTS) document.removeEventListener(type, this._swallowTap, TAP_SWALLOW_OPTS);
  }

  _swallowKeyup(e) {
    e.stopPropagation();
    e.preventDefault();
    this._removeKeyupSwallow();
  }

  // A held key's auto-repeat is still the closing gesture: swallowed, so it
  // neither reaches UIScene (pause) nor activates the button focus went back to.
  _endKeyupSwallow(e) {
    if (e.repeat) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    this._removeKeyupSwallow();
  }

  _removeKeyupSwallow() {
    document.removeEventListener('keyup', this._swallowKeyup, true);
    document.removeEventListener('keydown', this._endKeyupSwallow, true);
  }

  _onFrame() {
    this._frame = 0;
    if (this._flow) this._render(this._flow);
  }

  _stopFrames() {
    if (this._frame) this._caf(this._frame);
    this._frame = 0;
  }

  // A live region that enters the accessibility tree already filled is often
  // never read, so the first line lands a frame after the dialog shows. The id
  // check keeps a frame that fires after its cancel from writing.
  _announceNextFrame(line) {
    const id = this._raf(() => {
      if (this._liveFrame !== id) return;
      this._liveFrame = 0;
      this._live.textContent = line;
    });
    this._liveFrame = id;
  }

  _cancelLiveFrame() {
    if (this._liveFrame) this._caf(this._liveFrame);
    this._liveFrame = 0;
  }

  // view() never resolves completion itself, so every render ticks first.
  _render(state) {
    const now = this._now();
    let flow = tick(state, now, STORY_DIALOG);
    let v = view(flow, now, STORY_DIALOG);
    if (v.index !== this._panelIndex) {
      const motion = this._motion();
      // Motion switched off since play(): this panel shows complete at once.
      if (!motion && v.phase === 'typing') {
        flow = primary(flow, now, STORY_DIALOG);
        v = view(flow, now, STORY_DIALOG);
      }
      this._enterPanel(v, motion);
    }
    this._flow = flow;
    if (this._overlay.dataset.phase !== v.phase) this._overlay.dataset.phase = v.phase;
    if (v.shown !== this._shown) this._writeText(v.shown);
    if (v.phase !== 'typing') this._stopFrames();
    else if (!this._frame) this._frame = this._raf(this._onFrame);
  }

  _enterPanel(v, motion) {
    const look = speakerLook(v.panel.speaker);
    const ds = this._overlay.dataset;
    const first = this._panelIndex === -1;
    this._panelIndex = v.index;
    ds.index = String(v.index);
    ds.speaker = look.frame === null ? 'unknown' : look.id;
    ds.side = look.side;
    ds.shape = look.shape;
    ds.glitch = look.glitch ? '1' : '0';
    ds.transition = v.transition;
    setColourVar(this._overlay, '--sd-frame', look.frame);
    setColourVar(this._overlay, '--sd-caption', look.caption);
    this._overlay.classList.toggle('motion-off', !motion);
    if (motion) replay(this._overlay, `sd-${v.transition}`);
    else this._overlay.classList.remove(...ONE_SHOT_CLASSES);
    this._name.textContent = look.name;
    this._renderPortrait(look);
    this._chars = Array.from(v.panel.text);
    this._shown = -1;
    const line = look.name ? `${look.name}: ${v.panel.text}` : v.panel.text;
    this._cancelLiveFrame();
    if (first) this._announceNextFrame(line);
    else this._live.textContent = line;
    // Last panel: relabel Next to a closing verb.
    this._next.textContent = v.isLast ? 'Continue ▸' : 'Next ▸';
    this._next.setAttribute('aria-label', v.isLast ? 'Continue' : 'Next');
  }

  // Both spans always hold the whole line between them, so the text is laid
  // out once and never re-wraps while typing.
  _writeText(shown) {
    this._shown = shown;
    this._typed.textContent = this._chars.slice(0, shown).join('');
    this._rest.textContent = this._chars.slice(shown).join('');
  }

  _renderPortrait(look) {
    if (look.portrait.kind !== 'image') {
      this._renderInitial(look.portrait.initial);
      return;
    }
    const img = document.createElement('img');
    // Decorative: the live region already names the speaker.
    img.alt = '';
    img.addEventListener('error', () => {
      // A late error from a panel that has since changed must not paint over it.
      if (img.isConnected) this._renderInitial(this._fallbackInitial(look.id));
    }, { once: true });
    img.src = `/${portraitPath(look.portrait.key)}`;
    this._portrait.replaceChildren(img);
  }

  _fallbackInitial(speakerId) {
    return speakerLook(speakerId, STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, NO_PORTRAITS).portrait.initial;
  }

  _renderInitial(initial) {
    const face = document.createElement('span');
    face.className = 'sd-initial';
    face.textContent = initial;
    this._portrait.replaceChildren(face);
  }

  // Back to where the player was, unless that element is gone or hidden (a
  // Story Log entry whose list closed): then focus falls to <body>.
  _restoreFocus() {
    const back = this._returnFocus;
    this._returnFocus = null;
    if (back?.isConnected && back !== document.body) back.focus();
    if (this._overlay.contains(document.activeElement)) document.activeElement.blur();
  }
}
