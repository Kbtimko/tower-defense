import { attachLongPress } from './longPress.js';
import { PEEK_LINGER_MS, PANEL_EDGE_MARGIN, PEEK_GAP_PX } from '../data/input.js';
import { isKeyboardFocus } from './keyboardFocus.js';
import { placeLeftOf, placeRightOf } from '../systems/viewport.js';
import { railAnchorRect } from './hudLayer.js';

// One shared #hint-peek replaces native title= tooltips, which never show on
// touch. Module state (not a class) because every owner shares the one element
// and the one Esc listener; each owner only holds its own detach().
let attached = 0;
let lingerTimer = null;

const peekEl = () => document.getElementById('hint-peek');

function clearLinger() {
  if (lingerTimer !== null) { clearTimeout(lingerTimer); lingerTimer = null; }
}

function hide() {
  clearLinger();
  const el = peekEl();
  if (!el) return;
  el.classList.remove('shown');
  el.setAttribute('aria-hidden', 'true');
}

const onEsc = (e) => { if (e.key === 'Escape') hide(); };

// The right rail's controls open the card to their left, the left rail's to
// their right, so it always lands over the map rather than off-screen.
function position(el, anchor) {
  const place = anchor.closest('#rail-right') ? placeLeftOf : placeRightOf;
  const { left, top } = place({
    anchor: railAnchorRect(anchor),
    size: { width: el.offsetWidth, height: el.offsetHeight },
    area: { width: window.innerWidth, height: window.innerHeight },
    gap: PEEK_GAP_PX,
    margin: PANEL_EDGE_MARGIN,
  });
  el.style.left = `${left}px`;
  el.style.top  = `${top}px`;
}

function show(anchor, getText) {
  const el = peekEl();
  const text = getText();
  if (!el || !text) return;
  clearLinger();
  el.textContent = text;
  // Shown BEFORE positioning: display:none would measure 0 and hang the card
  // off the viewport.
  el.classList.add('shown');
  el.setAttribute('aria-hidden', 'false');
  position(el, anchor);
}

// Text is a getter, read at show time, so a changing value (hero XP) is never stale.
export function attachHint(anchor, getText) {
  if (!anchor) return () => {};
  const display = () => show(anchor, getText);
  // A touch fires pointerenter on every tap; touch peeks via long-press instead.
  const hoverShow = (e) => { if (e.pointerType === 'mouse') display(); };
  const hoverHide = (e) => { if (e.pointerType === 'mouse') hide(); };
  // Keyboard focus only: a tap focuses a tabindex wrapper too.
  const focusShow = (e) => { if (isKeyboardFocus(e)) display(); };
  const listeners = [['pointerenter', hoverShow], ['pointerleave', hoverHide], ['focusin', focusShow], ['focusout', hide]];
  for (const [evt, fn] of listeners) anchor.addEventListener(evt, fn);
  const detachLongPress = attachLongPress(anchor, {
    onLongPress: display,
    onEnd: () => {
      clearLinger();
      lingerTimer = setTimeout(hide, PEEK_LINGER_MS);
    },
  });
  if (attached++ === 0) document.addEventListener('keydown', onEsc);

  let done = false;
  return function detach() {
    if (done) return;
    done = true;
    for (const [evt, fn] of listeners) anchor.removeEventListener(evt, fn);
    detachLongPress();
    hide();
    if (--attached === 0) document.removeEventListener('keydown', onEsc);
  };
}
