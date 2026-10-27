#!/usr/bin/env python3
"""cut/（assemble.py 的输出）+ script.json + episode.json + cast.json → 剪辑工程能直接渲染的数据。

用法（在工程目录里跑）：python3 build_tl.py [--edit edit] [--partial]
写出：
  <edit>/src/tl.json        时间轴：每段 {id, host, shot, lang, ch, src, start, dur, text, chars, lines, visual, img}
                             + 片头卡 {kind:"title"}（episode.json → titleCard.after 那段后面）
  <edit>/src/episode.json   episode.json 补全角色名牌（cast.json + 角色库）和头像
  <edit>/public/clips/      每段片段，-16 LUFS 响度归一
  <edit>/public/img/        visual 里引用的本地图片（src / img / image 字段，路径相对工程目录；写 "cast:<角色id>" = 那个角色的首帧），自动拷进来并量好尺寸
  <edit>/public/cast/       角色头像（片尾阵容用）
字幕按标点切句、时间来自 whisper 逐字对齐；sub 是字幕专用写法（念「四十八 G」、字幕显示 48G），句数要和 t 一致；
英文段的 zh 按句数平均挂到英文句子下面（双语字幕）。--partial：还没生成的段先跳过，用来提前看版式。
"""
import difflib, json, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
a = sys.argv[1:]
EDIT = Path(a[a.index("--edit") + 1] if "--edit" in a else "edit")
PARTIAL = "--partial" in a
S = json.load(open("script.json"))
Q = {r["id"]: r for r in json.load(open("cut/qa.json"))} if Path("cut/qa.json").exists() else {}
EP = json.load(open("episode.json")) if Path("episode.json").exists() else {}
TC = EP.get("titleCard") or {}
GAP = 0.12
PUNCT = "，。：；！？,.:;!?"
for d in ("src", "public/clips", "public/img", "public/cast"): (EDIT / d).mkdir(parents=True, exist_ok=True)

# 阵容：项目 cast.json，{"use": "<库里的 id>"} 借 skill 角色库（assets/cast/library.json）的现成角色
LIB = json.loads((HERE / "assets/cast/library.json").read_text())
CAST = {}
for cid, c in (json.loads(Path("cast.json").read_text()) if Path("cast.json").exists() else {}).items():
    if cid.startswith("_"): continue
    base = LIB.get(c.get("use"), {}) if c.get("use") else {}
    frames = {r: HERE / f for r, f in base.get("frames", {}).items()}
    frames.update({r: Path(f).expanduser() for r, f in c.get("frames", {}).items()})
    CAST[cid] = {**base, **c, "frames": frames}


def char_times(sid, text, keep):
    """whisper token → 每个字的相对时间；difflib 把听到的字对到文稿上，没对上的（数字写法不同等）按邻居插值"""
    toks = []
    for t in json.load(open(f"cut/{sid}.json", errors="replace"))["transcription"]:
        a0, a1 = t["offsets"]["from"] / 1000, t["offsets"]["to"] / 1000
        tx = t["text"].strip()
        if not tx or tx.startswith("["): continue
        for k, ch in enumerate(tx):
            if not ch.isspace() and ch not in PUNCT: toks.append((ch.lower(), a0 + (a1 - a0) * k / len(tx)))
    idx = [i for i, c in enumerate(text) if not c.isspace() and c not in PUNCT + "“”「」…—"]
    src = "".join(text[i].lower() for i in idx); hrd = "".join(c for c, _ in toks)
    tm = {}
    for x, y, n in difflib.SequenceMatcher(None, src, hrd, autojunk=False).get_matching_blocks():
        for k in range(n): tm[idx[x + k]] = toks[y + k][1]
    known = sorted(tm.items()); out = {}
    for i in idx:
        if i in tm: out[i] = tm[i]; continue
        lo = max((p for p in known if p[0] < i), default=(None, 0.0), key=lambda p: p[0])
        hi = min((p for p in known if p[0] > i), default=(None, keep), key=lambda p: p[0])
        l0, l1 = (lo[0] if lo[0] is not None else 0), (hi[0] if hi[0] is not None else len(text))
        out[i] = lo[1] + (hi[1] - lo[1]) * (i - l0) / max(1, l1 - l0)
    return out


def split(text):
    """按标点切成 [(句子, 起始下标)]；逗号类断句不留标点，问号叹号留着"""
    parts, buf, b0 = [], "", 0
    for i, c in enumerate(text):
        if c in PUNCT:
            if buf.strip(): parts.append((buf.strip() + (c if c in "!?！？" else ""), b0))
            buf = ""; continue
        if not buf: b0 = i
        buf += c
    if buf.strip(): parts.append((buf.strip(), b0))
    return parts


def img_size(p):
    try:
        from PIL import Image
        with Image.open(p) as im: return list(im.size)
    except Exception:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout
        return [int(x) for x in out.strip().split(",")[:2]]


def face(cid):
    fr = CAST.get(cid, {}).get("frames", {})
    return fr.get("9:16") or fr.get("16:9")


def localize(v, dims):
    """visual 里引用的本地图片拷进 public/img/，改写成相对 public 的路径，量好尺寸"""
    if isinstance(v, list): return [localize(x, dims) for x in v]
    if not isinstance(v, dict): return v
    out = {}
    for k, x in v.items():
        if k in ("src", "img", "image") and isinstance(x, str) and not x.startswith(("img/", "cast/", "clips/")):
            if x.startswith("cast:"):
                p = face(x[5:])
                if not p: sys.exit(f"cast.json 里没有角色 {x[5:]}（或它没有首帧）")
            else:
                p = Path(x).expanduser()
            if not p.exists(): sys.exit(f"visual 引用的图片不存在：{x}")
            dst = EDIT / "public/img" / p.name
            if not dst.exists() or dst.stat().st_mtime < p.stat().st_mtime: shutil.copy(p, dst)
            x = f"img/{p.name}"; dims[x] = img_size(dst)
        elif k in ("src", "img", "image") and isinstance(x, str) and (EDIT / "public" / x).exists():
            dims[x] = img_size(EDIT / "public" / x)
        out[k] = localize(x, dims)
    return out


items, T = [], 0.0
for s in S:
    sid = s["id"]
    if sid not in Q:
        if PARTIAL: continue
        sys.exit(f"{sid} 还没进 cut/（先 h3.py run 再 assemble.py），或者加 --partial 先看已有的")
    keep = Q[sid]["keep"]
    dst = EDIT / "public/clips" / f"{sid}.mp4"
    if not dst.exists() or dst.stat().st_mtime < Path(f"cut/{sid}.mp4").stat().st_mtime:
        # 每段单独响度归一：H3 原声在 -10 ~ -14 LUFS 之间飘，不归一的话段与段之间忽大忽小
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"cut/{sid}.mp4", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
                        "-c:a", "aac", "-b:a", "192k", str(dst)], check=True)
    ct = char_times(sid, s["t"], keep)
    at = lambda i: T + ct.get(i, ct[min(ct, key=lambda k: abs(k - i))])
    tp, spp = split(s["t"]), split(s.get("sub", s["t"]))
    if len(spp) != len(tp): spp = tp
    lines = []
    for k, ((txt, i0), (sub, _)) in enumerate(zip(tp, spp)):
        st = at(i0) - 0.05
        en = at(tp[k + 1][1]) - 0.04 if k + 1 < len(tp) else T + keep
        lines.append({"text": sub, "start": round(max(T, st), 3), "end": round(en, 3)})
    if s.get("zh"):
        zp = split(s["zh"])
        for k, ln in enumerate(lines):
            ln["zh"] = "".join(p for p, _ in zp[round(k * len(zp) / len(lines)):round((k + 1) * len(zp) / len(lines))])
    dims = {}
    vis = localize(s["visual"], dims) if s.get("visual") else None
    items.append({"kind": "nar", "id": sid, "host": s.get("host"), "shot": s.get("shot", "pip"), "lang": s.get("lang", "zh"),
                  "ch": s.get("ch", ""), "src": f"clips/{sid}.mp4", "start": round(T, 3), "dur": round(keep, 3), "text": s["t"],
                  "chars": {str(i): round(T + v, 3) for i, v in ct.items()}, "lines": lines, "visual": vis, "img": dims})
    T += keep + GAP
    if TC.get("after") == sid:
        items.append({"kind": "title", "id": "title", "ch": s.get("ch", ""), "start": round(T, 3), "dur": TC.get("dur", 3.6)})
        T += TC.get("dur", 3.6) + GAP
(EDIT / "src/tl.json").write_text(json.dumps({"total": round(T + 0.6, 3), "items": items}, ensure_ascii=False, indent=1))

# episode.json：补全角色名牌和头像（cast.json + 角色库），片头图拷进 public
ep = dict(EP); ep.setdefault("cast", {})
for cid, c in CAST.items():
    info = dict(ep["cast"].get(cid, {}))
    for k in ("name", "tag", "color"):
        if k not in info and c.get(k): info[k] = c[k]
    fp = face(cid)
    if fp and fp.exists() and "avatar" not in info:
        av = EDIT / "public/cast" / f"{cid}{fp.suffix}"
        shutil.copy(fp, av); info["avatar"] = f"cast/{av.name}"
    ep["cast"][cid] = info
if TC.get("image"): ep["titleCard"] = localize(TC, {})
(EDIT / "src/episode.json").write_text(json.dumps(ep, ensure_ascii=False, indent=1))
print(f"{len(items)} 项，总长 {T:.1f} 秒 → {EDIT}/src/tl.json · {EDIT}/src/episode.json")
