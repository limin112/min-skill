#!/usr/bin/env python3
"""环境自检：开工前跑一次，缺什么说什么。只看不动，不起服务、不出图。

  python3 doctor.py                本机依赖、用户配置
  python3 doctor.py --h3           再连 H3 机器：显卡、ComfyUI、节点、模型、队列
  python3 doctor.py --fetch-models 下载质检用的人脸模型（YuNet + SFace，校验 sha256）
退出码：0 能开工；1 有必须解决的问题。
"""
import hashlib, importlib, shlex, shutil, subprocess, sys, urllib.request
sys.dont_write_bytecode = True
try:
    from common import config, config_path, font_path, image_conf, models_dir, ocr_ready
except ImportError as e:      # 自检不能因为缺依赖自己先崩
    sys.exit(f"  ✗ python 缺 {e.name}：pip3 install -r requirements.txt")

MODELS = {
    "face_detection_yunet_2023mar.onnx": ("https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
                                          "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    "face_recognition_sface_2021dec.onnx": ("https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
                                            "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
}
bad = 0
def ok(s): print(f"  ✓ {s}")
def no(s):
    global bad; bad += 1; print(f"  ✗ {s}")
def warn(s): print(f"  · {s}")


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def fetch():
    d = models_dir(); d.mkdir(parents=True, exist_ok=True)
    for name, (url, want) in MODELS.items():
        p = d / name
        if p.exists() and sha(p) == want: ok(f"{name} 已有"); continue
        tmp = p.with_suffix(".part")
        print(f"  下载 {name} …", flush=True); urllib.request.urlretrieve(url, tmp)
        if sha(tmp) != want: tmp.unlink(); no(f"{name} 校验失败，没有保存"); continue
        tmp.replace(p); ok(f"{name} → {p}")


def local():
    print("== 本机")
    for c in ("ffmpeg", "ffprobe"):
        ok(c) if shutil.which(c) else no(f"{c} 没装")
    if shutil.which("ffmpeg"):
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        ok("ffmpeg 有 libx264") if "libx264" in enc else no("ffmpeg 没有 libx264")
    for m, pip in (("PIL", "pillow"), ("numpy", "numpy"), ("cv2", "'opencv-python-headless<5'")):
        try: importlib.import_module(m); ok(f"python: {m}")
        except ImportError: no(f"python 缺 {m}（pip3 install {pip}）")
    try:
        import cv2
        need = ("CascadeClassifier", "FaceDetectorYN", "FaceRecognizerSF")
        lack = [n for n in need if not hasattr(cv2, n)]
        ok(f"OpenCV {cv2.__version__}") if not lack else no(f"OpenCV {cv2.__version__} 缺 {', '.join(lack)}：pip3 install 'opencv-python-headless>=4.8,<5'")
    except ImportError: pass
    ok(f"字体 {font_path()}") if font_path() else no("找不到中文字体（水印、AI 标识要用）：装 fonts-noto-cjk，或 configure.py --font <路径>")
    ok("烧录字幕 OCR（macOS Vision）") if ocr_ready() else warn("不是 macOS：scan.py ocr 和 clean_text 用不了；歌词让用户给文本，字幕靠 src_crop 裁掉")
    miss = [n for n in MODELS if not (models_dir() / n).exists()]
    ok("质检人脸模型") if not miss else warn(f"没有质检人脸模型（joint 模式和 qa_h3 要用）：python3 doctor.py --fetch-models")
    print("== 出图通道")
    im = image_conf()
    if im["provider"] == "http": ok(f"http：{', '.join(im.get('urls', []))}")
    elif shutil.which("codex"): ok("Codex CLI（gpt-image）；是否登录、额度够不够，要跑一次才知道")
    else: no("没有 codex CLI：装 Codex，或 configure.py --image http --image-urls <地址>")
    print("== H3 配置")
    c = config().get("h3", {})
    if c.get("host") and c.get("comfy_root") and c.get("ports"): ok(f"已配置（{config_path()}）")
    else: no(f"还没配置：问用户要地址，再跑 configure.py --host <ssh别名|local> --comfy-root <路径> --ports 8188。没有自己的 H3，就只能做到首尾帧这一步")


def remote():
    import h3_client as h
    print("== H3 机器"); C = h.conf()
    ok(f"连得上：{h.host()}")
    q = h.rsh("nvidia-smi --query-gpu=index,name,memory.used,memory.total --format=csv,noheader 2>/dev/null", check=False).strip()
    if q:
        for l in q.splitlines(): ok(f"GPU {l}")
    else: no("nvidia-smi 没有结果：这台机器没有可用的 NVIDIA 显卡？")
    ok(f"ComfyUI 目录 {h.comfy()}") if h.rsh(f"test -f {h.comfy()}/main.py && echo y", check=False).strip() else no(f"{h.comfy()}/main.py 不存在")
    live = h.live_ports()
    if not live:
        ok("ComfyUI 没在跑，配了 start_command，run 时会自己起") if C.get("start_command") else no(f"ComfyUI 没在跑（端口 {C['ports']}），也没配 start_command")
    for p in live:
        qu = h.api(p, "/queue") or {}; r, w = len(qu.get("queue_running", [])), len(qu.get("queue_pending", []))
        (warn if r or w else ok)(f":{p} 在跑，运行 {r} / 排队 {w}" + ("：可能是别人的任务，开工前告诉用户" if r or w else ""))
    if live:
        for node in ("MiniMaxH3ImageToVideo", "MiniMaxH3TurboLoRA", "MiniMaxH3TurboSampler"):
            ok(f"节点 {node}") if h.api(live[0], f"/object_info/{node}") else no(f"缺节点 {node}（见 references/h3-setup.md）")
    # 模型可能不在 models/ 下：extra_model_paths.yaml 的 base_path 也要找
    extra = h.rsh(f"sed -n 's/^ *base_path: *//p' {h.comfy()}/extra_model_paths.yaml 2>/dev/null", check=False).split()
    roots = " ".join(shlex.quote(r) for r in [f"{h.comfy()}/models/", *extra])
    miss = [f for f in [*C["models"].values(), C["accel"]["lora"]] if not h.rsh(f"find -L {roots} -name {shlex.quote(f)} -print -quit 2>/dev/null", check=False).strip()]
    ok("模型文件齐了") if not miss else no(f"缺模型文件：{', '.join(miss)}（见 references/h3-setup.md）")


if __name__ == "__main__":
    if "--fetch-models" in sys.argv: fetch()
    else:
        local()
        if "--h3" in sys.argv:
            if config().get("h3", {}).get("host"): remote()
            else: print("== H3 机器\n  · 还没配置，跳过")
    print("\n结论：" + ("能开工" if not bad else f"有 {bad} 个问题要先解决"))
    sys.exit(1 if bad else 0)
