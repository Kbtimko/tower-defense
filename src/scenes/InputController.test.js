import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputController } from './InputController.js';
import { LONG_PRESS_MS, PEEK_LINGER_MS, TAP_SLOP_PX } from '../data/input.js';
import { RAIL_WIDTH } from '../data/layout.js';

// Stand-in for Phaser's InputPlugin: records listeners by event so a test can
// fire them with the registered context, and drops them on a matching off().
function makeInput() {
  const handlers = new Map();
  return {
    handlers,
    on: vi.fn((evt, fn, ctx) => { handlers.set(evt, { fn, ctx }); }),
    off: vi.fn((evt, fn, ctx) => {
      const h = handlers.get(evt);
      if (h && h.fn === fn && h.ctx === ctx) handlers.delete(evt);
    }),
    fire(evt, pointer) {
      const h = handlers.get(evt);
      if (h) h.fn.call(h.ctx, pointer);
    },
  };
}

function makeEvents() {
  const handlers = new Map();
  return {
    on: vi.fn((evt, fn) => { handlers.set(evt, fn); }),
    off: vi.fn((evt, fn) => { if (handlers.get(evt) === fn) handlers.delete(evt); }),
    has: (evt) => handlers.has(evt),
    emit: (evt) => handlers.get(evt)?.(),
  };
}

function makeScene(displayScale = 1) {
  return {
    input: makeInput(),
    events: makeEvents(),
    scale: { displayScale: { x: displayScale, y: displayScale } },
    inspector: {
      onPointerMove: vi.fn(),
      inspectableAt: vi.fn(() => HIT),
      peekHit: vi.fn(() => true),
      hidePeek: vi.fn(),
    },
    _onTap: vi.fn(),
    _buildCursorX: 0,
    _buildCursorY: 0,
  };
}

const HIT = { kind: 'enemy', target: { x: 100, y: 100 } };

const MAP_CAMERA = { id: 'main' };

// x/y here are WORLD coords; Phaser's pointer.x/y are canvas px, offset by the
// left rail, so a handler that read pointer.x would land RAIL_WIDTH off. Phaser
// leaves pointer.camera undefined (and worldX stale) over no camera, i.e. a rail.
const ptr = (x, y, { touch = false, id = 1, eventType, offMap = false } = {}) => ({
  id, x: x + RAIL_WIDTH, y, worldX: x, worldY: y, wasTouch: touch,
  camera: offMap ? undefined : MAP_CAMERA,
  event: { type: eventType ?? (touch ? 'touchend' : 'mouseup') },
});

describe('InputController', () => {
  let scene, ctl;
  beforeEach(() => {
    vi.useFakeTimers();
    scene = makeScene();
    ctl = new InputController(scene);
  });
  afterEach(() => {
    ctl.destroy();
    vi.useRealTimers();
  });

  const press = (x, y, opts) => scene.input.fire('pointerdown', ptr(x, y, opts));
  const move  = (x, y, opts) => scene.input.fire('pointermove', ptr(x, y, opts));
  const release = (x, y, opts) => scene.input.fire('pointerup', ptr(x, y, opts));

  it('registers down, move, up and up-outside on the scene input', () => {
    expect([...scene.input.handlers.keys()].sort())
      .toEqual(['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']);
  });

  describe('tap', () => {
    it('resolves on release, not on press', () => {
      press(100, 120);
      expect(scene._onTap).not.toHaveBeenCalled();
      release(100, 120);
      expect(scene._onTap).toHaveBeenCalledTimes(1);
      expect(scene._onTap).toHaveBeenCalledWith(100, 120);
    });

    it('a touch tap shorter than the long-press resolves as a tap', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      release(100, 100, { touch: true });
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
      expect(scene._onTap).toHaveBeenCalledWith(100, 100);
    });

    it('a slow mouse click is still a click: no long-press on desktop', () => {
      press(100, 100);
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      release(100, 100);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
      expect(scene._onTap).toHaveBeenCalledWith(100, 100);
    });

    it('a release with no press on this scene does nothing', () => {
      release(100, 100);
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('ignores a release from a different pointer', () => {
      press(100, 100, { touch: true, id: 1 });
      release(100, 100, { touch: true, id: 2 });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('a touchcancel (the OS took the touch) never resolves as a tap', () => {
      press(100, 100, { touch: true });
      release(100, 100, { touch: true, eventType: 'touchcancel' });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('a release off the canvas resolves nothing and clears the press', () => {
      press(100, 100, { touch: true });
      scene.input.fire('pointerupoutside', ptr(100, 100, { touch: true }));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true });
      expect(scene._onTap).not.toHaveBeenCalled();
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });
  });

  describe('outside the map viewport (a rail)', () => {
    it('a tap pressed and released over a rail resolves nothing', () => {
      press(-50, 100, { offMap: true });
      release(-50, 100, { offMap: true });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('a press on the map released over a rail resolves nothing', () => {
      press(100, 100, { touch: true });
      release(100, 100, { touch: true, offMap: true });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('a touch press over a rail never hit-tests or peeks', () => {
      press(-50, 100, { touch: true, offMap: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.inspectableAt).not.toHaveBeenCalled();
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });

    it('a move over a rail leaves the build cursor and hover peek alone', () => {
      move(30, 40);
      move(999, 999, { offMap: true });
      expect([scene._buildCursorX, scene._buildCursorY]).toEqual([30, 40]);
      expect(scene.inspector.onPointerMove).toHaveBeenCalledTimes(1);
    });

    it('a long-press released over a rail still lingers then hides', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true, offMap: true });
      vi.advanceTimersByTime(PEEK_LINGER_MS);
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });
  });

  describe('long-press (touch)', () => {
    it('peeks at the press point and swallows the release', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).toHaveBeenCalledWith(HIT);
      release(100, 100, { touch: true });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('keeps the peek for PEEK_LINGER_MS after release, then hides it', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true });
      vi.advanceTimersByTime(PEEK_LINGER_MS - 1);
      expect(scene.inspector.hidePeek).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });

    it('hit-tests at the press, so an enemy that moves away is still peeked', () => {
      press(100, 100, { touch: true });
      expect(scene.inspector.inspectableAt).toHaveBeenCalledWith(100, 100);
      HIT.target.x = 160; // walked 60px during the hold, far outside its hit radius
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).toHaveBeenCalledWith(HIT);
      release(100, 100, { touch: true });
      expect(scene._onTap).not.toHaveBeenCalled();
      HIT.target.x = 100;
    });

    it('a slow press on empty ground is not an inspect gesture: it taps at release', () => {
      scene.inspector.inspectableAt.mockReturnValue(null);
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
      release(100, 100, { touch: true });
      expect(scene._onTap).toHaveBeenCalledWith(100, 100);
    });

    it('a pause mid-hold clears the timer, the press and a shown peek', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).toHaveBeenCalledTimes(1);
      scene.events.emit('pause');
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
      release(100, 100, { touch: true });
      expect(scene._onTap).not.toHaveBeenCalled();
    });

    it('a pause before the timer fires means no peek ever shows', () => {
      press(100, 100, { touch: true });
      scene.events.emit('pause');
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });

    it('destroy removes the pause listener', () => {
      expect(scene.events.has('pause')).toBe(true);
      ctl.destroy();
      expect(scene.events.has('pause')).toBe(false);
    });

    it('a target gone by the time it fires shows no peek but still consumes the press', () => {
      scene.inspector.peekHit.mockReturnValue(false);
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true });
      expect(scene._onTap).not.toHaveBeenCalled();
      vi.advanceTimersByTime(PEEK_LINGER_MS);
      expect(scene.inspector.hidePeek).not.toHaveBeenCalled();
    });

    it('a mouse press never runs the long-press hit test', () => {
      press(100, 100);
      expect(scene.inspector.inspectableAt).not.toHaveBeenCalled();
    });

    it('the next press hides a lingering peek straight away', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true });
      press(300, 300, { touch: true });
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(PEEK_LINGER_MS);
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });

    it('a release off the canvas after a long-press still lingers then hides', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      scene.input.fire('pointerupoutside', ptr(100, 100, { touch: true }));
      vi.advanceTimersByTime(PEEK_LINGER_MS);
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });
  });

  describe('drag', () => {
    it('beyond slop cancels the long-press and resolves at the release point', () => {
      press(100, 100, { touch: true });
      move(150, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      release(150, 100, { touch: true });
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
      expect(scene._onTap).toHaveBeenCalledWith(150, 100);
    });

    it('jitter within slop keeps the long-press', () => {
      press(100, 100, { touch: true });
      move(100 + TAP_SLOP_PX, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).toHaveBeenCalledWith(HIT);
    });

    it('measures slop in CSS px, so a scaled-up canvas does not tighten it', () => {
      ctl.destroy();
      scene = makeScene(3);
      ctl = new InputController(scene);
      press(100, 100, { touch: true });
      // 30 game px at displayScale 3 is 10 CSS px: still within slop.
      move(130, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).toHaveBeenCalled();
    });

    it('a scaled drag past slop in CSS px cancels the long-press', () => {
      ctl.destroy();
      scene = makeScene(3);
      ctl = new InputController(scene);
      press(100, 100, { touch: true });
      move(100 + (TAP_SLOP_PX + 1) * 3, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });
  });

  describe('pointer move', () => {
    it('updates the build cursor on press and move', () => {
      press(10, 20, { touch: true });
      expect([scene._buildCursorX, scene._buildCursorY]).toEqual([10, 20]);
      move(30, 40);
      expect([scene._buildCursorX, scene._buildCursorY]).toEqual([30, 40]);
    });

    it('drives the hover peek for a mouse', () => {
      move(30, 40);
      expect(scene.inspector.onPointerMove).toHaveBeenCalledWith(30, 40);
    });

    it('does not hover-peek for a finger', () => {
      move(30, 40, { touch: true });
      expect(scene.inspector.onPointerMove).not.toHaveBeenCalled();
    });
  });

  describe('timers and teardown', () => {
    it('clears the long-press timer on release', () => {
      press(100, 100, { touch: true });
      release(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });

    it('destroy removes every listener it added', () => {
      const added = scene.input.on.mock.calls.map(([evt, fn, c]) => [evt, fn, c]);
      ctl.destroy();
      expect(scene.input.off.mock.calls).toEqual(added);
      expect(scene.input.handlers.size).toBe(0);
    });

    it('destroy clears a pending long-press', () => {
      press(100, 100, { touch: true });
      ctl.destroy();
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(scene.inspector.peekHit).not.toHaveBeenCalled();
    });

    it('destroy hides a peek still held under the finger', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      ctl.destroy();
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });

    it('a second finger down during a held long-press hides its peek', () => {
      press(100, 100, { touch: true, id: 1 });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      press(300, 300, { touch: true, id: 2 });
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });

    it('destroy hides a lingering peek now rather than leaving it up', () => {
      press(100, 100, { touch: true });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      release(100, 100, { touch: true });
      ctl.destroy();
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(PEEK_LINGER_MS);
      expect(scene.inspector.hidePeek).toHaveBeenCalledTimes(1);
    });
  });
});
