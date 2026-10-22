// Wraps `fn` so any number of calls before the next frame run it once. A
// resize drag fires dozens of events per frame; only the last layout matters.
export function coalesceFrame(fn, raf = requestAnimationFrame) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    raf(() => {
      queued = false;
      fn();
    });
  };
}
