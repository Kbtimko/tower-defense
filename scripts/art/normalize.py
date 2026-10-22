#!/usr/bin/env python3
"""Normalize every sprite sheet to the art bible (roadmap 1.3).

    python3 scripts/art/normalize.py            # all sheets
    python3 scripts/art/normalize.py --only tower/cannon enemy/titan

Reads the ORIGINAL sheets from assets-src/sprites/ (what build-sprite-sheets.py
writes) and writes the shipped sheets to public/assets/sprites/. Always
reading originals is what makes it idempotent: running it twice produces the
same files, and no pass is ever applied on top of itself.

Per entity, tone parameters are computed once from its base state and applied
to every state, so idle, attack and death stay the same colour. Per frame:
  1. edge cleanup  - drop near-transparent fringe; remove stray specks
                     (not on death frames, whose debris is intentional)
  2. tone          - lift luminance / contrast / saturation into the art
                     bible §5 bands (factors capped so nothing is repainted)
  3. rim light     - lighten the upper-left edge (light comes from there)
  4. outline       - 1.5 display px of navy #0b1020 outside the silhouette

Cell sizes and display scales come from src/data/sprites.js via node, so the
manifest stays the single source of truth. Also writes a before/after contact
sheet to .art-cache/review/normalize-contact.png (dark background) and prints
re-measured `ground` metrics for sprites.js.

Requires: pip3 install pillow numpy scipy
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / 'assets-src'
OUT_ROOT = ROOT / 'public'
REVIEW = ROOT / '.art-cache' / 'review'

# --- Art bible numbers (docs/art-bible.md §3, §5) ------------------------------
OUTLINE_RGB = np.array([0x0b, 0x10, 0x20], dtype=np.float32) / 255
OUTLINE_DISPLAY_PX = 1.5
LUM_BAND = (0.22, 0.40)
MIN_CONTRAST = 0.12
SAT_BANDS = {
    'enemy':   (0.35, 0.70),
    'tower':   (0.20, 0.35),
    'soldier': (0.20, 0.35),
    'sentry':  (0.20, 0.35),
    'hero':    (0.20, 0.60),   # named characters may run hotter
}
# Caps keep the pass a correction, not a repaint.
MAX_CONTRAST_GAIN = 1.8
MAX_SAT_FACTOR = 1.6
RIM_STRENGTH = 0.35
RIM_RGB = np.array([1.0, 0.96, 0.86], dtype=np.float32)   # warm key light
ALPHA_FLOOR = 20 / 255
SPECK_FRACTION = 0.01      # components under 1 % of the frame's largest are noise
# Per-entity opt-out (risk table: "normalization makes sprites look flat").
SKIP_TONE = set()          # e.g. {'hero/pyro'}

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def luma(rgb):
    # Explicit weighted sum, not a matmul: numpy's float32 matmul on macOS
    # Accelerate raises spurious overflow warnings.
    return rgb[..., 0] * LUMA[0] + rgb[..., 1] * LUMA[1] + rgb[..., 2] * LUMA[2]


def load_manifest():
    js = "import('./src/data/sprites.js').then(m => console.log(JSON.stringify(m.SPRITE_MANIFEST)))"
    out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def frames_of(img, fw, fh):
    cols, rows = img.shape[1] // fw, img.shape[0] // fh
    for r in range(rows):
        for c in range(cols):
            yield (slice(r * fh, (r + 1) * fh), slice(c * fw, (c + 1) * fw))


# --- Tone -----------------------------------------------------------------------
def stats(rgb, a):
    m = a > 0.5
    px = rgb[m]
    if len(px) == 0:
        return None
    lum = luma(px)
    mx, mn = px.max(1), px.min(1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return float(lum.mean()), float(lum.std()), float(sat.mean())


def apply_tone(rgb, p):
    """rgb in [0,1]. p = dict(gamma, mean, gain, sat). Hue is preserved."""
    lum = np.maximum(luma(rgb), 1e-4)[..., None]
    lum2 = lum ** p['gamma']
    lum3 = np.clip(p['mean'] + (lum2 - p['mean']) * p['gain'], 0, 1)
    out = rgb * (lum3 / lum)
    grey = luma(out)[..., None]
    out = grey + (out - grey) * p['sat']
    return np.clip(out, 0, 1)


def tone_params(rgb, a, category):
    identity = dict(gamma=1.0, mean=0.0, gain=1.0, sat=1.0)
    s = stats(rgb, a)
    if s is None:
        return identity
    mean, _, _ = s
    m = a > 0.5
    lum = np.maximum(luma(rgb[m]), 1e-4)

    # 1) luminance mean into the band via gamma (bisection on the real pixels)
    lo, hi = LUM_BAND
    gamma = 1.0
    if not lo <= mean <= hi:
        target = lo + 0.03 if mean < lo else hi - 0.02
        g_lo, g_hi = 0.2, 5.0
        for _ in range(40):
            g = (g_lo + g_hi) / 2
            if (lum ** g).mean() > target:
                g_lo = g
            else:
                g_hi = g
        gamma = (g_lo + g_hi) / 2
    lum2 = lum ** gamma

    # 2) contrast floor, stretched around the (new) mean
    mean2, std2 = float(lum2.mean()), float(lum2.std())
    gain = 1.0
    if std2 < MIN_CONTRAST and std2 > 0:
        gain = min(MIN_CONTRAST / std2, MAX_CONTRAST_GAIN)

    # 3) saturation into the category band
    p = dict(gamma=gamma, mean=mean2, gain=gain, sat=1.0)
    s2 = stats(apply_tone(rgb, p), a)
    s_lo, s_hi = SAT_BANDS[category]
    sat = s2[2]
    if sat < s_lo and sat > 0:
        p['sat'] = min(s_lo / sat, MAX_SAT_FACTOR)
    elif sat > s_hi:
        p['sat'] = max(s_hi / sat, 1 / MAX_SAT_FACTOR)
    return p


# --- Per-frame passes -----------------------------------------------------------
def cleanup(a, keep_debris):
    a = np.where(a < ALPHA_FLOOR, 0, a)
    if keep_debris:
        return a
    labels, n = ndimage.label(a > 0)
    if n <= 1:
        return a
    sizes = ndimage.sum(np.ones_like(a), labels, index=range(1, n + 1))
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = sizes >= sizes.max() * SPECK_FRACTION
    return np.where(keep[labels], a, 0)


def rim_light(rgb, a, offset):
    """Lighten opaque pixels whose upper-left neighbour is (mostly) empty."""
    solid = a > 0.5
    shifted = np.zeros_like(solid)
    shifted[offset:, offset:] = solid[:-offset, :-offset]
    edge = solid & ~shifted
    k = (RIM_STRENGTH * a * edge)[..., None]
    return rgb * (1 - k) + RIM_RGB * k


def outline(rgb, a, width):
    """Composite the sprite over a navy outline `width` source px wide."""
    solid = a > 0.5
    dist = ndimage.distance_transform_edt(~solid)
    oa = np.clip(width + 0.5 - dist, 0, 1) * (~solid)
    out_a = a + oa * (1 - a)
    with np.errstate(invalid='ignore', divide='ignore'):
        out_rgb = (rgb * a[..., None] + OUTLINE_RGB * (oa * (1 - a))[..., None]) / out_a[..., None]
    out_rgb = np.nan_to_num(out_rgb)
    return out_rgb, out_a


def measure_ground(a, fw, fh, anchor_y, scale):
    bottoms, widths = [], []
    for sl in frames_of(a, fw, fh):
        ys, xs = np.where(a[sl] > 32 / 255)
        if len(ys):
            bottoms.append(ys.max() + 1)
            widths.append(xs.max() - xs.min() + 1)
    return round((max(bottoms) - fh * anchor_y) * scale, 1), round(float(np.median(widths)) * scale, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', help='category/type pairs, e.g. tower/cannon')
    args = ap.parse_args()
    manifest = load_manifest()
    REVIEW.mkdir(parents=True, exist_ok=True)
    tiles = []
    clipped = []

    for entry in manifest:
        key = f"{entry['category']}/{entry['type']}"
        if args.only and key not in args.only:
            continue
        scale = entry.get('scale', 1)
        anchor_y = entry.get('anchor', {}).get('y', 0.5)
        width = OUTLINE_DISPLAY_PX / scale
        rim_offset = max(1, round(1 / scale))
        states = list(entry['states'].items())

        params = None
        tone_after = None
        for state, d in states:
            src = SRC_ROOT / d['path'].removeprefix('assets/')
            dst = OUT_ROOT / d['path']
            if not src.exists():
                print(f'  ! {key} {state}: missing {src.relative_to(ROOT)}')
                continue
            img = np.asarray(Image.open(src).convert('RGBA'), dtype=np.float32) / 255
            fw, fh = d['frameWidth'], d['frameHeight']
            if params is None:   # base state sets the tone for every state
                first = next(frames_of(img, fw, fh))
                params = (dict(gamma=1.0, mean=0.0, gain=1.0, sat=1.0) if key in SKIP_TONE
                          else tone_params(img[first][..., :3], img[first][..., 3], entry['category']))
            out = np.zeros_like(img)
            for sl in frames_of(img, fw, fh):
                rgb, a = img[sl][..., :3], img[sl][..., 3]
                a = cleanup(a, keep_debris=(state == 'death'))
                rgb = apply_tone(rgb, params)
                rgb = rim_light(rgb, a, rim_offset)
                if tone_after is None:
                    tone_after = stats(rgb, a)   # before the outline, so navy doesn't skew it
                rgb, a = outline(rgb, a, width)
                out[sl][..., :3], out[sl][..., 3] = rgb, a
                edge = lambda m: np.concatenate([m[0], m[-1], m[:, 0], m[:, -1]])
                if (edge(a) > 0.5).any() and not (edge(img[sl][..., 3]) > 0.5).any():
                    clipped.append(f'{key} {state}')
            dst.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst, optimize=True)
            if state == states[0][0]:
                before = Image.open(src).convert('RGBA').crop((0, 0, fw, fh))
                after = Image.fromarray((out[:fh, :fw] * 255 + 0.5).astype(np.uint8), 'RGBA')
                tiles.append((key, before, after))
                foot, w = measure_ground(out[..., 3], fw, fh, anchor_y, scale)
                s0, s1 = stats(img[:fh, :fw, :3], img[:fh, :fw, 3]), tone_after
                print(f'  {key:18} lum {s0[0]:.2f}->{s1[0]:.2f}  contrast {s0[1]:.2f}->{s1[1]:.2f}  '
                      f'sat {s0[2]:.2f}->{s1[2]:.2f}   ground {{ footY: {foot}, width: {w} }}')

    # Contact sheet: before | after per entity, on the dark ground the art is judged on.
    T = 128
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    # Two halves: the dark ground the art bible judges on, and map 0/5 sand,
    # where the outline is what separates a unit from the terrain.
    half = rows * (T + 8)
    sheet = Image.new('RGBA', (cols * (2 * T + 16), half * 2 + 8), (255, 255, 255, 255))
    for h, bg in enumerate([(20, 24, 36, 255), (196, 140, 80, 255)]):
        sheet.paste(Image.new('RGBA', (sheet.width, half), bg), (0, h * (half + 8)))
        for i, (_, b, a) in enumerate(tiles):
            x, y = (i % cols) * (2 * T + 16), h * (half + 8) + (i // cols) * (T + 8)
            for j, im in enumerate((b, a)):
                sheet.alpha_composite(im.resize((T, T), Image.NEAREST), (x + j * T, y))
    sheet.save(REVIEW / 'normalize-contact.png')
    print(f'\ncontact sheet: {(REVIEW / "normalize-contact.png").relative_to(ROOT)}')
    if clipped:
        print('outline touches the cell edge (art may be cropped):', ', '.join(sorted(set(clipped))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
