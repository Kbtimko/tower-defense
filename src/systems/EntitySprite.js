// Sprite-or-fallback render component for an entity Container. When the entity's
// art is registered (BootScene loaded the PNGs), it adds a child Phaser Sprite
// and drives its animations; otherwise it stays inactive and the entity keeps
// drawing its Graphics body (the fallback). No Phaser import — only touches the
// passed-in `scene`, so it is unit-testable with a plain scene stub.
import { getSpriteConfig } from '../data/sprites.js';
import { registeredStates, resolveSpriteKey, variantTextureKey } from './spriteKeys.js';
import { shadowSpec } from './grounding.js';
import { pivotOffsetY } from './tierLookMath.js';

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

// The base manifest entry with a tier variant's overrides on top. Generated
// variant textures have no variant entry at all, so the base config stands.
function variantConfig(config, variant) {
  const v = config.variants?.[variant];
  if (!v) return config;
  return {
    ...config,
    scale:  v.scale  ?? config.scale,
    anchor: v.anchor ?? config.anchor,
    ground: v.ground ?? config.ground,
    states: { ...config.states, ...v.states },
  };
}

export class EntitySprite {
  constructor(container, scene, { category, type, initialState = 'idle', flying = false, variant = 't1' }) {
    this.scene    = scene;
    this.category = category;
    this.type     = type;
    this.active   = false;
    this.sprite   = null;
    this.shadow   = null;
    this._busy    = false; // true while a one-shot (attack/death) anim is playing
    this._flashed = false;
    this._squashX = 1;
    this._squashY = 1;
    this._baseTint = null; // status colour the sprite returns to after a flash
    this._tierScale = 1;
    this._variant  = variant;
    this._flying   = flying;
    this._lastState = null; // re-applied when the variant swaps the art under it

    this._baseConfig = getSpriteConfig(category, type);
    if (!this._baseConfig || !this._resolve(variant)) return;
    const states = [...this._states];

    const anchor = this._config.anchor ?? { x: 0.5, y: 0.5 };
    this.sprite = scene.add.sprite(0, 0, this._keys[states[0]]);
    this.sprite.setOrigin(anchor.x, anchor.y);
    if (this._config.scale != null) this.sprite.setScale(this._config.scale);
    container.addAt(this.sprite, 0); // below the entity's overlay/HP-bar graphics

    // Shadow is not flipped or animated with the sprite: the light is fixed.
    const shadow = shadowSpec(this._config.ground, { flying });
    if (shadow) {
      ensureShadowTexture(scene);
      this.shadow = scene.add.image(0, 0, SHADOW_KEY)
        .setPosition(shadow.x, shadow.y)
        .setDisplaySize(shadow.width, shadow.height)
        .setAlpha(shadow.alpha);
      // Kept so the tier scale sizes from T1 rather than compounding.
      this._shadowSize = { width: shadow.width, height: shadow.height };
      container.addAt(this.shadow, 0); // under the sprite
    }

    this._createAnims();

    this.active = true;
    // One-shot states (attack) revert to a looping default when they complete.
    const start = this._states.has(initialState) ? initialState : states[0];
    this._defaultState = LOOPING.has(start)
      ? start
      : (this._states.has('idle') ? 'idle' : (this._states.has('move') ? 'move' : start));
    this.sprite.on('animationcomplete', this._onAnimComplete, this);
    this.setState(start);
  }

  // Resolves one texture key per state for `variant` (exact variant key, else
  // base). A state's def follows its key: a variant def describes the variant
  // sheet, so a state that fell back to the base art keeps the base def.
  // Returns false when no state has art.
  _resolve(variant) {
    const base = this._baseConfig;
    const config = variantConfig(base, variant);
    const registeredKeys = this.scene.game?.registry?.get('spriteKeys') ?? [];
    const { category, type } = this;
    const states = registeredStates(category, type, Object.keys(config.states ?? {}), registeredKeys, variant);
    if (states.length === 0) return false;
    const keys = {};
    const defs = {};
    for (const st of states) {
      keys[st] = resolveSpriteKey(category, type, st, variant, registeredKeys);
      const exact = keys[st] === variantTextureKey(category, type, st, variant);
      defs[st] = (exact ? config.states[st] : base.states?.[st]) ?? config.states[st];
    }
    this._config = { ...config, states: defs };
    this._states = new Set(states);
    this._keys = keys;
    return true;
  }

  // One animation per resolved key, so a base-art state shares the base
  // animation with every other entity of the type.
  _createAnims() {
    const { scene } = this;
    for (const st of this._states) {
      const def = this._config.states[st];
      if (!def.frames || def.frames <= 1) continue; // single-image state — no animation
      const key = this._keys[st];
      if (scene.anims.exists(key)) continue;        // idempotent across many entities of a type
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: def.frames - 1 }),
        frameRate: def.frameRate ?? 10,
        repeat: LOOPING.has(st) ? -1 : 0,
      });
    }
  }

  // Swaps the art to another tier's (falling back per state to the base art)
  // and carries on showing whatever state was showing.
  setVariant(variant) {
    if (!this.active || variant === this._variant) return;
    this._variant = variant;
    this._resolve(variant);
    const anchor = this._config.anchor ?? { x: 0.5, y: 0.5 };
    this.sprite.setOrigin(anchor.x, anchor.y);
    const shadow = this.shadow && shadowSpec(this._config.ground, { flying: this._flying });
    if (shadow) {
      this.shadow.setPosition(shadow.x, shadow.y);
      this._shadowSize = { width: shadow.width, height: shadow.height };
    }
    this._applyTierScale();
    this._createAnims();
    const state = this._states.has(this._lastState) ? this._lastState : this._defaultState;
    this.setState(state);
  }

  // Grows the art from its foot (S1) so a bigger tier still stands on its pad;
  // the shadow grows with it but stays put. Remembered while inactive so
  // tierScale() still reports the tier when there is no art.
  setTierScale(s) {
    this._tierScale = s;
    if (this.active) this._applyTierScale();
  }

  _applyTierScale() {
    const s = this._tierScale;
    this._applyScale();
    this.sprite.y = this.pivotOffsetY();
    if (this.shadow) {
      this.shadow.setDisplaySize(this._shadowSize.width * s, this._shadowSize.height * s);
    }
  }

  _applyScale() {
    const base = (this._config.scale ?? 1) * this._tierScale;
    this.sprite.setScale(base * this._squashX, base * this._squashY);
  }

  tierScale() {
    return this._tierScale;
  }

  _footY() {
    const footY = this.active ? this._config.ground?.footY : undefined;
    return Number.isFinite(footY) ? footY : null;
  }

  pivotOffsetY() {
    const footY = this._footY();
    return footY == null ? 0 : pivotOffsetY(footY, this._tierScale);
  }

  // Ground contact at the current tier. The foot stays at footY (foot pivot);
  // height approximates the drawn art for centre-anchored sheets (plan P1).
  groundSpec() {
    const footY = this._footY();
    if (footY == null) return null;
    const s = this._tierScale;
    return { footY, width: this._config.ground.width * s, height: 2 * s * footY };
  }

  resolvedKey(state) {
    return this._keys?.[state] ?? null;
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
    this._lastState = name;
    const key = this._keys[name];
    const def = this._config.states[name];
    if (!def.frames || def.frames <= 1) { this.sprite.setTexture(key); return; }
    this._busy = oneShot;
    this.sprite.play({ key, repeat: oneShot ? 0 : -1 }, true);
  }

  playOnce(name, onComplete) {
    if (!this.active || !this._states.has(name)) { onComplete?.(); return; }
    const key = this._keys[name];
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

  // Multiplies the manifest and tier scale so the squash never loses the art's
  // size, and a pop plays from the tier's size (C5).
  setSquash(x, y) {
    if (!this.active) return;
    this._squashX = x;
    this._squashY = y;
    this._applyScale();
  }

  // Rendered size of the art, for callers that must lay out around the body
  // rather than around the entity's nominal radius. Null while inactive.
  // Reports the UNSQUASHED size: the squash is transient, and layouts computed
  // mid-squash (HP bar, status overlays) would otherwise persist wrong.
  getDisplaySize() {
    if (!this.active) return null;
    return {
      width: this.sprite.displayWidth / this._squashX,
      height: this.sprite.displayHeight / this._squashY,
    };
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
