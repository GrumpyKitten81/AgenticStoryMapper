import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LINKS = load('story86_links', 'check_links.py')
NATIVE = load('story86_native', 'native-quickstart.py')


class HelperProbes(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='story86-helper-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        evidence = self.root / 'evidence'
        evidence.mkdir()
        self.context = {'source': self.root / 'source', 'node_bin': self.root / 'node-bin',
                        'evidence': evidence, 'root': self.root, 'checkout': self.root / 'checkout',
                        'report_path': evidence / 'native-macos.json', 'report': {'commands': [], 'outcomes': {}}}
        self.thread_errors = []
        thread_capture = patch.object(threading, 'excepthook', side_effect=self.thread_errors.append)
        thread_capture.start()
        self.addCleanup(thread_capture.stop)

    def tearDown(self):
        self.assertEqual(self.thread_errors, [])

    def inspect(self, raw):
        return LINKS.inspect_link(self.root, {'README.md', 'docs/guide.md'}, Path('README.md'), 1, raw, {})[0]

    def test_untracked_targets_are_rejected_without_reads(self):
        (self.root / 'ignored.md').write_text('# Private\n')
        (self.root / 'ignored-dir').mkdir()
        with patch.object(Path, 'read_text', side_effect=AssertionError('ignored content read')):
            for raw in ['ignored.md', 'ignored.md#private', 'ignored-dir/']:
                self.assertEqual(self.inspect(raw), 'missing_files')

    def test_invalid_targets_and_exact_placeholder(self):
        with patch.object(Path, 'read_text', side_effect=AssertionError('invalid target read')):
            for raw in ['/missing.md', '{mistyped.md', '{URL}', '../outside.md', 'C:\\private.md']:
                self.assertEqual(self.inspect(raw), 'invalid_targets')
        self.assertEqual(self.inspect('URL'), 'intentional')

    def test_tracked_files_directories_and_anchors(self):
        (self.root / 'README.md').write_text('# Start\n')
        (self.root / 'docs').mkdir()
        (self.root / 'docs/guide.md').write_text('# Guide\n')
        for raw in ['README.md#start', 'docs/', './']:
            self.assertEqual(self.inspect(raw), 'resolved')
        self.assertEqual(self.inspect('README.md#absent'), 'missing_anchors')

    def test_command_deadline_retains_failure_and_log(self):
        with patch.object(NATIVE, 'COMMAND_TIMEOUT', 0.05):
            with self.assertRaises(RuntimeError):
                NATIVE.run(self.context, ['/bin/sleep', '5'], 'timeout', self.root)
        report = json.loads(self.context['report_path'].read_text())
        self.assertTrue(report['commands'][0]['timed_out'])
        self.assertNotEqual(report['commands'][0]['exit_code'], 0)
        self.assertTrue((self.context['evidence'] / 'native-timeout.log').is_file())

    def launch_with_sleep(self, failure):
        original = subprocess.Popen
        processes = []

        def spawn(*args, **kwargs):
            process = original(['/bin/sleep', '5'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            processes.append(process)
            return process

        with patch.object(NATIVE.subprocess, 'Popen', side_effect=spawn), patch.object(NATIVE, 'stopped_health', return_value=True), failure:
            with self.assertRaises((OSError, RuntimeError)):
                NATIVE.launch(self.context, {})
        self.assertIsNotNone(processes[0].poll())
        processes[0].stdout.close()
        self.assertIn('stop', json.loads(self.context['report_path'].read_text())['outcomes'])
        self.assertTrue((self.context['evidence'] / 'native-start.log').is_file())

    def test_thread_start_failure_cleans_launcher(self):
        self.launch_with_sleep(patch.object(threading.Thread, 'start', side_effect=RuntimeError('probe thread failure')))

    def test_report_failure_cleans_launcher(self):
        original = NATIVE.save
        calls = []

        def fail_once(context):
            calls.append(1)
            if len(calls) == 1:
                raise OSError('probe report failure')
            return original(context)

        self.launch_with_sleep(patch.object(NATIVE, 'save', side_effect=fail_once))
        self.assertEqual(self.context['report']['outcomes']['launcher_failure']['type'], 'OSError')

    def stubborn_process(self):
        process = subprocess.Popen([sys.executable, str(HERE / 'helper-probe-child.py')], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        self.assertEqual(process.stdout.readline().strip(), 'ready')
        self.addCleanup(process.stdout.close)
        return process

    def test_shutdown_timeout_retains_report_and_fails(self):
        process = self.stubborn_process()
        errors = []
        thread = threading.Thread(target=NATIVE.capture, args=(self.context, process, errors))
        thread.start()
        with patch.object(NATIVE, 'SHUTDOWN_TIMEOUT', 0.05), patch.object(NATIVE, 'stopped_health', return_value=True):
            with self.assertRaises(RuntimeError):
                NATIVE.stop(self.context, process, thread, errors)
        stop = json.loads(self.context['report_path'].read_text())['outcomes']['stop']
        self.assertTrue(stop['shutdown_timed_out'])
        self.assertFalse(stop['passed'])
        self.assertIsNotNone(process.poll())
        self.assertIn('native-start.log', self.context['report']['log_hashes'])

    def test_failed_postcondition_returns_nonzero(self):
        def failed_launch(context, env):
            process = subprocess.Popen(['/usr/bin/true'], stdout=subprocess.PIPE, text=True)
            errors = []
            thread = threading.Thread(target=NATIVE.capture, args=(context, process, errors))
            thread.start()
            process.wait(timeout=5)
            try:
                NATIVE.stop(context, process, thread, errors)
            finally:
                process.stdout.close()

        destination = self.root / 'new-output'
        with patch.object(sys, 'argv', ['native-quickstart.py', str(self.root), str(self.root / 'node'), str(destination)]), patch.object(NATIVE, 'prepare', return_value={}), patch.object(NATIVE, 'setup'), patch.object(NATIVE, 'launch', side_effect=failed_launch), patch.object(NATIVE, 'stopped_health', return_value=False):
            self.assertEqual(NATIVE.main(), 1)
        self.assertFalse(json.loads((destination / 'native-macos.json').read_text())['outcomes']['stop']['passed'])

    def test_existing_output_is_untouched(self):
        sentinel = self.context['evidence'] / 'native-macos.json'
        sentinel.write_text('existing evidence\n')
        result = subprocess.run([sys.executable, str(HERE / 'native-quickstart.py'), str(self.root), str(self.root / 'node'), str(self.context['evidence'])], capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sentinel.read_text(), 'existing evidence\n')
        self.assertEqual(sorted(p.name for p in self.context['evidence'].iterdir()), ['native-macos.json'])


if __name__ == '__main__':
    unittest.main()
