import { FONTS } from '../data/theme.js';
import { addText, hiDpiStyle } from '../ui/hiDpiText.js';

const POOL_SIZE = 24;
const THRESHOLD = 30;
// A floored tower fires continuously; without a per-enemy gate the screen
// carpets with 🛡1 and becomes less readable than the silence it replaced.
const ABSORBED_COOLDOWN_MS = 700;

const STYLES = {
  big:  { fontFamily: FONTS.body, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  aoe:  { fontFamily: FONTS.body, fontSize: '16px', color: '#ff9966', stroke: '#000000', strokeThickness: 2 },
  // Muted and small on purpose: this marks a hit that barely landed, and must
  // not read as a good one.
  absorbed: { fontFamily: FONTS.body, fontSize: '13px', color: '#9aa4b0', stroke: '#000000', strokeThickness: 2 },
};

export class DamageNumberOverlay {
  constructor(scene) {
    this._scene  = scene;
    this._pool   = [];
    this._inUse  = new Set();
    // Insertion-ordered subset of _inUse showing an absorbed number, oldest
    // first: the only numbers a big or AoE hit may displace.
    this._absorbedInUse = new Set();
    this._onHit  = (p) => this._handle(p);
    this._absorbedAt = new WeakMap();
    this._now = () => Date.now();
    scene.events.on('damage-dealt', this._onHit);
  }

  destroy() {
    this._scene.events.off('damage-dealt', this._onHit);
    this._absorbedAt = new WeakMap();
    this._absorbedInUse.clear();
  }

  _handle({ target, amount, isAoe = false, abilityLabel = null, absorbedBand = 'none' }) {
    const absorbed = absorbedBand === 'heavy' || absorbedBand === 'floored';
    let now;

    if (absorbed) {
      // Per-enemy gate. A WeakMap means a dead enemy needs no sweep to be
      // collected, so a long level cannot leak entries.
      const last = this._absorbedAt.get(target);
      now = this._now();
      if (last !== undefined && now - last < ABSORBED_COOLDOWN_MS) return;
    } else if (!(isAoe || amount >= THRESHOLD)) {
      return;
    }

    let txt;
    if (this._pool.length) {
      txt = this._pool.pop();
    } else if (this._inUse.size < POOL_SIZE) {
      txt = addText(this._scene, 0, 0, '', STYLES.big);
      txt.setOrigin(0.5, 0.5);
      txt.setDepth(100);
    } else {
      // Pool full. A muted absorbed number must not starve a big or AoE hit,
      // so those take over the oldest absorbed slot; absorbed hits just drop.
      if (absorbed) return;
      const oldest = this._absorbedInUse.values().next().value;
      if (oldest === undefined) return;
      // Phaser's killTweensOf destroys tweens without firing onComplete, so
      // the evicted text's expiry callback can never double-release it.
      this._scene.tweens.killTweensOf(oldest);
      this._absorbedInUse.delete(oldest);
      this._inUse.delete(oldest);
      txt = oldest;
    }
    // Spend the throttle window only once the number is actually going to be
    // shown — writing it earlier let a pool-exhausted absorbed hit silently
    // eat this enemy's next window too.
    if (absorbed) this._absorbedAt.set(target, now);
    this._inUse.add(txt);
    if (absorbed) this._absorbedInUse.add(txt);

    const style = absorbed ? STYLES.absorbed
                : (isAoe  ? STYLES.aoe : STYLES.big);
    const label = absorbed ? `🛡${amount}`
                : (abilityLabel ? `${abilityLabel} ${amount}` : String(amount));
    txt.setText(label);
    txt.setStyle(hiDpiStyle(style));
    txt.setStroke(style.stroke, style.strokeThickness);
    txt.setShadow(0, 0, '#000000', 4, false, true);
    const jitterX = (Math.random() - 0.5) * 16;
    txt.setPosition(target.x + jitterX, target.y - 12);
    txt.setAlpha(0);
    txt.setVisible(true);

    this._scene.tweens.add({
      targets: txt,
      y: txt.y - 50,
      alpha: { from: 0, to: 1, duration: 100 },
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this._scene.tweens.killTweensOf(txt);
        txt.setVisible(false);
        this._inUse.delete(txt);
        this._absorbedInUse.delete(txt);
        this._pool.push(txt);
      },
    });

    this._scene.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 400,
      delay: 800,
    });
  }
}
