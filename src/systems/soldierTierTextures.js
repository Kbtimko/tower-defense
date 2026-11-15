// Soldier tier textures (#49, spec C2/R14): recolour the base soldier sheets
// once at boot and register them under tier keys. A pixel colour matrix, never
// Phaser tint or postFX: tint can only darken, and per-sprite FX cost every frame.
// Touches only the scene it is handed; no Phaser import.
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { SOLDIER_RECOLOR } from '../data/tierLooks.js';
import { spriteTextureKey, variantTextureKey } from './spriteKeys.js';
import { filterStages, applyColorStages } from './colorMatrix.js';

const SOLDIER = { category: 'soldier', type: 'default' };

export function generateSoldierTierTextures(scene, registeredKeys) {
  const textures = scene.textures;
  const entry = SPRITE_MANIFEST.find(e => e.category === SOLDIER.category && e.type === SOLDIER.type);
  const added = [];
  const failed = [];
  if (!entry) return { added, failed };

  for (const [variant, params] of Object.entries(SOLDIER_RECOLOR)) {
    const stages = filterStages(params);
    for (const [state, def] of Object.entries(entry.states ?? {})) {
      const baseKey = spriteTextureKey(SOLDIER.category, SOLDIER.type, state);
      if (!registeredKeys.includes(baseKey)) continue;
      const key = variantTextureKey(SOLDIER.category, SOLDIER.type, state, variant);
      // Real tier art already under this key wins (E14); this guard also stops a
      // second boot pass regenerating (E11). That pass still reports the key: the
      // boot scan does not find generated keys, and spriteKeys must keep them.
      if (textures.exists(key)) {
        if (!registeredKeys.includes(key)) added.push(key);
        continue;
      }

      let ct = null;
      try {
        const src = textures.get(baseKey).getSourceImage();
        // CanvasTexture's context is willReadFrequently, so this readback raises
        // no Chrome console warning (S8).
        ct = textures.createCanvas(key, src.width, src.height);
        ct.draw(0, 0, src);
        const img = ct.getData(0, 0, src.width, src.height);
        applyColorStages(img.data, stages);
        ct.putData(img, 0, 0);
        ct.refresh();
        textures.addSpriteSheet('', ct, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
        added.push(key);
      } catch {
        // e.g. a tainted canvas. Silent on purpose: a console warning fails every
        // capture; the caller surfaces `failed` instead. The soldier keeps the
        // base art and still reads its tier through scale and shield.
        if (ct) textures.remove(key);
        failed.push(key);
      }
    }
  }
  return { added, failed };
}
