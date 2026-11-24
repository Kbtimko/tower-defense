// Element fullscreen with the webkit-prefixed fallback. iPhone Safari exposes neither,
// so callers hide the control when fullscreenSupported() is false.
export function fullscreenSupported(doc) {
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(doc) {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

// Orientation lock is unsupported on most browsers and rejects outside fullscreen on
// others; it is a nicety, so it must never surface as an error.
async function lockLandscape(orientation) {
  try {
    await orientation?.lock?.('landscape');
  } catch {
    // best effort
  }
}

export async function toggleFullscreen(doc, el, orientation) {
  if (isFullscreen(doc)) {
    await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    return;
  }
  await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  await lockLandscape(orientation);
}
