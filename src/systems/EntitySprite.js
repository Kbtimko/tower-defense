// Sprite-or-fallback render component for an entity Container. When the entity's
// art is registered (BootScene loaded the PNGs), it adds a child Phaser Sprite
// and drives its animations; otherwise it stays inactive and the entity keeps
// drawing its Graphics body (the fallback). No Phaser import — only touches the
// passed-in `scene`, so it is unit-testable with a plain scene stub.
import { getSpriteConfig } from '../data/sprites.js';
import { spriteTextureKey, registeredStates } from './spriteKeys.js';
import { shadowSpec } from './grounding.js';

const LOOPING = new Set(['idle', 'move']);
const SHADOW_KEY = 'fx-contact-shadow';

// One soft radial blob shared by every shadow; stretched per entity. Drawn in
// code so grounding needs no art.
function ensureShadowTexture(scene) {
  if (scene.textures.exists(SHADOW_KEY)) return;
  const size = 64;
  const tex = scene.textures.createCanvas(SHADOW_KEY, size, size);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Flat core, short falloff: reads as a contact shadow, not a glow.
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

export class EntitySprite {
  constructor(container, scene, { category, type, initialState = 'idle', flying = false }) {
    this.scene    = scene;
    this.category = category;
    this.type     = type;
    this.active   = false;
    this.sprite   = null;
    this.shadow   = null;
    this._busy    = false; // true while a one-shot (attack/death) anim is playing
    this._flashed = false;
    this._baseTint = null; // status colour the sprite returns to after a flash

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

    // Shadow is not flipped or animated with the sprite: the light is fixed.
    const shadow = shadowSpec(config.ground, { flying });
    if (shadow) {
      ensureShadowTexture(scene);
      this.shadow = scene.add.image(0, 0, SHADOW_KEY)
        .setPosition(shadow.x, shadow.y)
        .setDisplaySize(shadow.width, shadow.height)
        .setAlpha(shadow.alpha);
      container.addAt(this.shadow, 0); // under the sprite
    }

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

  // Does this entity have registered art for `name`? Lets callers branch on
  // real art without reaching into the private state set.
  hasState(name) {
    return this.active && this._states.has(name);
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

  // Solid-white silhouette for a hit flash. The sprite is this component's to
  // own, so callers only say on or off; guarded so a per-frame call while the
  // flash holds does not re-tint every frame.
  setFlash(on) {
    if (!this.active || this._flashed === on) return;
    this._flashed = on;
    if (on) this.sprite.setTintFill(0xffffff);
    else    this._applyBaseTint();
  }

  // Status colour (slow cyan, burn orange, ...) that multiplies the art. Held
  // back while a flash is up so the flash stays solid white; setFlash(false)
  // then lands on this colour rather than plain white.
  setBaseTint(color) {
    if (!this.active) return;
    this._baseTint = color;
    if (!this._flashed) this._applyBaseTint();
  }

  _applyBaseTint() {
    if (this._baseTint == null) this.sprite.clearTint();
    else this.sprite.setTint(this._baseTint);
  }

  // Multiplies the manifest scale so the squash never loses the art's size.
  setSquash(x, y) {
    if (!this.active) return;
    const base = this._config.scale ?? 1;
    this.sprite.setScale(base * x, base * y);
  }

  // Rendered size of the art, for callers that must lay out around the body
  // rather than around the entity's nominal radius. Null while inactive.
  getDisplaySize() {
    if (!this.active) return null;
    return { width: this.sprite.displayWidth, height: this.sprite.displayHeight };
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
    if (this.shadow) { this.shadow.destroy(); this.shadow = null; }
    this.active = false;
  }
}
