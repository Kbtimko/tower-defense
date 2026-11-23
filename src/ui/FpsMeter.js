import { FPS_METER } from '../data/fpsMeter.js';
import { createFrameRecorder } from '../systems/frameStats.js';

// Installed in every build (production included): the perf gate drives the
// shipped bundle, which has no ?debug= hooks. Inert unless ?fps=1 is present.
export function installFpsMeter(win = window) {
  if (new URLSearchParams(win.location.search).get('fps') !== '1') return null;

  const recorder = createFrameRecorder({ capacityMs: FPS_METER.capacityMs });
  const el = document.createElement('div');
  el.id = 'fps-meter';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let raf = 0;
  let lastPaint = -Infinity;
  let running = true;
  const loop = (now) => {
    if (!running) return;
    recorder.tick(now);
    if (now - lastPaint >= FPS_METER.refreshMs) {
      lastPaint = now;
      const s = recorder.stats(FPS_METER.windowMs);
      el.textContent = `${s.fps} fps · p95 ${s.p95} ms`;
    }
    raf = win.requestAnimationFrame(loop);
  };
  raf = win.requestAnimationFrame(loop);
  win.__fps = { stats: (ms) => recorder.stats(ms) };

  return {
    destroy() {
      running = false;
      if (win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
