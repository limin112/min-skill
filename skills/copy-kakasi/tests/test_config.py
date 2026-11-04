"""用户配置：地址由用户指定，仓库里没有"""
import json, re, stat
from conftest import REPO


def test_repo_has_no_machine_address_or_personal_path():
    pat = re.compile(r"\b(192\.168|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)|/" + r"Users/|/" + r"home/|/" + r"data/")
    allowed = {"10.0.0.5"}     # 文档里的占位示例
    hits = []
    for p in REPO.rglob("*"):
        if not p.is_file() or ".git" in p.parts or "__pycache__" in p.parts or p.suffix in (".png", ".onnx"): continue
        for i, line in enumerate(p.read_text(errors="ignore").splitlines(), 1):
            if pat.search(line) and not any(a in line for a in allowed) and "pat = re.compile" not in line:
                hits.append(f"{p.relative_to(REPO)}:{i}: {line.strip()[:80]}")
    assert not hits, "\n".join(hits)


def test_missing_config_asks_for_address_and_touches_nothing(ctx):
    ctx.project()
    r = ctx.run("h3_fl.py", "run")
    assert r.returncode != 0 and "还没配置 H3" in (r.stdout + r.stderr) and "configure.py" in r.stderr
    assert ctx.ssh_log() == ""


def test_configure_is_private_and_merges(ctx):
    ctx.project()
    assert ctx.run("configure.py", "--host", "a,b", "--comfy-root", "/x/ComfyUI", "--ports", "8188,8190").returncode == 0
    assert stat.S_IMODE(ctx.config.stat().st_mode) == 0o600
    assert ctx.run("configure.py", "--comfy-host", "10.0.0.5").returncode == 0
    c = json.loads(ctx.config.read_text())["h3"]
    assert c["host"] == ["a", "b"] and c["ports"] == [8188, 8190] and c["comfy_host"] == "10.0.0.5"


def test_http_image_needs_urls(ctx):
    ctx.project()
    assert ctx.run("configure.py", "--image", "http").returncode != 0


def test_doctor_reports_missing_h3_config(ctx):
    ctx.project()
    r = ctx.run("doctor.py")
    assert r.returncode == 1 and "还没配置" in r.stdout


def test_doctor_h3_reads_machine_state(ctx, comfy):
    ctx.project()
    r = ctx.run("doctor.py", "--h3", env={"STUB_GPUS": "0, RTX, 1 MiB, 24000 MiB"})
    assert "连得上：stub-gpu" in r.stdout and "在跑" in r.stdout and "缺模型文件" in r.stdout


def test_example_configs_are_valid(ctx):
    for n in ("project", "plan", "cast", "shots"):
        json.loads((REPO / f"examples/minimal/{n}.json").read_text())


def test_doctor_finds_models_via_extra_model_paths(ctx, comfy):
    ctx.project()
    base = ctx.tmp / "elsewhere"; (base / "diffusion_models").mkdir(parents=True)
    names = ["minimax_h3_fl2va_pruned_int8_convrot", "qwen3vl_32b_minimax_h3_nvfp4_awq", "minimax_h3_video_vae_fp16", "minimax_h3_audio_vae_fp32", "minimax_h3_turbo_v4_step600_ema"]
    for n in names: (base / "diffusion_models" / f"{n}.safetensors").write_text("")
    (comfy.root / "extra_model_paths.yaml").write_text(f"h3:\n    base_path: {base}\n    vae: vae\n")
    r = ctx.run("doctor.py", "--h3")
    assert "模型文件齐了" in r.stdout and "缺模型文件" not in r.stdout, r.stdout


def test_doctor_reports_missing_dependency_instead_of_crashing(ctx, tmp_path):
    ctx.project()
    (tmp_path / "PIL").mkdir(); (tmp_path / "PIL/__init__.py").write_text("raise ImportError('no', name='PIL')")
    r = ctx.run("doctor.py", env={"PYTHONPATH": str(tmp_path)})
    assert r.returncode != 0 and "缺 PIL" in r.stderr and "Traceback" not in r.stderr
