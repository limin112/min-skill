"""Paths, config, time helpers, HTTP helpers and atomic file writes."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request

from . import __version__

USER_AGENT = 'FreeToken-Bots/' + __version__ + ' (+https://github.com/limin112/min-skill)'

DEFAULT_CONFIG = {
    'providers': {
        'openrouter': {
            'enabled': True,
            'api_key_env': 'OPENROUTER_API_KEY',
            'catalog_url': 'https://openrouter.ai/api/v1/models',
            'base_url': 'https://openrouter.ai/api/v1',
            'allowed_hosts': ['openrouter.ai'],
        },
        'opencode': {
            # Monitoring only. OpenCode docs: "Free-tier chat models require
            # OpenCode; use paid models or Go from other clients." The router never
            # calls Zen; its free models are used through the OpenCode client
            # (`ftb opencode`, `ftb delegate`).
            'enabled': True,
            'routable': False,
            'catalog_url': 'https://opencode.ai/zen/v1/models',
        },
    },
    'router': {
        'host': '127.0.0.1',
        'port': 8787,
        'api_key_env': 'FTB_ROUTER_KEY',
        'catalog_max_age_hours': 24,
        'refresh_interval_hours': 6,
        'first_byte_timeout': 120,
        'max_attempts': 6,
        # Model names the router does not know (e.g. "gpt-5" sent by an agent
        # default) are mapped to "auto". Every candidate is free either way.
        'unknown_model': 'auto',
    },
    'routing': {
        'prefer': [],          # router keys or substrings tried first
        'exclude': [],         # substrings never used
        'min_context': 32000,
        'pinned_fallback': True,   # a pinned model may fall back to other free models
        'allow_meta_router': True,  # openrouter/free as last resort
    },
    'report': {'expiring_days': 7},
}


def home():
    return Path(os.environ.get('FTB_HOME') or (Path.home() / '.freetoken-bots'))


def path(*parts):
    return home().joinpath(*parts)


def deep_merge(base, extra):
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_config():
    cfg_path = Path(os.environ.get('FTB_CONFIG') or path('config.json'))
    user = {}
    if cfg_path.exists():
        user = json.loads(cfg_path.read_text())
    return deep_merge(DEFAULT_CONFIG, user)


def now():
    return dt.datetime.now(dt.timezone.utc)


def iso(t=None):
    return (t or now()).replace(microsecond=0).isoformat()


def parse_iso(s):
    if not s:
        return None
    try:
        t = dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return t


def utc_day(t=None):
    return (t or now()).strftime('%Y-%m-%d')


def next_utc_midnight(t=None):
    t = t or now()
    return (t + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def atomic_json(p, data):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + p.name, dir=str(p.parent))
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, 0o600)
        os.replace(name, str(p))
    finally:
        if os.path.exists(name):
            os.unlink(name)


def atomic_text(p, text):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + p.name, dir=str(p.parent))
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(text)
        os.chmod(name, 0o600)
        os.replace(name, str(p))
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_json(p, default=None):
    p = Path(p)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text())
    except ValueError:
        return default


class HttpError(Exception):
    def __init__(self, status, body, headers):
        super().__init__('HTTP %s: %s' % (status, (body or '')[:300]))
        self.status = status
        self.body = body or ''
        self.headers = headers or {}


def http_json(url, key=None, payload=None, timeout=30, headers=None):
    """GET/POST JSON. Raises HttpError on HTTP errors, OSError on network errors."""
    h = {'User-Agent': USER_AGENT, 'Accept': 'application/json'}
    if key:
        h['Authorization'] = 'Bearer ' + key
    if payload is not None:
        h['Content-Type'] = 'application/json'
    h.update(headers or {})
    req = urllib.request.Request(
        url, headers=h, data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode('utf-8') or 'null'), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', 'replace') if exc.fp else ''
        raise HttpError(exc.code, body, dict(exc.headers or {}))


# provider -> (display name, page that creates the key, what to click there)
KEY_HELP = {
    'openrouter': ('OpenRouter', 'https://openrouter.ai/settings/keys', 'Create API key'),
}


def key_help(provider):
    name, url, step = KEY_HELP.get(provider, (provider, '', ''))
    return name, url, '%s  ->  %s' % (url, step) if url else step


def keys_file():
    return path('keys.env')


def load_keys():
    """KEY=VALUE lines from ~/.freetoken-bots/keys.env (written by `ftb setup`)."""
    out = {}
    p = keys_file()
    if not p.exists():
        return out
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        if k.startswith('export '):
            k = k[7:].strip()
        out[k] = v.strip().strip('"').strip("'")
    return out


def save_keys(values):
    """Merge values into keys.env (0600). Empty values remove the entry."""
    cur = load_keys()
    for k, v in values.items():
        if v:
            cur[k] = v
        else:
            cur.pop(k, None)
    text = '# FreeToken-Bots API keys (ftb setup). Environment variables take precedence.\n'
    text += ''.join('%s=%s\n' % (k, v) for k, v in sorted(cur.items()))
    atomic_text(keys_file(), text)
    return keys_file()


def keyed_providers(cfg):
    """Providers the router calls with an API key (OpenCode Zen is client-only)."""
    return [p for p, pc in cfg['providers'].items() if pc.get('api_key_env')]


def key_source(cfg, provider):
    env = cfg['providers'][provider].get('api_key_env')
    if not env:
        return None
    if os.environ.get(env):
        return 'env'
    if load_keys().get(env):
        return 'keys.env'
    return None


def provider_key(cfg, provider):
    env = cfg['providers'][provider].get('api_key_env')
    if not env:
        return None
    return os.environ.get(env) or load_keys().get(env)


def mask(s):
    if not s:
        return '(unset)'
    return 'set (%d chars)' % len(s)
