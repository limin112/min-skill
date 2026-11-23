#!/usr/bin/env python3
"""End-to-end: real agent binaries -> ftb router -> mock free upstream.

Each agent must complete a full tool loop: the fake model asks the agent to
run `echo FTB_TOOL_OK` with its own shell tool, the agent runs it, sends the
result back, and the model answers "AGENT_LOOP_DONE tool_output_seen=True".

Every agent runs with an isolated HOME / config dir, so your real agent
configs are never read or written. No API keys or network needed.

    python3 tests/integration_agents.py            # all agents found on PATH
    python3 tests/integration_agents.py pi codex   # selected agents
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
import mock_upstream  # noqa: E402

FTB = [sys.executable, str(ROOT / 'scripts' / 'ftb.py')]
PROMPT = 'Use your shell tool to run: echo FTB_TOOL_OK . Then report the result.'
EXPECT = 'tool_output_seen=True'


def free_port():
    import socket
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def version(cmd):
    try:
        return subprocess.run([cmd, '--version'], capture_output=True, text=True, timeout=30).stdout.strip().splitlines()[-1]
    except Exception:
        return '?'


def main(selected):
    work = Path(tempfile.mkdtemp(prefix='ftb-agents-'))
    srv, mock = mock_upstream.start()
    port = free_port()
    cfg = mock_upstream.test_config(srv.server_address[1])
    cfg['router']['port'] = port
    (work / 'config.json').write_text(json.dumps(cfg))
    env = dict(os.environ, FTB_HOME=str(work / 'ftbhome'), FTB_CONFIG=str(work / 'config.json'),
               OPENROUTER_API_KEY='test', OPENCODE_API_KEY='test', FTB_ROUTER_KEY='ftb-local',
               NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')
    subprocess.run(FTB + ['scan'], env=env, check=True, capture_output=True)
    router = subprocess.Popen(FTB + ['serve'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = 'http://127.0.0.1:%d/v1' % port
    for _ in range(50):
        try:
            urllib.request.urlopen(base[:-3] + '/health', timeout=1)
            break
        except OSError:
            time.sleep(0.2)
    results = {}
    agents = selected or ['pi', 'codex', 'codex-profile', 'opencode', 'opencode-file']
    try:
        for ag in agents:
            binary = ag.split('-')[0]
            if not shutil.which(binary):
                results[ag] = ('SKIP', 'not on PATH', '')
                continue
            home = work / ('home-' + ag)
            proj = work / ('proj-' + ag)
            home.mkdir()
            proj.mkdir()
            e = dict(env, HOME=str(home), XDG_CONFIG_HOME=str(home / '.config'),
                     XDG_DATA_HOME=str(home / '.local/share'), XDG_CACHE_HOME=str(home / '.cache'),
                     XDG_STATE_HOME=str(home / '.local/state'))
            if ag == 'pi':
                e['PI_CODING_AGENT_DIR'] = str(home / 'pi-agent')
                subprocess.run(FTB + ['agent', 'pi', '--apply', '--base', base], env=e, check=True,
                               capture_output=True)
                cmd = ['pi', '--provider', 'freetoken', '--model', 'auto', '--no-extensions', '-p', PROMPT]
            elif ag == 'codex':
                e['CODEX_HOME'] = str(home / '.codex')
                (home / '.codex').mkdir()
                cmd = FTB + ['run', 'codex', '--', 'exec', '--skip-git-repo-check', PROMPT]
            elif ag == 'codex-profile':   # documented config.toml profile instead of `ftb run`
                e['CODEX_HOME'] = str(home / '.codex')
                (home / '.codex').mkdir()
                from freetoken_bots.agents import codex_files
                for name, text in codex_files(base, []).items():
                    (home / '.codex' / name).write_text(text)
                cmd = ['codex', '--profile', 'free', 'exec', '--skip-git-repo-check', PROMPT]
            elif ag == 'opencode':
                cmd = FTB + ['run', 'opencode', '--', 'run', PROMPT]
            elif ag == 'opencode-file':   # `ftb agent opencode --apply` into opencode.json
                subprocess.run(FTB + ['agent', 'opencode', '--apply', '--base', base], env=e, check=True,
                               capture_output=True)
                cmd = ['opencode', 'run', '-m', 'freetoken/auto', PROMPT]
            else:
                results[ag] = ('SKIP', 'no recipe', '')
                continue
            n0 = len(mock.calls)
            t0 = time.time()
            try:
                p = subprocess.run(cmd, env=e, cwd=str(proj), capture_output=True, text=True, timeout=240,
                                   stdin=subprocess.DEVNULL)
                outp = p.stdout + p.stderr
            except subprocess.TimeoutExpired as exc:
                outp = 'TIMEOUT ' + str(exc.stdout or '')[-500:]
            calls = mock.calls[n0:]
            ok = EXPECT in outp and len(calls) >= 2
            results[ag] = ('PASS' if ok else 'FAIL', '%s; %d upstream calls; %.0fs' % (
                version(binary), len(calls), time.time() - t0), outp[-1500:])
    finally:
        router.terminate()
        router.wait(5)
        srv.shutdown()
    paid = {'vendor/big-free', 'vendor/paid-model', 'paid-zen'} & {m for _, m, _ in mock.calls}
    print('\n=== agent integration (mock upstream, isolated homes) ===')
    for ag, (st, info, tail) in results.items():
        print('%-9s %s  %s' % (ag, st, info))
        if st == 'FAIL':
            print('   --- output tail ---\n   ' + tail.replace('\n', '\n   '))
    print('paid model ids sent upstream: %s' % (sorted(paid) or 'none'))
    shutil.rmtree(str(work), ignore_errors=True)
    return 0 if all(r[0] != 'FAIL' for r in results.values()) and not paid else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
