import datetime as dt
import json
import unittest

from helpers import MockCase
from freetoken_bots import catalog as C
from freetoken_bots import quota as Q
from freetoken_bots.common import atomic_json, now
from freetoken_bots.routing import RouteError

CHAT = {'messages': [{'role': 'user', 'content': 'hi'}]}
TOOLS = [{'type': 'function', 'function': {'name': 'get_utc_time', 'parameters': {'type': 'object', 'properties': {}}}}]


class RoutingTests(MockCase):
    def test_scan_against_mock(self):
        free = {m['key'] for m in C.free_models(self.cat)}
        self.assertIn('openrouter/vendor/big-free:free', free)
        self.assertNotIn('openrouter/vendor/big-free', free)
        self.assertNotIn('opencode/paid-zen', free)
        mo = C.find(self.cat, 'opencode/msgs-only-free')
        self.assertTrue(mo['free'])
        self.assertFalse(mo['api_callable'])
        self.assertTrue(mo['opencode_client'])

    def test_auto_picks_free_and_answers(self):
        r = self.router().dispatch(dict(CHAT, model='auto'))
        self.assertIn('PONG', r.json['choices'][0]['message']['content'])
        self.assertTrue(r.model['free'])
        self.assertNoPaidCalls()

    def test_verified_large_model_ranked_first(self):
        pool = self.router().candidates('auto')
        self.assertEqual(pool[0]['key'], 'openrouter/vendor/big-free:free')
        self.assertEqual(pool[-1]['key'], 'openrouter/openrouter/free', 'meta router is last resort')

    def test_paid_model_request_refused(self):
        for name in ('openrouter/vendor/paid-model', 'vendor/paid-model', 'opencode/paid-zen'):
            with self.assertRaises(RouteError) as cm:
                self.router().dispatch(dict(CHAT, model=name))
            self.assertEqual(cm.exception.status, 400, name)
        self.assertEqual(self.mock.calls, [])

    def test_missing_free_suffix_goes_to_free_variant(self):
        r = self.router().dispatch(dict(CHAT, model='vendor/big-free'))
        self.assertEqual(r.model['id'], 'vendor/big-free:free')
        self.assertNoPaidCalls()

    def test_unknown_model_maps_to_auto(self):
        r = self.router().dispatch(dict(CHAT, model='gpt-5'))
        self.assertTrue(r.model['free'])

    def test_daily_quota_blocks_whole_openrouter_no_paid_fallback(self):
        router = self.router()
        with self.assertRaises(RouteError) as cm:
            router.dispatch(dict(CHAT, model='openrouter/vendor/quota:free'))
        self.assertEqual(cm.exception.status, 429)
        self.assertEqual(cm.exception.attempts[0]['kind'], 'quota_exhausted')
        self.assertEqual(self.upstream_models(), ['vendor/quota:free'],
                         'daily free quota is account-wide: no other OpenRouter model is tried')
        self.assertTrue(router.state.provider_blocked('openrouter'))
        self.assertNoPaidCalls()

    def test_zen_is_never_routed(self):
        router = self.router(prefer=['opencode/good-free'])
        self.assertFalse(router.provider_usable('opencode')[0])
        self.assertNotIn('opencode', {m['provider'] for m in router.candidates('auto')})
        with self.assertRaises(RouteError) as cm:
            router.dispatch(dict(CHAT, model='opencode/good-free'))
        self.assertEqual((cm.exception.status, cm.exception.kind), (400, 'monitor_only_model'))
        self.assertIn('require OpenCode', cm.exception.message)
        router.dispatch(dict(CHAT, model='auto'))
        self.assertNoPaidCalls()   # also asserts zero calls to the Zen mock

    def test_payment_required_never_retries_paid(self):
        self.mock.behaviour['vendor/big-free:free'] = 'payment'
        router = self.router()
        with self.assertRaises(RouteError) as cm:
            router.dispatch(dict(CHAT, model='auto'))
        self.assertEqual(cm.exception.status, 429)
        self.assertEqual(self.upstream_models(), ['vendor/big-free:free'])
        self.assertTrue(router.state.provider_blocked('openrouter'))
        self.assertNoPaidCalls()

    def test_server_error_and_rate_limit_cool_model_only(self):
        self.mock.behaviour['vendor/big-free:free'] = 'server'
        self.mock.behaviour['vendor/quota:free'] = 'rate'
        router = self.router()
        r = router.dispatch(dict(CHAT, model='auto'))
        self.assertNotIn(r.model['key'], ('openrouter/vendor/big-free:free', 'openrouter/vendor/quota:free'))
        self.assertTrue(router.state.model_cooling('openrouter/vendor/big-free:free'))
        self.assertTrue(router.state.model_cooling('openrouter/vendor/quota:free'))
        self.assertEqual([a.get('kind') for a in r.attempts[:2]], ['upstream_error', 'rate_limited'])
        self.assertIsNone(router.state.provider_blocked('openrouter'))
        self.assertNoPaidCalls()

    def test_bad_request_is_not_retried(self):
        self.mock.behaviour['vendor/big-free:free'] = 'bad'
        with self.assertRaises(RouteError) as cm:
            self.router().dispatch(dict(CHAT, model='auto'))
        self.assertEqual(cm.exception.status, 400)
        self.assertEqual(len(self.mock.calls), 1)

    def test_all_exhausted_returns_error_not_paid(self):
        for mid in ('vendor/big-free:free', 'vendor/notools:free', 'openrouter/free', 'vendor/second:free',
                    'vendor/stream-error:free'):
            self.mock.behaviour[mid] = 'server'
        with self.assertRaises(RouteError) as cm:
            self.router().dispatch(dict(CHAT, model='auto'))
        self.assertIn(cm.exception.status, (429, 503))
        self.assertNoPaidCalls()

    def test_tools_filter(self):
        pool = self.router().candidates('auto', needs_tools=True)
        self.assertNotIn('openrouter/vendor/notools:free', [m['key'] for m in pool])

    def test_pinned_without_fallback(self):
        self.mock.behaviour['vendor/second:free'] = 'server'
        router = self.router(pinned_fallback=False)
        with self.assertRaises(RouteError):
            router.dispatch(dict(CHAT, model='openrouter/vendor/second:free'))
        self.assertEqual(self.upstream_models(), ['vendor/second:free'])

    def test_stale_catalog_fails_closed(self):
        cat = C.load()
        old = (now() - dt.timedelta(hours=30)).isoformat()
        for p in cat['providers'].values():
            p['checked_at'] = old
        atomic_json(C.catalog_path(), cat)
        router = self.router()
        router.scanner = lambda only=None: (_ for _ in ()).throw(OSError('offline'))
        router.reload()
        with self.assertRaises(RouteError) as cm:
            router.dispatch(dict(CHAT, model='auto'))
        self.assertEqual(cm.exception.status, 503)
        self.assertEqual(self.mock.calls, [])

    def test_model_turned_paid_after_scan_is_refused(self):
        self.mock.behaviour['vendor/quota:free'] = 'ok'
        router = self.router()
        for mm in router.cat['models']:
            if mm['key'] == 'openrouter/vendor/big-free:free':
                mm['free'] = False
        r = router.dispatch(dict(CHAT, model='auto'))
        self.assertNotEqual(r.model['key'], 'openrouter/vendor/big-free:free')
        self.assertNotIn('vendor/big-free:free', self.upstream_models())

    def test_payload_sanitized(self):
        body = dict(CHAT, model='auto', models=['openai/gpt-5'], provider={'order': ['OpenAI']},
                    plugins=[{'id': 'web'}], web_search_options={}, max_tokens=999999)
        self.router().dispatch(body)
        sent = self.mock.calls[0][2]
        for f in ('models', 'plugins', 'web_search_options'):
            self.assertNotIn(f, sent)
        self.assertEqual(sent['provider'], {'max_price': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}})
        self.assertEqual(sent['max_tokens'], 32000)

    def test_stream_first_event_error_fails_over(self):
        router = self.router(prefer=['vendor/stream-error:free'])
        r = router.dispatch(dict(CHAT, model='auto', stream=True))
        events = list(r.events)
        self.assertEqual(r.attempts[0]['model'], 'openrouter/vendor/stream-error:free')
        self.assertNotEqual(r.model['key'], 'openrouter/vendor/stream-error:free')
        text = ''.join((json.loads(e)['choices'] or [{}])[0].get('delta', {}).get('content') or ''
                       for e in events if e != '[DONE]')
        self.assertIn('PONG', text)
        self.assertEqual(events[-1], '[DONE]')

    def test_usage_counted(self):
        router = self.router()
        router.dispatch(dict(CHAT, model='auto'))
        t = router.state.today('openrouter')
        self.assertEqual((t['requests'], t['ok'], t['prompt_tokens']), (1, 1, 11))


class ClassifyTests(unittest.TestCase):
    def test_classify(self):
        c = Q.classify('openrouter', 429, '{"error":{"message":"Rate limit exceeded: free-models-per-day"}}', {})
        self.assertEqual((c['scope'], c['kind']), ('provider', 'quota_exhausted'))
        c = Q.classify('openrouter', 429, 'Rate limit exceeded: free-models-per-min.', {})
        self.assertEqual((c['scope'], c['kind']), ('provider', 'rate_limited'))
        c = Q.classify('openrouter', 429, 'temporarily rate-limited upstream', {'Retry-After': '7'})
        self.assertEqual((c['scope'], c['cooldown_s']), ('model', 7))
        c = Q.classify('opencode', 429, '{"error":{"type":"FreeUsageLimitError"}}', {'retry-after': '53340'})
        self.assertEqual(c['kind'], 'quota_exhausted')
        self.assertGreater(c['until'], now() + dt.timedelta(hours=14))
        self.assertEqual(Q.classify('x', 402, '', {})['kind'], 'payment_required')
        self.assertFalse(Q.classify('x', 400, 'bad', {})['failover'])
        self.assertTrue(Q.classify('x', None, 'timeout', {})['failover'])


if __name__ == '__main__':
    unittest.main()
