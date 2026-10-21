// Boot progress, drawn on the canvas so it scales with FIT like the game.
// Colours follow docs/art-bible.md (panel navy, cyan-teal accent).

export function loadingLabel(progress) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return `Loading ${Math.round(p * 100)}%`;
}

const BAR_W = 420;
const BAR_H = 10;

export function attachLoadingBar(scene) {
  const { width, height } = scene.scale;
  const x = (width - BAR_W) / 2;
  const y = height / 2;
  const gfx = scene.add.graphics();
  const label = scene.add.text(width / 2, y - 22, loadingLabel(0), {
    fontFamily: 'Georgia', fontSize: '16px', color: '#4fc3f7',
  }).setOrigin(0.5);

  const draw = (p) => {
    gfx.clear();
    gfx.fillStyle(0x0f1424, 1).fillRect(x, y, BAR_W, BAR_H);
    gfx.lineStyle(1, 0x2a3a4a, 1).strokeRect(x, y, BAR_W, BAR_H);
    gfx.fillStyle(0x4fc3f7, 1).fillRect(x, y, BAR_W * Math.max(0, Math.min(1, p)), BAR_H);
    label.setText(loadingLabel(p));
  };
  draw(0);
  scene.load.on('progress', draw);
  scene.load.once('complete', () => {
    scene.load.off('progress', draw);
    gfx.destroy();
    label.destroy();
  });
}
