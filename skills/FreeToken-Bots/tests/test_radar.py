import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('radar', Path(__file__).resolve().parents[1] / 'scripts' / 'radar.py')
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)
class ModelTests(unittest.TestCase):
    def test_price(self):
        self.assertTrue(radar.is_free({'pricing': {'prompt': '0', 'completion': '0'}}))
        self.assertFalse(radar.is_free({'pricing': {'prompt': '0', 'completion': '0.00001'}}))
    def test_unknown_parameters_fail_closed(self):
        self.assertFalse(radar.eligible({'id':'some/550b:free','pricing':{'prompt':'0','completion':'0'},'supported_parameters':['tools']}))
    def test_verified_parameters(self):
        self.assertTrue(radar.eligible({'id':'any','total_parameters':120000000000,'pricing':{'prompt':'0','completion':'0'},'supported_parameters':['tools']}))

class ResolveTests(unittest.TestCase):
    """v0.1.1 fail-closed model resolution: never trust a hand-typed ID."""
    def setUp(self):
        self._orig = radar.free_ids
        radar.free_ids = lambda: {'a/model:free', 'openrouter/free'}
    def tearDown(self):
        radar.free_ids = self._orig
    def test_exact_id_used_asis(self):
        self.assertEqual(radar.resolve_free_model('a/model:free'), 'a/model:free')
    def test_missing_free_suffix_autocorrects(self):
        # Dropping ':free' silently routes to the PAID variant; auto-correct loudly.
        self.assertEqual(radar.resolve_free_model('a/model'), 'a/model:free')
    def test_unknown_id_refused(self):
        with self.assertRaises(radar.NotFreeError):
            radar.resolve_free_model('x/paid-model')
    def test_blank_id_refused(self):
        with self.assertRaises(radar.NotFreeError):
            radar.resolve_free_model('   ')

class KeySecretTests(unittest.TestCase):
    """The API key must never appear in probe output."""
    def test_key_masked_in_api_error(self):
        orig = radar.request
        radar.request = lambda *a, **kw: {'error': 'bad key sk-or-secret'}
        try:
            res = radar.probe('a/model:free', 'sk-or-secret')
        finally:
            radar.request = orig
        self.assertNotIn('sk-or-secret', res['error'])
    def test_key_masked_in_exception(self):
        orig = radar.request
        def fail(*a, **kw):
            raise ValueError('boom sk-or-secret')
        radar.request = fail
        try:
            res = radar.probe('a/model:free', 'sk-or-secret')
        finally:
            radar.request = orig
        self.assertNotIn('sk-or-secret', res['error'])

if __name__ == '__main__': unittest.main()
