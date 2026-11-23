"""Local OpenAI-compatible router.

Endpoints
  GET  /health
  GET  /v1/models                    auto + every API-callable free model
  POST /v1/chat/completions          OpenAI Chat Completions (stream or not)
  POST /v1/responses                 OpenAI Responses API (for Codex CLI)
  GET  /ftb/status                   provider usability, cooldowns, usage today
  POST /v1/messages                  501: Anthropic Messages not implemented yet
"""
import hmac
import ipaddress
import json
import os
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__
from . import responses_api as R
from .routing import RouteError, Router, status_snapshot


def is_loopback(host):
    if host in ('localhost', ''):
        return host == 'localhost'
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'FreeToken-Bots/' + __version__
    router = None      # set by make_server
    router_key = None
    quiet = False

    def log_message(self, fmt, *args):
        if not self.quiet:
            super().log_message(fmt, *args)

    # ------------------------------------------------------------- helpers
    def _auth_ok(self):
        if not self.router_key:
            return True
        got = self.headers.get('x-api-key') or ''
        auth = self.headers.get('authorization') or ''
        if auth.lower().startswith('bearer '):
            got = auth[7:].strip()
        return hmac.compare_digest(got.encode(), self.router_key.encode())

    def _json(self, status, obj, extra=None):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def _start_stream(self, extra):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Transfer-Encoding', 'chunked')
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()

    def _chunk(self, text):
        data = text.encode()
        self.wfile.write(b'%x\r\n%s\r\n' % (len(data), data))
        self.wfile.flush()

    def _end_chunks(self):
        self.wfile.write(b'0\r\n\r\n')
        self.wfile.flush()

    def _body(self):
        n = int(self.headers.get('content-length') or 0)
        raw = self.rfile.read(n) if n else b''
        return json.loads(raw.decode('utf-8') or '{}')

    @staticmethod
    def _route_headers(routed):
        return {'x-ftb-model': routed.model['key'], 'x-ftb-provider': routed.model['provider'],
                'x-ftb-attempts': str(len(routed.attempts))}

    # ------------------------------------------------------------- routes
    def do_GET(self):
        p = self.path.split('?')[0].rstrip('/')
        if p in ('/health', ''):
            return self._json(200, {'ok': True, 'version': __version__})
        if not self._auth_ok():
            return self._json(401, {'error': {'message': 'invalid router key', 'type': 'auth'}})
        if p in ('/v1/models', '/models'):
            data = [{'id': 'auto', 'object': 'model', 'created': 0, 'owned_by': 'freetoken-bots'}]
            for m in self.router.callable_models():
                data.append({'id': m['key'], 'object': 'model', 'created': m.get('created') or 0,
                             'owned_by': m['provider'], 'context_length': m.get('context_length'),
                             'tools': m['tools']})
            return self._json(200, {'object': 'list', 'data': data})
        if p == '/ftb/status':
            return self._json(200, status_snapshot(self.router))
        return self._json(404, {'error': {'message': 'not found', 'type': 'not_found'}})

    def do_POST(self):
        p = self.path.split('?')[0].rstrip('/')
        if not self._auth_ok():
            return self._json(401, {'error': {'message': 'invalid router key', 'type': 'auth'}})
        try:
            body = self._body()
        except ValueError:
            return self._json(400, {'error': {'message': 'invalid JSON', 'type': 'invalid_request_error'}})
        if p in ('/v1/chat/completions', '/chat/completions'):
            return self._chat(body)
        if p in ('/v1/responses', '/responses'):
            return self._responses(body)
        if p in ('/v1/messages', '/messages'):
            return self._json(501, {'type': 'error', 'error': {
                'type': 'not_implemented',
                'message': 'Anthropic Messages API is not implemented yet. Use /v1/chat/completions '
                           'or /v1/responses.'}})
        return self._json(404, {'error': {'message': 'not found', 'type': 'not_found'}})

    def _chat(self, body):
        try:
            routed = self.router.dispatch(body)
        except RouteError as e:
            return self._json(e.status, e.body())
        hdr = self._route_headers(routed)
        if routed.json is not None:
            return self._json(200, routed.json, hdr)
        self._start_stream(hdr)
        done = False
        try:
            for e in routed.events:
                if e == '[DONE]':
                    done = True
                self._chunk('data: %s\n\n' % e)
            if not done:
                self._chunk('data: [DONE]\n\n')
            self._end_chunks()
        except (BrokenPipeError, ConnectionResetError):
            routed.events.close()
        except OSError as exc:  # upstream died mid-stream; tell the client
            try:
                self._chunk('data: %s\n\n' % json.dumps({'error': {'message': 'upstream stream error: %s' % exc}}))
                self._end_chunks()
            except OSError:
                pass

    def _responses(self, body):
        chat, ctx = R.to_chat(body)
        stream = bool(body.get('stream'))
        try:
            routed = self.router.dispatch(chat)
        except RouteError as e:
            return self._json(e.status, e.body())
        hdr = self._route_headers(routed)
        if not stream:
            if routed.json is None:  # cannot happen: dispatch mirrors stream flag
                return self._json(502, {'error': {'message': 'unexpected stream'}})
            return self._json(200, R.from_chat(routed.json, ctx, routed.model['key']), hdr)
        tr = R.StreamTranslator(ctx, routed.model['key'])
        self._start_stream(hdr)

        def send(evs):
            for typ, data in evs:
                self._chunk('event: %s\ndata: %s\n\n' % (typ, json.dumps(data, ensure_ascii=False)))
        try:
            send(tr.start())
            for e in routed.events:
                if e == '[DONE]':
                    break
                try:
                    chunk = json.loads(e)
                except ValueError:
                    continue
                if chunk.get('error'):
                    send(tr.fail(json.dumps(chunk['error'])[:300]))
                    self._end_chunks()
                    return
                send(tr.feed(chunk))
            send(tr.finish())
            self._end_chunks()
        except (BrokenPipeError, ConnectionResetError):
            routed.events.close()
        except OSError as exc:
            try:
                send(tr.fail('upstream stream error: %s' % exc))
                self._end_chunks()
            except OSError:
                pass


def make_server(cfg, host=None, port=None, router=None, quiet=False):
    rc = cfg['router']
    host = host or rc['host']
    port = int(port if port is not None else rc['port'])
    key = os.environ.get(rc.get('api_key_env') or 'FTB_ROUTER_KEY')
    if not is_loopback(host) and not key:
        raise SystemExit('refusing to listen on %s without %s set (router would be an open proxy '
                         'to your free quota)' % (host, rc.get('api_key_env')))
    router = router or Router(cfg)
    handler = type('FTBHandler', (Handler,), {'router': router, 'router_key': key, 'quiet': quiet})
    srv = ThreadingHTTPServer((host, port), handler)
    srv.daemon_threads = True
    srv.router = router
    return srv


def background(router, stop, every=30):
    last_refresh = 0.0
    while not stop.wait(every):
        router.state.save()
        if time.time() - last_refresh > 600:
            last_refresh = time.time()
            router.refresh()


def _sigterm(*_):
    raise KeyboardInterrupt


def serve(cfg, host=None, port=None):
    signal.signal(signal.SIGTERM, _sigterm)  # persist state on `kill` / service stop too
    srv = make_server(cfg, host, port)
    stop = threading.Event()
    t = threading.Thread(target=background, args=(srv.router, stop), daemon=True)
    t.start()
    srv.router.refresh()
    h, p = srv.server_address[:2]
    print('FreeToken-Bots router on http://%s:%s/v1  (free models only; Ctrl+C to stop)' % (h, p), flush=True)
    st = status_snapshot(srv.router)
    for name, s in st['providers'].items():
        print('  %-10s %s' % (name, 'usable' if s['usable'] else 'NOT usable: ' + str(s['reason'])), flush=True)
    print('  callable free models: %d' % st['callable_free_models'], flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        srv.router.state.save(force=True)
        srv.server_close()
