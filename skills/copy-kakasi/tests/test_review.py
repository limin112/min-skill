"""确认页：显示的和实际用的一致，质检问题不藏起来"""
import json, shutil


def _two(ctx):
    return ctx.project(shots=[
        {"n": "00", "who": ["F"], "desc": "d", "pose": {"F_a": "p", "F_b": "p"}, "box": {"F_a": [600, 200, 800, 450], "F_b": [600, 200, 800, 450]}},
        {"n": "01", "who": [], "desc": "d"}],
        cast={"F": {"name": "the woman", "label": "主角甲", "consent": "self", "adult": True, "method": "repaint", "refs": ["cast/r.png"], "identity": "x"}})


def test_shows_frame_and_video_qa_failures(ctx):
    d = _two(ctx); (d / "keys/repaint").mkdir(parents=True); (d / "gen").mkdir()
    shutil.copy(d / "keys/src/00_a.png", d / "keys/repaint/00_a.png"); (d / "keys/repaint/00_a.F.ok").touch()
    (d / "keys/repaint/00_a.qa_fail").write_text("接缝 88")
    (d / "gen/00.qa.json").write_text(json.dumps({"ok": False, "issues": ["中间凭空多了人"]}))
    r = ctx.run("review.py")
    assert r.returncode == 0, r.stderr
    h = (d / "qc/review.html").read_text()
    assert "首帧质检没过：接缝 88" in h and "H3 片段质检没过：中间凭空多了人" in h and "主角甲" in h


def test_page_shows_same_frame_h3_uses(ctx):
    d = _two(ctx); (d / "keys/clean").mkdir(parents=True); shutil.copy(d / "keys/src/01_a.png", d / "keys/clean/01_a.png")
    r = ctx.driver("import review,h3_fl,faces\nS,C=faces.shots(),faces.cast()\nprint(review.result_of('01','a',S['01'],C)[0].parent.name,h3_fl.key('01','a').parent.name)")
    assert r.stdout.split() == ["clean", "clean"], r.stderr
