#!/usr/bin/env python3
"""Normalize every sprite sheet to the art bible (roadmap 1.3).

    python3 scripts/art/normalize.py            # all sheets
    python3 scripts/art/normalize.py --only tower/cannon enemy/titan
    python3 scripts/art/normalize.py --only tower/archer.t4a   # one tier variant

Reads the ORIGINAL sheets from assets-src/sprites/ (what build-sprite-sheets.py
writes) and writes the shipped sheets to public/assets/sprites/. Always
reading originals is what makes it idempotent: running it twice produces the
same files, and no pass is ever applied on top of itself.

Per entity, tone parameters are computed once from its base state and applied
to every state, so idle, attack and death stay the same colour. A tier variant
reuses its BASE entity's parameters so the tiers of one tower stay one family. Per frame:
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
import importlib.util
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

# The builder's hyphenated filename can't be imported normally. Its fit logic
# is reused so a preview frame is what the real sheet's first frame would be.
_spec = importlib.util.spec_from_file_location('build_sheets', ROOT / 'scripts' / 'build-sprite-sheets.py')
_bs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bs)

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
# The 2x pass must not move the ground line the manifest was measured at 1x.
# Drift is bounded by the outline, not zero: the 1.5 display-px outline rasterises
# differently at 1x and 2x, so the measured silhouette grows or shrinks by up to one
# outline width across its two sides (width) and half that on the one ground edge (footY).
# footY also quantises to the 1x source: one 1x source pixel is `scale` display px, so a
# scale above half the outline (titan, 1.08, drifted 0.58) can sit a whole source pixel
# off with no real change. Its floor is therefore max(outline / 2, that job's 1x scale).
GROUND_WIDTH_TOLERANCE = OUTLINE_DISPLAY_PX
GROUND_FOOTY_TOLERANCE = OUTLINE_DISPLAY_PX / 2


def ground_tolerance(field, scale_1x=0):
    if field == 'footY':
        return max(GROUND_FOOTY_TOLERANCE, scale_1x)
    return GROUND_WIDTH_TOLERANCE
SPRITE2X_JS = ROOT / 'src' / 'data' / 'sprite2x.js'

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


def _params_for(rgb, a, category, key=None):
    if key in SKIP_TONE:
        return dict(gamma=1.0, mean=0.0, gain=1.0, sat=1.0)
    return tone_params(rgb, a, category)


def _read(path):
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32) / 255


def _to_image(arr):
    return Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')


def process_frame(rgb, a, params, keep_debris, scale):
    """cleanup -> tone -> rim light -> outline for one frame. Also returns the
    pre-outline stats so navy doesn't skew the reported tone."""
    width = OUTLINE_DISPLAY_PX / scale
    a = cleanup(a, keep_debris)
    rgb = apply_tone(rgb, params)
    rgb = rim_light(rgb, a, max(1, round(1 / scale)))
    tone_after = stats(rgb, a)
    rgb, a = outline(rgb, a, width)
    return rgb, a, tone_after


def preview_frame(cut_rgba, entry, *, tone_params=None):
    """The entity's first frame as the real sheet would build it, restyled.
    `tone_params` pins the tone (e.g. a base entity's); else the frame's own."""
    first = next(iter(entry['states'].values()))
    frame = np.asarray(_bs.static_cell(cut_rgba, first['frameWidth']), dtype=np.float32) / 255
    rgb, a = frame[..., :3], frame[..., 3]
    params = tone_params or _params_for(rgb, a, entry['category'],
                                       f"{entry['category']}/{entry['type']}")
    rgb, a, _ = process_frame(rgb, a, params, False, entry.get('scale', 1))
    return _to_image(np.dstack([rgb, a]))


def sheet_rel(path, px):
    """The on-disk name of a manifest sheet path at `px` times the 1x pixels."""
    return path if px == 1 else path.replace('.png', f'@{px}x.png')


def _normalize_states(key, category, states, params, scale, anchor_y, src_root, out_root,
                      tiles, clipped, px=1):
    """Restyle one set of states; returns its ground record or None if the
    first state's source is missing. At px=2 the sheets are the @2x files: cells
    are 2x the manifest's and `scale` halves, so display sizes are unchanged."""
    ground = None
    scale = scale / px
    for n, (state, d) in enumerate(states.items()):
        rel = sheet_rel(d['path'], px)
        src = src_root / rel.removeprefix('assets/')
        dst = out_root / rel
        if not src.exists():
            print(f'  ! {key} {state}: missing {src}')
            continue
        img = _read(src)
        fw, fh = d['frameWidth'] * px, d['frameHeight'] * px
        out = np.zeros_like(img)
        tone_after = None
        for sl in frames_of(img, fw, fh):
            rgb, a, ta = process_frame(img[sl][..., :3], img[sl][..., 3], params,
                                       state == 'death', scale)
            if tone_after is None:
                tone_after = ta
            out[sl][..., :3], out[sl][..., 3] = rgb, a
            edge = lambda m: np.concatenate([m[0], m[-1], m[:, 0], m[:, -1]])
            if (edge(a) > 0.5).any() and not (edge(img[sl][..., 3]) > 0.5).any():
                clipped.append(f'{key} {state}')
        dst.parent.mkdir(parents=True, exist_ok=True)
        _to_image(out).save(dst, optimize=True)
        if n == 0:
            tiles.append((key, Image.open(src).convert('RGBA').crop((0, 0, fw, fh)),
                          _to_image(out[:fh, :fw])))
            foot, w = measure_ground(out[..., 3], fw, fh, anchor_y, scale)
            ground = {'footY': foot, 'width': w}
            s0, s1 = stats(img[:fh, :fw, :3], img[:fh, :fw, 3]), tone_after
            print(f'  {key:18} lum {s0[0]:.2f}->{s1[0]:.2f}  contrast {s0[1]:.2f}->{s1[1]:.2f}  '
                  f'sat {s0[2]:.2f}->{s1[2]:.2f}   ground {{ footY: {foot}, width: {w} }}')
    return ground


def normalize_entry(entry, *, only_variants=None, include_base=True, src_root, out_root,
                    tiles=None, clipped=None, px=1):
    """Normalise an entry's base states (if include_base) and its variants
    (all, or just `only_variants`). Variants take the BASE's first-state tone,
    computed even when only a variant is requested."""
    tiles = [] if tiles is None else tiles
    clipped = [] if clipped is None else clipped
    category = entry['category']
    key = f"{category}/{entry['type']}"
    scale = entry.get('scale', 1)
    anchor_y = entry.get('anchor', {}).get('y', 0.5)
    variants = entry.get('variants', {})
    if only_variants is not None:
        variants = {v: variants[v] for v in only_variants}

    d0 = next(iter(entry['states'].values()))
    base_src = src_root / sheet_rel(d0['path'], px).removeprefix('assets/')
    if not base_src.exists():
        print(f'  ! {key}: missing {base_src}')
        return []
    img = _read(base_src)
    first = next(frames_of(img, d0['frameWidth'] * px, d0['frameHeight'] * px))
    params = _params_for(img[first][..., :3], img[first][..., 3], category, key)

    records = []
    jobs = ([(key, entry['states'], scale, anchor_y, entry.get('ground'))] if include_base else []) + [
        (f'{key}.{v}', vd['states'], vd.get('scale', scale),
         vd.get('anchor', entry.get('anchor', {})).get('y', 0.5),
         vd.get('ground', entry.get('ground')))
        for v, vd in variants.items()]
    for k, states, sc, ay, expected in jobs:
        ground = _normalize_states(k, category, states, params, sc, ay, src_root, out_root,
                                   tiles, clipped, px)
        if ground is not None:
            record = {'key': k, 'ground': ground}
            # Only 2x runs are checked against the manifest; 1x records stay as they were.
            if px > 1 and expected:
                record['expected'] = expected
                record['scale'] = sc
            records.append(record)
    return records


def ground_drift(records):
    """Messages for each measured footY/width that strays from the manifest's
    1x ground by more than ground_tolerance (display px)."""
    msgs = []
    for r in records:
        for field, want in r.get('expected', {}).items():
            got = r['ground'][field]
            if abs(got - want) > ground_tolerance(field, r.get('scale', 0)):
                msgs.append(f"{r['key']}: {field} {got} vs manifest {want}")
    return msgs


def write_sprite2x_module(out_root, path):
    """Regenerate the 2x coverage set from every @2x sheet on disk, not just
    this run's, so a partial --only run never drops entries."""
    sheets = sorted(p.relative_to(out_root).as_posix().replace('@2x.png', '.png')
                    for p in (out_root / 'assets' / 'sprites').rglob('*@2x.png'))
    body = ''.join(f"  '{s}',\n" for s in sheets)
    path.write_text('// GENERATED by scripts/art/normalize.py --scale 2. Do not edit.\n'
                    '// The 1x paths that have an @2x sibling in public/.\n'
                    f'export const SPRITE_2X = new Set([\n{body}]);\n')


def write_contact_sheet(tiles):
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


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*',
                    help='tower/archer (base only) or tower/archer.t4a (that variant only)')
    ap.add_argument('--src-root', type=Path, default=SRC_ROOT)
    ap.add_argument('--out-root', type=Path, default=OUT_ROOT)
    ap.add_argument('--scale', type=int, choices=(1, 2), default=1,
                    help='2 reads <name>@2x.png sources and writes @2x shipped sheets')
    ap.add_argument('--sprite2x-js', type=Path, default=None,
                    help='where --scale 2 writes the 2x coverage module (default: the real '
                         'one, but only when --out-root is the default too)')
    ap.add_argument('--ground-json', type=Path, help='write the measured ground records here')
    args = ap.parse_args(argv)
    manifest = load_manifest()
    REVIEW.mkdir(parents=True, exist_ok=True)
    tiles, clipped, records = [], [], []

    for entry in manifest:
        key = f"{entry['category']}/{entry['type']}"
        kw = {}
        if args.only:
            wanted = set(args.only)
            vs = [v for v in entry.get('variants', {}) if f'{key}.{v}' in wanted]
            if key not in wanted and not vs:
                continue
            kw = dict(only_variants=vs, include_base=key in wanted)
        records += normalize_entry(entry, src_root=args.src_root, out_root=args.out_root,
                                   tiles=tiles, clipped=clipped, px=args.scale, **kw)

    write_contact_sheet(tiles)
    print(f'\ncontact sheet: {REVIEW / "normalize-contact.png"}')
    if args.ground_json:
        args.ground_json.write_text(json.dumps(records, indent=2) + '\n')
    if clipped:
        print('outline touches the cell edge (art may be cropped):', ', '.join(sorted(set(clipped))))
    if args.scale > 1:
        # A scratch --out-root would otherwise overwrite the real module with a list
        # of only the scratch sheets, declaring the game's 2x art missing.
        js = args.sprite2x_js or (SPRITE2X_JS if args.out_root == OUT_ROOT else None)
        if js:
            write_sprite2x_module(args.out_root, js)
        else:
            print('\nskipped src/data/sprite2x.js: --out-root is not the default (pass --sprite2x-js to write it)')
        drift = ground_drift(records)
        if drift:
            print('\nGROUND DRIFT (2x vs manifest, display px):\n  ' + '\n  '.join(drift))
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
