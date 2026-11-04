"""换脸：授权检查、失败不丢成果、通道一致、不混入特定片子的设定"""
import json
import cv2, numpy as np, pytest
from conftest import needs_models

TWO = dict(
    cast={"A": {"name": "alice", "consent": "self", "method": "repaint", "refs": ["cast/r.png"], "identity": "x"},
          "B": {"name": "bob", "consent": "fictional", "method": "repaint", "refs": ["cast/r.png"], "identity": "y"}},
    shots=[{"n": "00", "who": ["A", "B"], "desc": "d", "pose": {"A_a": "p", "B_a": "p"}, "box": {"A_a": [100, 100, 300, 300], "B_a": [800, 100, 1000, 300]}}])


def test_consent_must_be_one_of_three(ctx):
    ctx.project(cast={"F": {"name": "x", "consent": "maybe", "refs": []}})
    r = ctx.run("faces.py", "swap", "--dry")
    assert r.returncode != 0 and "只能是" in r.stderr


def test_consent_alone_is_enough(ctx):
    ctx.project(cast={"F": {"name": "x", "consent": "consented", "method": "repaint", "refs": ["cast/r.png"], "identity": "i"}})
    assert ctx.run("faces.py", "repaint", "--dry").returncode == 0


def test_second_role_failure_keeps_first_role_after_retry(ctx):
    """第二个角色出图失败后重跑：第一个角色的成果不能丢，不能留下原演员的脸"""
    d = ctx.project(**TWO)
    r = ctx.run("faces.py", "repaint", "--only", "00", env={"CODEX_FAIL_IF": "bob"})
    assert "A ✓" in r.stdout and "B ✗" in r.stdout and "满载" in r.stdout
    assert (d / "keys/repaint/00_a.png").exists()                     # A 的结果还在
    assert ctx.run("faces.py", "repaint", "--only", "00").returncode == 0
    src, out = cv2.imread(str(d / "keys/src/00_a.png")).astype(float), cv2.imread(str(d / "keys/repaint/00_a.png")).astype(float)
    assert np.abs(src[150:250, 150:250] - out[150:250, 150:250]).mean() > 1, "A 的位置变回了原帧"
    assert np.abs(src[150:250, 850:950] - out[150:250, 850:950]).mean() > 1, "B 的位置没画"


def test_stale_output_is_not_success(ctx):
    d = ctx.project(); stale = d / "keys/repaint/raw/x.png"; stale.parent.mkdir(parents=True); stale.write_bytes(b"old")
    r = ctx.driver("from common import edit_image,ROOT\nprint(edit_image([ROOT/'keys/src/00_a.png'],'p bob',ROOT/'keys/repaint/raw/x.png',ROOT/'l.log'))", env={"CODEX_FAIL_IF": "bob"})
    assert "False" in r.stdout, r.stderr
    assert not stale.exists()


def test_failed_edit_reports_missing_codex(ctx):
    d = ctx.project()
    env = {"PATH": "/usr/bin:/bin"}
    r = ctx.driver("from common import edit_image,image_why,ROOT\nprint(edit_image([ROOT/'keys/src/00_a.png'],'p',ROOT/'o.png',ROOT/'l.log'),image_why(ROOT/'l.log'))", env=env)
    assert "False" in r.stdout and "codex" in r.stdout


def test_dry_prompts_have_no_project_specific_text(ctx):
    d = ctx.project(**TWO)
    r = ctx.run("faces.py", "joint", "--dry")
    r2 = ctx.run("faces.py", "repaint", "--dry")
    t = r.stdout + r2.stdout
    for bad in ("stage performance", "backup dancers", "TV-station", "Save the final", "1536x864"):
        assert bad not in t, bad
    assert "same person, a fictional AI-generated adult" in r2.stdout       # 虚构角色不再声称是真人


def test_h3_prompt_matches_film_not_stage(ctx):
    ctx.project()
    r = ctx.run("h3_fl.py", "print")
    assert r.returncode == 0 and "stage" not in r.stdout and "city wall" in r.stdout


def test_joint_without_models_stops_before_spending(ctx):
    ctx.project(); ctx.env["COPYKAKASI_MODELS"] = str(ctx.tmp / "empty")
    r = ctx.run("faces.py", "joint")
    assert r.returncode != 0 and "--fetch-models" in r.stderr and ctx.codex_log() == ""


@needs_models
def test_joint_with_codex_saves_where_it_checks(ctx):
    d = ctx.project()
    r = ctx.run("faces.py", "joint", "--tries", "1")
    assert r.returncode == 0, r.stderr
    log = ctx.codex_log()
    assert "keys/repaint/raw/00_a.try0.png" in log and "Save the final image file as keys/repaint/00_a.png" not in log
    assert (d / "keys/repaint/00_a.qa.json").exists() and (d / "keys/repaint/00_a.png").exists()
    assert (d / "keys/repaint/00_a.F.ok").exists()


@needs_models
def test_joint_auto_detected_box_does_not_crash(ctx, image_server):
    d = ctx.project(shots=[{"n": "00", "who": ["F"], "desc": "d", "pose": {"F_a": "p"}}])
    (d / "keys/masked").mkdir(parents=True); (d / "keys/repaint").mkdir(parents=True)
    r = ctx.driver("import faces\nfaces.find_face=lambda img,hint=None:(600,200,200,250)\nprint(faces.joint_one('00','a',faces.shots()['00'],faces.cast()))")
    assert r.returncode == 0 and "Traceback" not in r.stderr, r.stderr
    assert json.loads((d / "keys/masked/00_a.boxes.json").read_text())["F_a"] == [570, 187, 830, 495]
    assert (d / "keys/repaint/00_a.png").exists()


@needs_models
def test_clean_text_off_makes_no_extra_calls_and_keeps_corner(ctx, image_server):
    d = ctx.project(project={"clean_text": False})
    assert ctx.run("faces.py", "joint", "--tries", "1").returncode == 0
    assert len(image_server) == 2 and not any("remove every" in p for p in image_server)
    src, out = cv2.imread(str(d / "keys/src/00_a.png")), cv2.imread(str(d / "keys/repaint/00_a.png"))
    assert np.array_equal(src[60:105, 1240:1430], out[60:105, 1240:1430]), "头以外的像素要保持原帧"


def test_broken_opencv_does_not_crash_at_import(ctx):
    """有的 OpenCV 版本没有 CascadeClassifier：手标 box 的流程照常，要自动检脸才报清楚"""
    ctx.project()
    code = "import cv2\nif hasattr(cv2,'CascadeClassifier'): del cv2.CascadeClassifier\nimport faces\nprint('imported')\nfaces.find_face(None)"
    r = ctx.driver(code)
    assert "imported" in r.stdout and "AttributeError" not in r.stderr and "<5" in r.stderr, r.stderr
