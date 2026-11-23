"""Scan providers, persist the merged catalog, detect changes, build reports."""
import datetime as dt
import json
import threading

from . import providers as P
from .common import atomic_json, atomic_text, iso, now, parse_iso, path, read_json

_LOCK = threading.Lock()


def catalog_path():
    return path('catalog.json')


def events_path():
    return path('changes.jsonl')


def load():
    return read_json(catalog_path(), {'providers': {}, 'models': [], 'first_seen': {}})


def _summary(m):
    """Fields compared between scans."""
    return {'free': m['free'], 'price_note': m['price_note'], 'expires': m.get('expires'),
            'api_callable': m['api_callable'], 'name': m['name'],
            'anonymous': m.get('anonymous'), 'price_schedule': m.get('price_schedule') or []}


def scan(cfg, fetch=None, only=None):
    """Fetch every enabled provider. A failing provider keeps its previous models
    but its checked_at is not advanced, so routing treats it as stale."""
    fetch = fetch or P.fetch_provider
    with _LOCK:
        old = load()
        old_by_key = {m['key']: m for m in old.get('models', [])}
        first_seen = dict(old.get('first_seen') or {})
        prov_state = dict(old.get('providers') or {})
        models = []
        t = iso()
        for name, pc in cfg['providers'].items():
            if not pc.get('enabled', True) or (only and name not in only):
                models.extend(m for m in old.get('models', []) if m['provider'] == name)
                continue
            try:
                got = fetch(name, pc)
                prov_state[name] = {'ok': True, 'checked_at': t, 'error': None,
                                    'model_count': len(got),
                                    'free_count': sum(1 for m in got if m['free'])}
                models.extend(got)
            except Exception as exc:  # network, HTTP, parse - keep the old list, mark stale
                prev = prov_state.get(name) or {}
                prov_state[name] = dict(prev, ok=False, error=str(exc)[:300], failed_at=t)
                models.extend(m for m in old.get('models', []) if m['provider'] == name)
        for m in models:
            first_seen.setdefault(m['key'], t)
            if m['free']:
                first_seen.setdefault('free:' + m['key'], t)
        new = {'checked_at': t, 'providers': prov_state, 'models': models,
               'first_seen': first_seen}
        events = diff(old_by_key, {m['key']: m for m in models}, prov_state, t,
                      baseline=not old.get('models'))
        atomic_json(catalog_path(), new)
        if events:
            events_path().parent.mkdir(parents=True, exist_ok=True)
            with open(events_path(), 'a') as f:
                for e in events:
                    f.write(json.dumps(e, ensure_ascii=False) + '\n')
        write_daily_report(cfg, new)
        return new, events


def diff(old, new, prov_state, t, baseline=False):
    """Change events between two {key: model} maps.

    Providers whose scan failed are skipped, so an outage never looks like
    every model losing free status."""
    if baseline:
        return [{'at': t, 'type': 'baseline', 'free_keys': sorted(k for k, m in new.items() if m['free'])}]
    events = []
    ok = {n for n, s in prov_state.items() if s.get('ok') and s.get('checked_at') == t}
    for key, m in new.items():
        if m['provider'] not in ok:
            continue
        o = old.get(key)
        if m['free'] and not (o and o['free']):
            events.append({'at': t, 'type': 'new_free' if not o else 'became_free', 'key': key,
                           'name': m['name'], 'anonymous': m.get('anonymous'),
                           'api_callable': m['api_callable'], 'expires': m.get('expires')})
        elif o and o['free'] and not m['free']:
            events.append({'at': t, 'type': 'no_longer_free', 'key': key, 'name': m['name'],
                           'price_note': m['price_note']})
        elif o and m['free']:
            if (o.get('expires') != m.get('expires')
                    or (o.get('price_schedule') or []) != (m.get('price_schedule') or [])):
                events.append({'at': t, 'type': 'free_terms_changed', 'key': key, 'name': m['name'],
                               'expires': m.get('expires'),
                               'price_schedule': m.get('price_schedule')})
            if o.get('api_callable') != m['api_callable']:
                events.append({'at': t, 'type': 'callable_changed', 'key': key, 'name': m['name'],
                               'api_callable': m['api_callable'],
                               'monitor_reason': m.get('monitor_reason')})
    for key, o in old.items():
        if key not in new and o['provider'] in ok and o['free']:
            events.append({'at': t, 'type': 'delisted', 'key': key, 'name': o['name']})
    return events


def free_models(cat=None):
    cat = cat or load()
    return [m for m in cat.get('models', []) if m['free']]


def provider_fresh(cat, provider, max_age_hours):
    st = (cat.get('providers') or {}).get(provider) or {}
    t = parse_iso(st.get('checked_at'))
    return bool(t) and now() - t <= dt.timedelta(hours=max_age_hours)


def find(cat, key):
    for m in cat.get('models', []):
        if m['key'] == key:
            return m
    return None


def resolve_key(cat, requested):
    """Map a user string to a free model key, fail-closed.

    Accepts the full router key, a bare upstream id (if unique), and fixes a
    missing OpenRouter ':free' suffix (the suffix-less id is the PAID variant).
    Returns (key, note) or raises KeyError with a reason."""
    req = (requested or '').strip()
    if not req:
        raise KeyError('empty model id')
    free = {m['key']: m for m in free_models(cat)}
    if req in free:
        return req, None
    bare = [k for k, m in free.items() if m['id'] == req]
    if len(bare) == 1:
        return bare[0], None
    for cand in (req + ':free', 'openrouter/' + req + ':free', 'openrouter/' + req):
        if cand in free:
            return cand, ('"%s" is not a verified-free id; using "%s". The id without '
                          '":free" is the PAID variant.' % (req, cand))
    paid = find(cat, req) or find(cat, 'openrouter/' + req) or find(cat, 'opencode/' + req)
    if paid:
        raise KeyError('"%s" is listed but NOT free (%s). Refused.' % (req, paid['price_note']))
    raise KeyError('"%s" is not a verified-free model in the latest scan. Refused.' % req)


# ------------------------------------------------------------------- reports

def read_events(since=None):
    out = []
    p = events_path()
    if not p.exists():
        return out
    for line in p.read_text().splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if since and (parse_iso(e.get('at')) or now()) < since:
            continue
        out.append(e)
    return out


def expiring(cat, days):
    """Free models whose published free period ends (or price rule starts) soon."""
    horizon = now() + dt.timedelta(days=days)
    out = []
    for m in free_models(cat):
        dates = []
        if m.get('expires'):
            dates.append(('expires', m['expires']))
        for rule in m.get('price_schedule') or []:
            d = rule.get('date') or {}
            for op in ('gte', 'gt', 'equals'):
                if op in d:
                    dates.append(('price rule from', d[op]))
        for label, d in dates:
            t = parse_iso(d if 'T' in str(d) else str(d) + 'T00:00:00+00:00')
            if t and t <= horizon:
                out.append({'key': m['key'], 'name': m['name'], 'what': label, 'date': d,
                            'days_left': round((t - now()).total_seconds() / 86400, 1)})
    return sorted(out, key=lambda x: x['days_left'])


def build_report(cfg, cat=None, hours=24):
    cat = cat or load()
    since = now() - dt.timedelta(hours=hours)
    events = [e for e in read_events(since) if e['type'] != 'baseline']
    free = free_models(cat)
    by_type = {}
    for e in events:
        by_type.setdefault(e['type'], []).append(e)
    return {
        'generated_at': iso(),
        'window_hours': hours,
        'catalog_checked_at': cat.get('checked_at'),
        'providers': cat.get('providers'),
        'free_total': len(free),
        'free_callable': sum(1 for m in free if m['api_callable']),
        'free_opencode_client': [m['key'] for m in free if m.get('opencode_client')],
        'free_monitor_only': [{'key': m['key'], 'reason': m['monitor_reason']}
                              for m in free if not m['api_callable'] and not m.get('opencode_client')],
        'anonymous_free': [m['key'] for m in free if m.get('anonymous')],
        'new_free': by_type.get('new_free', []) + by_type.get('became_free', []),
        'lost_free': by_type.get('no_longer_free', []) + by_type.get('delisted', []),
        'terms_changed': by_type.get('free_terms_changed', []) + by_type.get('callable_changed', []),
        'expiring_soon': expiring(cat, cfg['report']['expiring_days']),
        'published_end_dates': expiring(cat, 3650),
    }


def report_markdown(r):
    L = ['# FreeToken-Bots daily report', '',
         '- generated: %s (window %dh)' % (r['generated_at'], r['window_hours']),
         '- catalog checked: %s' % r['catalog_checked_at']]
    for name, st in (r['providers'] or {}).items():
        L.append('- %s: %s, %s free / %s models%s' % (
            name, 'ok' if st.get('ok') else 'SCAN FAILED', st.get('free_count', '?'),
            st.get('model_count', '?'), (' - ' + st['error']) if st.get('error') else ''))
    L.append('- free models: %d (via router, any agent: %d; inside OpenCode only: %d)' % (
        r['free_total'], r['free_callable'], len(r.get('free_opencode_client') or [])))
    L += ['', '## New free models (%d)' % len(r['new_free'])]
    L += ['- `%s` %s%s%s' % (e['key'], e['name'], ' [anonymous]' if e.get('anonymous') else '',
                             '' if e.get('api_callable', True) else ' [monitor-only]')
          for e in r['new_free']] or ['- none']
    L += ['', '## No longer free / delisted (%d)' % len(r['lost_free'])]
    L += ['- `%s` %s (%s)' % (e['key'], e['name'], e['type'] if e['type'] == 'delisted'
                               else 'now ' + e.get('price_note', 'paid')) for e in r['lost_free']] or ['- none']
    L += ['', '## Limited-time free ending soon (%d)' % len(r['expiring_soon'])]
    L += ['- `%s` %s %s (%.1f days)' % (e['key'], e['what'], e['date'], e['days_left'])
          for e in r['expiring_soon']] or ['- none published']
    later = [e for e in r.get('published_end_dates') or [] if e not in r['expiring_soon']]
    if later:
        L += ['', '## Other published free end dates']
        L += ['- `%s` %s %s (%.0f days)' % (e['key'], e['what'], e['date'], e['days_left']) for e in later]
    if r['terms_changed']:
        L += ['', '## Free terms changed']
        L += ['- `%s` %s' % (e['key'], e['type']) for e in r['terms_changed']]
    L += ['', '## Anonymous / undisclosed free models (heuristic)']
    L += ['- `%s`' % k for k in r['anonymous_free']] or ['- none']
    if r.get('free_opencode_client'):
        L += ['', '## OpenCode Zen free models (usable only inside OpenCode: `opencode` or `ftb delegate`)']
        L += ['- `%s`' % k for k in r['free_opencode_client']]
    if r['free_monitor_only']:
        L += ['', '## Free but monitor-only (not usable as a chat model)']
        L += ['- `%s`: %s' % (x['key'], x['reason']) for x in r['free_monitor_only']]
    L += ['', 'Note: OpenCode Zen does not publish end dates for free periods; treat every Zen free model as '
          'limited-time. Official docs: "Free-tier chat models require OpenCode".']
    return '\n'.join(L) + '\n'


def write_daily_report(cfg, cat):
    r = build_report(cfg, cat)
    day = dt.datetime.now().strftime('%Y-%m-%d')  # local date: the scan runs at 08:00 local time
    atomic_text(path('reports', day + '.md'), report_markdown(r))
    atomic_json(path('reports', day + '.json'), r)
    return r
