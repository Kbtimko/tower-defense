import contextlib
import importlib.util
import io
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('normalize', HERE / 'normalize.py')
nz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nz)

CELL = 64


def write_sheet(path, brightness, frames=1):
    """Opaque grey blob on a transparent cell; `brightness` in 0..255."""
    im = np.zeros((CELL, CELL * frames, 4), dtype=np.uint8)
    for f in range(frames):
        im[16:48, f * CELL + 16:f * CELL + 48] = (brightness, brightness, brightness, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(im, 'RGBA').save(path)


def state(path):
    return {'path': path, 'frameWidth': CELL, 'frameHeight': CELL, 'frames': 1}


ENTRY = {
    'category': 'tower', 'type': 'archer', 'scale': 1,
    'states': {'idle': state('assets/sprites/towers/archer_idle.png'),
               'attack': state('assets/sprites/towers/archer_attack.png')},
    'variants': {'t4a': {'states': {
        'idle': state('assets/sprites/towers/archer_t4a_idle.png'),
        'attack': state('assets/sprites/towers/archer_t4a_attack.png')}}},
}


class NormalizeEntry(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src = Path(self.tmp.name) / 'src'
        self.out = Path(self.tmp.name) / 'out'
        for name, b in (('archer_idle', 60), ('archer_attack', 60),
                        ('archer_t4a_idle', 120), ('archer_t4a_attack', 120)):
            write_sheet(self.src / 'sprites' / 'towers' / f'{name}.png', b)

    def run_entry(self, **kw):
        return nz.normalize_entry(ENTRY, src_root=self.src, out_root=self.out, **kw)

    def test_variant_reuses_base_tone_params(self):
        real = nz.tone_params
        calls = []

        def spy(rgb, a, category):
            calls.append((rgb.copy(), category))
            return real(rgb, a, category)

        with mock.patch.object(nz, 'tone_params', spy):
            self.run_entry()
        self.assertEqual(len(calls), 1)
        base_first = np.asarray(Image.open(self.src / 'sprites/towers/archer_idle.png')
                                .convert('RGBA'), dtype=np.float32) / 255
        np.testing.assert_allclose(calls[0][0], base_first[..., :3])

    def test_variant_of_brighter_pixels_is_toned_like_base(self):
        # Own-tone would pull the bright variant down toward the band; with the
        # base's params the 2x-brighter input stays brighter after the pass.
        self.run_entry()
        base = np.asarray(Image.open(self.out / 'assets/sprites/towers/archer_idle.png'))
        var = np.asarray(Image.open(self.out / 'assets/sprites/towers/archer_t4a_idle.png'))
        self.assertGreater(var[32, 32, 0], base[32, 32, 0])

    def test_only_variant_writes_only_variant_files_but_uses_base_tone(self):
        real = nz.tone_params
        calls = []
        with mock.patch.object(nz, 'tone_params',
                               lambda *a: calls.append(a) or real(*a)):
            recs = self.run_entry(only_variants=['t4a'], include_base=False)
        written = sorted(p.name for p in (self.out / 'assets/sprites/towers').iterdir())
        self.assertEqual(written, ['archer_t4a_attack.png', 'archer_t4a_idle.png'])
        self.assertEqual([r['key'] for r in recs], ['tower/archer.t4a'])
        self.assertEqual(len(calls), 1)

    def test_records_one_per_key_with_ground(self):
        recs = self.run_entry()
        self.assertEqual([r['key'] for r in recs], ['tower/archer', 'tower/archer.t4a'])
        for r in recs:
            self.assertEqual(set(r['ground']), {'footY', 'width'})
            self.assertIsInstance(r['ground']['footY'], float)

    def test_base_only(self):
        recs = self.run_entry(only_variants=[])
        self.assertEqual([r['key'] for r in recs], ['tower/archer'])
        self.assertFalse((self.out / 'assets/sprites/towers/archer_t4a_idle.png').exists())


class CliGroundJson(unittest.TestCase):
    def test_ground_json_and_only_selector(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            write_sheet(t / 'src/sprites/towers/archer_t4a_idle.png', 120)
            write_sheet(t / 'src/sprites/towers/archer_idle.png', 60)
            manifest = {'category': 'tower', 'type': 'archer', 'scale': 1,
                        'states': {'idle': state('assets/sprites/towers/archer_idle.png')},
                        'variants': {'t4a': {'states': {
                            'idle': state('assets/sprites/towers/archer_t4a_idle.png')}}}}
            mf = t / 'manifest.json'
            mf.write_text(json.dumps([manifest]))
            gj = t / 'ground.json'
            with mock.patch.object(nz, 'load_manifest', lambda: json.loads(mf.read_text())), \
                 mock.patch.object(nz, 'REVIEW', t / 'review'):
                rc = nz.main(['--only', 'tower/archer.t4a', '--src-root', str(t / 'src'),
                              '--out-root', str(t / 'out'), '--ground-json', str(gj)])
            self.assertEqual(rc, 0)
            self.assertEqual([r['key'] for r in json.loads(gj.read_text())], ['tower/archer.t4a'])
            self.assertFalse((t / 'out/assets/sprites/towers/archer_idle.png').exists())
            self.assertTrue((t / 'out/assets/sprites/towers/archer_t4a_idle.png').exists())


class PreviewFrame(unittest.TestCase):
    def test_cell_sized_rgba_with_navy_outline(self):
        cut = Image.new('RGBA', (200, 120), (0, 0, 0, 0))
        cut.paste(Image.new('RGBA', (100, 60), (150, 90, 60, 255)), (50, 30))
        out = nz.preview_frame(cut, ENTRY)
        self.assertEqual(out.mode, 'RGBA')
        self.assertEqual(out.size, (CELL, CELL))
        px = np.asarray(out)
        navy = (px[..., 3] > 200) & (np.abs(px[..., :3].astype(int) - [0x0b, 0x10, 0x20]).sum(-1) < 12)
        self.assertTrue(navy.any())

    def test_skip_tone_entity_is_not_toned_in_preview(self):
        cut = Image.new('RGBA', (100, 100), (200, 200, 200, 255))
        with mock.patch.object(nz, 'SKIP_TONE', {'tower/archer'}):
            skipped = np.asarray(nz.preview_frame(cut, ENTRY))
        toned = np.asarray(nz.preview_frame(cut, ENTRY))
        self.assertGreater(skipped[32, 32, 0], toned[32, 32, 0])

    def test_given_tone_params_are_used(self):
        cut = Image.new('RGBA', (100, 100), (150, 150, 150, 255))
        dark = dict(gamma=3.0, mean=0.2, gain=1.0, sat=1.0)
        a = np.asarray(nz.preview_frame(cut, ENTRY, tone_params=dark))
        b = np.asarray(nz.preview_frame(cut, ENTRY))
        self.assertLess(a[32, 32, 0], b[32, 32, 0])


def write_sheet_2x(path, brightness, shift=0):
    """The same silhouette as write_sheet at twice the pixels. `shift` pushes it
    down by that many source px to fake ground drift."""
    im = np.zeros((CELL * 2, CELL * 2, 4), dtype=np.uint8)
    im[32 + shift:96 + shift, 32:96] = (brightness, brightness, brightness, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(im, 'RGBA').save(path)


def at2x(rel):
    return rel.replace('.png', '@2x.png')


def one_state_entry(name, ground=None):
    e = {'category': 'tower', 'type': name, 'scale': 1,
         'states': {'idle': state(f'assets/sprites/towers/{name}_idle.png')}}
    if ground:
        e['ground'] = ground
    return e


def ring_coverage(path):
    """Summed outline alpha left of the blob on the centre row."""
    px = np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32) / 255
    h = px.shape[0]
    return float(px[h // 2, : h // 4, 3].sum())


class Scale2(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.t = Path(self.tmp.name)
        p = mock.patch.object(nz, 'REVIEW', self.t / 'review')
        p.start()
        self.addCleanup(p.stop)

    def run_main(self, manifest, *argv):
        mf = self.t / 'manifest.json'
        mf.write_text(json.dumps(manifest))
        with mock.patch.object(nz, 'load_manifest', lambda: json.loads(mf.read_text())), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            rc = nz.main(['--src-root', str(self.t / 'src'), '--out-root', str(self.t / 'out'),
                          '--sprite2x-js', str(self.t / 'sprite2x.js'), *argv])
        return rc, out.getvalue()

    def test_scale_2_keeps_outline_display_width(self):
        write_sheet(self.t / 'src/sprites/towers/blob_idle.png', 120)
        write_sheet_2x(self.t / 'src/sprites/towers/blob_idle@2x.png', 120)
        e = one_state_entry('blob')
        self.run_main([e], '--only', 'tower/blob')
        self.run_main([e], '--only', 'tower/blob', '--scale', '2')
        one = ring_coverage(self.t / 'out/assets/sprites/towers/blob_idle.png')
        two = ring_coverage(self.t / 'out/assets/sprites/towers/blob_idle@2x.png')
        # The soft edge covers (width - 0.5) px, so compare width = coverage + 0.5.
        self.assertAlmostEqual(two + 0.5, 2 * (one + 0.5), delta=0.05)
        with Image.open(self.t / 'out/assets/sprites/towers/blob_idle@2x.png') as im:
            self.assertEqual(im.size, (CELL * 2, CELL * 2))

    def drift_run(self, shift):
        write_sheet_2x(self.t / 'src/sprites/towers/blob_idle@2x.png', 120, shift)
        # The manifest's ground is whatever the unshifted 2x silhouette measures.
        write_sheet_2x(self.t / 'ref/sprites/towers/blob_idle@2x.png', 120)
        base = nz.normalize_entry(one_state_entry('blob'), src_root=self.t / 'ref',
                                  out_root=self.t / 'refout', px=2)[0]['ground']
        return self.run_main([one_state_entry('blob', base)], '--scale', '2')

    def test_scale_2_passes_when_ground_matches(self):
        rc, _ = self.drift_run(0)
        self.assertEqual(rc, 0)

    def test_scale_2_fails_on_ground_drift(self):
        shift = math.ceil(1.0 / (1 / 2))
        rc, out = self.drift_run(shift)
        self.assertNotEqual(rc, 0)
        self.assertIn('tower/blob', out)

    def drift_msgs(self, field, delta):
        rec = {'key': 'tower/blob', 'ground': {field: 30 + delta}, 'expected': {field: 30}}
        return nz.ground_drift([rec])

    def test_width_tolerance_is_the_outline_width(self):
        tol = nz.OUTLINE_DISPLAY_PX
        self.assertEqual(self.drift_msgs('width', tol - 0.1), [])
        self.assertEqual(len(self.drift_msgs('width', tol + 0.1)), 1)
        self.assertEqual(len(self.drift_msgs('width', -(tol + 0.1))), 1)

    def test_footY_tolerance_is_half_the_outline_width(self):
        tol = nz.OUTLINE_DISPLAY_PX / 2
        self.assertEqual(self.drift_msgs('footY', tol - 0.05), [])
        self.assertEqual(len(self.drift_msgs('footY', tol + 0.05)), 1)

    def test_scale_2_skips_entry_without_at2x_source(self):
        write_sheet(self.t / 'src/sprites/towers/blob_idle.png', 120)   # 1x only
        rc, out = self.run_main([one_state_entry('blob')], '--scale', '2')
        self.assertEqual(rc, 0)
        self.assertIn('missing', out)
        self.assertFalse((self.t / 'out/assets/sprites/towers/blob_idle@2x.png').exists())

    def test_sprite2x_js_is_regenerated_from_every_at2x_file_on_disk(self):
        # An earlier run left skitter's 2x sheet; this --only run touches archer.
        write_sheet_2x(self.t / 'out/assets/sprites/enemies/skitter_move@2x.png', 120)
        write_sheet_2x(self.t / 'src/sprites/towers/archer_idle@2x.png', 120)
        archer = one_state_entry('archer')
        skitter = one_state_entry('skitter')
        rc, _ = self.run_main([archer, skitter], '--only', 'tower/archer', '--scale', '2')
        self.assertEqual(rc, 0)
        text = (self.t / 'sprite2x.js').read_text()
        self.assertIn('generated', text.splitlines()[0].lower())
        self.assertIn('export const SPRITE_2X = new Set([\n'
                      "  'assets/sprites/enemies/skitter_move.png',\n"
                      "  'assets/sprites/towers/archer_idle.png',\n"
                      ']);', text)

    def test_scale_1_does_not_touch_sprite2x_js(self):
        write_sheet(self.t / 'src/sprites/towers/blob_idle.png', 120)
        self.run_main([one_state_entry('blob')])
        self.assertFalse((self.t / 'sprite2x.js').exists())


if __name__ == '__main__':
    unittest.main()
