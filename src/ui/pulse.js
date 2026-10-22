// Restarts a CSS keyframe animation on an element that may already be playing it.
// Removing the class, reading offsetWidth, then re-adding forces a style flush in
// between, so the browser sees the animation as new rather than coalescing the
// two class changes and ignoring the second one.
export function pulseClass(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
