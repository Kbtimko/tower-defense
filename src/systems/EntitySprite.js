// Sprite-or-fallback render component for an entity Container. When the entity's
// art is registered (BootScene loaded the PNGs), it adds a child Phaser Sprite
// and drives its animations; otherwise it stays inactive and the entity keeps
// drawing its Graphics body (the fallback). No Phaser import — only touches the
// passed-in `scene`, so it is unit-testable with a plain scene stub.
import { getSpriteConfig } from '../data/sprites.js';
import { spriteTextureKey, registeredStates } from './spriteKeys.js';

const LOOPING = new Set(['idle', 'move']);

export class EntitySprite {
  constructor(container, scene, { category, type, initialState = 'idle' }) {
    this.scene    = scene;
    this.category = category;
    this.type     = type;
    this.active   = false;
    this.sprite   = null;
    this._busy    = false; // true while a one-shot (attack/death) anim is playing

    const config = getSpriteConfig(category, type);
    if (!config) return;
    const registeredKeys = scene.game?.registry?.get('spriteKeys') ?? [];
    const states = registeredStates(category, type, Object.keys(config.states ?? {}), registeredKeys);
    if (states.length === 0) return;

    this._config = config;
    this._states = new Set(states);

    const anchor = config.anchor ?? { x: 0.5, y: 0.5 };
    this.sprite = scene.add.sprite(0, 0, spriteTextureKey(category, type, states[0]));
    this.sprite.setOrigin(anchor.x, anchor.y);
    if (config.scale != null) this.sprite.setScale(config.scale);
    container.addAt(this.sprite, 0); // below the entity's overlay/HP-bar graphics

    for (const st of states) {
      const def = config.states[st];
      if (!def.frames || def.frames <= 1) continue; // single-image state — no animation
      const key = spriteTextureKey(category, type, st);
      if (scene.anims.exists(key)) continue;        // idempotent across many entities of a type
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: def.frames - 1 }),
        frameRate: def.frameRate ?? 10,
        repeat: LOOPING.has(st) ? -1 : 0,
      });
    }

    this.active = true;
    // One-shot states (attack) revert to a looping default when they complete.
    const start = this._states.has(initialState) ? initialState : states[0];
    this._defaultState = LOOPING.has(start)
      ? start
      : (this._states.has('idle') ? 'idle' : (this._states.has('move') ? 'move' : start));
    this.sprite.on('animationcomplete', this._onAnimComplete, this);
    this.setState(start);
  }

  setState(name) {
    if (!this.active || !this._states.has(name)) return;
    const oneShot = !LOOPING.has(name);
    if (this._busy && !oneShot) return; // don't interrupt a one-shot (attack) with a loop
    const key = spriteTextureKey(this.category, this.type, name);
    const def = this._config.states[name];
    if (!def.frames || def.frames <= 1) { this.sprite.setTexture(key); return; }
    this._busy = oneShot;
    this.sprite.play({ key, repeat: oneShot ? 0 : -1 }, true);
  }

  playOnce(name, onComplete) {
    if (!this.active || !this._states.has(name)) { onComplete?.(); return; }
    const key = spriteTextureKey(this.category, this.type, name);
    this.sprite.once('animationcomplete', () => onComplete?.());
    this.sprite.play({ key, repeat: 0 }, true);
  }

  setFacing(dirX) {
    if (!this.active || dirX === 0) return;
    const facesRight = (this._config.baseFacing ?? 'right') === 'right';
    this.sprite.setFlipX(facesRight ? dirX < 0 : dirX > 0);
  }

  _onAnimComplete() {
    // Looping anims never fire this; for one-shots, clear busy and return to the
    // default loop (per-frame call sites then resume move/idle next frame).
    this._busy = false;
    this.setState(this._defaultState);
  }

  destroy() {
    if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
    this.active = false;
  }
}
