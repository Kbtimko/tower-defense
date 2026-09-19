#!/usr/bin/env python3
"""Turn ONE generated reference frame per entity into its animation sheets.

    npm run art -- --kind sprite          # generate references into .art-cache/
    python3 scripts/build-sprite-sheets.py drone skitter ...
    python3 scripts/build-sprite-sheets.py --all

Why this shape rather than the IP-Adapter / ControlNet pipeline PROMPTS.md
describes: character consistency across frames is the hard problem, and the
cheapest way to win it is to never have more than one creature. Every frame
here is the SAME reference pixels under a transform, so identity drift is
impossible by construction rather than merely constrained.

The trade is that limbs do not articulate. At the on-screen footprint these
sprites actually occupy (drone 27px, titan 66px) a leg is 1-2px and a walk
cycle is sub-pixel noise, while frame-to-frame identity drift reads as obvious
flicker. Bob/rock for movement and collapse/dissolve for death are what carry
at that size.

Requires: pip3 install 'rembg[cli]' onnxruntime pillow numpy
"""
import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / '.art-cache' / 'sprites'
OUT_DIR = ROOT / 'public' / 'assets' / 'sprites' / 'enemies'

SS = 4          # supersample: transform at 4x the cell, downscale once at the end
FILL = 0.82     # fraction of the cell the creature spans, leaving room for bob

# Per-enemy emissive tint, used for the burning rim of the dissolve. Mirrors
# ENEMY_DEFS colours in src/data/enemies.js.
TINTS = {
    'drone':    (120, 255, 170),
    'skitter':  (255, 150, 60),
    'brute':    (170, 200, 170),
    'colossus': (255, 90, 160),
    'phantom':  (200, 140, 255),
    'titan':    (255, 120, 100),
}


def cutout(path):
    """Alpha-cut the reference. isnet-general-use is the model that excludes
    the ground shadow FLUX renders despite being told not to; u2net keeps it as
    a translucent grey blob welded to the feet."""
    from rembg import remove, new_session
    src = Image.open(path).convert('RGBA')
    out = remove(src, session=new_session('isnet-general-use'), alpha_matting=True,
                 alpha_matting_foreground_threshold=250,
                 alpha_matting_background_threshold=15,
                 alpha_matting_erode_size=6)
    return out.crop(out.getbbox())


def _fit(ref, big):
    target = int(big * FILL)
    s = min(target / ref.width, target / ref.height)
    return ref.resize((max(1, round(ref.width * s)), max(1, round(ref.height * s))), Image.LANCZOS)


def build_move(ref, out_path, cell=64, frames=8, bob=0.055, rock=3.0, squash=0.035,
               hover=False):
    """Looping gait: a squash-and-stretch bob with a counter-phased rock.
    `hover` drops the rock for flyers, which should bob without footfalls."""
    big = cell * SS
    ref = _fit(ref, big)
    sheet = Image.new('RGBA', (cell * frames, cell), (0, 0, 0, 0))
    for i in range(frames):
        ph = 2 * math.pi * i / frames
        sy = 1 + squash * math.sin(ph)              # compressed at the bottom of the bob
        sx = 1 - (squash * 0.6) * math.sin(ph)
        f = ref.resize((max(1, round(ref.width * sx)), max(1, round(ref.height * sy))),
                       Image.LANCZOS)
        if not hover:
            f = f.rotate(rock * math.cos(ph), resample=Image.BICUBIC, expand=True)
        cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        dy = -bob * big * math.sin(ph)              # negative y is up
        cellim.paste(f, (round((big - f.width) / 2), round((big - f.height) / 2 + dy)), f)
        sheet.paste(cellim.resize((cell, cell), Image.LANCZOS), (i * cell, 0))
    sheet.save(out_path)
    return sheet


def _noise(h, w, seed, cells=10):
    """Smooth value noise in [0,1]: the creature crumbles in coherent chunks
    instead of sparkling away pixel by pixel."""
    rng = np.random.default_rng(seed)
    low = rng.random((cells, cells))
    return np.asarray(Image.fromarray((low * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
                      dtype=np.float32) / 255.0


def build_death(ref, out_path, tint, cell=64, frames=6, seed=7, ease=2.4,
                sink=0.10, flatten=0.35, tip=7.0):
    """One-shot: collapse, then dissolve. The threshold is EASED -- a linear
    sweep ate the creature by frame 3 and wasted the back half of the sheet.
    The last frame is fully dissolved so the entity is invisible before the
    scene destroys it."""
    big = cell * SS
    ref = _fit(ref, big)
    sheet = Image.new('RGBA', (cell * frames, cell), (0, 0, 0, 0))
    for i in range(frames):
        t = i / (frames - 1)
        f = ref.resize((max(1, round(ref.width * (1 + 0.10 * t))),
                        max(1, round(ref.height * (1 - flatten * t)))), Image.LANCZOS)
        f = f.rotate(-tip * t, resample=Image.BICUBIC, expand=True)

        a = np.array(f).astype(np.float32)
        n = _noise(a.shape[0], a.shape[1], seed)
        thr = (t ** ease) * 1.12
        keep = n > thr
        edge = keep & (n < thr + 0.08)              # burning rim on the dissolve front
        a[..., 3] *= keep
        for c in range(3):
            a[..., c] = np.where(edge, a[..., c] * 0.5 + tint[c] * 0.5, a[..., c])
        a[..., 3] *= (1 - 0.25 * t)
        f = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

        cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        cellim.paste(f, (round((big - f.width) / 2),
                         round((big - f.height) / 2 + sink * big * t)), f)
        sheet.paste(cellim.resize((cell, cell), Image.LANCZOS), (i * cell, 0))
    sheet.save(out_path)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('types', nargs='*', help='enemy types, e.g. drone skitter')
    ap.add_argument('--all', action='store_true', help='every type with a reference')
    ap.add_argument('--cell', type=int, default=64)
    ap.add_argument('--no-mirror', action='store_true',
                    help='reference already faces right')
    args = ap.parse_args()

    types = sorted(p.stem.replace('enemy_', '') for p in REF_DIR.glob('enemy_*.png')) \
        if args.all else args.types
    if not types:
        sys.exit(f'nothing to build; put references in {REF_DIR} via '
                 f'`npm run art -- --kind sprite`')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for t in types:
        ref_path = REF_DIR / f'enemy_{t}.png'
        if not ref_path.exists():
            print(f'  {t}: SKIP (no reference at {ref_path})')
            continue
        ref = cutout(ref_path)
        # Author facing RIGHT; the renderer mirrors via flipX. FLUX ignores the
        # instruction and draws these creatures facing left, so flip by default.
        if not args.no_mirror:
            ref = ref.transpose(Image.FLIP_LEFT_RIGHT)
        build_move(ref, OUT_DIR / f'{t}_move.png', cell=args.cell, hover=(t == 'phantom'))
        build_death(ref, OUT_DIR / f'{t}_death.png', TINTS.get(t, (255, 255, 255)),
                    cell=args.cell)
        print(f'  {t}: move + death -> {OUT_DIR}')

    print('\nNow add/confirm the SPRITE_MANIFEST entries in src/data/sprites.js, '
          'then: npm run assets')


if __name__ == '__main__':
    main()
