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
if __name__ == '__main__': unittest.main()
