#!/usr/bin/env python3
"""FreeToken-Bots: conservative OpenRouter free-model discovery and Pi sync."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request

API = 'https://openrouter.ai/api/v1'
HOME = Path.home() / '.pi' / 'agent'
CACHE = HOME / 'freetoken-bots.json'
MODELS = HOME / 'models.json'
PARAM = re.compile(r'(?<!\d)(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z])')

def request(url, key=None, payload=None, timeout=20):
    headers = {'User-Agent': 'FreeToken-Bots/0.1', 'Accept': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, headers=headers,
        data=json.dumps(payload).encode() if payload is not None else None)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)

def zero(value):
    try:
        return float(value) == 0
    except (ValueError, TypeError):
        return False

def is_free(model):
    p = model.get('pricing') or {}
    if not (zero(p.get('prompt')) and zero(p.get('completion'))):
        return False
    return all(zero(p[k]) for k in ('request', 'input_cache_read', 'input_cache_write') if k in p)

def billion(model):
    # Never infer size from context length, ID digits, or model family alone.
    direct = model.get('total_parameters') or model.get('parameter_count')
    if isinstance(direct, (int, float)) and direct >= 1e9:
        return direct / 1e9
    # Descriptive strings are unverified; intentionally do not use them for eligibility.
    return None

def eligible(model):
    if not is_free(model):
        return False
    supported = model.get('supported_parameters') or []
    if 'tools' not in supported:
        return False
    return billion(model) is not None and billion(model) >= 100

def discover():
    raw = request(API + '/models')
    entries = raw.get('data', [])
    free = [m for m in entries if is_free(m)]
    qualifying = [m for m in free if eligible(m)]
    pending = [m for m in free if 'tools' in (m.get('supported_parameters') or []) and billion(m) is None]
    return {'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'eligible': [{'id': m['id'], 'context_length': m.get('context_length'), 'parameters_b': billion(m)} for m in qualifying],
            'needs_parameter_verification': [{'id': m['id'], 'context_length': m.get('context_length')} for m in pending],
            'free_ids': sorted(m['id'] for m in free),
            'free_count': len(free)}

class NotFreeError(RuntimeError):
    """Raised when a model ID cannot be proven free. Never probe on uncertainty."""

def free_ids():
    """Exact OpenRouter IDs verified free by the latest scan.

    Re-scans (public /models, no key needed) when the cache is missing,
    unreadable, older than 24h, or predates the free_ids field. Free
    eligibility is dynamic; a stale list must never authorize a call.
    """
    report = None
    if CACHE.exists():
        try:
            report = json.loads(CACHE.read_text())
            age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(report['checked_at'])
            if age > dt.timedelta(hours=24) or 'free_ids' not in report:
                report = None
        except (ValueError, KeyError):
            report = None
    if report is None:
        report = discover()
        atomic_json(CACHE, report)
    return set(report.get('free_ids', []))

def resolve_free_model(requested):
    """Fail-closed resolution of a user-supplied model ID to a verified-free exact ID.

    - exact match in the latest free scan -> use as-is
    - missing ':free' suffix but the suffixed form is verified free ->
      auto-correct with a loud stderr warning (dropping ':free' silently
      routes to the PAID variant of the same model)
    - anything else -> raise NotFreeError; the caller must refuse the probe.
      A pretty-printed, remembered, or hand-typed ID is not proof of free.
    """
    requested = (requested or '').strip()
    known = free_ids()
    if requested in known:
        return requested
    suffixed = requested if requested.endswith(':free') else requested + ':free'
    if suffixed in known:
        print(f'WARNING: "{requested}" is not a verified-free model ID; '
              f'using verified-free "{suffixed}" instead. '
              f'Calling "{requested}" directly would use the PAID variant.',
              file=sys.stderr)
        return suffixed
    raise NotFreeError(
        f'"{requested}" is not a verified-free OpenRouter model ID. '
        'Probe refused: calling it could incur charges. '
        'Use an exact ID from the latest scan report.')

def probe(model_id, key):
    try:
        result = request(API + '/chat/completions', key,
            {'model': model_id, 'messages': [{'role': 'user', 'content': 'Reply PONG'}], 'max_tokens': 64}, timeout=35)
        if result.get('error'):
            return {'ok': False, 'error': str(result['error'])[:300]}
        return {'ok': bool(result.get('choices')), 'error': None}
    except urllib.error.HTTPError as exc:
        return {'ok': False, 'http_status': exc.code, 'error': str(exc)}
    except (OSError, ValueError) as exc:
        return {'ok': False, 'error': str(exc)[:300]}

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('command', choices=['scan', 'status', 'probe', 'sync'])
    p.add_argument('--model', help='Exact OpenRouter model ID for probe')
    p.add_argument('--allow-unverified-size', action='store_true', help='Include unverified 100B sizes only in report, never Pi sync')
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    if a.command == 'status':
        print(CACHE.read_text() if CACHE.exists() else '{"message":"run scan first"}')
        return
    if a.command == 'probe':
        if not a.model or not os.getenv('OPENROUTER_API_KEY'):
            p.error('probe requires --model and OPENROUTER_API_KEY')
        try:
            model = resolve_free_model(a.model)
        except NotFreeError as exc:
            print(f'error: {exc}', file=sys.stderr)
            return 2
        print(json.dumps(probe(model, os.environ['OPENROUTER_API_KEY']), indent=2))
        return
    report = discover()
    if a.command == 'scan':
        if not a.dry_run:
            atomic_json(CACHE, report)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return
    # Pi custom model schema varies across releases. Fail closed: never overwrite
    # models.json or claim to register models without confirming local schema.
    # Emit a machine-readable proposed model set for Pi-aware installation agent.
    report['sync_status'] = 'proposal_only_requires_pi_schema_validation'
    report['pi_models_path'] = str(MODELS)
    if not a.dry_run:
        atomic_json(CACHE, report)
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    raise SystemExit(main())
