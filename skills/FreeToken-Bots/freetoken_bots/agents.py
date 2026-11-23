"""Agent integrations, data-driven.

The router speaks two generic protocols (OpenAI Chat Completions and OpenAI
Responses). Every agent below is just "which protocol + where to put the base
URL". Adding an agent = adding one entry; no core code changes.

Nothing here edits a user's config unless they run `ftb agent <id> --apply`
(JSON configs only: backup first, adds only our own provider key, refuses to
replace an existing one without --force).

status:
  verified       run end-to-end against the router in this repo's integration
                 test (scripts/integration_test.sh), version noted
  documented     config taken from the agent's official docs, not run here
  not-supported  needs a protocol adapter that does not exist yet
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path

from .common import atomic_json

PROVIDER_ID = 'freetoken'


def _ctx(models):
    """Advertised context/output for the 'auto' model: conservative minimum over
    tool-capable callable models (auto never picks one too small for the request)."""
    tool = [m for m in models if m.get('tools') and m.get('context_length')]
    ctx = min((m['context_length'] for m in tool), default=128000)
    outs = [m['max_output'] for m in tool if m.get('max_output')]
    return max(ctx, 32000), max(4096, min(min(outs, default=16384), 32000))


def router_key_ref(style):
    if style == 'pi':
        return '$FTB_ROUTER_KEY' if os.environ.get('FTB_ROUTER_KEY') else 'ftb-local'
    if style == 'opencode':
        return '{env:FTB_ROUTER_KEY}' if os.environ.get('FTB_ROUTER_KEY') else 'ftb-local'
    return os.environ.get('FTB_ROUTER_KEY') or 'ftb-local'


# ---------------------------------------------------------------- generators

def pi_config(base, models):
    ctx, out = _ctx(models)
    entries = [{'id': 'auto', 'name': 'FreeToken auto (free only)', 'reasoning': False,
                'input': ['text'], 'contextWindow': ctx, 'maxTokens': out,
                'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}}]
    for m in models:
        if not m.get('tools'):
            continue
        entries.append({'id': m['key'], 'name': m['name'] + ' [ftb]', 'reasoning': False,
                        'input': ['text', 'image'] if 'image' in (m.get('input_modalities') or []) else ['text'],
                        'contextWindow': m.get('context_length') or ctx,
                        'maxTokens': min(m.get('max_output') or out, 32000),
                        'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}})
    return {'providers': {PROVIDER_ID: {
        'name': 'FreeToken-Bots', 'baseUrl': base, 'api': 'openai-completions',
        'apiKey': router_key_ref('pi'),
        'compat': {'supportsDeveloperRole': False, 'supportsReasoningEffort': False,
                   'supportsStore': False},
        'models': entries}}}


def opencode_config(base, models):
    ctx, out = _ctx(models)
    ms = {'auto': {'name': 'FreeToken auto (free only)', 'tool_call': True,
                   'limit': {'context': ctx, 'output': out}}}
    for m in models:
        if m.get('tools'):
            ms[m['key']] = {'name': m['name'] + ' [ftb]', 'tool_call': True,
                            'limit': {'context': m.get('context_length') or ctx,
                                      'output': min(m.get('max_output') or out, 32000)}}
    return {'$schema': 'https://opencode.ai/config.json',
            'provider': {PROVIDER_ID: {'npm': '@ai-sdk/openai-compatible', 'name': 'FreeToken-Bots',
                                       'options': {'baseURL': base, 'apiKey': router_key_ref('opencode')},
                                       'models': ms}}}


def codex_files(base, models):
    """Codex >= 0.16x keeps profiles in <CODEX_HOME>/<name>.config.toml; a
    [profiles.x] table inside config.toml is rejected."""
    ctx, _ = _ctx(models)
    return {
        'config.toml': ('[model_providers.%s]\nname = "FreeToken-Bots"\nbase_url = "%s"\n'
                        'wire_api = "responses"\nenv_key = "FTB_ROUTER_KEY"\n' % (PROVIDER_ID, base)),
        'free.config.toml': ('model_provider = "%s"\nmodel = "auto"\nmodel_context_window = %d\n'
                             % (PROVIDER_ID, ctx)),
    }


def codex_toml(base, models):
    f = codex_files(base, models)
    return ('# Option A (no file edits): ftb run codex -- exec "..."\n'
            '# Option B: append to ~/.codex/config.toml:\n%s\n'
            '# and create ~/.codex/free.config.toml (Codex profile file):\n%s\n'
            '# then: export FTB_ROUTER_KEY=ftb-local && codex --profile free\n'
            % (f['config.toml'], f['free.config.toml']))


def codex_args(base, models):
    ctx, _ = _ctx(models)
    p = 'model_providers.' + PROVIDER_ID
    return ['-c', 'model_provider=' + PROVIDER_ID, '-c', 'model="auto"',
            '-c', p + '.name="FreeToken-Bots"', '-c', p + '.base_url="%s"' % base,
            '-c', p + '.wire_api="responses"', '-c', p + '.env_key="FTB_ROUTER_KEY"',
            '-c', 'model_context_window=%d' % ctx]


AGENTS = [
    {'id': 'pi', 'name': 'Pi (pi.dev coding agent)', 'protocol': 'openai-chat', 'status': 'verified',
     'verified_with': 'pi 1.6.0',
     'how': 'Adds provider "freetoken" to <agent-dir>/models.json. `ftb agent pi --apply` merges it '
            '(backup + only our key). Then: pi --provider freetoken --model auto',
     'config': ('json', 'models.json', pi_config)},
    {'id': 'codex', 'name': 'Codex CLI', 'protocol': 'openai-responses', 'status': 'verified',
     'verified_with': 'codex-cli 0.163.0',
     'how': 'Codex only accepts wire_api="responses"; the router translates Responses <-> chat. '
            '`ftb run codex -- exec "..."` passes -c overrides, no config file edit.',
     'config': ('toml', 'config.toml', codex_toml)},
    {'id': 'opencode', 'name': 'OpenCode', 'protocol': 'openai-chat', 'status': 'verified',
     'verified_with': 'opencode 1.19.6',
     'how': '`ftb run opencode -- run "..."` injects OPENCODE_CONFIG_CONTENT (no file edit). '
            'Or merge the JSON into opencode.json with `ftb agent opencode --apply`. '
            'Model: freetoken/auto. Note: OpenCode also has Zen free models built in (in-product quota).',
     'config': ('json', 'opencode.json', opencode_config)},
    {'id': 'aider', 'name': 'Aider', 'protocol': 'openai-chat', 'status': 'documented',
     'how': 'aider --model openai/auto --openai-api-base <base> --openai-api-key <key>  '
            '(or `ftb run aider`). LiteLLM "openai/" prefix = generic OpenAI-compatible endpoint.',
     'config': None},
    {'id': 'cline', 'name': 'Cline (VS Code)', 'protocol': 'openai-chat', 'status': 'documented',
     'how': 'Settings -> API Provider "OpenAI Compatible": Base URL <base>, API Key <key>, Model ID "auto".',
     'config': None},
    {'id': 'roo', 'name': 'Roo Code (VS Code)', 'protocol': 'openai-chat', 'status': 'documented',
     'how': 'Settings -> API Provider "OpenAI Compatible": Base URL <base>, API Key <key>, Model "auto".',
     'config': None},
    {'id': 'hermes', 'name': 'Hermes Agent (Nous Research)', 'protocol': 'openai-chat', 'status': 'documented',
     'how': 'Run `hermes model`, choose the custom OpenAI-compatible endpoint, base URL <base>, '
            'key <key>, model "auto". Config schema not verified locally.',
     'config': None},
    {'id': 'generic', 'name': 'Any OpenAI-compatible client / SDK', 'protocol': 'openai-chat',
     'status': 'verified', 'verified_with': 'curl + python urllib (tests)',
     'how': 'OPENAI_BASE_URL=<base> OPENAI_API_KEY=<key>, model "auto" (or a key from /v1/models). '
            '`ftb run <any command>` exports both.',
     'config': None},
    {'id': 'gemini', 'name': 'Gemini CLI', 'protocol': 'gemini-generateContent', 'status': 'not-supported',
     'how': 'Gemini CLI only speaks the Gemini API (generateContent). Needs a Gemini protocol adapter; '
            'not implemented. Do not point it at the router.',
     'config': None},
    {'id': 'claude-code', 'name': 'Claude Code', 'protocol': 'anthropic-messages', 'status': 'not-supported',
     'how': 'Deferred: needs an Anthropic Messages adapter (/v1/messages currently returns 501).',
     'config': None},
]


def get(agent_id):
    for a in AGENTS:
        if a['id'] == agent_id:
            return a
    raise KeyError(agent_id)


def render(agent_id, base, models):
    a = get(agent_id)
    if not a['config']:
        return a['how'].replace('<base>', base).replace('<key>', router_key_ref('plain'))
    kind, _name, fn = a['config']
    out = fn(base, models)
    return json.dumps(out, indent=2, ensure_ascii=False) if kind == 'json' else out


def default_config_path(agent_id):
    if agent_id == 'pi':
        return Path(os.environ.get('PI_CODING_AGENT_DIR') or Path.home() / '.pi' / 'agent') / 'models.json'
    if agent_id == 'opencode':
        return Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config') / 'opencode' / 'opencode.json'
    raise KeyError('--apply supports pi and opencode (JSON configs) only')


def merge_provider(existing, ours, force=False):
    """Add our provider entry to an agent JSON config. Never touches other keys.

    Returns (merged, changed). Raises ValueError if our provider id already
    exists with different content and force is False."""
    merged = copy.deepcopy(existing)
    key = 'providers' if 'providers' in ours else 'provider'
    merged.setdefault(key, {})
    new_entry = ours[key][PROVIDER_ID]
    cur = merged[key].get(PROVIDER_ID)
    if cur == new_entry:
        return merged, False
    if cur is not None and not force:
        raise ValueError('%s.%s already exists and differs; re-run with --force to replace '
                         'only that entry' % (key, PROVIDER_ID))
    merged[key][PROVIDER_ID] = new_entry
    if '$schema' in ours and '$schema' not in merged:
        merged['$schema'] = ours['$schema']
    return merged, True


def apply(agent_id, base, models, target=None, force=False, dry_run=False):
    a = get(agent_id)
    target = Path(target) if target else default_config_path(agent_id)
    ours = a['config'][2](base, models)
    existing = {}
    if target.exists():
        text = target.read_text()
        existing = json.loads(text) if text.strip() else {}
    merged, changed = merge_provider(existing, ours, force)
    if not changed:
        return {'target': str(target), 'changed': False}
    if dry_run:
        return {'target': str(target), 'changed': True, 'dry_run': True, 'would_write': merged}
    backup = None
    mode = None
    if target.exists():
        mode = target.stat().st_mode & 0o777
        backup = target.with_name(target.name + '.ftb-backup-' + dt.datetime.now().strftime('%Y%m%d%H%M%S'))
        backup.write_bytes(target.read_bytes())
    atomic_json(target, merged)
    if mode is not None:
        os.chmod(str(target), mode)
    json.loads(target.read_text())  # validate
    return {'target': str(target), 'changed': True, 'backup': str(backup) if backup else None}
