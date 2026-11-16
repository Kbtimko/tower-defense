#!/usr/bin/env python3
"""Review images for a candidate batch.

    python3 scripts/art/prepare_review.py --cache DIR --batch NAME [--job PATH]

For every sprite asset in the job and every candidate that lacks them, writes
  <i>.cut.png      background-removed, mirrored to face the way the game
                   draws it, cropped to its bbox (shown large on the review page)
  <i>.preview.png  the game-size, art-bible-styled cell (shown at real size on
                   a map pad: that, not the raw render, decides whether it reads)
  <i>.cut.json     {"mirror": bool} as shown, so apply anchors a Flip to what the
                   user saw rather than to a facing.json an earlier apply changed

Idempotent (existing files are kept, so the slow cutout never reruns), and one
bad candidate does not stop the rest: exits 1 at the end if any failed.
"""
import argparse
import importlib.util
import json
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_bs = _load('build_sheets', ROOT / 'scripts' / 'build-sprite-sheets.py')
nz = _load('normalize', HERE / 'normalize.py')


def _asset_id(a):
    return f"{a['entity']}.{a['variant']}" if a.get('variant') else a['entity']


def _base_params(base, src_root):
    """The base entity's tone params, as normalize.py computes them, so a variant
    previews in the same colour family as the shipped base. None -> the
    candidate's own tone (base art not built yet)."""
    d0 = next(iter(base['states'].values()))
    src = src_root / d0['path'].removeprefix('assets/')
    if not src.exists():
        return None
    img = nz._read(src)
    first = next(nz.frames_of(img, d0['frameWidth'], d0['frameHeight']))
    return nz._params_for(img[first][..., :3], img[first][..., 3], base['category'],
                          f"{base['category']}/{base['type']}")


def _candidate_indexes(adir):
    return sorted(int(p.stem) for p in adir.glob('*.json') if p.stem.isdigit()
                  and (adir / f'{p.stem}.png').exists())


def prepare(cache, batch, job_path=None, src_root=None):
    """Returns the number of candidates that failed."""
    job_path = Path(job_path) if job_path else HERE / 'jobs' / f'{batch}.json'
    src_root = Path(src_root) if src_root else nz.SRC_ROOT
    job = json.loads(job_path.read_text())
    facing = _bs.load_facing()
    manifest = {f"{e['category']}_{e['type']}": e for e in nz.load_manifest()}

    failed = 0
    for a in job['assets']:
        if a.get('kind') != 'sprite':
            continue
        asset_id = _asset_id(a)
        category, etype, variant = _bs.parse_name(asset_id)
        entry = manifest.get(f'{category}_{etype}')
        adir = Path(cache) / 'candidates' / batch / asset_id
        if entry is None:
            print(f'! {asset_id}: no manifest entry')
            failed += len(_candidate_indexes(adir))
            continue
        mirror = a['mirror'] if 'mirror' in a else _bs.mirror_for(asset_id, facing)
        params = _base_params(entry, src_root) if variant else None
        if variant and params is None:
            print(f'! {asset_id}: base art missing, previewing with its own tone')
        for i in _candidate_indexes(adir):
            cut_p, prev_p = adir / f'{i}.cut.png', adir / f'{i}.preview.png'
            cutj_p = adir / f'{i}.cut.json'
            # The json is written last: a cut without it was interrupted, or made
            # before the mirror was recorded, and is redone.
            if cut_p.exists() and prev_p.exists() and cutj_p.exists():
                continue
            try:
                cut = _bs.cutout(adir / f'{i}.png', keep_largest=not a.get('keepDebris', False))
                if mirror:
                    cut = cut.transpose(Image.FLIP_LEFT_RIGHT)
                cut.save(cut_p)
                nz.preview_frame(cut, entry, tone_params=params).save(prev_p)
                cutj_p.write_text(json.dumps({'mirror': bool(mirror)}) + '\n')
                print(f'  {asset_id} #{i}: ok')
            except Exception:
                traceback.print_exc()
                print(f'  {asset_id} #{i}: FAILED')
                failed += 1
    return failed


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--cache', required=True)
    ap.add_argument('--batch', required=True)
    ap.add_argument('--job')
    args = ap.parse_args(argv)
    failed = prepare(args.cache, args.batch, args.job)
    print(f'{failed} candidate(s) failed' if failed else 'review images ready')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
