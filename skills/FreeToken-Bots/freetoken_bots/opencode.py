"""OpenCode as the harness for OpenCode Zen free models.

OpenCode's docs: "Free-tier chat models require OpenCode; use paid models or Go
from other clients." So FreeToken-Bots never calls Zen free models itself.
Instead:

  * OpenCode is the agent that uses them (`ftb opencode setup` installs it and
    adds OpenRouter free models via the router as a second free source).
  * Other agents (Pi, Codex, Hermes, Grokbot, Claude Code, ...) delegate a whole
    task to OpenCode with `ftb delegate "task"`: OpenCode runs its own agent
    loop with its own tools in the given directory and returns the result.

What this module deliberately does NOT do: expose Zen free models as a model
API for other agents' own loops, or imitate the OpenCode client. That would be
"free tier from other clients", which the docs rule out.
"""
import json
import os
import re
import shutil
import subprocess
import sys

from . import catalog as C

INSTALL_NPM = ['npm', 'install', '-g', 'opencode-ai']
INSTALL_SCRIPT = 'curl -fsSL https://opencode.ai/install | bash'
FAIL_PATTERNS = re.compile(r'FreeUsageLimit|usage limit|rate.?limit|429|Unexpected server error|'
                           r'ProviderModelNotFound|model not found', re.I)


def binary():
    return shutil.which('opencode')


def version():
    b = binary()
    if not b:
        return None
    try:
        return subprocess.run([b, '--version'], capture_output=True, text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None


def install_command():
    if shutil.which('npm'):
        return INSTALL_NPM
    return ['sh', '-c', INSTALL_SCRIPT]


def client_models(provider='opencode', timeout=60):
    """Model ids the installed OpenCode client offers for a provider (None if unknown)."""
    b = binary()
    if not b:
        return None
    try:
        p = subprocess.run([b, 'models', provider], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if p.returncode != 0:
        return None
    pre = provider + '/'
    return {l.strip()[len(pre):] for l in p.stdout.splitlines() if l.strip().startswith(pre)}


def _rank(m):
    size = m.get('params_hint_b') or 0
    return (not m.get('tools'), -(1 if size >= 100 else 0), -(m.get('context_length') or 0))


def zen_free_models(cat=None, available=None):
    """Zen free chat models usable inside OpenCode, best first.

    `available` = ids the local client lists; when given, models the client
    does not offer are dropped (catalog and client can briefly disagree)."""
    cat = cat or C.load()
    ms = [m for m in C.free_models(cat) if m['provider'] == 'opencode' and m.get('opencode_client')]
    if available is not None:
        ms = [m for m in ms if m['id'] in available]
    return sorted(ms, key=_rank)


def resolve_model(cat, requested):
    """Only free models may be delegated to. Accepts 'opencode/x', 'x', or 'freetoken/...'."""
    r = (requested or '').strip()
    if r.startswith('freetoken/'):
        return r
    key = r if r.startswith('opencode/') else 'opencode/' + r
    m = C.find(cat, key)
    if not m or not m['free'] or not m.get('opencode_client'):
        raise KeyError('%s is not a free OpenCode model in the latest scan; refused' % r)
    return key


def run_once(model, task, cwd=None, env=None, timeout=1800, fmt='default'):
    cmd = [binary(), 'run', '-m', model]
    if cwd:
        # OpenCode resolves the project from --dir / $PWD, not from the process cwd
        cwd = os.path.abspath(cwd)
        cmd += ['--dir', cwd]
        env = dict(env or os.environ, PWD=cwd)
    if fmt == 'json':
        cmd += ['--format', 'json']
    cmd.append(task)
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout,
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired as exc:
        return 124, (exc.stdout or '') if isinstance(exc.stdout, str) else '', 'timeout'
    return p.returncode, p.stdout, p.stderr


def delegate(task, models, cwd=None, env=None, timeout=1800, fmt='default', log=None):
    """Run `opencode run` with each free model in turn until one succeeds.

    Retrying is safe only before the agent has done anything: a failed attempt
    that already printed output may have edited files, so we stop there
    instead of replaying the task on another model."""
    log = log or (lambda s: print(s, file=sys.stderr))
    env = dict(env or os.environ)
    env.pop('OPENCODE_DISABLE_FREE_MODELS', None)
    attempts = []
    for model in models:
        rc, out, err = run_once(model, task, cwd, env, timeout, fmt)
        attempts.append({'model': model, 'rc': rc})
        if rc == 0 and out.strip():
            return {'ok': True, 'model': model, 'output': out, 'attempts': attempts}
        did_work = bool(out.strip()) and not FAIL_PATTERNS.search(out + err)
        log('[ftb delegate] %s failed (rc=%s)%s' % (model, rc, ': ' + (err or out).strip()[-200:] if (err or out) else ''))
        if did_work:
            log('[ftb delegate] the agent produced output before failing; not replaying the task on '
                'another model (it may already have changed files)')
            return {'ok': False, 'model': model, 'output': out, 'attempts': attempts}
    return {'ok': False, 'model': None, 'output': '', 'attempts': attempts}


def status(cat=None):
    cat = cat or C.load()
    avail = client_models()
    ms = zen_free_models(cat, avail)
    return {
        'installed': bool(binary()),
        'binary': binary(),
        'version': version(),
        'install_command': ' '.join(install_command()),
        'zen_free_in_catalog': [m['key'] for m in zen_free_models(cat)],
        'zen_free_offered_by_client': [m['key'] for m in ms] if avail is not None else None,
        # listed by the client but not free in the Zen catalog (stale client cache, or paid
        # models when logged in) - never chosen by `ftb delegate`
        'client_lists_but_not_free_in_catalog': sorted(
            avail - {m['id'] for m in C.free_models(cat) if m['provider'] == 'opencode'})
        if avail is not None else None,
    }


def dumps(x):
    return json.dumps(x, indent=2, ensure_ascii=False)
