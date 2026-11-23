import json
import os
import threading
import unittest
import urllib.error
import urllib.request

from helpers import MockCase
from freetoken_bots import responses_api as R
from freetoken_bots.server import make_server

SHELL_TOOL = {'type': 'function', 'name': 'exec_command', 'description': 'run',
              'parameters': {'type': 'object', 'properties': {'cmd': {'type': 'string'}}, 'required': ['cmd']}}


class ServerCase(MockCase):
    def setUp(self):
        super().setUp()
        self.start()

    def start(self):
        self.http = make_server(self.cfg, '127.0.0.1', 0, quiet=True)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.base = 'http://127.0.0.1:%d' % self.http.server_address[1]

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        super().tearDown()

    def post(self, p, body, key=None):
        h = {'Content-Type': 'application/json'}
        if key:
            h['Authorization'] = 'Bearer ' + key
        req = urllib.request.Request(self.base + p, data=json.dumps(body).encode(), headers=h)
        return urllib.request.urlopen(req, timeout=20)

    def sse(self, resp):
        out, ev = [], None
        for raw in resp:
            line = raw.decode().rstrip('\n')
            if line.startswith('event: '):
                ev = line[7:]
            elif line.startswith('data: '):
                d = line[6:]
                out.append((ev, d if d == '[DONE]' else json.loads(d)))
                ev = None
        return out


class ServerTests(ServerCase):
    def test_models_lists_only_free_callable(self):
        with urllib.request.urlopen(self.base + '/v1/models') as r:
            ids = [m['id'] for m in json.load(r)['data']]
        self.assertEqual(ids[0], 'auto')
        self.assertIn('opencode/good-free', ids)
        for bad in ('openrouter/vendor/paid-model', 'opencode/paid-zen', 'opencode/msgs-only-free'):
            self.assertNotIn(bad, ids)

    def test_chat_non_stream(self):
        with self.post('/v1/chat/completions', {'model': 'auto', 'messages': [{'role': 'user', 'content': 'hi'}]}) as r:
            self.assertTrue(r.headers['x-ftb-model'])
            self.assertIn('PONG', json.load(r)['choices'][0]['message']['content'])

    def test_chat_stream(self):
        with self.post('/v1/chat/completions', {'model': 'auto', 'stream': True,
                                                'messages': [{'role': 'user', 'content': 'hi'}]}) as r:
            evs = self.sse(r)
        self.assertEqual(evs[-1][1], '[DONE]')
        text = ''.join((e[1]['choices'] or [{}])[0].get('delta', {}).get('content') or ''
                       for e in evs[:-1])
        self.assertIn('PONG', text)

    def test_error_passthrough_status(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.post('/v1/chat/completions', {'model': 'opencode/paid-zen', 'messages': []})
        self.assertEqual(cm.exception.code, 400)
        self.assertEqual(json.load(cm.exception)['error']['type'], 'paid_model_refused')

    def test_messages_not_implemented(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.post('/v1/messages', {'model': 'x', 'messages': []})
        self.assertEqual(cm.exception.code, 501)

    def test_responses_non_stream_tool_loop(self):
        body = {'model': 'auto', 'input': [{'type': 'message', 'role': 'user',
                                            'content': [{'type': 'input_text', 'text': 'run it'}]}],
                'tools': [SHELL_TOOL, {'type': 'web_search'}], 'stream': False}
        with self.post('/v1/responses', body) as r:
            res = json.load(r)
        call = res['output'][0]
        self.assertEqual(call['type'], 'function_call')
        self.assertEqual(json.loads(call['arguments']), {'cmd': 'echo FTB_TOOL_OK'})
        body['input'] += [call, {'type': 'function_call_output', 'call_id': call['call_id'], 'output': 'FTB_TOOL_OK\n'}]
        with self.post('/v1/responses', body) as r:
            res = json.load(r)
        self.assertIn('tool_output_seen=True', res['output'][0]['content'][0]['text'])
        sent = self.mock.calls[-1][2]
        self.assertEqual([t['function']['name'] for t in sent['tools']], ['exec_command'], 'web_search dropped')

    def test_responses_stream_events(self):
        body = {'model': 'auto', 'stream': True, 'tools': [SHELL_TOOL],
                'input': [{'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': 'sys'}]},
                          {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'go'}]}]}
        with self.post('/v1/responses', body) as r:
            evs = self.sse(r)
        types = [e[0] for e in evs]
        self.assertEqual(types[0], 'response.created')
        self.assertIn('response.function_call_arguments.delta', types)
        self.assertEqual(types[-1], 'response.completed')
        done = evs[-1][1]['response']
        self.assertEqual(done['output'][0]['type'], 'function_call')
        self.assertEqual(json.loads(done['output'][0]['arguments'])['cmd'], 'echo FTB_TOOL_OK')
        self.assertEqual(done['usage']['input_tokens'], 11)
        seqs = [e[1]['sequence_number'] for e in evs]
        self.assertEqual(seqs, sorted(seqs))


class AuthTests(ServerCase):
    def start(self):
        os.environ['FTB_ROUTER_KEY'] = 'sekret'
        super().start()

    def test_key_required(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.post('/v1/chat/completions', {'model': 'auto', 'messages': [{'role': 'user', 'content': 'x'}]})
        self.assertEqual(cm.exception.code, 401)
        with self.post('/v1/chat/completions', {'model': 'auto', 'messages': [{'role': 'user', 'content': 'x'}]},
                       key='sekret') as r:
            self.assertEqual(r.status, 200)

    def test_public_bind_requires_key(self):
        os.environ.pop('FTB_ROUTER_KEY')
        with self.assertRaises(SystemExit):
            make_server(self.cfg, '0.0.0.0', 0)


class ResponsesUnit(unittest.TestCase):
    def test_to_chat(self):
        chat, ctx = R.to_chat({
            'model': 'auto', 'instructions': 'be brief', 'max_output_tokens': 100,
            'input': [
                {'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': 'dev'}]},
                {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'hi'},
                                                                 {'type': 'input_image', 'image_url': 'data:x'}]},
                {'type': 'reasoning', 'encrypted_content': 'zzz'},
                {'type': 'function_call', 'call_id': 'c1', 'name': 'f', 'arguments': '{}'},
                {'type': 'custom_tool_call', 'call_id': 'c2', 'name': 'apply_patch', 'input': '*** Begin'},
                {'type': 'function_call_output', 'call_id': 'c1', 'output': 'r1'},
                {'type': 'custom_tool_call_output', 'call_id': 'c2', 'output': 'r2'},
            ],
            'tools': [{'type': 'function', 'name': 'f', 'parameters': {}},
                      {'type': 'custom', 'name': 'apply_patch', 'description': 'patch'},
                      {'type': 'namespace', 'name': 'ns', 'tools': []}, {'type': 'web_search'}]})
        roles = [m['role'] for m in chat['messages']]
        self.assertEqual(roles, ['system', 'user', 'assistant', 'tool', 'tool'])
        self.assertIn('be brief', chat['messages'][0]['content'])
        self.assertIn('dev', chat['messages'][0]['content'])
        self.assertEqual(len(chat['messages'][2]['tool_calls']), 2, 'consecutive calls merged')
        self.assertEqual(json.loads(chat['messages'][2]['tool_calls'][1]['function']['arguments']), {'input': '*** Begin'})
        self.assertEqual([t['function']['name'] for t in chat['tools']], ['f', 'apply_patch'])
        self.assertEqual(chat['max_tokens'], 100)
        self.assertEqual(ctx['custom'], {'apply_patch'})

    def test_custom_tool_call_round_trip(self):
        ctx = {'custom': {'apply_patch'}, 'model': 'auto'}
        res = R.from_chat({'choices': [{'message': {'tool_calls': [
            {'id': 'c9', 'function': {'name': 'apply_patch', 'arguments': '{"input": "*** Begin Patch"}'}}]}}]}, ctx)
        self.assertEqual(res['output'][0]['type'], 'custom_tool_call')
        self.assertEqual(res['output'][0]['input'], '*** Begin Patch')

    def test_stream_text_then_tool(self):
        tr = R.StreamTranslator({'custom': set(), 'model': 'auto'})
        evs = tr.start()
        evs += tr.feed({'choices': [{'delta': {'content': 'Hel'}}]})
        evs += tr.feed({'choices': [{'delta': {'content': 'lo'}}]})
        evs += tr.feed({'choices': [{'delta': {'tool_calls': [{'index': 0, 'id': 'c', 'function': {'name': 'f', 'arguments': '{"a"'}}]}}]})
        evs += tr.feed({'choices': [{'delta': {'tool_calls': [{'index': 0, 'function': {'arguments': ':1}'}}]}}]})
        evs += tr.finish()
        final = evs[-1][1]['response']
        self.assertEqual(final['output'][0]['content'][0]['text'], 'Hello')
        self.assertEqual(final['output'][1]['arguments'], '{"a":1}')
        idx = [e[1].get('output_index') for e in evs if e[0] == 'response.output_item.added']
        self.assertEqual(idx, [0, 1])


if __name__ == '__main__':
    unittest.main()
