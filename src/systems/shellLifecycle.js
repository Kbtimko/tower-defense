// Pure decisions for the mobile shell's lifecycle, kept out of Phaser so they unit-test.

// Auto-pause only ever PAUSES. Coming back (tab visible, device rotated to landscape)
// leaves the PAUSED overlay up so the player resumes when ready, not mid-wave.
export function shouldAutoPause({ hidden, phonePortrait, inLevel, userPaused, over }) {
  if (!inLevel || over || userPaused) return false;
  return Boolean(hidden || phonePortrait);
}

// Phaser's WebAudioSoundManager already resumes suspended/interrupted contexts every
// frame while the game has focus (onFocus), including after iOS interrupts audio. What
// it cannot do is resume from inside a user-activation gesture, which is the only time
// iOS Safari reliably allows it. main.js calls this on pointerup/touchend (pointerdown
// from touch does not count as an activation), so a context Phaser could not revive
// is unlocked by the next tap.
export function resumeAudio(ctx) {
  if (!ctx || (ctx.state !== 'suspended' && ctx.state !== 'interrupted')) return;
  // resume() can reject when there was no user gesture yet; the next tap retries.
  ctx.resume()?.catch?.(() => {});
}
