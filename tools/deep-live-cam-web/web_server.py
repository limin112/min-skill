#!/usr/bin/env python3
"""Deep-Live-Cam web workbench: one photo -> live face swap in the browser.

  * Photo library: upload photos, switch the active face live (click or keys 1-9).
  * Live: the browser streams webcam JPEG frames over a WebSocket, the server
    runs the same per-frame path as the app's live preview
    (modules.ui._ProcessingWorker: detect_one_face_fast every det_interval
    frames -> face_swapper.swap_face -> apply_post_processing -> optional
    GFPGAN) and streams JPEG frames back.
  * Video: upload a video, the server runs the app's own CLI (run.py) on it,
    the page shows progress and offers the result for download.

Runs on an Apple-silicon Mac (CoreML) or a Linux box with an NVIDIA GPU (CUDA).
Binds to 127.0.0.1 only. For a remote GPU server, reach it through an SSH tunnel
(see remote.sh) -- browsers only allow the camera on localhost or https.

WebSocket wire format (little-endian):
  client -> server : float64 client_ts | JPEG bytes
  server -> client : float64 client_ts | float32 server_ms | uint8 flags | JPEG bytes
  flags: 1 = face swapped in this frame, 2 = frame dropped (no JPEG), 4 = no source photo yet
  client -> server text: {"type":"settings","enhancer":bool,"mouth_mask":bool,"jpeg_q":int}
"""
import argparse
import asyncio
import base64
import glob
import json
import os
import platform
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser(description="Deep-Live-Cam web workbench")
ap.add_argument("--host", default="127.0.0.1")
ap.add_argument("--port", type=int, default=8765)
ap.add_argument("--repo", default=os.environ.get("DLC_REPO", os.path.join(HERE, "Deep-Live-Cam")),
                help="Deep-Live-Cam checkout (install.sh puts it next to this file)")
ap.add_argument("--data", default=os.environ.get("DLC_DATA", os.path.join(HERE, "web_data")),
                help="where photos, uploaded videos and results are kept")
ap.add_argument("--provider", default=os.environ.get("DLC_PROVIDER", "auto"),
                choices=["auto", "cuda", "coreml", "cpu"], help="onnxruntime execution provider")
ap.add_argument("--idle-exit-min", type=float, default=120,
                help="exit (free the GPU) after this many minutes with no page activity; 0 = never")
args = ap.parse_args()
REPO = os.path.abspath(args.repo)
if not os.path.isfile(os.path.join(REPO, "run.py")):
    sys.exit(f"Deep-Live-Cam not found at {REPO} (run ./install.sh first, or pass --repo)")

os.makedirs(os.path.join(args.data, "videos"), exist_ok=True)
if platform.system() == "Linux":
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")  # the app imports PySide6 even when headless


def pick_provider(want):
    import onnxruntime
    avail = onnxruntime.get_available_providers()
    if want != "auto":
        return want
    for name, ep in (("cuda", "CUDAExecutionProvider"), ("coreml", "CoreMLExecutionProvider")):
        if ep in avail:
            return name
    return "cpu"


PROVIDER = pick_provider(args.provider)

# ---- Deep-Live-Cam init: same globals as `python run.py --execution-provider <p> --max-memory 0`
# (--max-memory 0: the default memory cap makes CUDA segfault on start)
sys.argv = [os.path.join(REPO, "run.py"), "--execution-provider", PROVIDER, "--max-memory", "0"]
sys.path.insert(0, REPO)
os.chdir(REPO)

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from aiohttp import web, WSMsgType  # noqa: E402

from modules import core  # noqa: E402
import modules.globals as G  # noqa: E402
import modules.ui as ui  # noqa: E402
from modules.processors.frame.core import get_frame_processors_modules  # noqa: E402
from modules.face_analyser import get_face_analyser, get_many_faces  # noqa: E402

core.parse_args()
assert core.pre_check()
if PROVIDER != "cpu" and not any(PROVIDER in ep.lower() for ep in G.execution_providers):
    sys.exit(f"execution provider '{PROVIDER}' is not available in onnxruntime "
             f"(have {G.execution_providers}); on Linux check that start.sh set LD_LIBRARY_PATH for cuDNN")
G.fp_ui["face_enhancer"] = False
G.fp_ui["face_enhancer_gpen256"] = False
G.fp_ui["face_enhancer_gpen512"] = False
G.many_faces = False
G.map_faces = False
G.live_mirror = False
G.live_async_swap = False
G.mouth_mask = False
G.opacity = 1.0
G.sharpness = 0.0

import modules.processors.frame.face_swapper as FS  # noqa: E402

get_face_analyser()
FS.get_face_swapper()

CAMERA_FPS = 30.0
DET_INTERVAL = max(1, round(CAMERA_FPS * 0.08))  # as in ui._ProcessingWorker
GPU = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gpu")  # all model calls are serialised here
SOURCE_META = os.path.join(args.data, "source.json")  # legacy single-photo store (migrated on startup)
FACES_DIR = os.path.join(args.data, "faces")          # photo library: <id>.<ext> + <id>.json
ACTIVE_FILE = os.path.join(FACES_DIR, "active.txt")
MAX_FACES = 60
os.makedirs(FACES_DIR, exist_ok=True)


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def largest_face(faces):
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


def face_thumb(img, face, size=256):
    x1, y1, x2, y2 = face.bbox.astype(int)
    cx, cy, half = (x1 + x2) // 2, (y1 + y2) // 2, int(max(x2 - x1, y2 - y1) * 0.8)
    h, w = img.shape[:2]
    crop = img[max(0, cy - half):min(h, cy + half), max(0, cx - half):min(w, cx + half)]
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA if crop.shape[0] > size else cv2.INTER_CUBIC)
    ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


class Engine:
    """Single shared face-swap pipeline. Every method runs on the GPU executor thread."""

    def __init__(self):
        self.faces = {}          # id -> {"face": insightface Face, "info": dict, "path": str}
        self.active_id = None
        self.source_face = None  # the active photo's face (what gets swapped in)
        self.source_path = None
        self.det_count = 0
        self.cached_face = None
        self.processors = get_frame_processors_modules(G.frame_processors)

    # -- photo library
    @staticmethod
    def _analyse(data: bytes):
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)  # honours EXIF rotation
        if img is None:
            return None, None, None, "无法读取这张图片，请换 JPG / PNG 格式"
        faces = get_many_faces(img) or []
        if not faces:
            return img, None, faces, "照片里没有检测到人脸，请换一张清楚的正脸照"
        return img, largest_face(faces), faces, None

    def add_face(self, data: bytes, filename: str, activate: bool = True):
        if len(self.faces) >= MAX_FACES:
            return {"ok": False, "name": filename, "error": f"照片库最多 {MAX_FACES} 张，请先删掉一些"}
        img, face, faces, err = self._analyse(data)
        if err:
            return {"ok": False, "name": filename, "error": err}
        x1, y1, x2, y2 = face.bbox.astype(int)
        width = int(x2 - x1)
        warnings = []
        if width < 80:
            warnings.append(f"脸比较小（{width}px 宽），换脸可能偏糊，建议用脸更大更清楚的照片")
        if len(faces) > 1:
            warnings.append(f"照片里有 {len(faces)} 张脸，已自动使用最大的那张")
        yaw = float(face.pose[1]) if getattr(face, "pose", None) is not None else 0.0
        if abs(yaw) > 25:
            warnings.append(f"脸偏向一侧（约 {abs(yaw):.0f}°），正脸照片效果更好")
        fid = uuid.uuid4().hex[:8]
        ext = os.path.splitext(filename or "")[1].lower()
        ext = ext if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp") else ".jpg"
        path = os.path.join(FACES_DIR, fid + ext)
        with open(path, "wb") as f:
            f.write(data)
        info = {"id": fid, "name": filename or "photo", "thumb": face_thumb(img, face),
                "faces": len(faces), "face_width": width, "det_score": round(float(face.det_score), 3),
                "warnings": warnings, "created": time.time(), "file": os.path.basename(path)}
        with open(os.path.join(FACES_DIR, fid + ".json"), "w") as f:
            json.dump(info, f, ensure_ascii=False)
        self.faces[fid] = {"face": face, "info": info, "path": path}
        log(f"face added {fid}: {filename} faces={len(faces)} width={width}")
        if activate or self.active_id is None:
            self.activate(fid)
        return {"ok": True, **info}

    def activate(self, fid):
        if fid is not None and fid not in self.faces:
            return False
        self.active_id = fid
        entry = self.faces.get(fid) if fid else None
        self.source_face = entry["face"] if entry else None
        self.source_path = entry["path"] if entry else None
        try:
            with open(ACTIVE_FILE, "w") as f:
                f.write(fid or "")
        except OSError:
            pass
        return True

    def delete_face(self, fid):
        entry = self.faces.pop(fid, None)
        if entry is None:
            return False
        for p in (entry["path"], os.path.join(FACES_DIR, fid + ".json")):
            try:
                os.remove(p)
            except OSError:
                pass
        if self.active_id == fid:
            rest = sorted(self.faces.values(), key=lambda e: e["info"]["created"])
            self.activate(rest[-1]["info"]["id"] if rest else None)
        log(f"face deleted {fid}")
        return True

    def list_faces(self):
        items = sorted(self.faces.values(), key=lambda e: e["info"]["created"])
        return {"faces": [e["info"] for e in items], "active": self.active_id}

    def load_library(self):
        # migrate the old single-photo store, once
        try:
            meta = json.load(open(SOURCE_META))
            with open(meta["path"], "rb") as f:
                self.add_face(f.read(), meta.get("name") or "photo")
            os.rename(SOURCE_META, SOURCE_META + ".migrated")
        except FileNotFoundError:
            pass
        except Exception as e:
            log("legacy source migration skipped:", e)
        for meta_path in sorted(glob.glob(os.path.join(FACES_DIR, "*.json"))):
            try:
                info = json.load(open(meta_path))
                if info["id"] in self.faces:
                    continue
                path = os.path.join(FACES_DIR, info["file"])
                with open(path, "rb") as f:
                    _, face, _, err = self._analyse(f.read())
                if err:
                    raise ValueError(err)
                self.faces[info["id"]] = {"face": face, "info": info, "path": path}
            except Exception as e:
                log("could not load saved face", meta_path, e)
        try:
            want = open(ACTIVE_FILE).read().strip()
        except OSError:
            want = ""
        if want in self.faces:
            self.activate(want)
        elif self.faces and self.active_id not in self.faces:
            self.activate(self.list_faces()["faces"][-1]["id"])
        log(f"photo library: {len(self.faces)} faces, active={self.active_id}")

    # -- settings
    def apply_settings(self, s: dict):
        if "enhancer" in s:
            want = bool(s["enhancer"])
            if want != G.fp_ui["face_enhancer"]:
                G.fp_ui["face_enhancer"] = want
                if want:  # loads the GFPGAN module on first use (like the UI toggle)
                    self.processors = get_frame_processors_modules(G.frame_processors)
                    for fp in self.processors:
                        if fp.NAME == "DLC.FACE-ENHANCER" and not fp.pre_check():
                            G.fp_ui["face_enhancer"] = False
                log("enhancer", G.fp_ui["face_enhancer"])
        if "mouth_mask" in s:
            G.mouth_mask = bool(s["mouth_mask"])
        if "jpeg_q" in s:
            self.jpeg_q = max(50, min(95, int(s["jpeg_q"])))
        return {"enhancer": G.fp_ui["face_enhancer"], "mouth_mask": G.mouth_mask}

    def reset_tracking(self):
        self.det_count = 0
        self.cached_face = None

    # -- one live frame (mirrors ui._ProcessingWorker.run, single-face path)
    def process_jpeg(self, jpg: bytes):
        t0 = time.perf_counter()
        frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return None, 2, 0.0
        flags = 0
        out = frame
        if self.source_face is None:
            flags |= 4
        else:
            self.det_count += 1
            if self.det_count % DET_INTERVAL == 0 or self.det_count == 1:
                self.cached_face = ui.detect_one_face_fast(frame)
            faces = [self.cached_face] if self.cached_face is not None else None
            if G.mouth_mask and faces:
                ui.ensure_landmarks(frame, faces)
            for fp in self.processors:
                if fp.NAME == "DLC.FACE-ENHANCER":
                    if G.fp_ui["face_enhancer"]:
                        out = fp.process_frame(None, out, detected_faces=faces)
                elif fp.NAME == "DLC.FACE-SWAPPER":
                    bboxes = []
                    if self.cached_face is not None:
                        out = fp.swap_face(self.source_face, self.cached_face, out)
                        flags |= 1
                        if getattr(self.cached_face, "bbox", None) is not None:
                            bboxes.append(self.cached_face.bbox.astype(int))
                    out = fp.apply_post_processing(out, bboxes)
        ok, buf = cv2.imencode(".jpg", out, [int(cv2.IMWRITE_JPEG_QUALITY), getattr(self, "jpeg_q", 85)])
        return (buf.tobytes() if ok else None), flags, (time.perf_counter() - t0) * 1000


ENGINE = Engine()
ENGINE.load_library()

# ---------------------------------------------------------------- activity / idle exit
LAST_ACTIVITY = [time.time()]
ACTIVE_WS = {"ws": None}


def touch():
    LAST_ACTIVITY[0] = time.time()


async def idle_watchdog(app):
    if args.idle_exit_min <= 0:
        return
    while True:
        await asyncio.sleep(30)
        busy = (ACTIVE_WS["ws"] is not None and not ACTIVE_WS["ws"].closed) or any(
            j["status"] == "running" for j in JOBS.values())
        if busy:
            touch()
        elif time.time() - LAST_ACTIVITY[0] > args.idle_exit_min * 60:
            log(f"idle for {args.idle_exit_min} min, exiting to free the GPU")
            os._exit(0)


# ---------------------------------------------------------------- HTTP handlers
async def index(request):
    touch()
    return web.FileResponse(os.path.join(HERE, "index.html"), headers={"Cache-Control": "no-store"})


async def api_state(request):
    touch()
    lib = await asyncio.get_running_loop().run_in_executor(GPU, ENGINE.list_faces)
    return web.json_response({
        **lib,
        "settings": {"enhancer": G.fp_ui["face_enhancer"], "mouth_mask": G.mouth_mask},
        "jobs": [public_job(j) for j in sorted(JOBS.values(), key=lambda j: -j["created"])][:5],
        "idle_exit_min": args.idle_exit_min,
    })


async def api_faces_add(request):
    """Upload one or more photos (multipart field 'file', repeatable). The last good one becomes active."""
    touch()
    loop = asyncio.get_running_loop()
    reader = await request.multipart()
    uploads = []
    while True:
        field = await reader.next()
        if field is None:
            break
        if field.name != "file":
            continue
        data = await field.read(decode=False)
        name = os.path.basename(field.filename or "photo.jpg")
        if len(data) > 30 * 1024 * 1024:
            uploads.append({"ok": False, "name": name, "error": "图片太大（超过 30MB）"})
            continue
        uploads.append((data, name))
    results = []
    good = [u for u in uploads if isinstance(u, tuple)]
    for u in uploads:
        if not isinstance(u, tuple):
            results.append(u)
            continue
        is_last = u is good[-1]
        r = await loop.run_in_executor(GPU, ENGINE.add_face, u[0], u[1], is_last)
        results.append({k: v for k, v in r.items() if k != "thumb"})
    lib = await loop.run_in_executor(GPU, ENGINE.list_faces)
    if not results:
        return web.json_response({"ok": False, "error": "没有收到文件", **lib}, status=400)
    # if the last good upload failed detection, activate the newest one that did succeed
    ok_ids = [r["id"] for r in results if r.get("ok")]
    if ok_ids and lib["active"] not in ok_ids:
        await loop.run_in_executor(GPU, ENGINE.activate, ok_ids[-1])
        lib = await loop.run_in_executor(GPU, ENGINE.list_faces)
    return web.json_response({"ok": bool(ok_ids), "results": results, **lib})


async def api_faces_activate(request):
    touch()
    loop = asyncio.get_running_loop()
    ok = await loop.run_in_executor(GPU, ENGINE.activate, request.match_info["fid"])
    lib = await loop.run_in_executor(GPU, ENGINE.list_faces)
    return web.json_response({"ok": ok, **lib}, status=200 if ok else 404)


async def api_faces_delete(request):
    touch()
    loop = asyncio.get_running_loop()
    ok = await loop.run_in_executor(GPU, ENGINE.delete_face, request.match_info["fid"])
    lib = await loop.run_in_executor(GPU, ENGINE.list_faces)
    return web.json_response({"ok": ok, **lib}, status=200 if ok else 404)


async def ws_live(request):
    touch()
    ws = web.WebSocketResponse(max_msg_size=16 * 1024 * 1024, heartbeat=20)
    await ws.prepare(request)
    old = ACTIVE_WS["ws"]
    if old is not None and not old.closed:  # one live session at a time: newest page wins
        await old.close(code=4000, message=b"another page took over")
    ACTIVE_WS["ws"] = ws
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(GPU, ENGINE.reset_tracking)
    log("live client connected")

    pending = []  # (ts_bytes, jpeg) waiting for the GPU; the client keeps <=2-3 in flight
    wake = asyncio.Event()

    async def worker():
        while not ws.closed:
            await wake.wait()
            wake.clear()
            while pending and not ws.closed:
                # frames arrive in bursts over remote links and the GPU (~15 ms/frame) catches up,
                # so only drop stale frames when a real backlog builds up
                while len(pending) > 3:
                    ts_b, _ = pending.pop(0)
                    await ws.send_bytes(ts_b + struct.pack("<fB", 0.0, 2))
                ts_b, jpg = pending.pop(0)
                out, flags, ms = await loop.run_in_executor(GPU, ENGINE.process_jpeg, jpg)
                if ws.closed:
                    break
                if out is None:
                    await ws.send_bytes(ts_b + struct.pack("<fB", ms, 2))
                else:
                    await ws.send_bytes(ts_b + struct.pack("<fB", ms, flags) + out)

    task = asyncio.create_task(worker())
    try:
        async for msg in ws:
            touch()
            if msg.type == WSMsgType.BINARY and len(msg.data) > 8:
                pending.append((msg.data[:8], msg.data[8:]))
                wake.set()
            elif msg.type == WSMsgType.TEXT:
                try:
                    m = json.loads(msg.data)
                except ValueError:
                    continue
                if m.get("type") == "settings":
                    s = await loop.run_in_executor(GPU, ENGINE.apply_settings, m)
                    await ws.send_str(json.dumps({"type": "settings", **s}))
            elif msg.type == WSMsgType.ERROR:
                break
    except Exception as e:  # client vanished mid-send etc.
        log("live socket error:", e)
    finally:
        task.cancel()
        if ACTIVE_WS["ws"] is ws:
            ACTIVE_WS["ws"] = None
        log("live client disconnected")
    return ws


# ---------------------------------------------------------------- video jobs (app CLI)
JOBS = {}
PROGRESS_RE = re.compile(r"(\d+)/(\d+)")


def public_job(j):
    return {k: j[k] for k in ("id", "name", "status", "progress", "error", "created", "elapsed", "enhancer")}


async def run_job(job):
    cmd = [sys.executable, os.path.join(REPO, "run.py"),
           "-s", job["source"], "-t", job["input"], "-o", job["output"],
           "--execution-provider", PROVIDER, "--max-memory", "0",
           "--keep-fps", "--keep-audio", "--video-encoder", "libx264", "--video-quality", "18",
           "--frame-processor", "face_swapper"] + (["face_enhancer"] if job["enhancer"] else [])
    log("video job", job["id"], " ".join(cmd))
    t0 = time.time()
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=REPO, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    job["pid"] = proc.pid
    tail = []
    buf = b""
    while True:
        chunk = await proc.stdout.read(4096)
        if not chunk:
            break
        buf = (buf + chunk)[-8192:]
        text = chunk.decode(errors="ignore")
        tail = (tail + re.split(r"[\r\n]+", text))[-40:]
        for a, b in PROGRESS_RE.findall(text):
            a, b = int(a), int(b)
            if 0 < b and a <= b and b > 5:
                job["progress"] = round(a / b, 3)
        job["elapsed"] = round(time.time() - t0, 1)
    rc = await proc.wait()
    job["elapsed"] = round(time.time() - t0, 1)
    if rc == 0 and os.path.exists(job["output"]) and os.path.getsize(job["output"]) > 0:
        job["status"], job["progress"] = "done", 1.0
    else:
        job["status"] = "failed"
        job["error"] = f"处理失败（退出码 {rc}）：" + " | ".join(t for t in tail if t.strip())[-600:]
    log("video job", job["id"], job["status"], job["elapsed"], "s")
    try:
        os.remove(job["input"])
    except OSError:
        pass


async def api_video(request):
    touch()
    if ENGINE.source_path is None:
        return web.json_response({"ok": False, "error": "请先上传要换上的照片"}, status=400)
    if any(j["status"] == "running" for j in JOBS.values()):
        return web.json_response({"ok": False, "error": "已有视频在处理中，请等它完成"}, status=409)
    enhancer = request.query.get("enhancer") == "1"
    reader = await request.multipart()
    field = await reader.next()
    while field is not None and field.name != "file":
        field = await reader.next()
    if field is None:
        return web.json_response({"ok": False, "error": "没有收到视频"}, status=400)
    jid = uuid.uuid4().hex[:10]
    name = os.path.basename(field.filename or "video.mp4")
    ext = os.path.splitext(name)[1].lower() or ".mp4"
    d = os.path.join(args.data, "videos")
    inp, out = os.path.join(d, f"{jid}_in{ext}"), os.path.join(d, f"{jid}_out.mp4")
    size = 0
    with open(inp, "wb") as f:
        while True:
            chunk = await field.read_chunk(1 << 20)
            if not chunk:
                break
            size += len(chunk)
            if size > 2 * 1024 ** 3:
                f.close()
                os.remove(inp)
                return web.json_response({"ok": False, "error": "视频太大（超过 2GB）"}, status=400)
            f.write(chunk)
            touch()
    # keep a frozen copy of the current photo so changing it later doesn't affect this job
    src_copy = os.path.join(d, f"{jid}_src{os.path.splitext(ENGINE.source_path)[1]}")
    shutil.copy(ENGINE.source_path, src_copy)
    job = {"id": jid, "name": name, "status": "running", "progress": 0.0, "error": None,
           "created": time.time(), "elapsed": 0.0, "enhancer": enhancer,
           "input": inp, "output": out, "source": src_copy}
    JOBS[jid] = job
    asyncio.create_task(run_job(job))
    return web.json_response({"ok": True, "job": public_job(job)})


async def api_job(request):
    touch()
    j = JOBS.get(request.match_info["jid"])
    if not j:
        return web.json_response({"ok": False, "error": "任务不存在"}, status=404)
    return web.json_response({"ok": True, "job": public_job(j)})


async def api_job_download(request):
    touch()
    j = JOBS.get(request.match_info["jid"])
    if not j or j["status"] != "done":
        raise web.HTTPNotFound()
    from urllib.parse import quote
    base = os.path.splitext(j["name"])[0] or "video"
    disp = "inline" if request.query.get("dl") != "1" else "attachment"
    return web.FileResponse(j["output"], headers={
        "Content-Disposition": f"{disp}; filename=faceswap.mp4; filename*=UTF-8''{quote(base + '_faceswap.mp4')}"})


async def healthz(request):
    return web.json_response({"ok": True, "faces": len(ENGINE.faces), "active": ENGINE.active_id})


async def on_startup(app):
    app["watchdog"] = asyncio.create_task(idle_watchdog(app))


app = web.Application(client_max_size=2 * 1024 ** 3 + 1024 * 1024)
app.router.add_get("/", index)
app.router.add_get("/healthz", healthz)
app.router.add_get("/api/state", api_state)
app.router.add_post("/api/faces", api_faces_add)
app.router.add_post("/api/faces/{fid}/activate", api_faces_activate)
app.router.add_delete("/api/faces/{fid}", api_faces_delete)
app.router.add_get("/ws", ws_live)
app.router.add_post("/api/video", api_video)
app.router.add_get("/api/job/{jid}", api_job)
app.router.add_get("/api/job/{jid}/download", api_job_download)
app.on_startup.append(on_startup)

log(f"ready on http://{args.host}:{args.port}  provider={PROVIDER} {G.execution_providers}  (idle exit after {args.idle_exit_min} min)")
web.run_app(app, host=args.host, port=args.port, print=None, access_log=None)
