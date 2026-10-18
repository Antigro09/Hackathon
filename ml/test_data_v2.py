import copy
import unittest

from ml.data_v2 import assert_mixed_disjoint, development_split, fresh_test_record


def row(identity, uploader, split, original='dev', dataset='FSD50K'):
    return {'clip_id': identity, 'uploader_group': uploader, 'split': split,
            'original_split': original, 'dataset': dataset,
            'sha256': identity + '-prepared', 'original_sha256': identity + '-raw',
            'pcm_sha256': identity + '-pcm'}


class FreshCohortTests(unittest.TestCase):
    def test_excludes_old_uploader_even_when_new_clip_and_hashes(self):
        old = [row('old', 'person', 'test', 'eval')]
        self.assertFalse(fresh_test_record(row('new', 'person', 'test', 'eval'), old))
        self.assertTrue(fresh_test_record(row('new', 'new-person', 'test', 'eval'), old))

    def test_excludes_any_old_identifier_or_audio_hash(self):
        old = [row('old', 'old-person', 'ood_test', 'eval')]
        for field in ('clip_id', 'sha256', 'original_sha256', 'pcm_sha256'):
            fresh = row('new', 'new-person', 'test', 'eval')
            fresh[field] = old[0][field]
            self.assertFalse(fresh_test_record(fresh, old), field)

    def test_preserves_calibration_groups_and_groups_new_clips_without_mutation(self):
        old = [row('a', 'train-person', 'train'), row('b', 'val-person', 'val')]
        before = copy.deepcopy(old)
        self.assertEqual(development_split(row('c', 'train-person', 'train'), old), 'train')
        self.assertEqual(development_split(row('d', 'val-person', 'train'), old), 'val')
        self.assertEqual(development_split(row('e', 'new-person', 'train'), old),
                         development_split(row('f', 'new-person', 'train'), old))
        self.assertEqual(old, before)

    def test_checks_machine_groups_across_supplemental_splits(self):
        rows = [row('a', 'mimii:fan:00', 'train', '0_dB', 'MIMII'),
                row('b', 'mimii:fan:06', 'test', '0_dB', 'MIMII')]
        assert_mixed_disjoint(rows)
        rows[1]['uploader_group'] = rows[0]['uploader_group']
        with self.assertRaisesRegex(ValueError, 'uploader_group'):
            assert_mixed_disjoint(rows)

    def test_fsd_test_requires_official_eval_but_machine_split_is_derived(self):
        with self.assertRaisesRegex(ValueError, 'official evaluation'):
            assert_mixed_disjoint([row('a', 'person', 'test', 'dev')])
        assert_mixed_disjoint([row('b', 'mimii:fan:06', 'test', '0_dB', 'MIMII')])


if __name__ == '__main__':
    unittest.main()
