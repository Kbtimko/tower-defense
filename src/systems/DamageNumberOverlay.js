const POOL_SIZE = 24;
const THRESHOLD = 30;

const STYLES = {
  big:  { fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  crit: { fontSize: '22px', color: '#ffcc44', stroke: '#000000', strokeThickness: 3 },
  aoe:  { fontSize: '16px', color: '#ff9966', stroke: '#000000', strokeThickness: 2 },
};

export class DamageNumberOverlay {
  constructor(scene) {
    this._scene  = scene;
    this._pool   = [];
    this._inUse  = new Set();
    this._onHit  = (p) => this._handle(p);
    scene.events.on('damage-dealt', this._onHit);
  }

  destroy() {
    this._scene.events.off('damage-dealt', this._onHit);
  }

  _handle({ target, amount, isCrit = false, isAoe = false, abilityLabel = null }) {
    if (!(isCrit || isAoe || amount >= THRESHOLD)) return;
    if (this._inUse.size >= POOL_SIZE && this._pool.length === 0) return;

    let txt;
    if (this._pool.length) {
      txt = this._pool.pop();
    } else if (this._inUse.size < POOL_SIZE) {
      txt = this._scene.add.text(0, 0, '', STYLES.big);
      txt.setOrigin(0.5, 0.5);
      txt.setDepth(100);
    } else {
      return;
    }
    this._inUse.add(txt);

    const style = isCrit ? STYLES.crit : (isAoe ? STYLES.aoe : STYLES.big);
    const label = isCrit ? `CRIT ${amount}!`
                : (abilityLabel ? `${abilityLabel} ${amount}` : String(amount));
    txt.setText(label);
    txt.setStyle(style);
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
        txt.setVisible(false);
        this._inUse.delete(txt);
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
