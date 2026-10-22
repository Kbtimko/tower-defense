// focusin also fires when a touch/mouse tap focuses a tabindex wrapper, which
// must not open a hover card. :focus-visible is true only for keyboard focus.
// Browsers without the pseudo (or jsdom's selector engine) throw: treat that
// as keyboard focus so the card stays reachable rather than silently dead.
export function isKeyboardFocus(e) {
  try {
    return e.target.matches(':focus-visible');
  } catch {
    return true;
  }
}
