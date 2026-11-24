// Pure typewriter timing. Code points (not UTF-16 units) so an emoji is one
// step and a surrogate pair is never split.

// Pause applies AFTER a punctuation char: it delays every later character.
export function revealTimes(text, cfg) {
  const { msPerChar, punctPauseMs, punctChars } = cfg;
  let pauses = 0;
  return Array.from(text).map((ch, i) => {
    const t = i * msPerChar + pauses * punctPauseMs;
    if (punctChars.includes(ch)) pauses += 1;
    return t;
  });
}

export function typeDurationMs(text, cfg) {
  const times = revealTimes(text, cfg);
  return times.length === 0 ? 0 : times[times.length - 1] + cfg.msPerChar;
}

// Chars whose reveal time is strictly before elapsedMs, so t=0 shows none.
export function charsShown(text, elapsedMs, cfg) {
  if (!(elapsedMs > 0)) return 0;
  const times = revealTimes(text, cfg);
  if (elapsedMs >= typeDurationMs(text, cfg)) return times.length;
  let n = 0;
  while (n < times.length && times[n] < elapsedMs) n += 1;
  return n;
}
