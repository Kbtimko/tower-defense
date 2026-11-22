// The static layer (blockers, platforms, pads) changes only on build/sell/move,
// but a display-list Graphics is re-triangulated by Phaser every frame (~57% of
// CPU in profiling). Draw it into an off-display-list Graphics, then bake that
// into a canvas texture so the per-frame cost is one textured quad.
//
// Canvas2D, not a RenderTexture: a Graphics drawn into a RenderTexture loses the
// main canvas's MSAA and the pad edges go jagged. Canvas2D antialiases paths.
//
// The surface is scaled by `resolution` so callers keep drawing in world units,
// and the image is k× pixels shown at world size, i.e. 1:1 on the k× canvas.
// The texture key carries k like the road's does, and destroy() removes it, so a
// replay or a different k never reuses a stale canvas.
export function createStaticBake(scene, { width, height, resolution, depth }) {
  const key = `static_layer@${resolution}`;
  const pxW = width * resolution, pxH = height * resolution;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, pxW, pxH);
  const surface = scene.make.graphics({}, false);
  surface.setScale(resolution);
  const image = scene.add.image(0, 0, key)
    .setOrigin(0, 0)
    .setDepth(depth)
    .setDisplaySize(width, height);
  return {
    surface,
    image,
    // generateTexture draws ON TOP of an existing canvas, so wipe it first.
    rebake() { texture.clear(); surface.generateTexture(key, pxW, pxH); },
    destroy() { surface.destroy(); image.destroy(); scene.textures.remove(key); },
  };
}
