import copy
import os
import tempfile
import unittest

import helpers  # noqa: F401
from freetoken_bots import catalog as C
from freetoken_bots.common import DEFAULT_CONFIG


def m(key, free=True, expires=None, callable_=True, provider=None):
    provider = provider or key.split('/')[0]
    return {'key': key, 'provider': provider, 'id': key.split('/', 1)[1], 'name': key, 'free': free,
            'price_note': 'free' if free else 'in=$1/M', 'expires': expires, 'api_callable': callable_,
            'monitor_reason': None, 'anonymous': False, 'price_schedule': [], 'tools': True,
            'context_length': 100000}


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.environ.get('FTB_HOME')
        os.environ['FTB_HOME'] = self.tmp.name
        self.cfg = copy.deepcopy(DEFAULT_CONFIG)
        self.lists = {'openrouter': [m('openrouter/a:free'), m('openrouter/b:free'), m('openrouter/c', free=False)],
                      'opencode': [m('opencode/z-free')]}
        self.failing = set()

    def tearDown(self):
        if self.old is None:
            os.environ.pop('FTB_HOME', None)
        else:
            os.environ['FTB_HOME'] = self.old
        self.tmp.cleanup()

    def fetch(self, name, pc):
        if name in self.failing:
            raise OSError('network down')
        return copy.deepcopy(self.lists[name])

    def test_baseline_then_changes(self):
        _, ev = C.scan(self.cfg, fetch=self.fetch)
        self.assertEqual(ev[0]['type'], 'baseline')
        self.lists['openrouter'] = [m('openrouter/a:free', free=False),       # repriced
                                    m('openrouter/c', free=True),             # became free
                                    m('openrouter/new:free', expires='2026-12-01')]  # new; b delisted
        _, ev = C.scan(self.cfg, fetch=self.fetch)
        types = {(e['type'], e['key']) for e in ev}
        self.assertIn(('no_longer_free', 'openrouter/a:free'), types)
        self.assertIn(('became_free', 'openrouter/c'), types)
        self.assertIn(('new_free', 'openrouter/new:free'), types)
        self.assertIn(('delisted', 'openrouter/b:free'), types)
        r = C.build_report(self.cfg)
        self.assertEqual(len(r['new_free']), 2)
        self.assertEqual(len(r['lost_free']), 2)
        self.assertTrue(list((C.path('reports')).glob('*.md')))

    def test_provider_outage_is_not_a_delisting(self):
        C.scan(self.cfg, fetch=self.fetch)
        self.failing = {'openrouter'}
        cat, ev = C.scan(self.cfg, fetch=self.fetch)
        self.assertEqual(ev, [])
        self.assertFalse(cat['providers']['openrouter']['ok'])
        # old models kept for monitoring...
        self.assertIsNotNone(C.find(cat, 'openrouter/a:free'))

    def test_expiring_soon(self):
        from freetoken_bots.common import now
        import datetime as dt
        soon = (now() + dt.timedelta(days=2)).strftime('%Y-%m-%d')
        later = (now() + dt.timedelta(days=60)).strftime('%Y-%m-%d')
        self.lists['openrouter'] = [m('openrouter/s:free', expires=soon), m('openrouter/l:free', expires=later)]
        cat, _ = C.scan(self.cfg, fetch=self.fetch)
        keys = [e['key'] for e in C.expiring(cat, 7)]
        self.assertEqual(keys, ['openrouter/s:free'])

    def test_resolve_key_fail_closed(self):
        self.lists['openrouter'] = [m('openrouter/x/model:free'), m('openrouter/x/model', free=False)]
        cat, _ = C.scan(self.cfg, fetch=self.fetch)
        self.assertEqual(C.resolve_key(cat, 'openrouter/x/model:free')[0], 'openrouter/x/model:free')
        self.assertEqual(C.resolve_key(cat, 'x/model:free')[0], 'openrouter/x/model:free')
        key, note = C.resolve_key(cat, 'x/model')  # missing :free -> corrected loudly
        self.assertEqual(key, 'openrouter/x/model:free')
        self.assertIn('PAID', note)
        with self.assertRaises(KeyError):
            C.resolve_key(cat, 'unknown/thing')
        with self.assertRaises(KeyError):
            C.resolve_key(cat, '  ')


if __name__ == '__main__':
    unittest.main()
