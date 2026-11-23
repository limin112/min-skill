import os
import stat
import tempfile
import unittest
from pathlib import Path

from helpers import MockCase
from freetoken_bots import opencode as OC

# Fake `opencode` CLI. Behaviour by model:
#   models opencode         -> lists good-free, msgs-only-free, paid-zen, stale-free
#   run -m opencode/good-free        -> rate-limit error, rc 1, no work done
#   run -m opencode/msgs-only-free   -> succeeds
#   run -m opencode/halfway          -> prints work then fails (must NOT be replayed)
FAKE = r'''#!/bin/sh
echo "$@" >> "$FAKE_LOG"
if [ "$1" = "--version" ]; then echo 9.9.9; exit 0; fi
if [ "$1" = "models" ]; then
  printf 'opencode/good-free\nopencode/msgs-only-free\nopencode/paid-zen\nopencode/stale-free\n'; exit 0
fi
if [ "$1" = "run" ]; then
  case "$3" in
    opencode/good-free) echo '{"name":"APIError","data":{"message":"FreeUsageLimitError: rate limit"}}' >&2; exit 1;;
    opencode/msgs-only-free) eval "LAST=\${$#}"; echo "DONE by msgs-only-free: $LAST"; exit 0;;
    opencode/halfway) echo "edited src/app.py"; exit 1;;
  esac
fi
exit 3
'''


class OpenCodeTests(MockCase):
    def setUp(self):
        super().setUp()
        self.bin = tempfile.TemporaryDirectory()
        p = Path(self.bin.name) / 'opencode'
        p.write_text(FAKE)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
        self.log = Path(self.bin.name) / 'calls.log'
        self._path = os.environ['PATH']
        os.environ['PATH'] = self.bin.name + os.pathsep + self._path
        os.environ['FAKE_LOG'] = str(self.log)

    def tearDown(self):
        os.environ['PATH'] = self._path
        os.environ.pop('FAKE_LOG', None)
        self.bin.cleanup()
        super().tearDown()

    def runs(self):
        return [l for l in self.log.read_text().splitlines() if l.startswith('run')]

    def test_zen_free_models_intersect_client(self):
        avail = OC.client_models()
        self.assertEqual(avail, {'good-free', 'msgs-only-free', 'paid-zen', 'stale-free'})
        keys = [m['key'] for m in OC.zen_free_models(self.cat, avail)]
        self.assertEqual(set(keys), {'opencode/good-free', 'opencode/msgs-only-free'},
                         'paid and catalog-unknown models are never chosen')

    def test_resolve_model_free_only(self):
        self.assertEqual(OC.resolve_model(self.cat, 'good-free'), 'opencode/good-free')
        for bad in ('paid-zen', 'opencode/paid-zen', 'stale-free'):
            with self.assertRaises(KeyError):
                OC.resolve_model(self.cat, bad)

    def test_delegate_fails_over_before_any_work(self):
        res = OC.delegate('fix the bug', ['opencode/good-free', 'opencode/msgs-only-free'], log=lambda s: None)
        self.assertTrue(res['ok'])
        self.assertEqual(res['model'], 'opencode/msgs-only-free')
        self.assertIn('DONE by msgs-only-free: fix the bug', res['output'])
        self.assertEqual(len(self.runs()), 2)

    def test_delegate_never_replays_after_partial_work(self):
        res = OC.delegate('fix the bug', ['opencode/halfway', 'opencode/msgs-only-free'], log=lambda s: None)
        self.assertFalse(res['ok'])
        self.assertEqual(len(self.runs()), 1, 'task must not be replayed on another model')

    def test_delegate_passes_dir(self):
        with tempfile.TemporaryDirectory() as d:
            OC.delegate('x', ['opencode/msgs-only-free'], cwd=d, log=lambda s: None)
        self.assertIn('--dir ' + os.path.abspath(d), self.runs()[-1])

    def test_delegate_drops_disable_free_env(self):
        env = dict(os.environ, OPENCODE_DISABLE_FREE_MODELS='1')
        res = OC.delegate('x', ['opencode/msgs-only-free'], env=env, log=lambda s: None)
        self.assertTrue(res['ok'])

    def test_cli_delegate_end_to_end(self):
        import contextlib
        import io
        from freetoken_bots import cli
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            rc = cli.main(['delegate', 'hello', '--no-openrouter'])
        self.assertEqual(rc, 0)
        self.assertIn('DONE by', buf.getvalue())
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(['delegate', 'x', '--model', 'opencode/paid-zen']), 2)
        self.assertNoPaidCalls()


if __name__ == '__main__':
    unittest.main()
