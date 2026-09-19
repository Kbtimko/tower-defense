#!/usr/bin/env python3
"""Turn ONE generated reference frame per entity into its animation sheets.

    npm run art -- --kind sprite          # generate references into .art-cache/
    python3 scripts/build-sprite-sheets.py tower_archer hero_rael ...
    python3 scripts/build-sprite-sheets.py --all

Entities are named `category_type`, matching the reference filenames that
`npm run art` writes. The type MUST be the entity's runtime type — the hero
ids are rael/engineer/scout/pyro, and soldier/sentry are both `default`.

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

Requires: pip3 install 'rembg[cli]' onnxruntime pillow numpy scipy
"""
import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / '.art-cache' / 'sprites'
SPRITE_ROOT = ROOT / 'public' / 'assets' / 'sprites'

# Output directory per category. These names are what PROMPTS.md documents and
# what SPRITE_MANIFEST paths point at — do not "tidy" the singular `sentry`.
OUT_DIRS = {
    'enemy':   SPRITE_ROOT / 'enemies',
    'tower':   SPRITE_ROOT / 'towers',
    'hero':    SPRITE_ROOT / 'heroes',
    'soldier': SPRITE_ROOT / 'soldiers',
    'sentry':  SPRITE_ROOT / 'sentry',
}

# Which states each category gets, and the default cell size. Towers are static
# emplacements, so their idle is a single frame; heroes walk the path, so they
# get a gait; soldiers and sentries are markedly smaller than any enemy.
PLAN = {
    'enemy':   {'states': ('move', 'death'),           'cell': 64},
    'tower':   {'states': ('idle', 'attack'),          'cell': 64},
    'hero':    {'states': ('idle', 'move', 'attack'),  'cell': 64},
    'soldier': {'states': ('idle', 'attack'),          'cell': 48},
    'sentry':  {'states': ('idle', 'attack'),          'cell': 48},
}

# Per-entity overrides. The barracks is a building and never fires.
STATE_OVERRIDES = {('tower', 'barracks'): ('idle',)}

# A bigger creature needs more source pixels than a 64px cell leaves it: a 64px
# cell left the titan 24px wide inside it. Set from the measured silhouette.
CELL_OVERRIDES = {('enemy', 'colossus'): 96, ('enemy', 'titan'): 128,
                  # The mage spire is the narrowest tower (aspect 0.48), so a
                  # 64px cell leaves it 25px wide and needs a 1.44x upscale to
                  # reach the 36px tower footprint. 96 brings that back to 0.95.
                  # The archer is the other tall, narrow tower (aspect 0.44):
                  # 64 leaves it 23px wide and needs 1.57x.
                  ('tower', 'mage'): 96, ('tower', 'archer'): 96}

# Flyers bob without footfalls, so their gait drops the rock.
HOVER = {('enemy', 'phantom')}

# The firing beat, one entry per frame: (x offset as a fraction of the cell,
# flash strength 0-1). Art faces right, so a negative offset is a pull back and
# a positive one a lunge. The LAST entry must equal the first: EntitySprite
# reverts to the idle loop on animationcomplete, and a final frame that is not
# the rest pose makes that revert visibly jump.
ATTACK_BEAT = [(0.0, 0.0), (-0.085, 0.15), (0.098, 1.0), (0.030, 0.35), (0.0, 0.0)]
FLASH_MIX = 0.55        # how far the flash pushes a pixel toward the tint

SS = 4          # supersample: transform at 4x the cell, downscale once at the end
FILL = 0.82     # fraction of the cell the creature spans, leaving room for bob

# Per-entity emissive tint: the burning rim of the death dissolve and the flash
# on the attack beat. Enemies mirror ENEMY_DEFS colours in src/data/enemies.js;
# towers mirror TOWER_DEFS[].color and heroes their strokeColor.
TINTS = {
    ('enemy', 'drone'):      (120, 255, 170),
    ('enemy', 'skitter'):    (255, 150,  60),
    ('enemy', 'brute'):      (170, 200, 170),
    ('enemy', 'colossus'):   (255,  90, 160),
    ('enemy', 'phantom'):    (200, 140, 255),
    ('enemy', 'titan'):      (255, 120, 100),
    ('tower', 'archer'):     (0x8b, 0x45, 0x13),
    ('tower', 'mage'):       (0x6a, 0x0d, 0xad),
    ('tower', 'cannon'):     (0x66, 0x66, 0x66),
    ('tower', 'ice'):        (0x4a, 0x8f, 0xa8),
    ('tower', 'sniper'):     (0x55, 0x6b, 0x2f),
    ('tower', 'barracks'):   (0x4c, 0xaf, 0x50),
    ('hero',  'rael'):       (0x4f, 0xc3, 0xf7),
    ('hero',  'engineer'):   (0xff, 0x99, 0x33),
    ('hero',  'scout'):      (0x3f, 0xb9, 0x50),
    ('hero',  'pyro'):       (0xe7, 0x4c, 0x3c),
    ('soldier', 'default'):  (0x4c, 0xaf, 0x50),
    ('sentry',  'default'):  (0xff, 0x99, 0x33),
}


def largest_component(rgba, min_alpha=24):
    """Keep only the biggest connected blob of opaque pixels.

    The generator scatters loose debris and secondary props around the subject
    (the titan came back standing in a field of rocks), and the shared negative
    prompt cannot stop it: FLUX at CFG 0 ignores negative_prompt entirely. Left
    in, that junk inflates the bounding box and shrinks the creature inside its
    cell."""
    from scipy import ndimage
    a = np.array(rgba)
    labels, n = ndimage.label(a[..., 3] > min_alpha)
    if n <= 1:
        return rgba
    biggest = np.argmax(ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))) + 1
    a[..., 3] *= (labels == biggest)
    return Image.fromarray(a, 'RGBA')


def cutout(path, keep_largest=True):
    """Alpha-cut the reference. isnet-general-use is the model that excludes
    the ground shadow FLUX renders despite being told not to; u2net keeps it as
    a translucent grey blob welded to the feet."""
    from rembg import remove, new_session
    src = Image.open(path).convert('RGBA')
    out = remove(src, session=new_session('isnet-general-use'), alpha_matting=True,
                 alpha_matting_foreground_threshold=250,
                 alpha_matting_background_threshold=15,
                 alpha_matting_erode_size=6)
    if keep_largest:
        out = largest_component(out)
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


def build_idle_static(ref, out_path, cell=64):
    """A single centred cell. Towers are emplacements and do not breathe.

    `frames: 1` is handled by EntitySprite.setState via setTexture rather than
    an animation, and a static state is a legal default to revert to after a
    one-shot — only a single-frame ONE-SHOT is broken (no animationcomplete)."""
    big = cell * SS
    ref = _fit(ref, big)
    cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    cellim.paste(ref, (round((big - ref.width) / 2), round((big - ref.height) / 2)), ref)
    sheet = cellim.resize((cell, cell), Image.LANCZOS)
    sheet.save(out_path)
    return sheet


def build_idle_breathe(ref, out_path, cell=64, frames=6):
    """A living unit standing still: the gait with the stride taken out.
    Same code path as build_move so the two cannot drift apart."""
    return build_move(ref, out_path, cell=cell, frames=frames,
                      bob=0.012, rock=0.0, squash=0.018, hover=True)


def build_attack(ref, out_path, tint, cell=64):
    """One-shot firing beat: pull back, lunge with a flash in the entity's
    tint, settle back to rest. Frame count comes from ATTACK_BEAT."""
    frames = len(ATTACK_BEAT)
    big = cell * SS
    ref = _fit(ref, big)
    sheet = Image.new('RGBA', (cell * frames, cell), (0, 0, 0, 0))
    for i, (off, flash) in enumerate(ATTACK_BEAT):
        f = ref
        if flash > 0:
            a = np.array(ref).astype(np.float32)
            m = FLASH_MIX * flash
            for c in range(3):
                a[..., c] = a[..., c] * (1 - m) + tint[c] * m
            f = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
        cellim = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        cellim.paste(f, (round((big - f.width) / 2 + off * big),
                         round((big - f.height) / 2)), f)
        sheet.paste(cellim.resize((cell, cell), Image.LANCZOS), (i * cell, 0))
    sheet.save(out_path)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*',
                    help='entities as category_type, e.g. tower_archer hero_rael')
    ap.add_argument('--all', action='store_true', help='every reference present')
    ap.add_argument('--cell', type=int, default=None,
                    help='override the cell size for every entity built')
    ap.add_argument('--no-mirror', action='store_true',
                    help='reference already faces right')
    ap.add_argument('--keep-debris', action='store_true',
                    help='skip largest-component isolation (subject is several blobs)')
    args = ap.parse_args()

    names = sorted(p.stem for p in REF_DIR.glob('*_*.png')) if args.all else args.names
    if not names:
        sys.exit(f'nothing to build; put references in {REF_DIR} via '
                 f'`npm run art -- --kind sprite`')

    for name in names:
        category, _, etype = name.partition('_')
        if category not in PLAN:
            print(f'  {name}: SKIP (unknown category {category!r})')
            continue
        ref_path = REF_DIR / f'{name}.png'
        if not ref_path.exists():
            print(f'  {name}: SKIP (no reference at {ref_path})')
            continue

        states = STATE_OVERRIDES.get((category, etype), PLAN[category]['states'])
        cell = args.cell or CELL_OVERRIDES.get((category, etype), PLAN[category]['cell'])
        tint = TINTS.get((category, etype), (255, 255, 255))
        out_dir = OUT_DIRS[category]
        out_dir.mkdir(parents=True, exist_ok=True)

        ref = cutout(ref_path, keep_largest=not args.keep_debris)
        # Author facing RIGHT; the renderer mirrors via flipX. FLUX drew every
        # enemy facing left whatever the prompt said, so flip by default and
        # pass --no-mirror for a reference that already faces right.
        if not args.no_mirror:
            ref = ref.transpose(Image.FLIP_LEFT_RIGHT)

        for st in states:
            out_path = out_dir / f'{etype}_{st}.png'
            if st == 'move':
                build_move(ref, out_path, cell=cell,
                           hover=(category, etype) in HOVER)
            elif st == 'death':
                build_death(ref, out_path, tint, cell=cell)
            elif st == 'idle':
                # Emplacements do not breathe; living units do.
                if category == 'tower':
                    build_idle_static(ref, out_path, cell=cell)
                else:
                    build_idle_breathe(ref, out_path, cell=cell)
            elif st == 'attack':
                build_attack(ref, out_path, tint, cell=cell)
        print(f'  {name}: {" + ".join(states)} -> {out_dir}')

    print('\nNow add/confirm the SPRITE_MANIFEST entries in src/data/sprites.js, '
          'then: npm run assets')


if __name__ == '__main__':
    main()
