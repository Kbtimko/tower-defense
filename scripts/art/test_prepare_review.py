import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare_review', HERE / 'prepare_review.py')
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

# Asymmetric so a mirror is detectable: opaque only on the left half.
def fake_cut(*_a, **_k):
    im = Image.new('RGBA', (60, 40), (0, 0, 0, 0))
    im.paste((180, 90, 60, 255), (0, 0, 30, 40))
    return im


class PrepareReview(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cache = Path(tmp.name) / 'cache'
        self.job = Path(tmp.name) / 'job.json'
        self.job.write_text(json.dumps({'batch': 't', 'assets': [
            {'kind': 'sprite', 'entity': 'tower_cannon'},
            {'kind': 'sprite', 'entity': 'tower_archer', 'variant': 't4a', 'mirror': False},
            {'kind': 'portrait', 'id': 'portrait-rael'}]}))
        self.dir = self.cache / 'candidates' / 't' / 'tower_cannon'
        self.dir.mkdir(parents=True)
        for i in (0, 1):
            Image.new('RGB', (32, 32), (50, 60, 70)).save(self.dir / f'{i}.png')
            (self.dir / f'{i}.json').write_text('{}')

    def run_prep(self, cut=fake_cut):
        with mock.patch.object(pr._bs, 'cutout', side_effect=cut) as m:
            return pr.prepare(self.cache, 't', self.job), m

    def test_writes_cut_and_game_size_preview(self):
        failed, _ = self.run_prep()
        self.assertEqual(failed, 0)
        cell = next(e for e in pr.nz.load_manifest()
                    if (e['category'], e['type']) == ('tower', 'cannon'))['states']['idle']['frameWidth']
        for i in (0, 1):
            self.assertTrue((self.dir / f'{i}.cut.png').exists())
            with Image.open(self.dir / f'{i}.preview.png') as im:
                self.assertEqual(im.size, (cell, cell))

    def test_cannon_is_mirrored_per_facing_table(self):
        self.run_prep()
        cut = Image.open(self.dir / '0.cut.png')
        # facing.json mirrors tower_cannon, so the opaque left half ends up right.
        self.assertEqual(cut.getpixel((5, 20))[3], 0)
        self.assertEqual(cut.getpixel((55, 20))[3], 255)

    def test_job_mirror_override_wins(self):
        d = self.cache / 'candidates' / 't' / 'tower_archer.t4a'
        d.mkdir(parents=True)
        Image.new('RGB', (32, 32)).save(d / '0.png')
        (d / '0.json').write_text('{}')
        self.run_prep()
        self.assertEqual(Image.open(d / '0.cut.png').getpixel((5, 20))[3], 255)

    def test_second_run_does_not_recut(self):
        self.run_prep()
        failed, m = self.run_prep()
        self.assertEqual(failed, 0)
        m.assert_not_called()

    def test_corrupt_candidate_does_not_stop_others(self):
        def cut(path, keep_largest=True):
            if Path(path).name == '1.png':
                raise OSError('cannot identify image file')
            return fake_cut()
        failed, _ = self.run_prep(cut)
        self.assertEqual(failed, 1)
        self.assertTrue((self.dir / '0.cut.png').exists())
        self.assertTrue((self.dir / '0.preview.png').exists())
        self.assertFalse((self.dir / '1.preview.png').exists())
        with mock.patch.object(pr, 'prepare', return_value=1):
            self.assertEqual(pr.main(['--cache', str(self.cache), '--batch', 't']), 1)

    def _with_archer(self, **extra):
        d = self.cache / 'candidates' / 't' / 'tower_archer.t4a'
        d.mkdir(parents=True)
        Image.new('RGB', (32, 32)).save(d / '0.png')
        (d / '0.json').write_text('{}')
        return d

    def test_tone_params_variant_gets_base_base_gets_own(self):
        self._with_archer()
        with mock.patch.object(pr.nz, 'preview_frame', wraps=pr.nz.preview_frame) as spy:
            self.run_prep()
        by_type = {c.args[1]['type']: c.kwargs.get('tone_params') for c in spy.call_args_list}
        self.assertIsNone(by_type['cannon'])
        self.assertIsNotNone(by_type['archer'])

    def test_keep_debris_maps_to_keep_largest(self):
        for debris, expected in ((False, True), (True, False)):
            with self.subTest(keepDebris=debris):
                for f in self.dir.glob('*.cut.png'):
                    f.unlink()
                for f in self.dir.glob('*.preview.png'):
                    f.unlink()
                job = json.loads(self.job.read_text())
                job['assets'][0]['keepDebris'] = debris
                self.job.write_text(json.dumps(job))
                _, m = self.run_prep()
                self.assertTrue(m.call_args_list)
                for c in m.call_args_list:
                    self.assertIs(c.kwargs['keep_largest'], expected)


if __name__ == '__main__':
    unittest.main()
