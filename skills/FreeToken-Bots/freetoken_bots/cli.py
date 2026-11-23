"""ftb - FreeToken-Bots command line."""
import argparse
import copy
import json
import os
import shutil
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path

from . import __version__
from . import agents as A
from . import catalog as C
from . import quota as Q
from .common import (DEFAULT_CONFIG, HttpError, atomic_json, load_config, mask, now, parse_iso,
                     path, provider_key)
from .routing import RouteError, Router, request_needs, status_snapshot

SKILL_DIR = Path(__file__).resolve().parents[1]


def out(obj):
    print(json.dumps(obj, indent=2, ensure_ascii=False, default=str))


def base_url(cfg, a=None):
    host = getattr(a, 'host', None) or cfg['router']['host']
    port = getattr(a, 'port', None) or cfg['router']['port']
    return 'http://%s:%s/v1' % ('127.0.0.1' if host in ('0.0.0.0', '') else host, port)


def ensure_catalog(cfg, quiet=False):
    cat = C.load()
    max_age = cfg['router']['catalog_max_age_hours']
    stale = [p for p, pc in cfg['providers'].items()
             if pc.get('enabled', True) and not C.provider_fresh(cat, p, max_age)]
    if stale:
        if not quiet:
            print('catalog missing/stale for %s - scanning...' % ', '.join(stale), file=sys.stderr)
        cat, _ = C.scan(cfg, only=stale)
    return cat


# ------------------------------------------------------------------ commands

def cmd_scan(cfg, a):
    cat, events = C.scan(cfg, only=a.provider and [a.provider])
    if a.json:
        return out({'providers': cat['providers'], 'events': events})
    for name, st in cat['providers'].items():
        print('%-10s %s  models=%s free=%s%s' % (
            name, 'ok    ' if st.get('ok') else 'FAILED', st.get('model_count', '?'),
            st.get('free_count', '?'), ('  error: ' + st['error']) if st.get('error') else ''))
    free = C.free_models(cat)
    print('free models: %d (router-callable: %d)' % (len(free), sum(1 for m in free if m['api_callable'])))
    shown = [e for e in events if e['type'] != 'baseline']
    if any(e['type'] == 'baseline' for e in events):
        print('first scan: baseline recorded; changes are reported from the next scan on.')
    for e in shown:
        print('  %-18s %s' % (e['type'], e.get('key')))
    print('report: %s' % path('reports'))


def _fmt_ctx(n):
    if not n:
        return '?'
    return '%dk' % (n // 1000) if n < 1000000 else '%.1fM' % (n / 1e6)


def cmd_models(cfg, a):
    cat = ensure_catalog(cfg)
    state = Q.State()
    ms = cat.get('models', []) if a.all else C.free_models(cat)
    if a.provider:
        ms = [m for m in ms if m['provider'] == a.provider]
    if a.tools:
        ms = [m for m in ms if m['tools']]
    if a.json:
        return out(ms)
    router = Router(cfg, state=state)
    usable = {p: router.provider_usable(p) for p in cfg['providers']}
    print('%-62s %-5s %-5s %-6s %-11s %s' % ('MODEL (router key)', 'FREE', 'TOOLS', 'CTX', 'EXPIRES', 'STATUS'))
    for m in sorted(ms, key=lambda m: (m['provider'], not m['api_callable'], m['key'])):
        if not m['api_callable']:
            st = 'monitor-only: ' + (m.get('monitor_reason') or '')
        elif state.model_cooling(m['key']):
            st = 'cooling down (%s)' % state.model_health(m['key']).get('last_status')
        elif not usable[m['provider']][0]:
            st = 'provider: ' + usable[m['provider']][1]
        else:
            h = state.model_health(m['key'])
            st = 'ready' + (' (last ok %s)' % h['last_ok'][5:16] if h.get('last_ok') else '')
        tags = (' [anon]' if m.get('anonymous') else '') + (' [meta-router]' if m.get('meta_router') else '')
        print('%-62s %-5s %-5s %-6s %-11s %s%s' % (
            m['key'], 'yes' if m['free'] else 'no', 'yes' if m['tools'] else '-',
            _fmt_ctx(m.get('context_length')), m.get('expires') or '-', st, tags))
    print('\n%d models. Free is re-verified against the catalog before every routed call.' % len(ms))


def cmd_report(cfg, a):
    cat = C.load()
    if not cat.get('models'):
        cat, _ = C.scan(cfg)
    r = C.build_report(cfg, cat, hours=a.hours)
    if a.json:
        return out(r)
    print(C.report_markdown(r))


def cmd_quota(cfg, a):
    state = Q.State()
    res = [Q.provider_quota(cfg, state, p, live=not a.no_live) for p in cfg['providers']]
    if a.json:
        return out(res)
    for q in res:
        print('== %s  (api key: %s)' % (q['provider'], q['api_key']))
        if q.get('access'):
            print('  access:        %s' % q['access'])
        t = q['local_today_utc']
        print('  local today:   %d requests (%d ok, %d errors), %d in / %d out tokens  [measured by router]' % (
            t['requests'], t['ok'], t['errors'], t['prompt_tokens'], t['completion_tokens']))
        if q['blocked']:
            print('  BLOCKED until: %s  (%s; source: %s)' % (q['blocked']['until'], q['blocked']['reason'],
                                                           q['blocked']['source']))
        live = q.get('live')
        if isinstance(live, dict) and live:
            print('  live (%s): %s' % (q.get('live_source', 'api'), json.dumps(live, ensure_ascii=False)))
        elif isinstance(live, str):
            print('  live:          %s' % live)
        elif q['api_key'] == 'missing':
            print('  live:          unknown (no API key)')
        if q.get('estimated_free_requests_per_day'):
            print('  est. free/day: %s (is_free_tier=true => documented 50/day)' % q['estimated_free_requests_per_day'])
        if q.get('last_rate_limit_headers'):
            print('  last headers:  %s' % json.dumps(q['last_rate_limit_headers']))
        doc = q.get('documented') or {}
        for k, v in doc.items():
            if k != 'source':
                print('  documented:    %s = %s' % (k, v))
        if doc.get('source'):
            print('  doc source:    %s' % doc['source'])


def _probe_one(router, key, tools):
    body = {'model': key, 'messages': [{'role': 'user', 'content': 'Reply with exactly: PONG'}],
            'max_tokens': 256, 'stream': False}
    if tools:
        body['messages'] = [{'role': 'user', 'content': 'What time is it in UTC? Use the tool.'}]
        body['tools'] = [{'type': 'function', 'function': {
            'name': 'get_utc_time', 'description': 'Return the current UTC time.',
            'parameters': {'type': 'object', 'properties': {}, 'required': []}}}]
        body['tool_choice'] = 'auto'
    try:
        r = router.dispatch(body)
    except RouteError as e:
        return {'model': key, 'ok': False, 'status': e.status, 'error': e.message[:300], 'attempts': e.attempts}
    msg = ((r.json.get('choices') or [{}])[0].get('message') or {})
    res = {'model': r.model['key'], 'ok': True, 'attempts': r.attempts, 'usage': r.json.get('usage')}
    if tools:
        calls = msg.get('tool_calls') or []
        res['tool_call'] = bool(calls) and calls[0].get('function', {}).get('name') == 'get_utc_time'
        res['ok'] = res['tool_call']
    else:
        res['reply'] = (msg.get('content') or '')[:80]
    return res


def cmd_probe(cfg, a):
    cat = ensure_catalog(cfg)
    pcfg = copy.deepcopy(cfg)
    pcfg['routing']['pinned_fallback'] = False   # probe exactly the requested model
    router = Router(pcfg)
    router.cat = cat
    keys = []
    if a.all:
        keys = [m['key'] for m in router.callable_models()
                if (not a.provider or m['provider'] == a.provider) and (m['tools'] or not a.tools)][:a.limit]
    elif a.model:
        try:
            key, note = C.resolve_key(cat, a.model)
        except KeyError as exc:
            print('error: %s' % exc.args[0], file=sys.stderr)
            return 2
        if note:
            print('WARNING: ' + note, file=sys.stderr)
        keys = [key]
    else:
        print('error: give --model <key> or --all', file=sys.stderr)
        return 2
    results = []
    for k in keys:
        r = _probe_one(router, k, a.tools)
        results.append(r)
        if not a.json:
            print('%-60s %s %s' % (k[:60], 'OK  ' if r['ok'] else 'FAIL',
                                   r.get('reply') or ('tool_call=%s' % r.get('tool_call') if a.tools else '')
                                   or '%s %s' % (r.get('status'), r.get('error', ''))[:120]))
    router.state.save(force=True)
    if a.json:
        out(results)
    return 0 if all(r['ok'] for r in results) else 1


def cmd_route(cfg, a):
    cat = ensure_catalog(cfg, quiet=a.json)
    router = Router(cfg)
    router.cat = cat
    body = {'model': a.model or 'auto', 'messages': [{'role': 'user', 'content': 'x'}]}
    if a.tools:
        body['tools'] = [{'type': 'function', 'function': {'name': 'f', 'parameters': {}}}]
    try:
        pool = router.candidates(body['model'], *request_needs(body))
    except RouteError as e:
        print('no route: %s' % e.message)
        return 1
    if a.json:
        return out([m['key'] for m in pool])
    print('failover order for model=%s tools=%s (first %d are tried per request):' % (
        body['model'], a.tools, cfg['router']['max_attempts']))
    for i, m in enumerate(pool, 1):
        print('  %2d. %s  ctx=%s tools=%s' % (i, m['key'], _fmt_ctx(m.get('context_length')), m['tools']))


def cmd_serve(cfg, a):
    from .server import serve
    ensure_catalog(cfg)
    serve(cfg, a.host, a.port)


def cmd_status(cfg, a):
    try:
        with urllib.request.urlopen(base_url(cfg, a)[:-3] + '/ftb/status', timeout=3) as r:
            data = json.load(r)
            data['router'] = 'running at ' + base_url(cfg, a)
    except (OSError, ValueError):
        router = Router(cfg)
        data = status_snapshot(router)
        data['router'] = 'not running (start with: ftb serve)'
    out(data)


def cmd_agents(cfg, a):
    print('%-12s %-34s %-18s %-14s %s' % ('ID', 'AGENT', 'PROTOCOL', 'STATUS', 'VERIFIED WITH'))
    for ag in A.AGENTS:
        print('%-12s %-34s %-18s %-14s %s' % (ag['id'], ag['name'], ag['protocol'], ag['status'],
                                             ag.get('verified_with', '-')))
    print('\nftb agent <id>   shows config for one agent.  ftb run <id> -- <args>  launches it via the router.')


def cmd_agent(cfg, a):
    try:
        ag = A.get(a.id)
    except KeyError:
        print('unknown agent %r; see `ftb agents`' % a.id, file=sys.stderr)
        return 2
    cat = ensure_catalog(cfg, quiet=True)
    router = Router(cfg)
    router.cat = cat
    models = router.callable_models()
    base = a.base or base_url(cfg)
    if a.apply:
        try:
            res = A.apply(a.id, base, models, a.target, a.force, a.dry_run)
        except (KeyError, ValueError) as exc:
            print('error: %s' % (exc.args[0] if exc.args else exc), file=sys.stderr)
            return 2
        return out(res)
    print('# %s  [%s, protocol %s]' % (ag['name'], ag['status'], ag['protocol']))
    print('# ' + ag['how'].replace('<base>', base).replace('<key>', A.router_key_ref('plain')))
    if ag['config']:
        print('# --- %s ---' % ag['config'][1])
        print(A.render(a.id, base, models))


def _router_alive(base):
    try:
        with urllib.request.urlopen(base[:-3] + '/health', timeout=2) as r:
            return json.load(r).get('ok') is True
    except (OSError, ValueError):
        return False


def cmd_run(cfg, a):
    """Run an agent through the router without editing its config files."""
    argv = list(a.args)
    if argv and argv[0] == '--':
        argv = argv[1:]
    base = base_url(cfg)
    srv = None
    if not _router_alive(base):
        from .server import make_server
        ensure_catalog(cfg)
        try:  # configured port first, so saved agent configs (e.g. Pi models.json) match
            srv = make_server(cfg, '127.0.0.1', cfg['router']['port'], quiet=True)
        except OSError:
            srv = make_server(cfg, '127.0.0.1', 0, quiet=True)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = 'http://127.0.0.1:%d/v1' % srv.server_address[1]
        print('[ftb] embedded router on %s' % base, file=sys.stderr)
    env = dict(os.environ)
    env.setdefault('FTB_ROUTER_KEY', 'ftb-local')
    env.update({'OPENAI_BASE_URL': base, 'OPENAI_API_BASE': base, 'OPENAI_API_KEY': env['FTB_ROUTER_KEY']})
    router = srv.router if srv else Router(cfg)
    models = router.callable_models()
    agent = a.agent
    if agent == 'codex':
        cmd = ['codex'] + A.codex_args(base, models) + argv
    elif agent == 'opencode':
        env['OPENCODE_CONFIG_CONTENT'] = json.dumps(A.opencode_config(base, models))
        if argv and argv[0] == 'run' and '-m' not in argv and '--model' not in argv:
            argv = argv[:1] + ['-m', A.PROVIDER_ID + '/auto'] + argv[1:]
        cmd = ['opencode'] + argv
    elif agent == 'aider':
        cmd = ['aider', '--model', 'openai/auto', '--openai-api-base', base,
               '--openai-api-key', env['FTB_ROUTER_KEY']] + argv
    elif agent == 'pi':
        cmd = ['pi', '--provider', A.PROVIDER_ID, '--model', 'auto'] + argv
        if not A.default_config_path('pi').exists():
            print('[ftb] pi needs the "freetoken" provider: run `ftb agent pi --apply` first',
                  file=sys.stderr)
    else:
        cmd = [agent] + argv
    if not shutil.which(cmd[0]):
        print('error: %s not found on PATH' % cmd[0], file=sys.stderr)
        return 127
    try:
        return subprocess.call(cmd, env=env)
    finally:
        if srv:
            srv.router.state.save(force=True)
            srv.shutdown()


def cmd_doctor(cfg, a):
    cat = C.load()
    print('FreeToken-Bots %s  python %s  home %s' % (__version__, sys.version.split()[0], path()))
    for p, pc in cfg['providers'].items():
        st = (cat.get('providers') or {}).get(p) or {}
        t = parse_iso(st.get('checked_at'))
        age = '%.1fh ago' % ((now() - t).total_seconds() / 3600) if t else 'never'
        print('  %-10s enabled=%s key %s=%s  last scan %s%s' % (
            p, pc.get('enabled', True), pc.get('api_key_env'), mask(provider_key(cfg, p)), age,
            '' if st.get('ok', True) else '  LAST SCAN FAILED: ' + str(st.get('error'))))
    if not provider_key(cfg, 'opencode') and not cfg['providers']['opencode'].get('allow_anonymous'):
        print('    opencode: no key -> Zen models are monitored but not routed. Get a free key at '
              'https://opencode.ai/auth and export OPENCODE_API_KEY.')
    print('  router %s: %s' % (base_url(cfg), 'running' if _router_alive(base_url(cfg)) else 'not running'))
    print('  router key FTB_ROUTER_KEY: %s' % mask(os.environ.get('FTB_ROUTER_KEY')))
    for ag in ('pi', 'codex', 'opencode', 'aider', 'hermes', 'gemini', 'claude'):
        print('  agent %-9s %s' % (ag, shutil.which(ag) or '-'))
    rep = sorted(path('reports').glob('*.md')) if path('reports').exists() else []
    print('  latest report: %s' % (rep[-1] if rep else 'none (run ftb scan)'))


def cmd_schedule(cfg, a):
    hh, mm = a.time.split(':')
    py = sys.executable
    entry = SKILL_DIR / 'scripts' / 'ftb.py'
    line = '%s %s * * * %s %s scan >> %s 2>&1  # freetoken-bots' % (
        int(mm), int(hh), py, entry, path('scan.log'))
    plist = path('com.freetoken-bots.scan.plist')
    plist_xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
                 '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'
                 '<key>Label</key><string>com.freetoken-bots.scan</string>\n'
                 '<key>ProgramArguments</key><array><string>%s</string><string>%s</string><string>scan</string></array>\n'
                 '<key>StartCalendarInterval</key><dict><key>Hour</key><integer>%d</integer>'
                 '<key>Minute</key><integer>%d</integer></dict>\n'
                 '<key>StandardOutPath</key><string>%s</string><key>StandardErrorPath</key><string>%s</string>\n'
                 '</dict></plist>\n') % (py, entry, int(hh), int(mm), path('scan.log'), path('scan.log'))
    if a.install == 'cron':
        cur = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
        lines = [l for l in (cur.stdout if cur.returncode == 0 else '').splitlines()
                 if '# freetoken-bots' not in l]
        lines.append(line)
        subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', text=True, check=True)
        print('installed cron entry (other entries untouched):\n  ' + line)
        print('API keys: cron does not load your shell profile. Scanning needs no key; '
              'probes/quota do.')
        return
    if a.install == 'launchd':
        plist.parent.mkdir(parents=True, exist_ok=True)
        plist.write_text(plist_xml)
        dest = Path.home() / 'Library' / 'LaunchAgents' / plist.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(str(plist), str(dest))
        subprocess.run(['launchctl', 'unload', str(dest)], capture_output=True)
        subprocess.run(['launchctl', 'load', str(dest)], check=True)
        print('installed %s (daily %s local time)' % (dest, a.time))
        return
    print('Daily scan is REQUIRED (free lists change without notice). Pick one:\n')
    print('cron (Linux/macOS):  ftb schedule --install cron\n  ' + line + '\n')
    print('launchd (macOS):     ftb schedule --install launchd\n')
    print('systemd timer: run `%s %s scan` daily with OnCalendar=*-*-* %s:00' % (py, entry, a.time))


def cmd_init(cfg, a):
    p = Path(os.environ.get('FTB_CONFIG') or path('config.json'))
    if p.exists() and not a.force:
        print('%s exists; not touching it (use --force to rewrite with defaults)' % p)
        return 1
    atomic_json(p, DEFAULT_CONFIG)
    print('wrote %s' % p)


def build_parser():
    ap = argparse.ArgumentParser(prog='ftb', description='FreeToken-Bots: free model radar + fail-closed router '
                                 '(OpenRouter + OpenCode Zen)')
    ap.add_argument('--version', action='version', version=__version__)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('scan', help='fetch catalogs, record changes, write daily report')
    s.add_argument('--provider')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('models', help='list free models and their routing status')
    s.add_argument('--provider')
    s.add_argument('--all', action='store_true', help='include paid models')
    s.add_argument('--tools', action='store_true', help='only tool-capable')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('report', help='daily change report')
    s.add_argument('--hours', type=int, default=24)
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('quota', help='free quota / rate limit state per provider')
    s.add_argument('--no-live', action='store_true')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('probe', help='real test call to free model(s)')
    s.add_argument('--model')
    s.add_argument('--all', action='store_true')
    s.add_argument('--provider')
    s.add_argument('--limit', type=int, default=5)
    s.add_argument('--tools', action='store_true', help='probe tool calling instead of plain chat')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('route', help='show the failover order (no calls)')
    s.add_argument('--model')
    s.add_argument('--tools', action='store_true')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('serve', help='start the OpenAI-compatible router')
    s.add_argument('--host')
    s.add_argument('--port', type=int)
    s = sub.add_parser('status', help='router / provider status')
    s.add_argument('--host')
    s.add_argument('--port', type=int)
    sub.add_parser('agents', help='agent support matrix')
    s = sub.add_parser('agent', help='show (or --apply) config for one agent')
    s.add_argument('id')
    s.add_argument('--base', help='router base url (default from config)')
    s.add_argument('--apply', action='store_true', help='merge into the agent JSON config (backup first)')
    s.add_argument('--target', help='config file to merge into')
    s.add_argument('--force', action='store_true')
    s.add_argument('--dry-run', action='store_true')
    s = sub.add_parser('run', help='run an agent/command through the router (no config edits)')
    s.add_argument('agent')
    s.add_argument('args', nargs=argparse.REMAINDER)
    sub.add_parser('doctor', help='check keys, catalog, router, agents')
    s = sub.add_parser('schedule', help='daily scan setup (prints, or --install cron|launchd)')
    s.add_argument('--time', default='08:00')
    s.add_argument('--install', choices=['cron', 'launchd'])
    s = sub.add_parser('init', help='write ~/.freetoken-bots/config.json with defaults')
    s.add_argument('--force', action='store_true')
    return ap


def main(argv=None):
    a = build_parser().parse_args(argv)
    cfg = load_config()
    fn = globals()['cmd_' + a.cmd]
    try:
        return fn(cfg, a) or 0
    except HttpError as exc:
        print('error: %s' % exc, file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    sys.exit(main())
