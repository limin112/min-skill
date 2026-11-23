"""Provider catalog adapters: fetch a public model list and normalize it.

Every adapter returns a list of normalized model dicts:

    key            router-wide unique id, "<provider>/<upstream id>"
    provider       "openrouter" | "opencode"
    id             upstream model id (sent to the upstream API)
    name
    free           True only when *every* published price is exactly zero
    price_note     short human-readable price summary
    api            upstream protocol ("chat-completions", "messages", ...)
    api_callable   True when the router can call it (free + chat-completions + text output)
    monitor_reason why it is monitor-only (None when api_callable)
    tools, reasoning, input_modalities, context_length, max_output
    params_b       verified total parameter count in billions (None if unknown)
    params_hint_b  size parsed from id/description - ranking hint only, never "verified"
    expires        ISO date when the free period ends, if the provider publishes one
    price_schedule date-conditioned price rules found in the catalog (limited-time pricing)
    anonymous      heuristic: undisclosed / stealth model
    base_url       upstream chat-completions base url (callable models only)

Free is judged only from the provider's own published catalog. Anything we
cannot parse is treated as NOT free (fail-closed).
"""
import re
from urllib.parse import urlparse

from .common import http_json

STEALTH_WORDS = re.compile(r'\b(stealth|cloaked|anonymous|undisclosed|mystery)\b', re.I)
SIZE_RE = re.compile(r'(?<![\d.])(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z])')
TOTAL_RE = re.compile(r'(\d+(?:\.\d+)?)\s*[bB]\s+total', re.I)


def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return None
    return None


def size_hint(model_id, description=''):
    """Parameter-size *hint* for ranking only. Never used to label a model verified."""
    m = TOTAL_RE.search(description or '')
    if m:
        return float(m.group(1))
    sizes = [float(x) for x in SIZE_RE.findall(model_id or '')]
    return max(sizes) if sizes else None


def host_allowed(url, allowed):
    try:
        host = (urlparse(url).hostname or '').lower()
    except ValueError:
        return False
    return any(host == h or host.endswith('.' + h) for h in allowed)


# ----------------------------------------------------------------- OpenRouter

def openrouter_pricing_free(pricing):
    """True only if prompt and completion are present and every price is zero.

    Unknown structures fail closed. `overrides` (tiered pricing) must be zero
    too; keys like min_prompt_tokens are thresholds, not prices.
    """
    if not isinstance(pricing, dict):
        return False
    if _num(pricing.get('prompt')) != 0 or _num(pricing.get('completion')) != 0:
        return False
    for k, v in pricing.items():
        if k == 'overrides':
            if v in (None, []):
                continue
            if not isinstance(v, list):
                return False
            for tier in v:
                if not isinstance(tier, dict):
                    return False
                for tk, tv in tier.items():
                    if tk.startswith(('min_', 'max_')):
                        continue
                    if _num(tv) != 0:
                        return False
            continue
        n = _num(v)
        if n is None or n != 0:
            return False
    return True


def normalize_openrouter(raw, cfg_provider):
    out = []
    base = cfg_provider.get('base_url') or 'https://openrouter.ai/api/v1'
    for m in (raw or {}).get('data', []):
        mid = m.get('id')
        if not mid:
            continue
        pricing = m.get('pricing') or {}
        free = openrouter_pricing_free(pricing)
        arch = m.get('architecture') or {}
        outputs = arch.get('output_modalities') or ['text']
        inputs = arch.get('input_modalities') or ['text']
        endpoints = m.get('endpoints')
        chat_ok = (not endpoints) or any(str(e).endswith('/chat/completions') for e in endpoints)
        supported = m.get('supported_parameters') or []
        direct = m.get('total_parameters') or m.get('parameter_count')
        params_b = direct / 1e9 if isinstance(direct, (int, float)) and direct >= 1e9 else None
        desc = m.get('description') or ''
        reason = None
        if not free:
            reason = 'not free'
        elif outputs != ['text']:
            reason = 'non-text output (%s)' % '+'.join(outputs)
        elif not chat_ok:
            reason = 'no chat-completions endpoint'
        anonymous = bool(STEALTH_WORDS.search(desc) or STEALTH_WORDS.search(m.get('name') or '')) or (
            mid.startswith('openrouter/') and mid not in ('openrouter/free', 'openrouter/auto'))
        out.append({
            'key': 'openrouter/' + mid,
            'provider': 'openrouter',
            'id': mid,
            'name': m.get('name') or mid,
            'free': free,
            'price_note': 'free' if free else 'prompt=%s completion=%s' % (
                pricing.get('prompt'), pricing.get('completion')),
            'api': 'chat-completions' if chat_ok else ','.join(endpoints or []),
            'api_callable': reason is None,
            'monitor_reason': reason,
            'tools': 'tools' in supported,
            'reasoning': 'reasoning' in supported or 'include_reasoning' in supported,
            'input_modalities': inputs,
            'context_length': m.get('context_length') or (m.get('top_provider') or {}).get('context_length'),
            'max_output': (m.get('top_provider') or {}).get('max_completion_tokens'),
            'params_b': params_b,
            'params_hint_b': size_hint(mid, desc),
            'expires': m.get('expiration_date'),
            'price_schedule': [],
            'anonymous': anonymous,
            'meta_router': mid == 'openrouter/free',
            'base_url': base if reason is None else None,
            'created': m.get('created'),
        })
    return out


# --------------------------------------------------------- OpenCode Zen

_SKIP_COST_KEYS = {'when', 'factor', 'unit'}


def zen_cost_free(cost, schedule=None):
    """Walk a Zen `cost` tree. Free only if at least one price exists and all are 0.

    `when` blocks are conditions (context size, service tier, date) and are
    skipped, but date conditions are recorded into `schedule` so the report
    can flag limited-time pricing. `factor` multiplies prices; a multiple of
    zero is zero, so multipliers cannot make a zero price non-zero.
    """
    found = []
    ok = [True]

    def walk(node, trail):
        if isinstance(node, dict):
            when = node.get('when')
            if isinstance(when, dict) and schedule is not None:
                _collect_dates(when, schedule, trail)
            for k, v in node.items():
                if k in _SKIP_COST_KEYS:
                    continue
                walk(v, trail + [k])
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, trail + [str(i)])
        elif isinstance(node, bool) or node is None:
            return
        elif isinstance(node, (int, float)):
            found.append(node)
            if node != 0:
                ok[0] = False
        elif isinstance(node, str):
            n = _num(node)
            if n is None:
                ok[0] = False  # unparseable price-like value: fail closed
            else:
                found.append(n)
                if n != 0:
                    ok[0] = False
        else:
            ok[0] = False

    if not isinstance(cost, dict) or not cost:
        return False
    walk(cost, [])
    return ok[0] and bool(found)


def _collect_dates(when, schedule, trail):
    date = when.get('date')
    if isinstance(date, dict):
        schedule.append({'rule': '.'.join(trail) or 'cost', 'date': date})
    for k in ('all', 'any'):
        for sub in when.get(k) or []:
            if isinstance(sub, dict):
                _collect_dates(sub, schedule, trail)


def normalize_opencode(raw, cfg_provider):
    out = []
    allowed = cfg_provider.get('allowed_hosts') or ['opencode.ai']
    for m in (raw or {}).get('data', []):
        mid = m.get('id')
        if not mid:
            continue
        schedule = []
        free = zen_cost_free(m.get('cost'), schedule)
        apis = m.get('api') or {}
        caps = m.get('capabilities') or {}
        mods = m.get('modalities') or {}
        outputs = mods.get('output') or []
        inputs = sorted({'image' if x.startswith('image') else x.split('/')[0]
                         for x in (mods.get('input') or ['text'])})
        chat = apis.get('chat-completions') or {}
        base = cfg_provider.get('base_url') or chat.get('base_url')
        reason = None
        if not free:
            reason = 'not free'
        elif m.get('type') not in (None, 'chat'):
            reason = 'type %s' % m.get('type')
        elif outputs != ['text']:
            reason = 'non-text output'
        elif not chat:
            reason = 'upstream protocol %s not adapted yet (router speaks chat-completions)' % (
                m.get('recommended_api') or ','.join(apis))
        elif not base or not (cfg_provider.get('base_url') or host_allowed(base, allowed)):
            reason = 'catalog base_url not on an allowed host'
        desc = m.get('description') or ''
        limit = m.get('limit') or {}
        anonymous = (not m.get('canonical_id') and not m.get('open_weights')) or bool(
            STEALTH_WORDS.search(desc))
        out.append({
            'key': 'opencode/' + mid,
            'provider': 'opencode',
            'id': mid,
            'name': m.get('name') or mid,
            'free': free,
            'price_note': 'free' if free else _zen_price_note(m.get('cost')),
            'api': m.get('recommended_api') or ','.join(apis),
            'api_callable': reason is None,
            'monitor_reason': reason,
            'tools': bool((caps.get('tools') or {}).get('supported')),
            'reasoning': bool((caps.get('reasoning') or {}).get('supported')),
            'input_modalities': inputs,
            'context_length': limit.get('context'),
            'max_output': limit.get('output'),
            'params_b': None,
            'params_hint_b': size_hint(m.get('canonical_id') or mid, desc),
            'expires': None,   # Zen publishes no end date for free periods
            'price_schedule': schedule,
            'anonymous': anonymous,
            'meta_router': False,
            'base_url': base if reason is None else None,
            'canonical_id': m.get('canonical_id'),
            'created': m.get('created'),
        })
    return out


def _zen_price_note(cost):
    try:
        t = cost['text']
        return 'in=$%s/M out=$%s/M' % (t['input']['price'], t['output']['price'])
    except (KeyError, TypeError):
        return 'priced (see catalog)'


# ------------------------------------------------------------------ registry

ADAPTERS = {
    'openrouter': normalize_openrouter,
    'opencode': normalize_opencode,
}


def fetch_provider(name, cfg_provider, timeout=30):
    raw, _ = http_json(cfg_provider['catalog_url'], timeout=timeout)
    return ADAPTERS[name](raw, cfg_provider)
