import { RESULTS, RESULTS_COPY } from '../data/results.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { STORY_DIALOG, SPEAKER_LOOK_DEFAULTS } from '../data/storyDialog.js';
import { resultsTimeline } from '../systems/resultsTimeline.js';
import { openFlow, tickFlow, pressFlow } from '../systems/resultsFlow.js';
import { speakerLook } from '../systems/speakerLook.js';
import { portraitPath } from '../systems/portraitFallback.js';
import { isBrowserShortcut } from './browserShortcut.js';
import { armGestureTail } from './gestureTail.js';

const ACTION_IDS = ['next', 'retry', 'map'];
const ROOT_DATA = ['result', 'final', 'phase', 'stars', 'speaker', 'shape', 'glitch'];
const NO_PORTRAITS = new Set();
const ACT_KEYS = new Set(['Enter', ' ', 'Escape', 'Tab']);

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// starMs -> --rs-star-ms: 350ms. JS stays the single source of the numbers the
// CSS animates with (3.5's publishTimings). A Deg key also gets its tangent, so
// the CSS can reserve the skew bleed without tan() (which a colour guard reads
// as the named colour "tan").
function publishResultVars(el, cfg) {
  for (const [key, value] of Object.entries(cfg)) {
    if (typeof value !== 'number') continue;
    const name = `--rs-${kebab(key)}`;
    if (key.endsWith('Deg')) {
      el.style.setProperty(name, `${value}deg`);
      el.style.setProperty(`${name.slice(0, -4)}-tan`, String(Math.tan((value * Math.PI) / 180)));
    } else if (key.endsWith('Ms')) el.style.setProperty(name, `${value}ms`);
    else el.style.setProperty(name, String(value));
  }
  el.style.setProperty('--rs-glitch-period-ms', `${STORY_DIALOG.glitchPeriodMs}ms`);
}

function setColourVar(el, name, value) {
  if (value) el.style.setProperty(name, value);
  else el.style.removeProperty(name);
}

const setAt = (el, beat) => el.style.setProperty('--rs-at', `${beat.at}ms`);

export class ResultsScreen {
  constructor({
    motion = () => true,
    now = () => performance.now(),
    raf = (cb) => requestAnimationFrame(cb),
    caf = (id) => cancelAnimationFrame(id),
    root = document.getElementById('results'),
  } = {}) {
    this._root = root;
    const byId = (id) => root.querySelector(`#${id}`);
    this._kicker = byId('results-kicker');
    this._bannerText = byId('results-banner-text');
    this._banner = this._bannerText.parentElement;
    this._starsEl = byId('results-stars');
    this._stars = [...this._starsEl.querySelectorAll('.rs-star')];
    this._chips = byId('results-chips');
    this._caption = byId('results-caption');
    this._portrait = byId('results-portrait');
    this._speaker = byId('results-speaker');
    this._line = byId('results-line');
    this._actions = byId('results-actions');
    this._live = byId('results-live');
    this._buttons = Object.fromEntries(ACTION_IDS.map((id) => [id, byId(`results-${id}`)]));
    this._motion = motion;
    this._now = now;
    this._raf = raf;
    this._caf = caf;
    this._flow = null;
    this._onAction = null;
    this._primaryId = null;
    this._frame = 0;
    this._liveFrame = 0;
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onFrame = this._onFrame.bind(this);
  }

  open(model, onAction) {
    this.close();
    const timeline = resultsTimeline(model.result);
    const motion = this._motion();
    this._onAction = onAction;
    this._render(model, timeline);
    this._root.classList.toggle('motion-off', !motion);
    this._root.addEventListener('click', this._onClick);
    document.addEventListener('keydown', this._onKeyDown, true);
    this._root.hidden = false;
    this._root.focus();
    this._announceNextFrame(model.announcement);
    this._flow = openFlow(this._now(), { motion, endMs: timeline.endMs });
    this._sync();
  }

  close() {
    this._root.removeEventListener('click', this._onClick);
    document.removeEventListener('keydown', this._onKeyDown, true);
    this._stopFrames();
    this._cancelLiveFrame();
    this._live.textContent = '';
    this._root.classList.remove('rs-done', 'motion-off');
    for (const k of ROOT_DATA) delete this._root.dataset[k];
    this._root.hidden = true;
    if (this._root.contains(document.activeElement)) document.activeElement.blur();
    this._flow = null;
    this._onAction = null;
  }

  _render(model, timeline) {
    const ds = this._root.dataset;
    ds.result = model.result;
    ds.final = model.final ? '1' : '0';
    ds.stars = String(model.stars);
    publishResultVars(this._root, RESULTS);
    this._kicker.textContent = model.kicker;
    this._bannerText.textContent = model.bannerText;
    setAt(this._banner, timeline.banner);
    setAt(this._bannerText, timeline.shake ?? timeline.banner);
    this._starsEl.setAttribute('aria-label', model.starsLabel);
    this._stars.forEach((star, i) => {
      star.dataset.earned = i < model.stars ? '1' : '0';
      if (timeline.stars[i]) setAt(star, timeline.stars[i]);
    });
    this._renderChips(model.chips, timeline);
    this._renderSpeaker(model);
    setAt(this._caption, timeline.caption);
    setAt(this._actions, timeline.actions);
    this._renderActions(model.actions);
  }

  _renderChips(chips, timeline) {
    this._chips.replaceChildren(...chips.map((chip, i) => {
      const li = document.createElement('li');
      li.className = 'rs-chip rs-reveal';
      li.dataset.chip = chip.id;
      setAt(li, timeline.chips[i]);
      const val = document.createElement('b');
      val.className = 'rs-chip-val';
      val.textContent = chip.value;
      const lbl = document.createElement('span');
      lbl.className = 'rs-chip-lbl';
      lbl.textContent = chip.label;
      const stamp = document.createElement('span');
      stamp.className = 'rs-new-best rs-reveal';
      stamp.textContent = RESULTS_COPY.newBest;
      stamp.hidden = !chip.newBest;
      if (timeline.newBest) setAt(stamp, timeline.newBest[i]);
      li.append(val, lbl, stamp);
      return li;
    }));
  }

  _renderSpeaker(model) {
    const look = speakerLook(model.speaker);
    const ds = this._root.dataset;
    ds.speaker = look.frame === null ? 'unknown' : look.id;
    ds.shape = look.shape;
    ds.glitch = look.glitch ? '1' : '0';
    setColourVar(this._root, '--rs-frame', look.frame);
    setColourVar(this._root, '--rs-caption', look.caption);
    this._speaker.textContent = look.name;
    this._line.textContent = model.line;
    this._renderPortrait(look);
  }

  // Primary first in DOM order, so Tab order and the stack match what is drawn.
  // Labels are set here once and never change mid-reveal.
  _renderActions(actions) {
    const shown = new Set(actions.map((a) => a.id));
    for (const a of actions) {
      const btn = this._buttons[a.id];
      btn.hidden = false;
      btn.textContent = a.label;
      btn.setAttribute('aria-label', a.name);
      btn.classList.toggle('rs-btn--primary', a.primary);
      if (a.primary) this._primaryId = a.id;
    }
    for (const id of ACTION_IDS) {
      if (shown.has(id)) continue;
      this._buttons[id].hidden = true;
      this._buttons[id].classList.remove('rs-btn--primary');
    }
    this._actions.append(...actions.map((a) => this._buttons[a.id]),
      ...ACTION_IDS.filter((id) => !shown.has(id)).map((id) => this._buttons[id]));
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
      // A late error from a since-replaced portrait must not paint over it.
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
    face.className = 'rs-initial';
    face.textContent = initial;
    this._portrait.replaceChildren(face);
  }

  // Click is the last event of a tap, so acting here leaves nothing of the
  // gesture to land on the level below. Any tap while revealing only finishes,
  // including one on a still-invisible button.
  _onClick(e) {
    if (e.defaultPrevented || !this._flow) return;
    this._tick();
    const btn = e.target.closest('.rs-btn');
    if (this._flow.phase === 'ready' && !(btn && !btn.hidden)) return;
    this._press(e, () => btn.id.replace('results-', ''));
  }

  // Capture phase on document: runs before UIScene's document listener and stops
  // the event before Phaser's window listener, so no game key fires underneath.
  _onKeyDown(e) {
    if (e.defaultPrevented || isBrowserShortcut(e)) return;
    e.stopPropagation();
    if (!ACT_KEYS.has(e.key)) return;
    // Also stops a focused button's native activation, which would act twice.
    e.preventDefault();
    if (e.repeat) return;
    this._tick();
    if (e.key === 'Tab') {
      if (this._flow.phase === 'ready') this._wrapFocus(e.shiftKey);
      return;
    }
    this._press(e, () => (e.key === 'Escape' ? 'map' : this._focusedActionId()));
  }

  _focusedActionId() {
    const id = ACTION_IDS.find((a) => this._buttons[a] === document.activeElement && !this._buttons[a].hidden);
    return id ?? this._primaryId;
  }

  _visibleButtons() {
    return [...this._actions.querySelectorAll('.rs-btn')].filter((b) => !b.hidden);
  }

  _wrapFocus(backwards) {
    const list = this._visibleButtons();
    const i = list.indexOf(document.activeElement);
    const next = i < 0
      ? (backwards ? list.length - 1 : 0)
      : (i + (backwards ? -1 : 1) + list.length) % list.length;
    list[next].focus();
  }

  _press(e, actionId) {
    const { state, act } = pressFlow(this._flow, this._now(), RESULTS);
    this._flow = state;
    if (!act) {
      this._sync();
      return;
    }
    const id = actionId();
    const cb = this._onAction;
    this.close();
    armGestureTail({ now: this._now, windowMs: RESULTS.actGuardMs, key: e.type === 'keydown' });
    cb(id);
  }

  _onFrame() {
    this._frame = 0;
    if (this._flow) this._tick();
  }

  // Input is dispatched before rAF, so after a stall the stored phase can be stale:
  // every decision ticks first, or a ready screen would be judged as revealing.
  _tick() {
    this._flow = tickFlow(this._flow, this._now());
    this._sync();
  }

  // Applies the flow's phase to the DOM; the rAF loop runs only while revealing.
  _sync() {
    const phase = this._flow.phase;
    if (this._root.dataset.phase === phase) {
      if (phase === 'revealing' && !this._frame) this._frame = this._raf(this._onFrame);
      return;
    }
    this._root.dataset.phase = phase;
    if (phase === 'revealing') {
      this._frame = this._raf(this._onFrame);
      return;
    }
    this._stopFrames();
    this._root.classList.add('rs-done');
    this._buttons[this._primaryId].focus();
  }

  _stopFrames() {
    if (this._frame) this._caf(this._frame);
    this._frame = 0;
  }

  // A live region that enters the accessibility tree already filled is often
  // never read, so the announcement lands a frame after open. The id check keeps
  // a frame that fires after its cancel from writing.
  _announceNextFrame(text) {
    const id = this._raf(() => {
      if (this._liveFrame !== id) return;
      this._liveFrame = 0;
      this._live.textContent = text;
    });
    this._liveFrame = id;
  }

  _cancelLiveFrame() {
    if (this._liveFrame) this._caf(this._liveFrame);
    this._liveFrame = 0;
  }
}
