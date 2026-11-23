"""Fail-closed free-model routing with automatic failover.

Invariants (each enforced in code, see tests/test_routing.py):
  1. A request is only ever sent to a model that the *latest fresh* catalog of
     its provider lists as free and API-callable (`assert_free`, checked right
     before every upstream call, including every failover hop).
  2. A stale catalog (older than router.catalog_max_age_hours) makes that
     provider unusable until a rescan succeeds.
  3. Client fields that can trigger paid features or paid routing on the
     upstream (OpenRouter `models`, `provider`, `plugins`, web search, ...)
     are stripped. OpenRouter requests also carry provider.max_price = 0.
  4. A client asking for a known *paid* model gets a 400, never a silent call.
"""
import json
import threading
import time
import urllib.error
import urllib.request

from . import catalog as C
from . import quota as Q
from .common import USER_AGENT, now, parse_iso, provider_key

AUTO_ALIASES = {'auto', 'ftb/auto', 'free', 'ftb', 'ftb-auto', 'default'}
PROVIDER_AUTO = {'ftb/auto-openrouter': 'openrouter', 'auto-openrouter': 'openrouter'}

# Request fields that could make an upstream route to, or bill for, something
# other than the exact free model we chose.
STRIP_FIELDS = {'models', 'provider', 'plugins', 'route', 'transforms', 'web_search_options',
                'preset', 'service_tier', 'prediction'}


class RouteError(Exception):
    def __init__(self, status, message, attempts=None, kind='route_error'):
        super().__init__(message)
        self.status = status
        self.message = message
        self.attempts = attempts or []
        self.kind = kind

    def body(self):
        return {'error': {'message': self.message, 'type': self.kind, 'code': self.status,
                          'ftb_attempts': self.attempts}}


class UpstreamFailure(Exception):
    def __init__(self, status, body, headers):
        super().__init__('upstream %s' % status)
        self.status = status
        self.body = body or ''
        self.headers = headers or {}


class Routed:
    """A successful upstream response. Exactly one of `json` / `events` is set."""

    def __init__(self, model, headers, attempts, json_body=None, events=None):
        self.model = model
        self.headers = headers
        self.attempts = attempts
        self.json = json_body
        self.events = events


def request_needs(body):
    msgs = body.get('messages') or []
    needs_tools = bool(body.get('tools')) or any(
        m.get('role') == 'tool' or m.get('tool_calls') for m in msgs if isinstance(m, dict))
    needs_images = False
    for m in msgs:
        c = m.get('content') if isinstance(m, dict) else None
        if isinstance(c, list) and any(isinstance(p, dict) and p.get('type') in ('image_url', 'input_image')
                                       for p in c):
            needs_images = True
    est = int(len(json.dumps(msgs, ensure_ascii=False).encode('utf-8')) / 3.5)
    return needs_tools, needs_images, est


class Router:
    def __init__(self, cfg, state=None, opener=None, scanner=None):
        self.cfg = cfg
        self.state = state or Q.State()
        self.opener = opener or urllib.request.urlopen
        self.scanner = scanner or (lambda only=None: C.scan(self.cfg, only=only))
        self.cat = C.load()
        self.lock = threading.Lock()
        self._last_refresh_try = 0.0

    # ------------------------------------------------------------ catalog
    def reload(self):
        with self.lock:
            self.cat = C.load()

    def refresh(self, force=False):
        """Rescan providers whose catalog is older than refresh_interval_hours."""
        rc = self.cfg['router']
        stale = [p for p, pc in self.cfg['providers'].items() if pc.get('enabled', True)
                 and (force or not C.provider_fresh(self.cat, p, rc['refresh_interval_hours']))]
        if not stale or (not force and time.time() - self._last_refresh_try < 300):
            return False
        self._last_refresh_try = time.time()
        try:
            cat, _ = self.scanner(only=stale)
        except Exception:
            return False
        with self.lock:
            self.cat = cat
        return True

    def provider_usable(self, provider):
        pc = self.cfg['providers'].get(provider) or {}
        if not pc.get('enabled', True):
            return False, 'disabled'
        if pc.get('routable') is False:
            return False, 'monitor-only: free tier is OpenCode-client-only (use OpenCode / ftb delegate)'
        if not C.provider_fresh(self.cat, provider, self.cfg['router']['catalog_max_age_hours']):
            return False, 'catalog stale or missing (fail-closed)'
        if not provider_key(self.cfg, provider):
            return False, 'no API key (%s)' % pc.get('api_key_env')
        b = self.state.provider_blocked(provider)
        if b:
            return False, 'blocked until %s: %s' % (b['until'], b['reason'])
        return True, None

    def assert_free(self, key):
        """The single gate every upstream call passes through."""
        m = C.find(self.cat, key)
        if not m or not m.get('free') or not m.get('api_callable'):
            return None
        if not C.provider_fresh(self.cat, m['provider'], self.cfg['router']['catalog_max_age_hours']):
            return None
        return m

    # ---------------------------------------------------------- selection
    def callable_models(self):
        return [m for m in C.free_models(self.cat) if m['api_callable']]

    def _rank(self, m):
        prefer = self.cfg['routing'].get('prefer') or []
        pref = len(prefer)
        for i, p in enumerate(prefer):
            if m['key'] == p or p in m['key']:
                pref = i
                break
        fails = min(self.state.model_health(m['key']).get('fails', 0), 3)
        size = m.get('params_b') or m.get('params_hint_b')
        bucket = 2 if size and size >= 100 else (0 if size and size < 20 else 1)
        return (pref, 1 if m.get('meta_router') else 0, fails, -bucket, -(m.get('context_length') or 0))

    def resolve_request_model(self, requested):
        """-> (pinned_key or None, provider_filter or None)."""
        r = (requested or '').strip()
        if not r or r in AUTO_ALIASES:
            return None, None
        if r in PROVIDER_AUTO:
            return None, PROVIDER_AUTO[r]
        try:
            key, _note = C.resolve_key(self.cat, r)
            m = C.find(self.cat, key)
            if not m.get('api_callable'):
                raise RouteError(400, '%s is free but not callable through the router: %s' % (
                    key, m.get('monitor_reason')), kind='monitor_only_model')
            return key, None
        except KeyError as exc:
            if 'NOT free' in str(exc):
                raise RouteError(400, str(exc), kind='paid_model_refused')
            if self.cfg['router'].get('unknown_model', 'auto') == 'auto':
                return None, None
            raise RouteError(404, str(exc), kind='unknown_model')

    def candidates(self, requested, needs_tools=False, needs_images=False, est_tokens=0):
        pinned, only_provider = self.resolve_request_model(requested)
        rt = self.cfg['routing']
        excluded = rt.get('exclude') or []
        min_ctx = max(rt.get('min_context') or 0, int(est_tokens * 1.1))
        skipped = []
        pool = []
        usable = {}
        for m in self.callable_models():
            p = m['provider']
            if p not in usable:
                usable[p] = self.provider_usable(p)
            ok, why = usable[p]
            if not ok:
                continue
            if only_provider and p != only_provider:
                continue
            if any(x in m['key'] for x in excluded) and m['key'] != pinned:
                continue
            if needs_tools and not m['tools']:
                continue
            if needs_images and 'image' not in (m.get('input_modalities') or []):
                continue
            if (m.get('context_length') or 0) < min_ctx and m['key'] != pinned:
                continue
            if self.state.model_cooling(m['key']):
                skipped.append(m['key'])
                continue
            if m.get('meta_router') and not rt.get('allow_meta_router', True) and m['key'] != pinned:
                continue
            pool.append(m)
        pool.sort(key=self._rank)
        if pinned:
            first = [m for m in pool if m['key'] == pinned]
            if not first:
                pm = C.find(self.cat, pinned)
                why = usable.get(pm['provider'], self.provider_usable(pm['provider']))[1] if pm else None
                if not rt.get('pinned_fallback', True):
                    raise RouteError(503, 'pinned model %s unavailable: %s' % (
                        pinned, why or 'cooling down / filtered'), kind='pinned_unavailable')
            rest = [m for m in pool if m['key'] != pinned] if rt.get('pinned_fallback', True) else []
            pool = first + rest
        if not pool:
            reasons = {p: v[1] for p, v in usable.items() if not v[0]}
            for p in self.cfg['providers']:
                if p not in usable:
                    ok, why = self.provider_usable(p)
                    if not ok:
                        reasons[p] = why
            raise RouteError(503, 'no free model available for this request (tools=%s images=%s, '
                                  'est_tokens=%d). providers: %s; cooling: %s' % (
                                      needs_tools, needs_images, est_tokens,
                                      json.dumps(reasons, ensure_ascii=False), skipped[:10]),
                             kind='no_free_model')
        return pool

    # ------------------------------------------------------------ upstream
    def build_payload(self, m, body):
        payload = {k: v for k, v in body.items() if k not in STRIP_FIELDS}
        payload['model'] = m['id']
        if not payload.get('stream'):
            payload.pop('stream_options', None)
        cap = m.get('max_output')
        for f in ('max_tokens', 'max_completion_tokens'):
            if cap and isinstance(payload.get(f), int) and payload[f] > cap:
                payload[f] = cap
        if m['provider'] == 'openrouter' and self.cfg['providers']['openrouter'].get('enforce_max_price', True):
            # Server-side guarantee on top of our own check: never pay anything.
            payload['provider'] = {'max_price': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}}
        return payload

    def _headers(self, m):
        h = {'User-Agent': USER_AGENT, 'Content-Type': 'application/json',
             'Accept': 'application/json, text/event-stream'}
        key = provider_key(self.cfg, m['provider'])
        if key:
            h['Authorization'] = 'Bearer ' + key
        if m['provider'] == 'openrouter':
            h['HTTP-Referer'] = 'https://github.com/limin112/min-skill'
            h['X-Title'] = 'FreeToken-Bots'
        return h

    def _send(self, m, payload, stream):
        url = m['base_url'].rstrip('/') + '/chat/completions'
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=self._headers(m))
        timeout = self.cfg['router']['first_byte_timeout']
        try:
            resp = self.opener(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8', 'replace') if exc.fp else ''
            raise UpstreamFailure(exc.code, body, dict(exc.headers or {}))
        except (OSError, ValueError) as exc:
            raise UpstreamFailure(None, str(exc), {})
        headers = dict(resp.headers or {})
        self.state.note_rate_headers(m['provider'], headers)
        if not stream:
            try:
                raw = resp.read().decode('utf-8', 'replace')
            finally:
                resp.close()
            try:
                data = json.loads(raw)
            except ValueError:
                raise UpstreamFailure(502, 'non-JSON upstream body: ' + raw[:200], headers)
            if data.get('error') or not data.get('choices'):
                err = data.get('error') or {'message': 'empty choices'}
                code = err.get('code') if isinstance(err, dict) else None
                raise UpstreamFailure(code if isinstance(code, int) else 502, json.dumps(err)[:500], headers)
            return headers, data, None
        events = sse_events(resp)
        try:
            first = next(events)
        except StopIteration:
            resp.close()
            raise UpstreamFailure(502, 'empty stream', headers)
        except (OSError, ValueError) as exc:
            resp.close()
            raise UpstreamFailure(None, str(exc), headers)
        if first != '[DONE]':
            try:
                obj = json.loads(first)
            except ValueError:
                obj = {}
            if isinstance(obj, dict) and obj.get('error'):
                resp.close()
                err = obj['error']
                code = err.get('code') if isinstance(err, dict) else None
                raise UpstreamFailure(code if isinstance(code, int) else 502, json.dumps(err)[:500], headers)

        def chain():
            try:
                yield first
                for e in events:
                    yield e
            finally:
                resp.close()
        return headers, None, chain()

    def dispatch(self, body):
        """Send a chat-completions request to the best free model, failing over."""
        self.refresh()
        stream = bool(body.get('stream'))
        needs_tools, needs_images, est = request_needs(body)
        pool = self.candidates(body.get('model'), needs_tools, needs_images, est)
        attempts = []
        last = None
        for m in pool[:max(1, int(self.cfg['router']['max_attempts']))]:
            gate = self.assert_free(m['key'])
            if not gate:
                attempts.append({'model': m['key'], 'skipped': 'failed free re-check'})
                continue
            if self.state.provider_blocked(gate['provider']):
                continue  # blocked by an earlier hop of this same request
            payload = self.build_payload(gate, body)
            t0 = time.time()
            try:
                headers, data, events = self._send(gate, payload, stream)
            except UpstreamFailure as f:
                c = Q.apply(self.state, gate, f.status, f.body, f.headers)
                self.state.count(gate['provider'], False)
                attempts.append({'model': gate['key'], 'status': f.status, 'kind': c['kind'],
                                 'error': f.body[:200]})
                last = f
                if not c['failover']:
                    raise RouteError(f.status or 502, f.body[:500] or 'upstream error', attempts, 'upstream_error')
                continue
            attempts.append({'model': gate['key'], 'status': 200})
            latency = int((time.time() - t0) * 1000)
            if data is not None:
                self.state.model_ok(gate['key'], latency)
                self.state.count(gate['provider'], True, data.get('usage'))
                return Routed(gate, headers, attempts, json_body=data)
            return Routed(gate, headers, attempts, events=self._track(gate, events, latency))
        status = 503
        if last is not None and last.status in (429, 402):
            status = 429
        raise RouteError(status, 'all free candidates failed or are exhausted; no paid fallback '
                                 'is ever used', attempts, 'free_pool_exhausted')

    def _track(self, m, events, latency):
        usage = None
        ok = True
        try:
            for e in events:
                if e != '[DONE]' and '"usage"' in e:
                    try:
                        usage = json.loads(e).get('usage') or usage
                    except ValueError:
                        pass
                if e != '[DONE]' and '"error"' in e[:40]:
                    ok = False
                yield e
        except (OSError, ValueError):
            ok = False
            raise
        finally:
            if ok:
                self.state.model_ok(m['key'], latency)
            else:
                self.state.cool_model(m['key'], 30, None, 'mid-stream error')
            self.state.count(m['provider'], ok, usage)


def sse_events(resp):
    """Yield the `data:` payload of each SSE event (comments skipped)."""
    buf = []
    while True:
        line = resp.readline()
        if not line:
            if buf:
                yield '\n'.join(buf)
            return
        line = line.decode('utf-8', 'replace').rstrip('\r\n')
        if not line:
            if buf:
                yield '\n'.join(buf)
                buf = []
            continue
        if line.startswith(':'):
            continue
        if line.startswith('data:'):
            buf.append(line[5:].lstrip(' '))
        elif line.startswith('{'):  # some servers send bare JSON lines
            buf.append(line)


def status_snapshot(router):
    cat = router.cat
    out = {'catalog_checked_at': cat.get('checked_at'), 'providers': {}}
    for p in router.cfg['providers']:
        ok, why = router.provider_usable(p)
        st = (cat.get('providers') or {}).get(p) or {}
        age = None
        t = parse_iso(st.get('checked_at'))
        if t:
            age = round((now() - t).total_seconds() / 3600, 2)
        out['providers'][p] = {'usable': ok, 'reason': why, 'catalog_age_hours': age,
                               'today': router.state.today(p)}
    out['callable_free_models'] = len(router.callable_models())
    out['cooling'] = [k for k in router.state.data['models'] if router.state.model_cooling(k)]
    out['now'] = now().isoformat()
    return out

