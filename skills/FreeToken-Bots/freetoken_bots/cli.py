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
from . import opencode as OC
from .common import (DEFAULT_CONFIG, HttpError, atomic_json, http_json, key_help, key_source,
                     keyed_providers, load_config, mask, now, parse_iso, path, provider_key, save_keys)
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
    print('%-12s %-22s %-14s %-9s %-24s %s' % ('ID', 'PROTOCOL', 'STATUS', 'ZEN FREE', 'VERIFIED WITH', 'AGENT'))
    for ag in A.AGENTS:
        print('%-12s %-22s %-14s %-9s %-24s %s' % (ag['id'], ag['protocol'], ag['status'], ag.get('zen_free', '-'),
                                                  ag.get('verified_with', '-'), ag['name']))
    print('\nZEN FREE: OpenCode Zen free models are OpenCode-client-only (official docs). native = the agent is '
          'OpenCode; delegate = hand whole tasks to OpenCode via `ftb delegate "task"`.')
    print('ftb agent <id>   shows config for one agent.  ftb run <id> -- <args>  launches it via the router.')


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


def _ensure_router(cfg):
    """-> (base_url, embedded_server_or_None). Starts an in-process router if none is running."""
    base = base_url(cfg)
    if _router_alive(base):
        return base, None
    from .server import make_server
    ensure_catalog(cfg)
    try:  # configured port first, so saved agent configs (e.g. Pi models.json) match
        srv = make_server(cfg, '127.0.0.1', cfg['router']['port'], quiet=True)
    except OSError:
        srv = make_server(cfg, '127.0.0.1', 0, quiet=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:%d/v1' % srv.server_address[1]
    print('[ftb] embedded router on %s' % base, file=sys.stderr)
    return base, srv


def _stop_router(srv):
    if srv:
        srv.router.state.save(force=True)
        srv.shutdown()


def cmd_run(cfg, a):
    """Run an agent through the router without editing its config files."""
    argv = list(a.args)
    if argv and argv[0] == '--':
        argv = argv[1:]
    base, srv = _ensure_router(cfg)
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
        _stop_router(srv)


def cmd_doctor(cfg, a):
    cat = C.load()
    print('FreeToken-Bots %s  python %s  home %s' % (__version__, sys.version.split()[0], path()))
    for p, pc in cfg['providers'].items():
        st = (cat.get('providers') or {}).get(p) or {}
        t = parse_iso(st.get('checked_at'))
        age = '%.1fh ago' % ((now() - t).total_seconds() / 3600) if t else 'never'
        src = key_source(cfg, p)
        keyinfo = ('key %s=%s%s' % (pc['api_key_env'], mask(provider_key(cfg, p)),
                                   ' (from %s)' % src if src else '')
                   if pc.get('api_key_env') else 'monitor-only (free tier is OpenCode-client-only)')
        print('  %-10s enabled=%s %s  last scan %s%s' % (
            p, pc.get('enabled', True), keyinfo, age,
            '' if st.get('ok', True) else '  LAST SCAN FAILED: ' + str(st.get('error'))))
    missing = [p for p in keyed_providers(cfg) if not provider_key(cfg, p)]
    for p in missing:
        name, _, how = key_help(p)
        print('    %s key missing -> its free models are monitored but not routed. Get one: %s' % (name, how))
    if missing:
        print('    then run: ftb setup')
    ocv = OC.version()
    print('  OpenCode (needed for OpenCode Zen free models): %s' % (
        ocv or 'not installed -> ftb opencode setup'))
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
        print('API keys: cron does not load your shell profile; keys saved by `ftb setup` '
              '(~/.freetoken-bots/keys.env) are read anyway. Scanning itself needs no key.')
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


def _confirm(prompt, default=True, assume=False):
    if assume:
        return True
    if not sys.stdin.isatty():
        return False
    ans = input(prompt + (' [Y/n] ' if default else ' [y/N] ')).strip().lower()
    return default if not ans else ans in ('y', 'yes')


def cmd_setup(cfg, a):
    """First install: OpenRouter key (for the router) + OpenCode (for OpenCode Zen free models)."""
    import getpass
    envs = [(p, cfg['providers'][p]['api_key_env']) for p in keyed_providers(cfg)]
    values = {}
    if a.from_env:
        values = {env: os.environ[env] for _, env in envs if os.environ.get(env)}
        if not values:
            print('error: --from-env given but none of %s is set' % ', '.join(e for _, e in envs), file=sys.stderr)
            return 2
    else:
        if not sys.stdin.isatty():
            print('error: ftb setup is interactive; run it in a terminal (or use --from-env)', file=sys.stderr)
            return 2
        print('FreeToken-Bots 有两个免费来源：')
        print('  1. OpenRouter 免费模型：需要 API key，任何 Agent 都能通过本地路由使用')
        print('  2. OpenCode Zen 免费模型：官方规定只能在 OpenCode 客户端里用，不需要 key，需要安装 OpenCode\n')
        print('输入 key 时不会回显；直接回车 = 跳过 / 保留现有值。\n')
        for p, env in envs:
            name, url, how = key_help(p)
            src = key_source(cfg, p)
            print('[%s] %s  当前: %s' % (name, env, ('已配置 (%s)' % src) if src else '未配置'))
            print('  获取方式: %s' % how)
            if url and not src and not a.no_browser:
                if _confirm('  在浏览器打开 %s ？' % url):
                    import webbrowser
                    if not webbrowser.open(url):
                        print('  无法自动打开，请手动访问: %s' % url)
            v = getpass.getpass('  粘贴 %s: ' % env).strip()
            if v:
                values[env] = v
            print()
    if values:
        f = save_keys(values)
        print('saved %s -> %s (mode 600; environment variables still take precedence)' % (
            ', '.join(sorted(values)), f))
    else:
        print('no key changed')
    # Free validation: OpenRouter /key costs nothing.
    key = provider_key(cfg, 'openrouter')
    if key:
        try:
            data, _ = http_json(cfg['providers']['openrouter']['base_url'] + '/key', key=key, timeout=15)
            d = (data or {}).get('data') or {}
            print('OpenRouter key OK (is_free_tier=%s)' % d.get('is_free_tier'))
        except HttpError as exc:
            print('OpenRouter key check failed: HTTP %s - check the key' % exc.status)
        except OSError as exc:
            print('OpenRouter key check skipped (network: %s)' % str(exc)[:80])
    else:
        print('OpenRouter key not set: OpenRouter free models stay monitor-only')
    if not a.from_env:
        print('\n[OpenCode] %s' % (OC.version() or '未安装'))
        if not OC.binary():
            if _confirm('  安装 OpenCode（%s）以使用 OpenCode Zen 免费模型？' % ' '.join(OC.install_command())):
                _install_opencode(assume=True)
        else:
            print('  已安装。`ftb opencode setup` 可以把 OpenRouter 免费模型也加进 OpenCode。')
    print('next: ftb scan && ftb models   |   daily scan: ftb schedule --install cron')


def _install_opencode(assume=False):
    if OC.binary():
        print('OpenCode already installed: %s' % OC.version())
        return 0
    cmd = OC.install_command()
    print('install command: %s' % ' '.join(cmd))
    if not _confirm('run it now?', assume=assume):
        print('skipped. Install manually with the command above.')
        return 1
    rc = subprocess.call(cmd)
    if rc != 0 or not OC.binary():
        print('install failed (rc=%s). Try: %s' % (rc, OC.INSTALL_SCRIPT))
        return 1
    print('installed: %s' % OC.version())
    return 0


def cmd_opencode(cfg, a):
    cat = ensure_catalog(cfg, quiet=a.json if a.action == 'status' else False)
    if a.action == 'status':
        st = OC.status(cat)
        if a.json:
            return out(st)
        print('OpenCode: %s' % (st['version'] or 'not installed  (install: %s)' % st['install_command']))
        print('Zen free chat models in catalog (usable only inside OpenCode): %d' % len(st['zen_free_in_catalog']))
        if st['zen_free_offered_by_client'] is not None:
            print('  offered by the installed client: %s' % ', '.join(st['zen_free_offered_by_client']))
            if st['client_lists_but_not_free_in_catalog']:
                print('  client lists but catalog says not free/active (never used by ftb delegate): %s'
                      % ', '.join(st['client_lists_but_not_free_in_catalog']))
        try:
            cur = json.loads(A.default_config_path('opencode').read_text())
            has = A.PROVIDER_ID in (cur.get('provider') or {})
        except (OSError, ValueError):
            has = False
        print('OpenRouter free models in OpenCode (provider "freetoken"): %s' % (
            'configured' if has else 'not configured (ftb opencode setup, or use ftb run opencode)'))
        print('\nuse: opencode  (pick an opencode/*-free model with /models)  |  ftb delegate "task"')
        return
    if a.action == 'install':
        return _install_opencode(a.yes)
    # setup = install + add OpenRouter free models via the router
    if _install_opencode(a.yes) != 0:
        return 1
    if not provider_key(cfg, 'openrouter'):
        print('OpenRouter key not set: skipping the freetoken provider. Zen free models already work in OpenCode.')
        return 0
    router = Router(cfg)
    router.cat = cat
    base = base_url(cfg)
    try:
        dry = A.apply('opencode', base, router.callable_models(), dry_run=True)
    except ValueError as exc:
        print('error: %s' % exc, file=sys.stderr)
        return 2
    if not dry['changed']:
        print('%s already has the freetoken provider' % dry['target'])
        return 0
    if not _confirm('add provider "freetoken" (OpenRouter free models via %s) to %s? (backup first, '
                    'other settings untouched)' % (base, dry['target']), assume=a.yes):
        print('skipped. `ftb run opencode` gives the same without editing files.')
        return 0
    res = A.apply('opencode', base, router.callable_models())
    print('updated %s (backup: %s)' % (res['target'], res.get('backup')))
    print('models: freetoken/auto needs the router running (ftb serve); opencode/*-free work without it')


def cmd_delegate(cfg, a):
    """Hand a whole task to OpenCode running a free model; for agents that can run shell commands."""
    if not OC.binary():
        print('error: OpenCode not installed (ftb opencode install)', file=sys.stderr)
        return 127
    cat = ensure_catalog(cfg, quiet=True)
    if a.model:
        try:
            models = [OC.resolve_model(cat, a.model)]
        except KeyError as exc:
            print('error: %s' % exc.args[0], file=sys.stderr)
            return 2
    else:
        models = ['opencode/' + m['id'] for m in OC.zen_free_models(cat, OC.client_models())][:a.max_models]
    env = dict(os.environ)
    srv = None
    use_router = not a.no_openrouter and provider_key(cfg, 'openrouter') and (
        not a.model or a.model.startswith(A.PROVIDER_ID + '/'))
    if use_router:
        base, srv = _ensure_router(cfg)
        router = srv.router if srv else Router(cfg)
        env['OPENCODE_CONFIG_CONTENT'] = json.dumps(A.opencode_config(base, router.callable_models()))
        env.setdefault('FTB_ROUTER_KEY', 'ftb-local')
        if not a.model:
            models.append(A.PROVIDER_ID + '/auto')
    if not models:
        print('error: no free model available for OpenCode (run ftb scan; set OPENROUTER_API_KEY for '
              'OpenRouter fallback)', file=sys.stderr)
        _stop_router(srv)
        return 1
    try:
        res = OC.delegate(a.task, models, cwd=a.dir, env=env, timeout=a.timeout,
                          fmt='json' if a.raw_json else 'default')
    finally:
        _stop_router(srv)
    if a.json:
        out(res)
    else:
        sys.stdout.write(res['output'])
        print('\n[ftb delegate] model=%s ok=%s attempts=%d' % (res['model'], res['ok'], len(res['attempts'])),
              file=sys.stderr)
    return 0 if res['ok'] else 1


def cmd_init(cfg, a):
    p = Path(os.environ.get('FTB_CONFIG') or path('config.json'))
    if p.exists() and not a.force:
        print('%s exists; not touching it (use --force to rewrite with defaults)' % p)
        return 1
    atomic_json(p, DEFAULT_CONFIG)
    print('wrote %s' % p)


def first_run_hint(cfg, cmd):
    """Once per install: if no provider key is configured anywhere, say how to add them."""
    if cmd in ('setup', 'init') or any(provider_key(cfg, p) for p in keyed_providers(cfg)):
        return
    marker = path('.setup-hint-shown')
    if marker.exists():
        return
    print('[ftb] 首次使用：运行 `ftb setup` 配置 OpenRouter API key，并安装 OpenCode'
          '（OpenCode Zen 免费模型只能在 OpenCode 里用）。只看免费模型列表可以都不配。', file=sys.stderr)
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text('1')
    except OSError:
        pass


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
    s = sub.add_parser('setup', help='first install: OpenRouter API key + install OpenCode')
    s.add_argument('--from-env', action='store_true',
                   help='save OPENROUTER_API_KEY from the current environment (no prompts)')
    s.add_argument('--no-browser', action='store_true', help='do not offer to open the key pages')
    s = sub.add_parser('opencode', help='OpenCode = the harness for OpenCode Zen free models')
    s.add_argument('action', choices=['status', 'install', 'setup'])
    s.add_argument('--yes', action='store_true', help='do not ask for confirmation')
    s.add_argument('--json', action='store_true')
    s = sub.add_parser('delegate', help='hand a whole task to OpenCode on a free model (for other agents)')
    s.add_argument('task')
    s.add_argument('--model', help='opencode/<free model> or freetoken/<key>; default: best free, with failover')
    s.add_argument('--dir', help='working directory for OpenCode (default: current)')
    s.add_argument('--timeout', type=int, default=1800)
    s.add_argument('--max-models', type=int, default=3, help='Zen free models to try before OpenRouter')
    s.add_argument('--no-openrouter', action='store_true', help='do not fall back to OpenRouter free models')
    s.add_argument('--json', action='store_true', help='print {ok, model, output, attempts}')
    s.add_argument('--raw-json', action='store_true', help='pass --format json to opencode run')
    s = sub.add_parser('init', help='write ~/.freetoken-bots/config.json with defaults')
    s.add_argument('--force', action='store_true')
    return ap


def main(argv=None):
    a = build_parser().parse_args(argv)
    cfg = load_config()
    first_run_hint(cfg, a.cmd)
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
