import importlib.util
import unittest
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
        for k in ('tower_cannon', 'hero_pyro', 'hero_rael', 'enemy_drone'):
            self.assertTrue(bs.mirror_for(k, f), k)


if __name__ == '__main__':
    unittest.main()
