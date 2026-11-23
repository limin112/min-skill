"""Mock OpenRouter + OpenCode Zen upstream for tests and agent integration runs.

Serves:
  GET  /openrouter/api/v1/models     OpenRouter-format catalog
  POST /openrouter/api/v1/chat/completions
  GET  /zen/v1/models                Zen-format catalog
  POST /zen/inference/chat/completions

Model behaviour is chosen by model id (see BEHAVIOUR). Every chat request is
recorded in `MockState.calls` so tests can assert that no paid model id was
ever sent upstream.

As an "agent-aware" fake model: when a request carries tools and no tool
result yet, it calls the first shell-like tool (exec_command / bash / shell)
with `echo FTB_TOOL_OK`; once the tool result is present it answers with text
that quotes it. That drives a real agent through a full tool loop.

Run standalone:  python3 tests/mock_upstream.py 18080
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FREE = {'prompt': '0', 'completion': '0'}
PAID = {'prompt': '0.000002', 'completion': '0.000008'}


def or_model(mid, pricing, tools=True, ctx=200000, **extra):
    m = {'id': mid, 'name': mid, 'description': '', 'context_length': ctx, 'pricing': pricing,
         'architecture': {'input_modalities': ['text'], 'output_modalities': ['text']},
         'top_provider': {'context_length': ctx, 'max_completion_tokens': 32000},
         'supported_parameters': ['tools', 'tool_choice', 'max_tokens'] if tools else ['max_tokens'],
         'endpoints': ['/api/v1/chat/completions']}
    m.update(extra)
    return m


def zen_model(mid, price, api='chat-completions', tools=True, base=None):
    return {'id': mid, 'name': mid, 'type': 'chat', 'canonical_id': 'x/' + mid, 'open_weights': True,
            'modalities': {'input': ['text'], 'output': ['text']},
            'capabilities': {'tools': {'supported': tools}},
            'limit': {'context': 200000, 'output': 32000},
            'cost': {'text': {'input': {'price': price}, 'output': {'price': price}}},
            'api': {api: {'base_url': base or 'https://opencode.ai/inference/openai/v1'}},
            'recommended_api': api}


class MockState:
    def __init__(self):
        self.calls = []          # (provider, model, body)
        self.lock = threading.Lock()
        self.or_models = [
            or_model('vendor/big-free:free', FREE, total_parameters=400_000_000_000),
            or_model('vendor/big-free', PAID),                      # paid twin of the :free id
            or_model('vendor/quota:free', FREE, ctx=300000),
            or_model('vendor/notools:free', FREE, tools=False),
            or_model('vendor/paid-model', PAID),
            or_model('openrouter/free', FREE),
        ]
        self.zen_models = [
            zen_model('good-free', 0),
            zen_model('stream-error-free', 0),
            zen_model('paid-zen', 1.5),
            zen_model('msgs-only-free', 0, api='messages'),
        ]
        # model id -> behaviour; anything not listed is "ok"
        self.behaviour = {'vendor/quota:free': 'daily_quota', 'stream-error-free': 'stream_error'}
        self.zen_base = None

    def record(self, provider, body):
        with self.lock:
            self.calls.append((provider, body.get('model'), body))


def _tool_args(tool):
    fn = tool.get('function') or tool
    props = ((fn.get('parameters') or {}).get('properties') or {})
    args = {}
    if 'cmd' in props:
        args['cmd'] = 'echo FTB_TOOL_OK'
    elif 'command' in props:
        cmd_type = (props['command'] or {}).get('type')
        args['command'] = ['bash', '-lc', 'echo FTB_TOOL_OK'] if cmd_type == 'array' else 'echo FTB_TOOL_OK'
    for r in (fn.get('parameters') or {}).get('required') or []:
        if r not in args:
            args[r] = 'print marker' if r == 'description' else ''
    return fn.get('name'), args


def agent_reply(body):
    """-> ('text', str) or ('tool', name, args_json)"""
    msgs = body.get('messages') or []
    tool_results = [m for m in msgs if m.get('role') == 'tool']
    if tool_results:
        out = tool_results[-1].get('content')
        if isinstance(out, list):
            out = ' '.join(p.get('text', '') for p in out if isinstance(p, dict))
        ok = 'FTB_TOOL_OK' in (out or '')
        return ('text', 'AGENT_LOOP_DONE tool_output_seen=%s' % ok)
    tools = body.get('tools') or []
    names = {(t.get('function') or {}).get('name'): t for t in tools}
    for pref in ('exec_command', 'bash', 'shell', 'get_utc_time'):
        if pref in names:
            name, args = _tool_args(names[pref])
            return ('tool', name, json.dumps(args))
    return ('text', 'PONG from %s' % body.get('model'))


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    st = None

    def log_message(self, *a):
        pass

    def _json(self, code, obj, headers=None):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith('/openrouter/api/v1/models'):
            return self._json(200, {'data': self.st.or_models})
        if self.path.startswith('/zen/v1/models'):
            return self._json(200, {'object': 'list', 'data': self.st.zen_models})
        return self._json(404, {'error': 'nf'})

    def do_POST(self):
        n = int(self.headers.get('content-length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}')
        provider = 'openrouter' if self.path.startswith('/openrouter/') else 'zen'
        self.st.record(provider, body)
        if not self.headers.get('authorization', '').startswith('Bearer '):
            return self._json(401, {'error': {'message': 'no auth', 'code': 401}})
        model = body.get('model')
        b = self.st.behaviour.get(model, 'ok')
        if b == 'daily_quota':
            return self._json(429, {'error': {'message': 'Rate limit exceeded: free-models-per-day. ', 'code': 429}},
                              {'X-RateLimit-Reset': str(int((time.time() + 3600) * 1000))})
        if b == 'zen_quota':
            return self._json(429, {'type': 'error', 'error': {'type': 'FreeUsageLimitError',
                                                               'message': 'Free usage limit reached.'}},
                              {'retry-after': '120'})
        if b == 'rate':
            return self._json(429, {'error': {'message': 'temporarily rate-limited upstream', 'code': 429}})
        if b == 'payment':
            return self._json(402, {'error': {'message': 'Insufficient credits', 'code': 402}})
        if b == 'server':
            return self._json(503, {'error': {'message': 'overloaded', 'code': 503}})
        if b == 'bad':
            return self._json(400, {'error': {'message': 'invalid messages', 'code': 400}})
        if b == 'slow':
            time.sleep(3)
        kind = agent_reply(body)
        if body.get('stream'):
            return self._stream(body, kind, b == 'stream_error')
        msg = {'role': 'assistant', 'content': kind[1] if kind[0] == 'text' else None}
        if kind[0] == 'tool':
            msg['tool_calls'] = [{'id': 'call_1', 'type': 'function',
                                  'function': {'name': kind[1], 'arguments': kind[2]}}]
        return self._json(200, {'id': 'cmpl-1', 'object': 'chat.completion', 'model': model,
                                'choices': [{'index': 0, 'message': msg,
                                             'finish_reason': 'tool_calls' if kind[0] == 'tool' else 'stop'}],
                                'usage': {'prompt_tokens': 11, 'completion_tokens': 7, 'total_tokens': 18}},
                          {'x-ratelimit-remaining': '41'})

    def _stream(self, body, kind, error_first):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Connection', 'close')
        self.end_headers()

        def ev(obj):
            self.wfile.write(('data: %s\n\n' % json.dumps(obj)).encode())
            self.wfile.flush()
        self.wfile.write(b': OPENROUTER PROCESSING\n\n')
        if error_first:
            ev({'error': {'message': 'provider returned error', 'code': 502}})
            self.close_connection = True
            return
        base = {'id': 'c1', 'object': 'chat.completion.chunk', 'model': body.get('model')}
        ev(dict(base, choices=[{'index': 0, 'delta': {'role': 'assistant', 'content': ''}}]))
        if kind[0] == 'text':
            for piece in (kind[1][:6], kind[1][6:]):
                ev(dict(base, choices=[{'index': 0, 'delta': {'content': piece}}]))
            fin = 'stop'
        else:
            ev(dict(base, choices=[{'index': 0, 'delta': {'tool_calls': [
                {'index': 0, 'id': 'call_1', 'type': 'function', 'function': {'name': kind[1], 'arguments': ''}}]}}]))
            half = len(kind[2]) // 2
            for part in (kind[2][:half], kind[2][half:]):
                ev(dict(base, choices=[{'index': 0, 'delta': {'tool_calls': [
                    {'index': 0, 'function': {'arguments': part}}]}}]))
            fin = 'tool_calls'
        ev(dict(base, choices=[{'index': 0, 'delta': {}, 'finish_reason': fin}]))
        ev(dict(base, choices=[], usage={'prompt_tokens': 11, 'completion_tokens': 7, 'total_tokens': 18}))
        self.wfile.write(b'data: [DONE]\n\n')
        self.wfile.flush()
        self.close_connection = True


def start(port=0):
    st = MockState()
    h = type('H', (Handler,), {'st': st})
    srv = ThreadingHTTPServer(('127.0.0.1', port), h)
    srv.daemon_threads = True
    st.zen_base = 'http://127.0.0.1:%d/zen/inference' % srv.server_address[1]
    for m in st.zen_models:
        for a in m['api'].values():
            a['base_url'] = st.zen_base
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, st


def test_config(port):
    """Router config pointing both providers at the mock."""
    from freetoken_bots.common import DEFAULT_CONFIG, deep_merge
    return deep_merge(DEFAULT_CONFIG, {
        'providers': {
            'openrouter': {'catalog_url': 'http://127.0.0.1:%d/openrouter/api/v1/models' % port,
                           'base_url': 'http://127.0.0.1:%d/openrouter/api/v1' % port,
                           'allowed_hosts': ['127.0.0.1']},
            'opencode': {'catalog_url': 'http://127.0.0.1:%d/zen/v1/models' % port,
                         'allowed_hosts': ['127.0.0.1']},
        },
        'routing': {'min_context': 1000},
    })


if __name__ == '__main__':
    srv, _ = start(int(sys.argv[1]) if len(sys.argv) > 1 else 18080)
    print('mock upstream on http://127.0.0.1:%d' % srv.server_address[1], flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
