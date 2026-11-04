"""成片：缺镜头不悄悄用原片、AI 标识总在、清单如实"""
import json, shutil, subprocess
import cv2, numpy as np


def _ready(ctx, clip, wav, **kw):
    d = ctx.project(**kw)
    shutil.copy(clip, d / "ref/00.mp4"); shutil.copy(wav, d / "ref/audio.wav")
    return d


def test_missing_shot_blocks_cut(ctx, clip, wav):
    d = _ready(ctx, clip, wav)
    r = ctx.run("finish.py", "cut")
    assert r.returncode != 0 and "还没出片：00" in r.stderr and not (d / "out/t_复刻.mp4").exists()


def test_allow_original_is_recorded(ctx, clip, wav):
    d = _ready(ctx, clip, wav)
    r = ctx.run("finish.py", "cut", "--allow-original")
    assert r.returncode == 0, r.stderr
    assert "原演员还在画面里" in r.stdout
    m = json.loads((d / "out/manifest.json").read_text())
    assert m["shots"][0]["picture"] == "original" and m["source_rights"] == "own"


def test_keep_orig_is_allowed_and_listed(ctx, clip, wav):
    d = _ready(ctx, clip, wav, shots=[{"n": "00", "who": [], "desc": "d", "keep_orig": True}])
    r = ctx.run("finish.py", "cut")
    assert r.returncode == 0 and "keep_orig" in r.stdout
    assert json.loads((d / "out/manifest.json").read_text())["shots"][0]["picture"] == "original"


def test_rights_required(ctx, clip, wav):
    _ready(ctx, clip, wav, project={"source_rights": None})
    r = ctx.run("finish.py", "cut", "--allow-original")
    assert r.returncode != 0 and "source_rights" in r.stderr


def _frame(path, t=1.0):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(t), "-i", str(path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8)


def test_ai_label_cannot_be_blanked(ctx, clip, wav):
    d = _ready(ctx, clip, wav, project={"ai_label": ""})
    assert ctx.run("finish.py", "cut", "--allow-original").returncode == 0
    out = d / "out/t_复刻.mp4"
    tags = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=comment", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout
    assert "AI 生成" in tags and (d / "graded/_ai_label.png").exists()
    a = _frame(out).reshape(360, 640, 3).astype(float); b = _frame(d / "graded/_orig_00.mp4").reshape(360, 640, 3).astype(float)
    corner, elsewhere = np.abs(a - b)[310:350, 15:120], np.abs(a - b)[20:60, 15:120]
    assert (corner > 40).sum() > 50 and (elsewhere > 40).sum() == 0, "左下角没有烧进标识"


def test_study_only_warns(ctx, clip, wav):
    d = _ready(ctx, clip, wav, project={"source_rights": "study-only"})
    r = ctx.run("finish.py", "cut", "--allow-original")
    assert "不要公开发布" in r.stdout
    assert "仅供学习研究" in json.loads((d / "out/manifest.json").read_text())["ai_label"]


def test_speed_past_end_warns(ctx, clip, wav):
    d = _ready(ctx, clip, wav, shots=[{"n": "00", "who": [], "desc": "d", "speed": 1.5}], frames=120)
    (d / "gen").mkdir(); shutil.copy(clip, d / "gen/00.mp4")
    r = ctx.run("finish.py", "grade")
    assert r.returncode == 0 and "结尾会定格" in r.stdout, r.stderr
