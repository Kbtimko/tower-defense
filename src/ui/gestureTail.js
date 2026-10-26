// The tail of the gesture that left a screen (roadmap 3.6, spec §5.9, §7.4).
// Module-level, so it outlives the scene that armed it: a RETRY restarts the
// scene, and the second tap of a double tap must not land on the new level.

// Touch events too: Phaser reads touchstart/touchend, not pointer events.
const TAP_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'];
// Non-passive, or Chrome treats a document touchstart as passive and ignores preventDefault.
const TAP_OPTS = { capture: true, passive: false };

let clock = null;
let armedAt = 0;
let windowMs = 0;

function swallow(e) {
  e.preventDefault();
  e.stopPropagation();
}

// A timestamp, not a timer: the first event at or after the window passes and ends it.
function onTap(e) {
  if (clock() - armedAt >= windowMs) {
    removeTapTail();
    return;
  }
  swallow(e);
}

function removeTapTail() {
  for (const type of TAP_EVENTS) document.removeEventListener(type, onTap, TAP_OPTS);
}

// The releasing keyup would activate whatever has focus next (a native button's Space).
function onKeyup(e) {
  swallow(e);
  removeKeyTail();
}

// A held key's auto-repeat is still the leaving gesture; a fresh press is a new one.
function onKeydown(e) {
  if (e.repeat) {
    swallow(e);
    return;
  }
  removeKeyTail();
}

function removeKeyTail() {
  document.removeEventListener('keyup', onKeyup, true);
  document.removeEventListener('keydown', onKeydown, true);
}

export function armGestureTail({ now, windowMs: ms, key }) {
  disarmGestureTail();
  clock = now;
  armedAt = now();
  windowMs = ms;
  for (const type of TAP_EVENTS) document.addEventListener(type, onTap, TAP_OPTS);
  if (key) {
    document.addEventListener('keyup', onKeyup, true);
    document.addEventListener('keydown', onKeydown, true);
  }
}

export function disarmGestureTail() {
  removeTapTail();
  removeKeyTail();
}
