import { LONG_PRESS_MS, TAP_SLOP_PX } from '../data/input.js';

const isTouchLike = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

// DOM counterpart of the canvas long-press: touch/pen only (a mouse has hover),
// and a long-press never also performs the control's primary action — the click
// the browser synthesises on release is swallowed. Returns detach().
export function attachLongPress(el, { onLongPress, onEnd, ms = LONG_PRESS_MS, slopPx = TAP_SLOP_PX }) {
  let timer = null;
  let pressing = false;
  let fired = false;
  let startX = 0;
  let startY = 0;

  // Capture phase on the element itself: fires before the owner's own
  // (bubble-phase) click handler, including when `el` is an ancestor wrapper
  // of the button that was actually pressed.
  const swallowClick = (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    el.removeEventListener('click', swallowClick, true);
  };

  const clearTimer = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  const onDown = (e) => {
    if (!isTouchLike(e)) return;
    // A stale swallower from a long-press whose click never arrived must not eat
    // this press's click.
    el.removeEventListener('click', swallowClick, true);
    clearTimer();
    pressing = true;
    fired = false;
    startX = e.clientX ?? 0;
    startY = e.clientY ?? 0;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      el.addEventListener('click', swallowClick, true);
      onLongPress(el);
    }, ms);
  };

  const onMove = (e) => {
    if (timer === null) return;
    if (Math.hypot((e.clientX ?? 0) - startX, (e.clientY ?? 0) - startY) > slopPx) clearTimer();
  };

  const finish = (cancelled) => {
    clearTimer();
    pressing = false;
    if (!fired) return;
    fired = false;
    // pointercancel means no click will follow, so nothing to swallow.
    if (cancelled) el.removeEventListener('click', swallowClick, true);
    onEnd?.(el);
  };
  const onUp     = () => finish(false);
  const onCancel = () => finish(true);

  // Android/iOS open a context menu on a long hold; keep it off while pressing.
  const onContextMenu = (e) => { if (pressing) e.preventDefault(); };

  const handlers = [
    ['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp],
    ['pointercancel', onCancel], ['contextmenu', onContextMenu],
  ];
  for (const [evt, fn] of handlers) el.addEventListener(evt, fn);

  return function detach() {
    clearTimer();
    for (const [evt, fn] of handlers) el.removeEventListener(evt, fn);
    el.removeEventListener('click', swallowClick, true);
  };
}
