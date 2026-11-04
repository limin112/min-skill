"""切镜头 → 剪辑 → 取帧：用合成视频跑真 ffmpeg"""
import json, subprocess
import pytest


@pytest.fixture
def source(ctx):
    """三段硬切的合成视频，带音轨"""
    d = ctx.project(shots=[{"n": "00", "who": [], "desc": "d", "cx": 0.5}, {"n": "01", "who": [], "desc": "d", "cx": 0.5}])
    src = d / "src.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=1920x804:r=24:d=4", "-f", "lavfi", "-i", "color=blue:s=1920x804:r=24:d=4",
                    "-f", "lavfi", "-i", "color=green:s=1920x804:r=24:d=4", "-f", "lavfi", "-i", "sine=d=12:f=440",
                    "-filter_complex", "[0][1][2]concat=n=3:v=1[v]", "-map", "[v]", "-map", "3:a", "-pix_fmt", "yuv420p", str(src)], check=True)
    P = json.loads((d / "project.json").read_text()); P["source"] = str(src); (d / "project.json").write_text(json.dumps(P))
    return d


def _plan(d, shots=((0, 0.5, 3.0), (1, 4.5, 3.0))):
    (d / "plan.json").write_text(json.dumps({"audio": {"segments": [[0.0, 6.0]], "fade_out": 0.5}, "acts": [{"act": "一", "lyric": "x", "shots": [list(s) for s in shots]}]}))


def test_cut_detection_and_ref_and_keys(ctx, source):
    d = source
    r = ctx.run("scan.py", "cuts"); assert r.returncode == 0, r.stderr
    rows = (d / "ref/shots.txt").read_text().splitlines()
    assert len(rows) == 3 and rows[1].startswith("4.0") and (d / "ref/shots.jpg").exists()
    _plan(d)
    r = ctx.run("build_ref.py"); assert r.returncode == 0, r.stderr
    assert "⚠ 差超过" not in r.stdout
    for f in ("edl.json", "00.mp4", "01.mp4", "audio.wav", "ref.mp4", "storyboard.jpg"): assert (d / "ref" / f).exists(), f
    edl = json.loads((d / "ref/edl.json").read_text())["shots"]; assert sum(e["frames"] for e in edl) == 144
    r = ctx.run("keys.py", "--sheet"); assert r.returncode == 0, r.stderr
    from PIL import Image
    assert Image.open(d / "keys/src/00_a.png").size == (1536, 864) and (d / "qc/keys_src.jpg").exists()
    r = ctx.run("keys.py", "look", "0", "--pad", "1"); assert r.returncode == 0 and (d / "qc/look_00.jpg").exists(), r.stderr
    r = ctx.run("keys.py", "zoom", "00_a", "100", "100", "768"); assert r.returncode == 0 and (d / "keys/user/00_a.png").exists(), r.stderr


def test_av_length_mismatch_warned(ctx, source):
    d = source
    assert ctx.run("scan.py", "cuts").returncode == 0
    _plan(d, shots=((0, 0.5, 2.0), (1, 4.5, 2.0)))
    assert "差超过 1 帧" in ctx.run("build_ref.py").stdout


def test_rights_required_before_cutting(ctx, source):
    d = source
    P = json.loads((d / "project.json").read_text()); del P["source_rights"]; (d / "project.json").write_text(json.dumps(P))
    assert ctx.run("scan.py", "cuts").returncode == 0
    _plan(d)
    r = ctx.run("build_ref.py")
    assert r.returncode != 0 and "source_rights" in r.stderr
