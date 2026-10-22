// Particle textures drawn in code at boot (no image files). All are white on
// transparent so emitters can tint them per tower accent at emit time.

function radialDot(ctx, size, stops) {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function drawGlow(ctx, size) {
  radialDot(ctx, size, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
}

function drawRing(ctx, size) {
  const c = size / 2;
  const r = c - 8; // leave room for the glow so it isn't clipped at the edge
  // Faint wide stroke underneath gives the soft edge without relying on shadowBlur support.
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawSpark(ctx, size) {
  const c = size / 2;
  // Elongated diamond; reads as a short streak at 16px.
  ctx.beginPath();
  ctx.moveTo(c, 0);
  ctx.lineTo(c + size * 0.18, c);
  ctx.lineTo(c, size);
  ctx.lineTo(c - size * 0.18, c);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();
}

function drawSmoke(ctx, size) {
  // Three offset gradients so the silhouette isn't a perfect disc.
  const c = size / 2;
  const blobs = [[0, 0, 0.5], [-0.12, 0.08, 0.38], [0.1, -0.1, 0.36]];
  for (const [dx, dy, rf] of blobs) {
    const cx = c + dx * size;
    const cy = c + dy * size;
    const r = rf * size;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

function drawShard(ctx, size) {
  const c = size / 2;
  // Thin kite: long point up, short tail down.
  ctx.beginPath();
  ctx.moveTo(c, 0);
  ctx.lineTo(c + size * 0.2, size * 0.4);
  ctx.lineTo(c, size);
  ctx.lineTo(c - size * 0.2, size * 0.4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();
}

function drawEmber(ctx, size) {
  radialDot(ctx, size, [
    [0, 'rgba(255,255,255,1)'],
    [0.4, 'rgba(255,255,255,0.8)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
}

export const FX_TEXTURES = [
  { key: 'fx-glow',  size: 64, draw: drawGlow },
  { key: 'fx-ring',  size: 64, draw: drawRing },
  { key: 'fx-spark', size: 16, draw: drawSpark },
  { key: 'fx-smoke', size: 64, draw: drawSmoke },
  { key: 'fx-shard', size: 32, draw: drawShard },
  { key: 'fx-ember', size: 16, draw: drawEmber },
];

export function generateFxTextures(scene) {
  for (const { key, size, draw } of FX_TEXTURES) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, size, size);
    draw(tex.getContext(), size);
    tex.refresh();
  }
}
