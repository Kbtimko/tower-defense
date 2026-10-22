// Phone in portrait: the game is landscape-only, so this shows the rotate prompt.
export const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse)';
// Landscape phones are ~340-430 px tall; tablets and desktops are taller.
export const COMPACT_MAX_HEIGHT_PX = 500;
export const COMPACT_QUERY = `(max-height: ${COMPACT_MAX_HEIGHT_PX}px)`;
// minimum-scale=1 stops the browser shrinking-to-fit (and staying zoomed out after a
// rotation); maximum-scale/user-scalable stop pinch and double-tap zoom.
export const VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
