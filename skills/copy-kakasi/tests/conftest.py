"""回归测试：假 ssh/scp/codex/nvidia-smi + 假 ComfyUI + 假图像服务，不碰真机器、不花额度、不用真人素材。"""
import base64, json, os, shutil, stat, subprocess, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import cv2, numpy as np, pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
STUBS = REPO / "tests/stubs"
HAS_MODELS = (Path(os.environ.get("COPYKAKASI_MODELS", "~/.cache/copy-kakasi/models")).expanduser() / "face_detection_yunet_2023mar.onnx").exists()
needs_models = pytest.mark.skipif(not HAS_MODELS, reason="没有人脸模型（doctor.py --fetch-models 或 COPYKAKASI_MODELS）")


def frame(seed):
    r = np.random.default_rng(seed); y, x = np.mgrid[0:864, 0:1536]
    im = np.stack([x / 1536 * 120 + 40, y / 864 * 120 + 40, np.full_like(x, 90.0)], 2) + r.normal(0, 3, (864, 1536, 3))
    return im.clip(0, 255).astype(np.uint8)


@pytest.fixture(scope="session")
def clip(tmp_path_factory):
    p = tmp_path_factory.mktemp("media") / "clip.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1024x576:r=24:d=5.2", "-pix_fmt", "yuv420p", str(p)], check=True)
    return p


@pytest.fixture(scope="session")
def wav(tmp_path_factory):
    p = tmp_path_factory.mktemp("media") / "a.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=d=2.5", "-ar", "48000", str(p)], check=True)
    return p


class Ctx:
    def __init__(self, tmp):
        self.tmp = Path(tmp); self.config = self.tmp / "config.json"; self.dir = self.tmp / "proj"
        self.env = {**os.environ, "PATH": f"{STUBS}:{os.environ['PATH']}", "AUDIT": str(self.tmp), "COPYKAKASI_CONFIG": str(self.config), "PYTHONDONTWRITEBYTECODE": "1"}
        self.env.setdefault("COPYKAKASI_MODELS", str(Path("~/.cache/copy-kakasi/models").expanduser()))
        self.env.pop("COPYKAKASI_H3_HOST", None); self.env.pop("COPYKAKASI_IMAGE_URLS", None)
        (self.tmp / "ssh.log").write_text(""); (self.tmp / "codex.log").write_text("")

    def project(self, project=None, shots=None, cast=None, frames=60):
        d = self.dir
        for s in ("keys/src", "cast", "ref"): (d / s).mkdir(parents=True, exist_ok=True)
        P = {"title": "t", "source": "x.mp4", "source_rights": "own", "size": [1024, 576], "out_size": [640, 360], "style": "a period film on a city wall", "job": "testjob", **(project or {})}
        box = {"F_a": [600, 200, 800, 450], "F_b": [600, 200, 800, 450]}
        S = shots or [{"n": "00", "who": ["F"], "desc": "d", "pose": {"F_a": "p", "F_b": "p"}, "box": box}]
        C = cast or {"F": {"name": "the woman", "consent": "self", "method": "repaint", "refs": ["cast/r.png"], "identity": "same face"}}
        (d / "project.json").write_text(json.dumps(P)); (d / "shots.json").write_text(json.dumps(S)); (d / "cast.json").write_text(json.dumps(C))
        (d / "ref/edl.json").write_text(json.dumps({"source": "x", "audio": {"fade_out": 0.5}, "shots": [
            {"n": int(s["n"]), "act": "a", "lyric": "", "shot": 0, "src_in": 0, "frames": frames, "dur": frames / 24} for s in S]}))
        cv2.imwrite(str(d / "cast/r.png"), frame(9)[:400, :400])
        for s in S:
            for t, k in (("a", 1), ("b", 2)): cv2.imwrite(str(d / f"keys/src/{s['n']}_{t}.png"), frame(k))
        return d

    def run(self, script, *args, env=None):
        return subprocess.run([sys.executable, str(SCRIPTS / script), *map(str, args)], cwd=self.dir, env={**self.env, **(env or {})}, capture_output=True, text=True, timeout=240)

    def driver(self, code, env=None):
        """在工程目录里跑一段 python（可以 monkeypatch 脚本内部）"""
        return subprocess.run([sys.executable, "-c", f"import sys;sys.path.insert(0,{str(SCRIPTS)!r});sys.argv=['x']\n{code}"], cwd=self.dir, env={**self.env, **(env or {})}, capture_output=True, text=True, timeout=240)

    def ssh_log(self): return (self.tmp / "ssh.log").read_text()
    def codex_log(self): return (self.tmp / "codex.log").read_text()


@pytest.fixture
def ctx(tmp_path):
    return Ctx(tmp_path)


class Comfy:
    """假 ComfyUI：/system_stats /queue /prompt /history，出片就是把 clip 拷到 output/"""
    def __init__(self, root, clip):
        self.root, self.clip = Path(root), clip; self.live = True; self.enqueue_ok = True; self.shot_ok = True
        self.foreign = []; self.prompts = []; self.hist = {}
        (self.root / "input").mkdir(parents=True); (self.root / "output").mkdir()
        (self.root / "main.py").write_text("")
        me = self
        class H(BaseHTTPRequestHandler):
            def log_message(s, *a): pass
            def _send(s, o, code=200):
                b = json.dumps(o).encode(); s.send_response(code); s.send_header("Content-Length", str(len(b))); s.end_headers(); s.wfile.write(b)
            def do_GET(s):
                if not me.live: s.send_response(503); s.send_header("Content-Length", "0"); s.end_headers(); return
                if s.path == "/system_stats": s._send({"system": {}})
                elif s.path == "/queue": s._send({"queue_running": [[0, x] for x in me.foreign], "queue_pending": []})
                elif s.path.startswith("/history/"):
                    pid = s.path.split("/")[-1]; s._send({pid: me.hist[pid]} if pid in me.hist else {})
                elif s.path.startswith("/object_info/"): s._send({"ok": 1})
                else: s._send({}, 404)
            def do_POST(s):
                body = json.loads(s.rfile.read(int(s.headers["Content-Length"])))
                if not me.enqueue_ok: return s._send({"error": "bad node"})
                g = body["prompt"]; me.prompts.append(g); pid = f"p{len(me.prompts)}"; job, sid = g["13"]["inputs"]["filename_prefix"].split("/")
                for nid in ("20", "21"):
                    if nid in g: assert (me.root / "input" / g[nid]["inputs"]["image"]).exists(), "帧没传上去"
                if me.shot_ok:
                    (me.root / "output" / job).mkdir(exist_ok=True); shutil.copy(me.clip, me.root / "output" / job / f"{sid}.mp4")
                    me.hist[pid] = {"status": {"status_str": "success"}, "outputs": {"13": {"videos": [{"filename": f"{sid}.mp4", "subfolder": job}]}}}
                else:
                    me.hist[pid] = {"status": {"status_str": "error", "messages": [["execution_error", {"exception_message": "out of memory"}]]}, "outputs": {}}
                s._send({"prompt_id": pid})
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H); self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()


@pytest.fixture
def comfy(ctx, clip):
    c = Comfy(ctx.tmp / "ComfyUI", clip)
    ctx.config.write_text(json.dumps({"h3": {"host": "stub-gpu", "comfy_root": str(c.root), "ports": [c.port]}}))
    yield c
    c.srv.shutdown()


@pytest.fixture
def image_server(ctx):
    """假图像服务：回传 refs[0]，右上角涂红；记录每次调用的提示词"""
    calls = []; store = {}
    class H(BaseHTTPRequestHandler):
        def log_message(s, *a): pass
        def do_POST(s):
            b = json.loads(s.rfile.read(int(s.headers["Content-Length"]))); calls.append(b["prompt"])
            im = cv2.imdecode(np.frombuffer(base64.b64decode(b["refs"][0].split(",")[1]), np.uint8), 1)
            im = cv2.resize(im, (1536, 864)); im[52:114, 1222:1446] = (0, 0, 255)
            k = f"{len(store)}.png"; store[k] = cv2.imencode(".png", im)[1].tobytes()
            o = json.dumps({"file": k}).encode(); s.send_response(200); s.send_header("Content-Length", str(len(o))); s.end_headers(); s.wfile.write(o)
        def do_GET(s):
            o = store[s.path.split("/")[-1]]; s.send_response(200); s.send_header("Content-Length", str(len(o))); s.end_headers(); s.wfile.write(o)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    ctx.env["COPYKAKASI_IMAGE_URLS"] = f"http://127.0.0.1:{srv.server_address[1]}"
    yield calls
    srv.shutdown()
