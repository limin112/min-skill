import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))

import mock_upstream  # noqa: E402


class MockCase(unittest.TestCase):
    """Isolated FTB_HOME + a running mock upstream + a scanned catalog."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._env = {k: os.environ.get(k) for k in ('FTB_HOME', 'OPENROUTER_API_KEY', 'OPENCODE_API_KEY',
                                                    'FTB_ROUTER_KEY', 'FTB_CONFIG')}
        os.environ['FTB_HOME'] = self.tmp.name
        os.environ['OPENROUTER_API_KEY'] = 'test-or'
        os.environ['OPENCODE_API_KEY'] = 'test-zen'
        os.environ.pop('FTB_ROUTER_KEY', None)
        os.environ.pop('FTB_CONFIG', None)
        self.srv, self.mock = mock_upstream.start()
        self.port = self.srv.server_address[1]
        self.cfg = mock_upstream.test_config(self.port)
        from freetoken_bots import catalog as C
        self.cat, self.events = C.scan(self.cfg)

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.tmp.cleanup()

    def router(self, **routing):
        from freetoken_bots.quota import State
        from freetoken_bots.routing import Router
        self.cfg['routing'].update(routing)
        return Router(self.cfg, state=State())

    def upstream_models(self):
        return [m for _, m, _ in self.mock.calls]

    def assertNoPaidCalls(self):
        paid = {'vendor/big-free', 'vendor/paid-model', 'paid-zen'}
        self.assertFalse(paid & set(self.upstream_models()), self.upstream_models())
        zen = [m for prov, m, _ in self.mock.calls if prov == 'zen']
        self.assertEqual(zen, [], 'Zen free tier is OpenCode-client-only; the router must never call it')
