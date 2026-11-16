import importlib.util
import json
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

    def test_given_tone_params_are_used(self):
        cut = Image.new('RGBA', (100, 100), (150, 150, 150, 255))
        dark = dict(gamma=3.0, mean=0.2, gain=1.0, sat=1.0)
        a = np.asarray(nz.preview_frame(cut, ENTRY, tone_params=dark))
        b = np.asarray(nz.preview_frame(cut, ENTRY))
        self.assertLess(a[32, 32, 0], b[32, 32, 0])


if __name__ == '__main__':
    unittest.main()
