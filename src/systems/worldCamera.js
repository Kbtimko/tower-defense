// The canvas backing store is k times the logical size, so each world camera
// zooms by k to keep world coordinates unchanged. Phaser zooms about the camera
// centre, hence the explicit centerOn: it puts world (0,0) at the viewport's
// top-left, exactly where an unzoomed camera has it.
export function applyWorldCamera(camera, { x, y, width, height }, k) {
  camera.setViewport(x * k, y * k, width * k, height * k);
  camera.setZoom(k);
  camera.centerOn(width / 2, height / 2);
}
