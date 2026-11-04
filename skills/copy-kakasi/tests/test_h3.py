"""H3 驱动：连接、起停、失败、清理"""
import json, os, shlex, subprocess, time
from pathlib import Path


def test_unreachable_says_so(ctx, comfy):
    ctx.project()
    r = ctx.run("h3_fl.py", "run", env={"STUB_SSH_DOWN": "1"})
    assert r.returncode != 0 and "连不上 H3 机器" in r.stderr and "stub-gpu" in r.stderr


def test_env_overrides_host(ctx, comfy):
    ctx.project()
    assert ctx.run("h3_fl.py", "run", env={"COPYKAKASI_H3_HOST": "other-box"}).returncode == 0
    assert "other-box ::" in ctx.ssh_log() and "stub-gpu ::" not in ctx.ssh_log()


def test_success_downloads_and_cleans_remote(ctx, comfy):
    d = ctx.project()
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 0, r.stderr
    assert (d / "gen/00.mp4").exists()
    assert not (comfy.root / "input/testjob").exists() and not (comfy.root / "output/testjob").exists()
    log = ctx.ssh_log()
    lines = log.splitlines(); uploads = [i for i, l in enumerate(lines) if l.startswith("SCP") and "/input/" in l.split(" -> ")[1]]
    assert "chmod 777" not in log and uploads and max(uploads) < next(i for i, l in enumerate(lines) if "chmod -R a+rX" in l), "传完帧才能放开读权限"
    assert "stage" not in comfy.prompts[0]["6"]["inputs"]["prompt"]


def test_local_mode_uses_no_ssh(ctx, comfy):
    d = ctx.project()
    cfg = json.loads(ctx.config.read_text()); cfg["h3"]["host"] = "local"; ctx.config.write_text(json.dumps(cfg))
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 0, r.stderr
    assert (d / "gen/00.mp4").exists() and ctx.ssh_log() == ""


def _with_start(ctx, comfy, cmd):
    comfy.live = False
    cfg = json.loads(ctx.config.read_text()); cfg["h3"]["start_command"] = cmd; ctx.config.write_text(json.dumps(cfg))


def test_not_running_without_start_command_is_clear(ctx, comfy):
    ctx.project(); comfy.live = False
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "ComfyUI 没在跑" in r.stderr


def test_low_vram_refuses(ctx, comfy):
    ctx.project(); _with_start(ctx, comfy, "echo pid=1")
    r = ctx.run("h3_fl.py", "run", env={"STUB_GPUS": "0, 10000"})
    assert r.returncode != 0 and "不在上面起实例" in r.stdout and "一个 ComfyUI 都没起来" in r.stderr


def test_start_stop_only_what_we_started(ctx, comfy):
    """单卡 24G：共存模式起一个；跑完 pid 被杀；状态文件清掉"""
    d = ctx.project(); flag = ctx.tmp / "dyn"
    script = ctx.tmp / "start.sh"
    script.write_text(f'#!/bin/bash\necho "$1 $2 $3" > {flag}\n(exec -a main.py sleep 120) > /dev/null 2>&1 < /dev/null &\npid=$!\necho pid=$pid\necho $pid > {ctx.tmp}/pid\n')
    _with_start(ctx, comfy, f"bash {script} {{gpu}} {{port}} {{dynvram}}")
    import threading
    threading.Timer(2, lambda: setattr(comfy, "live", True)).start()
    r = ctx.run("h3_fl.py", "run", env={"STUB_GPUS": "0, 24000"})
    assert r.returncode == 0, r.stderr + r.stdout
    assert flag.read_text().split() == ["0", str(comfy.port), "1"]      # 24G → 共存
    pid = (ctx.tmp / "pid").read_text().strip()
    assert "已停掉" in r.stdout
    time.sleep(0.3)
    assert subprocess.run(["ps", "-p", pid, "-o", "stat="], capture_output=True, text=True).stdout.strip() in ("", "Z")
    assert not (comfy.root / ".copy_kakasi_servers.json").exists()


def test_never_stops_a_server_it_did_not_start(ctx, comfy):
    ctx.project()
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 0 and "不动别人的" in r.stdout and "kill" not in ctx.ssh_log()


def test_foreign_queue_blocks_unless_allowed(ctx, comfy):
    ctx.project(); comfy.foreign = ["someone-else"]
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "不是这个工程的任务" in r.stderr and not comfy.prompts
    assert ctx.run("h3_fl.py", "run", "--allow-busy").returncode == 0 and comfy.prompts


def test_bad_job_rejected_before_remote(ctx, comfy):
    ctx.project(project={"job": "../../x; touch /tmp/pwned"})
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "只能用字母" in r.stderr and "pwned" not in ctx.ssh_log()


def test_enqueue_failure_cleans_uploaded_frames(ctx, comfy):
    ctx.project(); comfy.enqueue_ok = False
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 1 and "入队失败" in r.stdout
    assert "SCP" in ctx.ssh_log() and not (comfy.root / "input/testjob").exists()


def _pid_alive(pid):
    return subprocess.run(["ps", "-p", pid, "-o", "stat="], capture_output=True, text=True).stdout.strip() not in ("", "Z")


def _real_start(ctx, comfy):
    script = ctx.tmp / "start.sh"
    script.write_text(f'#!/bin/bash\n(exec -a main.py sleep 120) > /dev/null 2>&1 < /dev/null &\npid=$!\necho pid=$pid\necho $pid > {ctx.tmp}/pid\n')
    _with_start(ctx, comfy, f"bash {script} '{{{{literal}}}}' {{gpu}}")      # 命令里有别的花括号也不能崩
    import threading
    threading.Timer(2, lambda: setattr(comfy, "live", True)).start()


def test_enqueue_failure_stops_the_server_it_started(ctx, comfy):
    ctx.project(); comfy.enqueue_ok = False; _real_start(ctx, comfy)
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 1 and "已停掉" in r.stdout, r.stdout + r.stderr
    time.sleep(0.3)
    assert not _pid_alive((ctx.tmp / "pid").read_text().strip())


def test_download_failure_resumes_without_regenerating(ctx, comfy):
    """取片失败：不崩，不丢帧；修好后重跑接着取，不重复生成"""
    d = ctx.project()
    stubs = ctx.tmp / "broken"; stubs.mkdir(); bad = stubs / "scp"
    bad.write_text('#!/bin/bash\nn=$#; d=${!n}\ncase "$d" in *gen/*) exit 1;; esac\nm=$((n-1)); s=${!m}; cp "${s#*:}" "${d#*:}"\n'); bad.chmod(0o755)
    r = ctx.run("h3_fl.py", "run", env={"PATH": f"{stubs}:{ctx.env['PATH']}"})
    assert r.returncode == 1 and "Traceback" not in r.stderr and "接着等" in r.stdout, r.stdout + r.stderr
    assert (comfy.root / "input/testjob").exists() and len(comfy.prompts) == 1
    assert ctx.run("h3_fl.py", "run").returncode == 0 and (d / "gen/00.mp4").exists()
    assert len(comfy.prompts) == 1, "重复生成了"


def test_missing_style_is_clear(ctx):
    d = ctx.project(); P = json.loads((d / "project.json").read_text()); del P["style"]; (d / "project.json").write_text(json.dumps(P))
    r = ctx.run("h3_fl.py", "print")
    assert r.returncode != 0 and "style" in r.stderr and "Traceback" not in r.stderr


def test_setup_script_requires_comfy_and_installs(ctx):
    from conftest import REPO
    sh = REPO / "scripts/h3_setup_accel.sh"
    assert subprocess.run(["bash", str(sh)], capture_output=True, env={**ctx.env, "COMFY": ""}).returncode != 0
    root = ctx.tmp / "C"; (root / "custom_nodes/ComfyUI-MiniMax-H3-Turbo").mkdir(parents=True); (root / "custom_nodes/ComfyUI-MiniMax-H3-Turbo/__init__.py").write_text("")
    stubs = ctx.tmp / "net"; stubs.mkdir(); c = stubs / "curl"
    c.write_text('#!/bin/bash\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && touch "$2"; shift; done\n'); c.chmod(0o755)
    r = subprocess.run(["bash", str(sh)], capture_output=True, text=True, env={**ctx.env, "COMFY": str(root), "PATH": f"{stubs}:{ctx.env['PATH']}"})
    assert r.returncode == 0 and (root / "models/loras/minimax_h3_turbo_v4_step600_ema.safetensors").exists(), r.stderr


def test_failed_shot_exit_code_and_summary(ctx, comfy):
    d = ctx.project(); comfy.shot_ok = False
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode == 1 and "失败 1 段：00" in r.stderr and not (d / "gen/00.mp4").exists()
    comfy.shot_ok = True                     # 修好后重跑：换种子重新入队
    assert ctx.run("h3_fl.py", "run", "--only", "00").returncode == 0 and (d / "gen/00.mp4").exists()
    seeds = [g["15"]["inputs"]["noise_seed"] for g in comfy.prompts]
    assert seeds[1] == seeds[0] + 1000


def test_variant_steps_are_reported_truthfully(ctx, comfy):
    ctx.project(project={"h3_variant": "pika4"})
    r = ctx.run("h3_fl.py", "run", "--steps", "20")
    assert "不生效" in r.stdout and "4 步" in r.stdout and "20 步" not in r.stdout
    assert comfy.prompts[0]["14"]["inputs"]["steps"] == 4


def test_unknown_variant_rejected(ctx, comfy):
    ctx.project(project={"h3_variant": "nope"})
    assert ctx.run("h3_fl.py", "run").returncode != 0


def test_long_shot_rejected(ctx, comfy):
    ctx.project(frames=480)
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "上限" in r.stderr and not comfy.prompts


def test_qa_failed_frame_blocked_until_accepted(ctx, comfy):
    d = ctx.project(); (d / "keys/repaint").mkdir(parents=True)
    for t in "ab": (d / f"keys/repaint/00_{t}.png").write_bytes((d / f"keys/src/00_{t}.png").read_bytes())
    (d / "keys/repaint/00_a.qa_fail").write_text("接缝 88")
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "00_a" in r.stderr and "接缝 88" in r.stderr and not comfy.prompts
    assert ctx.run("h3_fl.py", "run", "--accept-qa", "00_a").returncode == 0 and comfy.prompts


def test_redo_keeps_previous_version(ctx, comfy):
    d = ctx.project()
    assert ctx.run("h3_fl.py", "run").returncode == 0
    assert ctx.run("h3_fl.py", "run", "--redo", "00").returncode == 0
    assert list((d / "gen/_old").glob("00_*.mp4")) and (d / "gen/00.mp4").exists()


def test_clean_command_removes_frames(ctx, comfy):
    ctx.project(); (comfy.root / "input/testjob").mkdir(); (comfy.root / "input/testjob/a.jpg").write_text("x")
    assert ctx.run("h3_fl.py", "clean").returncode == 0 and not (comfy.root / "input/testjob").exists()
