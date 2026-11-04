"""各脚本共用：用户配置、工程配置、16:9 裁切、出图通道、字体。

所有脚本都在**工程根目录**跑（cwd = 工程根）。两层配置：
  用户配置  ~/.config/copy-kakasi/config.json   H3 机器地址、出图通道。由用户指定，不进工程、不进仓库（configure.py 写入）
  工程配置  project.json  plan.json  cast.json  shots.json   片子本身（格式见 references/config.md）
"""
import base64, io, json, math, os, queue, re, shutil, subprocess, sys, urllib.request
from pathlib import Path
from PIL import Image, ImageFont

ROOT = Path.cwd()
SKILL = Path(__file__).resolve().parent.parent
KEY_W, KEY_H = 1536, 864           # 首尾帧统一尺寸（出图后再规整到这个尺寸）
MIN_FRAMES, MAX_FRAMES = 124, 362  # H3 训练区间，约 5–15 秒
MAX_IMAGES = 5                     # Codex 一次最多看 5 张图
CONSENT = {"self", "consented", "fictional"}   # 本人 / 本人明确同意 / AI 虚构人物；其他一律不做
CONSENT_TXT = {"self": "a real adult who consented to this edit", "consented": "a real adult who consented to this edit",
               "fictional": "a fictional AI-generated adult"}
RIGHTS = {"own", "licensed", "public-domain", "study-only"}
OK_JOB = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


# ---------- 用户配置 ----------
def config_path():
    return Path(os.environ.get("COPYKAKASI_CONFIG") or "~/.config/copy-kakasi/config.json").expanduser()


def config():
    p = config_path()
    return json.loads(p.read_text()) if p.exists() else {}


def image_conf():
    c = dict(config().get("image", {}))
    if os.environ.get("COPYKAKASI_IMAGE_URLS"):
        c.update(provider="http", urls=os.environ["COPYKAKASI_IMAGE_URLS"].split(","))
    c.setdefault("provider", "codex")
    return c


def models_dir():
    return Path(os.environ.get("COPYKAKASI_MODELS") or config().get("face_models_dir") or "~/.cache/copy-kakasi/models").expanduser()


def face_model(name):
    p = models_dir() / name
    if not p.exists():
        sys.exit(f"缺少质检用的人脸模型 {p}。先跑：python3 {SKILL}/scripts/doctor.py --fetch-models")
    return p


# ---------- 工程配置 ----------
def load(name, default=None):
    p = ROOT / name
    if not p.exists():
        if default is not None: return default
        sys.exit(f"缺少 {name}（在工程根目录跑；格式见 {SKILL}/references/config.md）")
    return json.loads(p.read_text())


def project(): return load("project.json")
def edl(): return load("ref/edl.json")["shots"]
def shots(): return {s["n"]: s for s in load("shots.json")}


def check_rights():
    r = project().get("source_rights")
    if r not in RIGHTS:
        sys.exit(f"project.json 的 source_rights 是 {r!r}：要写 own / licensed / public-domain / study-only 之一。"
                 "先问用户这段原片的来源和权利，别替用户填。")
    return r


def cast():
    c = load("cast.json")
    for k, r in c.items():
        if r.get("consent") not in CONSENT:
            sys.exit(f"cast.json 里 {k} 的 consent 是 {r.get('consent')!r}：只能是 self / consented / fictional。"
                     "真人照片只用用户本人或明确同意的人，先问清楚再写进来。")
        if r.get("adult") is not True:
            sys.exit(f"cast.json 里 {k} 没写 \"adult\": true：只做成年人，确认后再写。")
        if r["consent"] == "consented":
            rec = r.get("consent_record")
            if not rec or not (ROOT / rec).is_file() or not (ROOT / rec).read_text().strip():
                sys.exit(f"cast.json 里 {k} 是 consented，但 consent_record 没指向一份非空的同意记录（谁、何时、同意用在什么片子）。")
    return c


def nn(e): return f"{e['n']:02d}"


def frames_for(n):
    """H3 长度：17k+5 网格，且不短于训练区间下限。上限由 h3_fl.tasks 检查"""
    return max(MIN_FRAMES, math.ceil((n - 5) / 17) * 17 + 5)


def crop169(w, h, cx=0.5):
    """从 w×h 里按水平中心 cx（0–1）裁出最大的 16:9，返回 ffmpeg crop 参数"""
    if w / h >= 16 / 9:
        cw = round(h * 16 / 9) // 2 * 2; return f"crop={cw}:{h}:{round((w - cw) * cx)}:0"
    ch = round(w * 9 / 16) // 2 * 2; return f"crop={w}:{ch}:0:{(h - ch) // 2}"


def size_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True).stdout.strip().split(",")
    return int(r[0]), int(r[1])


def fit169(p):
    im = Image.open(p).convert("RGB"); w, h = im.size
    if abs(w / h - 16 / 9) > 0.01:
        nh = round(w * 9 / 16); top = (h - nh) // 2; im = im.crop((0, top, w, top + nh))
    im.resize((KEY_W, KEY_H), Image.LANCZOS).save(p)


# ---------- 字体 ----------
FONTS = ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/PingFang.ttc",
         "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
         "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
         "C:/Windows/Fonts/msyh.ttc"]


def font_path():
    for p in [os.environ.get("COPYKAKASI_FONT"), config().get("font"), *FONTS]:
        if p and Path(p).exists(): return p
    return None


def font(size, bold=False):
    p = font_path()
    if not p: sys.exit("找不到中文字体。装一个（如 fonts-noto-cjk），或 export COPYKAKASI_FONT=<字体文件路径>")
    return ImageFont.truetype(p, size, index=1 if bold and "Hiragino" in p else 0)


def ocr_ready():
    return sys.platform == "darwin" and shutil.which("swift") is not None


# ---------- 出图 ----------
OUT169 = "Output a landscape 16:9 image at 1536x864 if that size is supported, otherwise 1536x1024 with the same composition centred."
HTTP_NEG = ("mosaic, pixelated or blurred face, distorted face, asymmetric eyes, extra or missing glasses, duplicated face, "
            "plastic skin, oily shine, subtitles, captions, text, watermark, logo")


def http_prompt(p):
    """给 agent 的话 → 给图像模型的话：去掉"用工具"这类措辞，图片编号改成 image1、image2…"""
    p = re.sub(r"^Use your image generation tool to EDIT the first attached image,", "Edit image1,", p)
    p = re.sub(r"Images (\d+) to (\d+)", lambda m: " and ".join(f"image{i}" for i in range(int(m[1]), int(m[2]) + 1)), p)
    p = re.sub(r"\b[Ii]mage (\d+)\b", lambda m: f"image{m[1]}", p)
    return p.strip()


_HTTP_FREE = None
def http_edit(images, prompt, out, log, conf):
    """自建图像编辑服务（接口见 references/image-providers.md）。配多个 url 时，每个线程借一个空闲实例，用完还回去。"""
    global _HTTP_FREE
    if _HTTP_FREE is None:
        _HTTP_FREE = queue.Queue()
        for u in conf["urls"]: _HTTP_FREE.put(u.strip().rstrip("/"))
    url = _HTTP_FREE.get()
    try:
        refs = []
        for i, f in enumerate(images):     # 要改的那张保持原尺寸；身份照、参考首帧缩到 768，省显存
            im = Image.open(f).convert("RGB"); im.thumbnail((1536, 1536) if i == 0 else (768, 768)); b = io.BytesIO(); im.save(b, "PNG")
            refs.append("data:image/png;base64," + base64.b64encode(b.getvalue()).decode())
        qp = http_prompt(prompt)
        body = dict(prompt=qp, negative=HTTP_NEG if conf.get("negative") else "", cfg=float(conf.get("cfg", 4)), steps=int(conf.get("steps", 40)),
                    seed=int(conf.get("seed", -1)), width=KEY_W, height=KEY_H, refs=refs)
        with open(log, "w") as lf:
            lf.write(f"[http] {url}\n[prompt]\n{qp}\n[images] {[str(i) for i in images]}\n")
            try:
                req = urllib.request.Request(url + "/gen", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
                rec = json.loads(urllib.request.urlopen(req, timeout=1800).read())
                if "file" not in rec: lf.write(f"ERROR: {json.dumps(rec, ensure_ascii=False)[:500]}\n"); return False
                out.write_bytes(urllib.request.urlopen(f"{url}/img/{rec['file']}", timeout=300).read())
                lf.write(f"[ok] {json.dumps(rec, ensure_ascii=False)[:600]}\n")
            except Exception as e:
                lf.write(f"ERROR: {type(e).__name__}: {e}\n"); return False
        fit169(out); return True
    finally:
        _HTTP_FREE.put(url)


def edit_image(images, prompt, out, log):
    """按配置的通道改图，结果写到 out。提示词只写"怎么改"，保存路径由这里按通道追加，调用方不用管。
    out 是临时结果路径时，失败不会碰到已有的成果。旧文件先删，不会把上次的残留当成这次成功。"""
    conf = image_conf(); out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True); out.unlink(missing_ok=True)
    if conf["provider"] == "http": return http_edit(images, prompt, out, log, conf)
    # Codex CLI：提示词走 stdin（放在 -i 后面会被吞掉）。每个模型试两次；满载才换备选模型
    full = (f"{prompt} {OUT169} Save the final image file as {out.relative_to(ROOT)} in the current directory "
            "(copy or move it there), then reply with just the path.")
    models = [conf.get("model", "")] + [m for m in conf.get("fallback_models", []) if m]
    for m in models:
        args = ["codex", "exec", "-s", "workspace-write", "--skip-git-repo-check"] + (["-m", m] if m else [])
        for f in images: args += ["-i", str(f)]
        args.append("-")
        for _ in range(2):
            with open(log, "w") as lf:
                try: subprocess.run(args, input=full, text=True, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT)
                except FileNotFoundError: lf.write("ERROR: 没装 codex CLI（或在用户配置里改用 http 出图通道）\n"); return False
            if out.exists(): fit169(out); return True
            if "at capacity" not in image_why(log): return False      # 不是满载（拒绝、提示词问题）就别换模型硬试
    return False


def image_why(log):
    """从日志里读出失败原因，汇报给用户用"""
    t = Path(log).read_text(errors="ignore") if Path(log).exists() else ""
    if "at capacity" in t: return "出图满载（Selected model is at capacity）：服务端的问题，等一会儿或 --wait"
    if "num_last_images_to_include" in t: return "一次带的图超过 5 张"
    err = [l for l in t.splitlines() if "ERROR" in l or "error:" in l.lower()]
    return (err[-1] if err else t.strip().splitlines()[-1] if t.strip() else "没有输出")[:200]


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def only():
    return set(opt("--only", "").split(",")) - {""}
