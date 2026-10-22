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
//  - long-press (touch only, held still): peeks the enemy/hero under the press
//    and swallows the release. Over nothing inspectable the release still taps.
//    Mouse gets no long-press: hover already peeks, and a slow click must stay
//    a click.
export class InputController {
  constructor(scene) {
    this.scene = scene;
    this._press = null;
    this._longPressTimer = null;
    this._lingerTimer = null;
    this._onLongPress = this._onLongPress.bind(this);
    this._endLinger = this._endLinger.bind(this);

    scene.input.on('pointerdown', this._onDown, this);
    scene.input.on('pointermove', this._onMove, this);
    scene.input.on('pointerup', this._onUp, this);
    scene.input.on('pointerupoutside', this._onUpOutside, this);
  }

  destroy() {
    const input = this.scene.input;
    input.off('pointerdown', this._onDown, this);
    input.off('pointermove', this._onMove, this);
    input.off('pointerup', this._onUp, this);
    input.off('pointerupoutside', this._onUpOutside, this);
    this._clearLongPress();
    this._endLinger();
    this._press = null;
  }

  _onDown(pointer) {
    this._endLinger();
    this._clearLongPress();
    this._setBuildCursor(pointer);
    this._press = {
      id: pointer.id, x: pointer.x, y: pointer.y,
      downMs: Date.now(), movedPx: 0, consumed: false,
    };
    if (pointer.wasTouch) this._longPressTimer = setTimeout(this._onLongPress, LONG_PRESS_MS);
  }

  _onMove(pointer) {
    this._setBuildCursor(pointer);
    if (!pointer.wasTouch) this.scene.inspector?.onPointerMove(pointer.worldX, pointer.worldY);

    const press = this._press;
    if (!press || press.id !== pointer.id) return;
    press.movedPx = Math.max(press.movedPx, this._cssDistance(press, pointer));
    const gesture = classifyGesture({
      downMs: press.downMs, nowMs: Date.now(), movedPx: press.movedPx, released: false,
    });
    if (gesture === 'drag') this._clearLongPress();
  }

  _onUp(pointer) {
    const press = this._takePress(pointer);
    if (!press) return;
    if (press.consumed) { this._startLinger(); return; }
    // Phaser reports a touchcancel as an ordinary up; the OS took that touch.
    if (pointer.event?.type === 'touchcancel') return;
    this.scene._onTap(pointer.x, pointer.y);
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

  _onLongPress() {
    this._longPressTimer = null;
    const press = this._press;
    if (press && this.scene.inspector?.peekAt(press.x, press.y)) press.consumed = true;
  }

  _startLinger() {
    this._lingerTimer = setTimeout(this._endLinger, PEEK_LINGER_MS);
  }

  _endLinger() {
    if (this._lingerTimer === null) return;
    clearTimeout(this._lingerTimer);
    this._lingerTimer = null;
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
