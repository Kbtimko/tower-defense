import { LONG_PRESS_MS, PEEK_LINGER_MS } from '../data/input.js';
import { classifyGesture } from '../systems/inputGesture.js';

// Owns GameScene's canvas pointer listeners. A press resolves on RELEASE, so a
// finger can be read (long-press peek) before it commits to an action.
//
// Gesture -> action, in every mode (build, aim, reposition, none):
//  - tap: scene._onTap at the release point.
//  - drag (moved past slop): cancels the long-press, then resolves exactly like
//    a tap at the release point — press-drag-release places/aims where the
//    finger lifts. A mouse click is never a drag in practice, so desktop is
//    unchanged.
//  - long-press (touch only, held still): when the press landed on an
//    inspectable target it swallows the release, so an inspect hold never moves
//    the hero, fires an armed aim or cancels a build. The target is hit-tested at
//    the press (enemies walk 17-81px in 450ms, well past their 11-15px hit
//    radius) and peeked where it is when the timer fires; if it died during the
//    hold the press is still consumed. A slow press on empty ground is NOT an
//    inspect gesture: it resolves as a normal tap at release (a deliberate,
//    unhurried placement must still work). Mouse gets no long-press: hover
//    already peeks, and a slow click must stay a click.
//
// Phaser still fires canvas events over the side rails, outside every camera
// viewport, but then leaves pointer.camera unset and worldX/Y stale from the
// last in-map event — so a rail press is ignored and a rail release counts as
// released off the canvas.
function overMap(pointer) {
  return !!pointer.camera;
}

export class InputController {
  constructor(scene) {
    this.scene = scene;
    this._press = null;
    this._longPressTimer = null;
    this._lingerTimer = null;
    this._peekShown = false;
    this._onLongPress = this._onLongPress.bind(this);
    this._hidePeek = this._hidePeek.bind(this);
    this._onScenePause = this._onScenePause.bind(this);

    scene.input.on('pointerdown', this._onDown, this);
    scene.input.on('pointermove', this._onMove, this);
    scene.input.on('pointerup', this._onUp, this);
    scene.input.on('pointerupoutside', this._onUpOutside, this);
    // Phaser drops pointer events while paused but timers keep running, so the
    // pause has to reset a half-finished press itself.
    scene.events.on('pause', this._onScenePause);
  }

  destroy() {
    const input = this.scene.input;
    input.off('pointerdown', this._onDown, this);
    input.off('pointermove', this._onMove, this);
    input.off('pointerup', this._onUp, this);
    input.off('pointerupoutside', this._onUpOutside, this);
    // this.events survives scene shutdown, so an un-removed listener would stack.
    this.scene.events.off('pause', this._onScenePause);
    this._clearLongPress();
    this._hidePeek();
    this._press = null;
  }

  _onDown(pointer) {
    // Also covers a second finger landing while a long-press peek is held.
    this._hidePeek();
    this._clearLongPress();
    if (!overMap(pointer)) { this._press = null; return; }
    this._setBuildCursor(pointer);
    // x/y stay canvas px: they only feed the slop delta, measured in one space.
    this._press = {
      id: pointer.id, x: pointer.x, y: pointer.y,
      downMs: Date.now(), movedPx: 0, consumed: false, target: null,
    };
    if (!pointer.wasTouch) return;
    this._press.target = this.scene.inspector?.inspectableAt(pointer.worldX, pointer.worldY) ?? null;
    this._longPressTimer = setTimeout(this._onLongPress, LONG_PRESS_MS);
  }

  _onMove(pointer) {
    if (overMap(pointer)) {
      this._setBuildCursor(pointer);
      if (!pointer.wasTouch) this.scene.inspector?.onPointerMove(pointer.worldX, pointer.worldY);
    }

    const press = this._press;
    if (!press || press.id !== pointer.id) return;
    press.movedPx = Math.max(press.movedPx, this._cssDistance(press, pointer));
    const gesture = classifyGesture({
      downMs: press.downMs, nowMs: Date.now(), movedPx: press.movedPx, released: false,
    });
    if (gesture === 'drag') this._clearLongPress();
  }

  _onUp(pointer) {
    if (!overMap(pointer)) { this._onUpOutside(pointer); return; }
    const press = this._takePress(pointer);
    if (!press) return;
    if (press.consumed) { this._startLinger(); return; }
    // Phaser reports a touchcancel as an ordinary up; the OS took that touch.
    if (pointer.event?.type === 'touchcancel') return;
    this.scene._onTap(pointer.worldX, pointer.worldY);
  }

  // Released off the canvas: nothing resolves, but a peek still lingers.
  _onUpOutside(pointer) {
    const press = this._takePress(pointer);
    if (press?.consumed) this._startLinger();
  }

  _takePress(pointer) {
    const press = this._press;
    if (!press || press.id !== pointer.id) return null;
    this._clearLongPress();
    this._press = null;
    return press;
  }

  _onScenePause() {
    this._clearLongPress();
    this._press = null;
    this._hidePeek();
  }

  _onLongPress() {
    this._longPressTimer = null;
    const press = this._press;
    if (!press?.target) return;
    press.consumed = true;
    this._peekShown = !!this.scene.inspector?.peekHit(press.target);
  }

  _startLinger() {
    if (this._peekShown) this._lingerTimer = setTimeout(this._hidePeek, PEEK_LINGER_MS);
  }

  // Hides only a peek this controller showed, so the mouse hover peek is untouched.
  _hidePeek() {
    clearTimeout(this._lingerTimer);
    this._lingerTimer = null;
    if (!this._peekShown) return;
    this._peekShown = false;
    this.scene.inspector?.hidePeek();
  }

  _clearLongPress() {
    clearTimeout(this._longPressTimer);
    this._longPressTimer = null;
  }

  // Slop is a physical finger tolerance, so measure in CSS px: a phone renders
  // several game px per CSS px and a game-px slop would be far too tight there.
  _cssDistance(from, pointer) {
    const ds = this.scene.scale.displayScale;
    return Math.hypot((pointer.x - from.x) / ds.x, (pointer.y - from.y) / ds.y);
  }

  _setBuildCursor(pointer) {
    this.scene._buildCursorX = pointer.worldX;
    this.scene._buildCursorY = pointer.worldY;
  }
}
