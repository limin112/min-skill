"""Quota, rate-limit and health state.

What is *measured* (from APIs / response headers) is kept apart from what is
*documented policy* and from what is simply *unknown*. Nothing here guesses a
number and presents it as live data.
"""
import datetime as dt
import json
import threading

from .common import (HttpError, atomic_json, http_json, iso, next_utc_midnight, now, path,
                     provider_key, read_json, utc_day)

# Published policy, shown with source labels. Not enforced as truth: the
# router reacts to real 429/402 responses instead.
DOCUMENTED = {
    'openrouter': {
        'source': 'https://openrouter.ai/docs/api-reference/limits',
        'free_requests_per_minute': 20,
        'free_requests_per_day': '50 if the account bought < $10 credits, 1000 otherwise',
        'daily_reset': 'UTC midnight (inferred; the router trusts X-RateLimit-Reset when sent)',
    },
    'opencode': {
        'source': 'https://opencode.ai/docs/zen',
        'free_requests_per_day': 'not published',
        'note': ('No quota API. Limits are learned from 429 FreeUsageLimitError + retry-after. '
                 'Free models are limited-time; check OpenCode terms on data use during free periods.'),
    },
}


class State:
    """Thread-safe health/usage state persisted to ~/.freetoken-bots/state.json."""

    def __init__(self, file=None):
        self.file = file or path('state.json')
        self.lock = threading.Lock()
        self.data = read_json(self.file, None) or {}
        self.data.setdefault('usage', {})
        self.data.setdefault('provider_block', {})
        self.data.setdefault('models', {})
        self.data.setdefault('rate_limit_headers', {})
        self._dirty = False

    def save(self, force=False):
        with self.lock:
            if force or self._dirty:
                atomic_json(self.file, self.data)
                self._dirty = False

    def _touch(self):
        self._dirty = True

    # -- usage
    def count(self, provider, ok, usage=None):
        with self.lock:
            day = self.data['usage'].setdefault(provider, {}).setdefault(utc_day(), {
                'requests': 0, 'ok': 0, 'errors': 0, 'prompt_tokens': 0, 'completion_tokens': 0})
            day['requests'] += 1
            day['ok' if ok else 'errors'] += 1
            if usage:
                day['prompt_tokens'] += int(usage.get('prompt_tokens') or usage.get('input_tokens') or 0)
                day['completion_tokens'] += int(usage.get('completion_tokens') or usage.get('output_tokens') or 0)
            # keep 14 days
            for p in self.data['usage'].values():
                for d in sorted(p)[:-14]:
                    p.pop(d, None)
            self._touch()

    def today(self, provider):
        return (self.data['usage'].get(provider) or {}).get(utc_day(), {
            'requests': 0, 'ok': 0, 'errors': 0, 'prompt_tokens': 0, 'completion_tokens': 0})

    # -- blocks / cooldowns
    def block_provider(self, provider, until, reason, source):
        with self.lock:
            self.data['provider_block'][provider] = {'until': iso(until), 'reason': reason[:300],
                                                     'source': source, 'at': iso()}
            self._touch()
        self.save()  # quota blocks matter across restarts; persist immediately

    def provider_blocked(self, provider):
        b = self.data['provider_block'].get(provider)
        if not b:
            return None
        until = dt.datetime.fromisoformat(b['until'])
        return b if until > now() else None

    def cool_model(self, key, seconds, status, error):
        with self.lock:
            m = self.data['models'].setdefault(key, {})
            m['fails'] = m.get('fails', 0) + 1
            m['last_error'] = (error or '')[:300]
            m['last_status'] = status
            m['last_error_at'] = iso()
            if seconds:
                m['cooldown_until'] = iso(now() + dt.timedelta(seconds=seconds))
            self._touch()

    def model_ok(self, key, latency_ms):
        with self.lock:
            m = self.data['models'].setdefault(key, {})
            m['fails'] = 0
            m['last_ok'] = iso()
            m['last_latency_ms'] = latency_ms
            m.pop('cooldown_until', None)
            self._touch()

    def model_cooling(self, key):
        m = self.data['models'].get(key) or {}
        u = m.get('cooldown_until')
        return bool(u) and dt.datetime.fromisoformat(u) > now()

    def model_health(self, key):
        return self.data['models'].get(key) or {}

    def note_rate_headers(self, provider, headers):
        rl = {k.lower(): v for k, v in (headers or {}).items() if k.lower().startswith('x-ratelimit')}
        if rl:
            with self.lock:
                self.data['rate_limit_headers'][provider] = dict(rl, seen_at=iso())
                self._touch()


def _header(headers, name):
    for k, v in (headers or {}).items():
        if k.lower() == name.lower():
            return v
    return None


def _reset_from_headers(headers):
    ra = _header(headers, 'retry-after')
    if ra:
        try:
            return now() + dt.timedelta(seconds=float(ra))
        except ValueError:
            pass
    rs = _header(headers, 'x-ratelimit-reset')
    if rs:
        try:
            v = float(rs)
            if v > 1e12:  # epoch ms (OpenRouter)
                v /= 1000.0
            if v > 1e9:
                return dt.datetime.fromtimestamp(v, dt.timezone.utc)
            return now() + dt.timedelta(seconds=v)
        except ValueError:
            pass
    return None


def classify(provider, status, body, headers):
    """Decide what an upstream failure means.

    Returns dict(scope, kind, failover, cooldown_s, until):
      scope  'provider' (all models of the provider), 'model', or 'request'
      failover  whether trying another free model makes sense
    """
    text = (body or '').lower()
    reset = _reset_from_headers(headers)
    if status is None:  # network / timeout
        return {'scope': 'model', 'kind': 'unreachable', 'failover': True, 'cooldown_s': 30, 'until': None}
    if status == 429:
        daily = ('freeusagelimit' in text or 'free usage limit' in text or 'per-day' in text
                 or 'per day' in text)
        if daily:
            until = reset or next_utc_midnight()
            return {'scope': 'provider', 'kind': 'quota_exhausted', 'failover': True,
                    'cooldown_s': None, 'until': until}
        if 'free-models-per-min' in text or 'per-minute' in text or 'per minute' in text:
            # account-wide free RPM limit: pause the whole provider briefly
            until = reset if reset and reset < now() + dt.timedelta(minutes=5) else now() + dt.timedelta(seconds=60)
            return {'scope': 'provider', 'kind': 'rate_limited', 'failover': True,
                    'cooldown_s': None, 'until': until}
        secs = (reset - now()).total_seconds() if reset else 60
        return {'scope': 'model', 'kind': 'rate_limited', 'failover': True,
                'cooldown_s': int(round(max(5, min(secs, 3600)))), 'until': None}
    if status == 402:
        # Payment required on a free model = account balance/limit problem. Never
        # "fix" it by paying; block the provider and use another free source.
        return {'scope': 'provider', 'kind': 'payment_required', 'failover': True,
                'cooldown_s': None, 'until': now() + dt.timedelta(hours=1)}
    if status == 401:
        return {'scope': 'provider', 'kind': 'auth', 'failover': True, 'cooldown_s': None,
                'until': now() + dt.timedelta(minutes=10)}
    if status == 404:
        return {'scope': 'model', 'kind': 'unavailable', 'failover': True, 'cooldown_s': 3600, 'until': None}
    if status in (403, 408, 409, 425) or status >= 500:
        return {'scope': 'model', 'kind': 'upstream_error', 'failover': True, 'cooldown_s': 30, 'until': None}
    if 'no endpoints found' in text or 'model not found' in text or 'is not available' in text:
        return {'scope': 'model', 'kind': 'unavailable', 'failover': True, 'cooldown_s': 600, 'until': None}
    return {'scope': 'request', 'kind': 'bad_request', 'failover': False, 'cooldown_s': None, 'until': None}


def apply(state, model, status, body, headers):
    c = classify(model['provider'], status, body, headers)
    if c['scope'] == 'provider':
        state.block_provider(model['provider'], c['until'], '%s: %s' % (c['kind'], (body or '')[:200]),
                             'retry-after/x-ratelimit-reset' if _reset_from_headers(headers) else 'policy default')
    elif c['scope'] == 'model':
        state.cool_model(model['key'], c['cooldown_s'], status, body)
    return c


def provider_quota(cfg, state, provider, live=True):
    """Everything known about one provider's free quota, with sources."""
    key = provider_key(cfg, provider)
    info = {'provider': provider, 'api_key': 'set' if key else 'missing',
            'documented': DOCUMENTED.get(provider), 'local_today_utc': state.today(provider),
            'blocked': state.provider_blocked(provider),
            'last_rate_limit_headers': state.data['rate_limit_headers'].get(provider),
            'live': None}
    if provider == 'openrouter' and key and live:
        try:
            data, _ = http_json(cfg['providers']['openrouter']['base_url'] + '/key', key=key, timeout=15)
            d = (data or {}).get('data') or {}
            info['live'] = {k: d.get(k) for k in (
                'label', 'limit', 'limit_remaining', 'limit_reset', 'usage', 'usage_daily',
                'is_free_tier', 'rate_limit') if k in d}
            if d.get('is_free_tier') is True:
                info['estimated_free_requests_per_day'] = 50
            info['live_source'] = 'GET /api/v1/key'
        except HttpError as exc:
            info['live'] = {'error': 'HTTP %s' % exc.status}
        except OSError as exc:
            info['live'] = {'error': str(exc)[:120]}
    elif provider == 'opencode':
        info['live'] = 'unavailable: OpenCode Zen exposes no quota/usage API'
    if provider == 'opencode' and not key:
        allow = cfg['providers']['opencode'].get('allow_anonymous')
        info['access'] = 'anonymous (opted in)' if allow else 'monitor-only until OPENCODE_API_KEY is set'
    return info


def dumps(x):
    return json.dumps(x, indent=2, ensure_ascii=False, default=str)
