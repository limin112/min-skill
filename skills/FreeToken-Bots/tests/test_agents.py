import json
import tempfile
import unittest
from pathlib import Path

import helpers  # noqa: F401
from freetoken_bots import agents as A

MODELS = [{'key': 'opencode/good-free', 'name': 'Good', 'tools': True, 'context_length': 200000,
           'max_output': 32000, 'input_modalities': ['text']},
          {'key': 'openrouter/x:free', 'name': 'X', 'tools': False, 'context_length': 100000}]
BASE = 'http://127.0.0.1:8787/v1'


class AgentConfigTests(unittest.TestCase):
    def test_every_agent_renders(self):
        for a in A.AGENTS:
            self.assertTrue(A.render(a['id'], BASE, MODELS), a['id'])
            self.assertIn(a['status'], ('verified', 'documented', 'not-supported'))

    def test_pi_config_is_zero_cost(self):
        cfg = A.pi_config(BASE, MODELS)['providers'][A.PROVIDER_ID]
        self.assertEqual(cfg['api'], 'openai-completions')
        ids = [m['id'] for m in cfg['models']]
        self.assertEqual(ids, ['auto', 'opencode/good-free'], 'only tool-capable models listed')
        for m in cfg['models']:
            self.assertEqual(set(m['cost'].values()), {0})

    def test_codex_uses_responses_wire(self):
        self.assertIn('wire_api = "responses"', A.codex_toml(BASE, MODELS))
        self.assertNotIn('[profiles.', A.codex_toml(BASE, MODELS), 'codex 0.16x rejects [profiles.*] in config.toml')
        self.assertIn('model_providers.freetoken.wire_api="responses"', A.codex_args(BASE, MODELS))

    def test_merge_keeps_user_config(self):
        user = {'providers': {'ollama': {'baseUrl': 'x'}}, 'other': 1}
        merged, changed = A.merge_provider(user, A.pi_config(BASE, MODELS))
        self.assertTrue(changed)
        self.assertEqual(merged['providers']['ollama'], {'baseUrl': 'x'})
        self.assertEqual(merged['other'], 1)
        self.assertEqual(user, {'providers': {'ollama': {'baseUrl': 'x'}}, 'other': 1}, 'input not mutated')

    def test_merge_refuses_to_replace_without_force(self):
        user = {'providers': {A.PROVIDER_ID: {'baseUrl': 'mine'}}}
        with self.assertRaises(ValueError):
            A.merge_provider(user, A.pi_config(BASE, MODELS))
        merged, _ = A.merge_provider(user, A.pi_config(BASE, MODELS), force=True)
        self.assertEqual(merged['providers'][A.PROVIDER_ID]['baseUrl'], BASE)

    def test_apply_backs_up_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            t = Path(d) / 'opencode.json'
            t.write_text(json.dumps({'model': 'anthropic/x', 'provider': {'a': {}}}))
            dry = A.apply('opencode', BASE, MODELS, target=t, dry_run=True)
            self.assertTrue(dry['dry_run'])
            self.assertEqual(json.loads(t.read_text())['provider'], {'a': {}}, 'dry run writes nothing')
            res = A.apply('opencode', BASE, MODELS, target=t)
            self.assertTrue(Path(res['backup']).exists())
            data = json.loads(t.read_text())
            self.assertEqual(data['model'], 'anthropic/x', 'user default model untouched')
            self.assertIn(A.PROVIDER_ID, data['provider'])
            self.assertFalse(A.apply('opencode', BASE, MODELS, target=t)['changed'])


if __name__ == '__main__':
    unittest.main()
