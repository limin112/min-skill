import contextlib
import io
import json
import os
import stat
import tempfile
import unittest

import helpers  # noqa: F401
from freetoken_bots import cli
from freetoken_bots.common import (DEFAULT_CONFIG, key_source, keyed_providers, keys_file, load_keys,
                                   provider_key, save_keys)

ENVS = ('FTB_HOME', 'FTB_CONFIG', 'OPENROUTER_API_KEY', 'OPENCODE_API_KEY')


class KeyStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = {k: os.environ.get(k) for k in ENVS}
        for k in ENVS:
            os.environ.pop(k, None)
        os.environ['FTB_HOME'] = self.tmp.name
        # unreachable OpenRouter so `setup` never calls the real API in tests
        cfg = os.path.join(self.tmp.name, 'config.json')
        with open(cfg, 'w') as f:
            json.dump({'providers': {'openrouter': {'base_url': 'http://127.0.0.1:9/api/v1'}}}, f)
        os.environ['FTB_CONFIG'] = cfg

    def tearDown(self):
        for k, v in self.old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.tmp.cleanup()

    def test_save_load_and_mode(self):
        save_keys({'OPENROUTER_API_KEY': 'sk-or-1', 'OPENCODE_API_KEY': 'zen-1'})
        self.assertEqual(load_keys(), {'OPENROUTER_API_KEY': 'sk-or-1', 'OPENCODE_API_KEY': 'zen-1'})
        self.assertEqual(stat.S_IMODE(keys_file().stat().st_mode), 0o600)
        save_keys({'OPENCODE_API_KEY': 'zen-2'})  # merge, keeps the other key
        self.assertEqual(load_keys()['OPENROUTER_API_KEY'], 'sk-or-1')
        self.assertEqual(load_keys()['OPENCODE_API_KEY'], 'zen-2')

    def test_env_takes_precedence(self):
        save_keys({'OPENROUTER_API_KEY': 'from-file'})
        self.assertEqual(provider_key(DEFAULT_CONFIG, 'openrouter'), 'from-file')
        self.assertEqual(key_source(DEFAULT_CONFIG, 'openrouter'), 'keys.env')
        os.environ['OPENROUTER_API_KEY'] = 'from-env'
        self.assertEqual(provider_key(DEFAULT_CONFIG, 'openrouter'), 'from-env')
        self.assertEqual(key_source(DEFAULT_CONFIG, 'openrouter'), 'env')

    def test_opencode_needs_no_key(self):
        os.environ['OPENCODE_API_KEY'] = 'zen'
        self.assertIsNone(provider_key(DEFAULT_CONFIG, 'opencode'), 'router never uses a Zen key')
        self.assertEqual(keyed_providers(DEFAULT_CONFIG), ['openrouter'])

    def test_parses_export_and_quotes(self):
        keys_file().parent.mkdir(parents=True, exist_ok=True)
        keys_file().write_text('# c\nexport OPENROUTER_API_KEY="sk-or-q"\nOPENCODE_API_KEY=\'z\'\n')
        self.assertEqual(load_keys(), {'OPENROUTER_API_KEY': 'sk-or-q', 'OPENCODE_API_KEY': 'z'})

    def test_setup_from_env_saves_openrouter_key(self):
        os.environ['OPENROUTER_API_KEY'] = 'sk-or-x'
        os.environ['OPENCODE_API_KEY'] = 'zen-x'
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(['setup', '--from-env'])
        self.assertEqual(rc, 0)
        self.assertEqual(load_keys(), {'OPENROUTER_API_KEY': 'sk-or-x'}, 'no Zen key is stored')
        self.assertNotIn('sk-or-x', buf.getvalue(), 'keys are never printed')
        self.assertNotIn('zen-x', buf.getvalue())

    def test_setup_without_tty_refuses(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            rc = cli.main(['setup'])
        self.assertEqual(rc, 2)
        self.assertFalse(keys_file().exists())

    def test_first_run_hint_once(self):
        for _ in range(2):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                cli.main(['agents'])
            if _ == 0:
                self.assertIn('ftb setup', err.getvalue())
            else:
                self.assertNotIn('ftb setup', err.getvalue())


if __name__ == '__main__':
    unittest.main()
