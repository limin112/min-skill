import unittest

import helpers  # noqa: F401  (sys.path)
from freetoken_bots import providers as P


class OpenRouterPricing(unittest.TestCase):
    def test_zero(self):
        self.assertTrue(P.openrouter_pricing_free({'prompt': '0', 'completion': '0'}))
        self.assertTrue(P.openrouter_pricing_free({'prompt': '0', 'completion': '0', 'input_cache_read': '0'}))

    def test_any_nonzero_price_is_paid(self):
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0', 'completion': '0.00001'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0', 'completion': '0', 'request': '0.01'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0', 'completion': '0', 'web_search': '0.004'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0', 'completion': '0', 'image': '0.001'}))

    def test_missing_or_garbage_fails_closed(self):
        self.assertFalse(P.openrouter_pricing_free({}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '-1', 'completion': '0'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': 'free', 'completion': '0'}))
        self.assertFalse(P.openrouter_pricing_free({'prompt': '0', 'completion': '0', 'x': {'a': 1}}))
        self.assertFalse(P.openrouter_pricing_free(None))

    def test_tiered_overrides(self):
        ok = {'prompt': '0', 'completion': '0', 'overrides': [{'min_prompt_tokens': 272000, 'prompt': '0'}]}
        bad = {'prompt': '0', 'completion': '0', 'overrides': [{'min_prompt_tokens': 272000, 'prompt': '0.00001'}]}
        self.assertTrue(P.openrouter_pricing_free(ok))
        self.assertFalse(P.openrouter_pricing_free(bad))

    def test_normalize(self):
        raw = {'data': [
            {'id': 'a/b:free', 'name': 'B', 'pricing': {'prompt': '0', 'completion': '0'},
             'supported_parameters': ['tools'], 'context_length': 1000, 'expiration_date': '2026-12-31',
             'architecture': {'output_modalities': ['text']}, 'endpoints': ['/api/v1/chat/completions']},
            {'id': 'g/lyria', 'name': 'Lyria', 'pricing': {'prompt': '0', 'completion': '0'},
             'architecture': {'output_modalities': ['text', 'audio']}},
            {'id': 'openrouter/sonoma-sky', 'name': 'Sonoma', 'pricing': {'prompt': '0', 'completion': '0'},
             'description': 'a cloaked model'},
        ]}
        ms = {m['id']: m for m in P.normalize_openrouter(raw, {'base_url': 'https://openrouter.ai/api/v1'})}
        self.assertTrue(ms['a/b:free']['api_callable'])
        self.assertEqual(ms['a/b:free']['expires'], '2026-12-31')
        self.assertFalse(ms['g/lyria']['api_callable'])
        self.assertIn('non-text', ms['g/lyria']['monitor_reason'])
        self.assertTrue(ms['openrouter/sonoma-sky']['anonymous'])
        self.assertIsNone(ms['a/b:free']['params_b'], 'size must never be guessed')


class ZenCost(unittest.TestCase):
    def test_free(self):
        self.assertTrue(P.zen_cost_free({'text': {'input': {'price': 0, 'cache': {'read': 0}}, 'output': {'price': 0}}}))

    def test_input_only_price_is_paid(self):
        # real case: jev-1.13 has output 0 but input 0.042 -> not free
        self.assertFalse(P.zen_cost_free({'text': {'input': {'price': 0.042}, 'output': {'price': 0}}}))

    def test_cache_write_price_is_paid(self):
        self.assertFalse(P.zen_cost_free({'text': {'input': {'price': 0, 'cache': {'write': {'30m': 0.25}}},
                                                   'output': {'price': 0}}}))

    def test_conditional_override_price_is_paid_and_dated(self):
        sched = []
        cost = {'text': {'input': {'price': 0, 'overrides': [{'when': {'date': {'gte': '2026-12-01'}}, 'price': 1}]},
                         'output': {'price': 0}}}
        self.assertFalse(P.zen_cost_free(cost, sched))
        self.assertEqual(sched[0]['date'], {'gte': '2026-12-01'})

    def test_multiplier_on_zero_stays_free(self):
        cost = {'text': {'input': {'price': 0}, 'output': {'price': 0}},
                'multipliers': [{'when': {'date': {'gte': '2027-01-01'}}, 'factor': 2}]}
        sched = []
        self.assertTrue(P.zen_cost_free(cost, sched))
        self.assertTrue(sched)

    def test_empty_or_garbage_fails_closed(self):
        self.assertFalse(P.zen_cost_free({}))
        self.assertFalse(P.zen_cost_free(None))
        self.assertFalse(P.zen_cost_free({'text': {'input': {'price': 'tbd'}, 'output': {'price': 0}}}))
        self.assertFalse(P.zen_cost_free({'text': {'note': 'free!'}}))

    def test_normalize_protocol_and_host(self):
        raw = {'data': [
            {'id': 'ok-free', 'type': 'chat', 'cost': {'text': {'input': {'price': 0}, 'output': {'price': 0}}},
             'modalities': {'output': ['text']}, 'capabilities': {'tools': {'supported': True}},
             'api': {'chat-completions': {'base_url': 'https://opencode.ai/inference/openai/v1'}}},
            {'id': 'msgs-free', 'type': 'chat', 'cost': {'text': {'input': {'price': 0}, 'output': {'price': 0}}},
             'modalities': {'output': ['text']}, 'recommended_api': 'messages',
             'api': {'messages': {'base_url': 'https://opencode.ai/inference/anthropic/v1'}}},
            {'id': 'evil-free', 'type': 'chat', 'cost': {'text': {'input': {'price': 0}, 'output': {'price': 0}}},
             'modalities': {'output': ['text']},
             'api': {'chat-completions': {'base_url': 'https://attacker.example/v1'}}},
        ]}
        ms = {m['id']: m for m in P.normalize_opencode(raw, {'allowed_hosts': ['opencode.ai']})}
        self.assertTrue(ms['ok-free']['api_callable'])
        self.assertTrue(ms['ok-free']['anonymous'])  # no canonical id, closed weights
        self.assertFalse(ms['msgs-free']['api_callable'])
        self.assertIn('messages', ms['msgs-free']['monitor_reason'])
        self.assertFalse(ms['evil-free']['api_callable'], 'API key must never be sent to a foreign host')


if __name__ == '__main__':
    unittest.main()
