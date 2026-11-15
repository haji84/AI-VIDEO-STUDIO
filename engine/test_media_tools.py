"""Issue #37 equivalent failures in main; synthetic processes, not ZBook proof."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from engine import core_v01 as core
from engine import local_signals
from engine import render_saved_project
from engine.media_tools import MediaToolError, parse_probe_json, resolve_tools


class MediaBoundaryTests(unittest.TestCase):
    def test_present_but_unlaunchable_executable_is_a_domain_error(self):
        with tempfile.TemporaryDirectory() as folder:
            executable=Path(folder)/('ffprobe.exe' if os.name=='nt' else 'ffprobe')
            executable.write_bytes(b'not an executable image');executable.chmod(0o700)
            with self.assertRaisesRegex(core.StudioError,'MEDIA_TOOL_START_FAILED'):
                core.command([str(executable)],timeout=2)

    def test_null_optional_tags_are_absent_and_malformed_dimensions_are_domain_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'synthetic.mp4';source.write_bytes(b'owned fixture')
            metadata={'format':{'duration':'1','tags':None},'streams':[{'codec_type':'video','width':100,'height':100}]}
            with patch.object(core,'command',return_value=subprocess.CompletedProcess(['ffprobe'],0,json.dumps(metadata),'')):
                self.assertIsNone(core.media_info(str(source))['creation_time'])
            metadata['streams'][0]['width']=[1]
            with patch.object(core,'command',return_value=subprocess.CompletedProcess(['ffprobe'],0,json.dumps(metadata),'')):
                with self.assertRaisesRegex(core.StudioError,'FFPROBE_JSON_SCHEMA'):
                    core.media_info(str(source))

    def test_parser_depth_failure_is_bounded_domain_error(self):
        with self.assertRaisesRegex(MediaToolError,'FFPROBE_JSON_'):
            parse_probe_json('['*10000+'0'+']'*10000)

    def test_none_probe_output_is_a_domain_error_instead_of_json_typeerror(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.mp4'
            source.write_bytes(b'fixture owned by this test')
            result = subprocess.CompletedProcess(['ffprobe'], 0, None, '')
            with patch.object(core, 'command', return_value=result):
                with self.assertRaisesRegex(core.StudioError, 'FFPROBE_JSON_EMPTY'):
                    core.media_info(str(source))

    def test_empty_invalid_and_wrong_shape_probe_data_fail_with_safe_codes(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.mp4'
            source.write_bytes(b'fixture owned by this test')
            for output, code in [('', 'EMPTY'), ('  ', 'EMPTY'), ('{broken', 'INVALID'),
                                 ('null', 'SCHEMA'), ('[]', 'SCHEMA'),
                                 ('{"format":null,"streams":[]}', 'SCHEMA'),
                                 ('{"format":{},"streams":[null]}', 'SCHEMA')]:
                with self.subTest(output=output):
                    result = subprocess.CompletedProcess(['ffprobe'], 0, output, '')
                    with patch.object(core, 'command', return_value=result):
                        with self.assertRaisesRegex(core.StudioError, 'FFPROBE_JSON_' + code):
                            core.media_info(str(source))

    def test_signal_analysis_honors_the_same_explicit_tools_as_render(self):
        with tempfile.TemporaryDirectory() as folder:
            tools = Path(folder)
            suffix = '.exe' if os.name == 'nt' else ''
            for name in ['ffmpeg', 'ffprobe']:
                target = tools / (name + suffix)
                target.write_bytes(b'test executable location; not executed')
                target.chmod(0o700)
            with patch.dict(os.environ, {'AIVS_FFMPEG_DIR': folder, 'PATH': ''}):
                expected = str(tools / ('ffprobe' + suffix))
                self.assertEqual(core._which('ffprobe'), expected)
                try:
                    actual = local_signals._program('ffprobe')
                except local_signals.SignalsError:
                    actual = None
                self.assertEqual(actual, expected, 'analysis must use the same tool configuration as rendering')

    def test_none_signal_probe_output_is_a_domain_error(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.mp4'
            source.write_bytes(b'fixture owned by this test')
            with patch.object(local_signals, '_run', return_value=None):
                with self.assertRaisesRegex(local_signals.SignalsError, 'FFPROBE_JSON_EMPTY'):
                    local_signals.analyze_file(source, 'asset_' + '1' * 32)

    def test_saved_renderer_probes_and_decodes_with_no_media_tools_on_path(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.mp4'
            subprocess.run([core._which('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i',
                            'testsrc2=s=96x54:r=10:d=1', '-c:v', 'libx264', str(source)], check=True)
            tool_dir = str(Path(core._which('ffprobe')).parent)
            with patch.dict(os.environ, {'PATH': '', 'AIVS_FFMPEG_DIR': tool_dir}):
                result = render_saved_project._probe_local(source)
                self.assertTrue(any(s['codec_type'] == 'video' for s in result['streams']))
                render_saved_project._run(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 'null', os.devnull], 10)


class WindowsDiscoveryTests(unittest.TestCase):
    @staticmethod
    def pair(directory):
        directory.mkdir(parents=True, exist_ok=True)
        for name in ('ffmpeg.exe', 'ffprobe.exe'):
            (directory / name).write_bytes(b'location fixture, never executed')
            (directory / name).chmod(0o700)
        return {name: str((directory / (name + '.exe')).resolve()) for name in ('ffmpeg', 'ffprobe')}

    def test_stale_launch_path_recovers_a_scoped_user_winget_pair(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / '媒体 工具'
            expected = self.pair(root / 'Microsoft/WinGet/Packages/Gyan.FFmpeg_test/ffmpeg-9.0.2-full_build/bin')
            for launch_path in ('', str(Path(folder) / 'unrelated-shell-bin')):
                with self.subTest(launch_path=launch_path):
                    self.assertEqual(resolve_tools(environ={'LOCALAPPDATA': str(root), 'PATH': launch_path}, windows=True), expected)

    def test_machine_winget_install_does_not_require_a_user_path_entry(self):
        with tempfile.TemporaryDirectory() as folder:
            expected = self.pair(Path(folder) / 'WinGet/Packages/Gyan.FFmpeg_test/ffmpeg-9.0.2-full_build/bin')
            self.assertEqual(resolve_tools(environ={'ProgramFiles': folder, 'PATH': ''}, windows=True), expected)

    def test_explicit_incomplete_pair_never_silently_uses_another_install(self):
        with tempfile.TemporaryDirectory() as folder:
            self.pair(Path(folder) / 'Microsoft/WinGet/Links')
            missing = str(Path(folder) / 'missing')
            with self.assertRaisesRegex(MediaToolError, 'FFMPEG_TOOLCHAIN_INCOMPLETE') as result:
                resolve_tools(environ={'LOCALAPPDATA': folder, 'PATH': '', 'AIVS_FFMPEG_DIR': missing}, windows=True)
            self.assertNotIn(folder, str(result.exception))

    def test_multiple_off_path_installs_need_explicit_selection(self):
        with tempfile.TemporaryDirectory() as folder:
            for version in ('8', '9'):
                self.pair(Path(folder) / f'Microsoft/WinGet/Packages/Gyan.FFmpeg_{version}/ffmpeg-{version}/bin')
            with self.assertRaisesRegex(MediaToolError, 'FFMPEG_TOOLCHAIN_AMBIGUOUS'):
                resolve_tools(environ={'LOCALAPPDATA': folder, 'PATH': ''}, windows=True)


if __name__ == '__main__':
    unittest.main()
