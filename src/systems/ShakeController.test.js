import { describe, it, expect, vi, afterEach } from 'vitest';
import { ShakeController } from './ShakeController.js';
import { setRenderScale } from './renderScale.js';

afterEach(() => setRenderScale(1));

function makeScene() {
  const camShake = vi.fn();
  const events = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, off() {}, emit(e, p) { if (this.handlers[e]) this.handlers[e](p); } };
  return { events, cameras: { main: { shake: camShake } }, _shake: camShake };
}

describe('ShakeController', () => {
  it('boss-died triggers 600ms heavy shake', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('boss-died', { bossType: 'titan' });
    expect(scene._shake).toHaveBeenCalledWith(600, 0.020);
  });

  it('airstrike-impact triggers 250ms medium shake', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('airstrike-impact', { x: 100, y: 100 });
    expect(scene._shake).toHaveBeenCalledWith(250, 0.012);
  });

  it('emp-pulse triggers 200ms low-frequency rumble', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('emp-pulse', { x: 0, y: 0, radius: 80 });
    expect(scene._shake).toHaveBeenCalledWith(200, 0.008);
  });

  it('divides intensity by k^2 at k=2 (Phaser scales the offset by width and zoom)', () => {
    const scene = makeScene();
    new ShakeController(scene);
    setRenderScale(2); // set after construction: k is read at shake time
    scene.events.emit('boss-died', { bossType: 'titan' });
    expect(scene._shake).toHaveBeenCalledWith(600, 0.020 / 4);
  });
});
