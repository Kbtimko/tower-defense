import { getRenderScale } from '../systems/renderScale.js';

// Phaser Text rasterises at its own resolution (default 1); under a k-zoomed
// camera that is upscaled and blurry, so every canvas text goes through here.
// k is read at call time because it is only known after boot.
export function hiDpiStyle(style) {
  return { ...style, resolution: getRenderScale() };
}

export function addText(scene, x, y, text, style) {
  return scene.add.text(x, y, text, hiDpiStyle(style));
}
