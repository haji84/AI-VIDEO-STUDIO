"""Exercise no-clobber output publication on the actual destination filesystem."""
from pathlib import Path
import errno
import os
import tempfile
import unittest
from unittest import mock

from .render_saved_project import _install_new


class OutputInstallTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='aivs-output-install-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.candidate = self.root / 'candidate.mp4'
        self.output = self.root / 'finished.mp4'
        self.original = b'synthetic verified output\n'
        self.candidate.write_bytes(self.original)

    def assert_candidate_preserved_and_no_staged_files(self):
        self.assertEqual(self.candidate.read_bytes(), self.original)
        self.assertEqual(sorted(path.name for path in self.root.iterdir()),
                         ['candidate.mp4', 'finished.mp4'])

    def test_new_output_is_complete_and_candidate_is_unchanged(self):
        _install_new(self.candidate, self.output)
        self.assertEqual(self.output.read_bytes(), self.original)
        self.assert_candidate_preserved_and_no_staged_files()

    @unittest.skipUnless(os.name == 'nt', 'Windows native no-clobber publication')
    def test_windows_can_publish_when_hard_links_are_unavailable(self):
        with mock.patch('engine.render_saved_project.os.link',
                        side_effect=OSError(errno.EOPNOTSUPP, 'hard links unavailable')):
            _install_new(self.candidate, self.output)
        self.assertEqual(self.output.read_bytes(), self.original)
        self.assert_candidate_preserved_and_no_staged_files()

    def test_existing_output_is_never_replaced(self):
        self.output.write_bytes(b'pre-existing output')
        with self.assertRaises(FileExistsError):
            _install_new(self.candidate, self.output)
        self.assertEqual(self.output.read_bytes(), b'pre-existing output')
        self.assert_candidate_preserved_and_no_staged_files()

    def test_existing_directory_and_its_contents_are_preserved(self):
        self.output.mkdir()
        marker = self.output / 'retained.txt'
        marker.write_bytes(b'keep this directory')
        with self.assertRaises(OSError):
            _install_new(self.candidate, self.output)
        self.assertEqual(marker.read_bytes(), b'keep this directory')
        self.assert_candidate_preserved_and_no_staged_files()


if __name__ == '__main__':
    unittest.main()
