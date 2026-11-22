// The static layer (blockers, platforms, pads) changes only on build/sell/move,
// but a display-list Graphics is re-triangulated by Phaser every frame (~57% of
// CPU in profiling). Draw it into an off-display-list Graphics once, then bake
// that into a RenderTexture so the per-frame cost is one textured quad.
//
// The surface is scaled by `resolution` so callers keep drawing in world units,
// and the image is k× pixels shown at world size, i.e. 1:1 on the k× canvas.
export function createStaticBake(scene, { width, height, resolution, depth }) {
  const surface = scene.make.graphics({}, false);
  surface.setScale(resolution);
  const image = scene.add.renderTexture(0, 0, width * resolution, height * resolution)
    .setOrigin(0, 0)
    .setDepth(depth)
    .setDisplaySize(width, height);
  return {
    surface,
    image,
    rebake() { image.clear(); image.draw(surface, 0, 0); },
    destroy() { surface.destroy(); image.destroy(); },
  };
}
