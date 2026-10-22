// Pure decisions for the mobile shell's lifecycle, kept out of Phaser so they unit-test.

// Auto-pause only ever PAUSES. Coming back (tab visible, device rotated to landscape)
// leaves the PAUSED overlay up so the player resumes when ready, not mid-wave.
export function shouldAutoPause({ hidden, phonePortrait, inLevel, userPaused, over }) {
  if (!inLevel || over || userPaused) return false;
  return Boolean(hidden || phonePortrait);
}

// Phaser's WebAudioSoundManager.unlock() already resumes the context on the first
// touch/mouse/key (then removes its handlers). It does NOT cover a context that iOS
// later leaves 'interrupted' (call, lock screen) or re-suspends, so main.js calls this
// on every tap and on returning to the tab.
export function resumeAudio(ctx) {
  if (!ctx || (ctx.state !== 'suspended' && ctx.state !== 'interrupted')) return;
  // resume() can reject when there was no user gesture yet; the next tap retries.
  ctx.resume()?.catch?.(() => {});
}
