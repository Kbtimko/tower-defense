import contextlib
import importlib.util
import io
import tempfile
import unittest
from unittest import mock
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('build_sheets', HERE.parent / 'build-sprite-sheets.py')
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)


class ParseName(unittest.TestCase):
    def test_base(self):
        self.assertEqual(bs.parse_name('tower_archer'), ('tower', 'archer', None))

    def test_variant(self):
        self.assertEqual(bs.parse_name('tower_archer.t4a'), ('tower', 'archer', 't4a'))

    def test_soldier_default_is_a_type_not_a_variant(self):
        self.assertEqual(bs.parse_name('soldier_default'), ('soldier', 'default', None))


class MirrorFor(unittest.TestCase):
    facing = {'default': True, 'tower_archer': False}

    def test_exact_base_key(self):
        self.assertFalse(bs.mirror_for('tower_archer', self.facing))

    def test_variant_inherits_base(self):
        self.assertFalse(bs.mirror_for('tower_archer.t4a', self.facing))

    def test_unlisted_falls_to_default(self):
        self.assertTrue(bs.mirror_for('tower_cannon', self.facing))
        self.assertTrue(bs.mirror_for('enemy_drone', self.facing))

    def test_exact_variant_key_beats_base(self):
        f = {'default': True, 'tower_archer': False, 'tower_archer.t4a': True}
        self.assertTrue(bs.mirror_for('tower_archer.t4a', f))
        self.assertFalse(bs.mirror_for('tower_archer.t4b', f))

    def test_missing_default_mirrors(self):
        self.assertTrue(bs.mirror_for('enemy_drone', {}))


class OutputPaths(unittest.TestCase):
    def test_variant_filename(self):
        p = bs.sheet_path(Path('/o'), 'tower', 'archer', 't4a', 'idle')
        self.assertEqual(p, Path('/o/towers/archer_t4a_idle.png'))

    def test_base_filename(self):
        p = bs.sheet_path(Path('/o'), 'sentry', 'default', None, 'attack')
        self.assertEqual(p, Path('/o/sentry/default_attack.png'))


class FacingFile(unittest.TestCase):
    def test_shipped_table(self):
        f = bs.load_facing()
        for k in ('tower_archer', 'tower_mage', 'tower_ice', 'tower_sniper', 'tower_barracks',
                  'hero_engineer', 'hero_scout', 'soldier_default', 'sentry_default'):
            self.assertFalse(bs.mirror_for(k, f), k)
        # hero_rael: the mirrored build is the one that reproduces the shipped sheets.
        for k in ('tower_cannon', 'hero_pyro', 'hero_rael', 'enemy_drone'):
            self.assertTrue(bs.mirror_for(k, f), k)


    def test_missing_table_exits(self):
        with self.assertRaises(SystemExit):
            bs.load_facing(Path('/nonexistent/facing.json'))


def run_main(argv):
    out = io.StringIO()
    with mock.patch('sys.argv', ['build'] + argv), contextlib.redirect_stdout(out):
        bs.main()
    return out.getvalue()


def left_heavy_ref():
    """Opaque 40x40 whose left half is red and right half blue, so a flip is
    visible in the output without needing rembg."""
    from PIL import Image
    im = Image.new('RGBA', (40, 40), (0, 0, 255, 255))
    im.paste((255, 0, 0, 255), (0, 0, 20, 40))
    return im


class BuildLoop(unittest.TestCase):
    def setUp(self):
        from PIL import Image
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.refs = Path(self.tmp.name) / 'refs'
        self.out = Path(self.tmp.name) / 'out'
        self.refs.mkdir()
        for n in ('tower_archer', 'tower_archer.t4a', 'tower_cannon', 'enemy_drone'):
            left_heavy_ref().save(self.refs / f'{n}.png')
        p = mock.patch.object(bs, 'cutout', lambda path, keep_largest=True: Image.open(path).convert('RGBA'))
        p.start()
        self.addCleanup(p.stop)

    def build(self, *argv):
        return run_main(list(argv) + ['--ref-dir', str(self.refs), '--out-root', str(self.out)])

    def sheet(self, rel):
        from PIL import Image
        return Image.open(self.out / rel).convert('RGBA')

    def test_variant_matches_base_cell_and_frames(self):
        self.build('tower_archer', 'tower_archer.t4a')
        for st in ('idle', 'attack'):
            base = self.sheet(f'towers/archer_{st}.png')
            var = self.sheet(f'towers/archer_t4a_{st}.png')
            self.assertEqual(var.size, base.size, st)
        self.assertEqual(self.sheet('towers/archer_t4a_idle.png').size, (96, 96))
        self.assertEqual(self.sheet('towers/archer_t4a_attack.png').size, (96 * 5, 96))

    def left_is_red(self, rel):
        # Sample the middle of the sheet's first cell: the colour split is
        # at the centre, so look a quarter cell either side of it.
        im = self.sheet(rel)
        cell = im.height
        l, r = im.getpixel((cell // 2 - cell // 6, cell // 2)), im.getpixel((cell // 2 + cell // 6, cell // 2))
        return l[0] > l[2] and r[2] > r[0]

    def test_table_decides_and_flags_override(self):
        self.build('tower_archer', 'tower_cannon')
        self.assertTrue(self.left_is_red('towers/archer_idle.png'))     # table: no mirror
        self.assertFalse(self.left_is_red('towers/cannon_idle.png'))    # default: mirror
        self.build('tower_archer', 'tower_cannon', '--mirror')
        self.assertFalse(self.left_is_red('towers/archer_idle.png'))
        self.build('tower_archer', 'tower_cannon', '--no-mirror')
        self.assertTrue(self.left_is_red('towers/cannon_idle.png'))

    def test_all_includes_variants_and_skips_not_reproducible(self):
        out = self.build('--all')
        self.assertTrue((self.out / 'towers/archer_t4a_idle.png').exists())
        self.assertFalse((self.out / 'enemies').exists())
        self.assertIn('enemy_drone: SKIP in --all', out)

    def test_explicit_name_builds_not_reproducible(self):
        self.build('enemy_drone')
        self.assertTrue((self.out / 'enemies/drone_move.png').exists())


if __name__ == '__main__':
    unittest.main()
