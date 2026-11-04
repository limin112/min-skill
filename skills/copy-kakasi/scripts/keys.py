#!/usr/bin/env python3
"""原片每个镜头取首尾帧 → keys/src/NN_a.png、NN_b.png（按 shots.json 的 cx 裁 16:9，1536×864）。在工程根目录跑。

  python3 keys.py [--only 03,22] [--sheet]     取首尾帧；--sheet 拼 qc/keys_src.jpg（每行：首帧 | 尾帧）核对裁切 cx
  python3 keys.py look 19 [20 ..] [--n 8] [--pad 2]
        把整个镜头均匀抽 n 帧拼成 qc/look_NN.jpg（带原片时间），前后各多看 pad 秒。
        有剧情的镜头写 desc 之前先看这个：只看首尾两帧很容易把动作理解错。
  python3 keys.py zoom 01_a X Y W              从这一帧（repaint > swap > src）裁出 (X,Y) 起宽 W 的 16:9 区域放大
        → keys/user/01_a.png。用来做"从特写开头"这类原片没有的首帧，不用等出图。

取第 1 帧和倒数第 2 帧，不取边界帧（容易带上切点的残影）。
原片这一镜的尾帧没拍到要的那一刻（动作在切点之后）：在 shots.json 写 "src_at": {"b": 72.95}，
直接从原片那个时间取帧（秒，原片时间轴；先用 look --pad 找）。
"""
import subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter
from common import ROOT, KEY_W, KEY_H, font, project, edl, shots, nn, crop169, size_of, only, opt


def src_frame(t, cx, out, size=(KEY_W, KEY_H)):
    """从原片时间 t 取一帧，按 src_crop 去黑边，再按 cx 裁 16:9"""
    P = project(); pre = f"crop={P['src_crop']}," if P.get("src_crop") else ""
    if P.get("src_crop"): w, h = map(int, P["src_crop"].split(":")[:2])
    else: w, h = size_of(P["source"])
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", P["source"], "-frames:v", "1",
                    "-vf", f"{pre}{crop169(w, h, cx)},scale={size[0]}:{size[1]}:flags=lanczos", str(out)], check=True)


def grab():
    S, O = shots(), only()
    (ROOT / "keys/src").mkdir(parents=True, exist_ok=True)
    done = []
    for e in edl():
        n = nn(e)
        if O and n not in O: continue
        s = S.get(n, {}); clip = ROOT / f"ref/{n}.mp4"; w, h = size_of(clip); c = crop169(w, h, s.get("cx", 0.5))
        for tag, idx in (("a", 1), ("b", max(1, e["frames"] - 2))):
            out = ROOT / f"keys/src/{n}_{tag}.png"
            if tag in s.get("src_at", {}): src_frame(s["src_at"][tag], s.get("cx", 0.5), out); continue
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(clip), "-vf", f"select=eq(n\\,{idx}),{c},scale={KEY_W}:{KEY_H}:flags=lanczos",
                            "-frames:v", "1", str(out)], check=True)
        done.append(n)
    print(f"{len(done)} 个镜头 → keys/src/")
    if "--sheet" in sys.argv:
        (ROOT / "qc").mkdir(exist_ok=True); fz = font(20)
        tw, th = 384, 216; sheet = Image.new("RGB", (tw * 2 + 60, th * len(done)), "black"); d = ImageDraw.Draw(sheet)
        for r, n in enumerate(done):
            d.text((8, r * th + 8), n, fill="yellow", font=fz)
            for k, tag in enumerate("ab"):
                sheet.paste(Image.open(ROOT / f"keys/src/{n}_{tag}.png").resize((tw, th)), (60 + k * tw, r * th))
        sheet.save(ROOT / "qc/keys_src.jpg", quality=85); print("→ qc/keys_src.jpg")


def look(ns):
    E = {nn(e): e for e in edl()}; S = shots(); k = int(opt("--n", "8")); pad = float(opt("--pad", "0"))
    fz = font(18); tw, th, cols = 480, 270, 4
    (ROOT / "qc").mkdir(exist_ok=True)
    for n in ns:
        e = E[n]; a = max(0.0, e["src_in"] - pad); b = e["src_in"] + e["dur"] + pad
        ts = [a + (b - a) * i / max(1, k - 1) for i in range(k)]; ts[-1] -= 1 / 24
        rows = (k + cols - 1) // cols; sheet = Image.new("RGB", (tw * cols, (th + 26) * rows), "black"); d = ImageDraw.Draw(sheet)
        with tempfile.TemporaryDirectory() as tmp:
            for i, t in enumerate(ts):
                p = f"{tmp}/{i}.png"; src_frame(t, S.get(n, {}).get("cx", 0.5), p, (tw, th))
                x, y = (i % cols) * tw, (i // cols) * (th + 26); sheet.paste(Image.open(p), (x, y + 26))
                inside = e["src_in"] <= t <= e["src_in"] + e["dur"]
                d.text((x + 4, y + 3), f"{int(t // 60)}:{t % 60:05.2f}" + ("" if inside else "（镜头外）"), fill="yellow" if inside else "gray", font=fz)
        sheet.save(ROOT / f"qc/look_{n}.jpg", quality=85); print(f"→ qc/look_{n}.jpg（{a:.2f}–{b:.2f}s，{k} 帧）")


def zoom(key, x, y, w):
    src = next(p for p in (ROOT / f"keys/{d}/{key}.png" for d in ("repaint", "swap", "src")) if p.exists())
    h = round(w * 9 / 16); im = Image.open(src).convert("RGB").crop((x, y, x + w, y + h))
    im = im.resize((KEY_W, KEY_H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    out = ROOT / f"keys/user/{key}.png"; out.parent.mkdir(parents=True, exist_ok=True); im.save(out)
    out.with_suffix(".txt").write_text(f"从 {src.relative_to(ROOT)} 裁 ({x},{y}) 宽 {w}×{h}，放大到 {KEY_W}×{KEY_H} 并轻微锐化（keys.py zoom）。\n")
    print(f"→ {out.relative_to(ROOT)}（{w / KEY_W:.0%} 区域，放大 {KEY_W / w:.1f} 倍；超过 2 倍会糊，最好再让模型重画一遍细节）")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    args = [a for i, a in enumerate(sys.argv[2:], 2) if not a.startswith("--") and not sys.argv[i - 1].startswith("--")]
    if cmd == "look": look([f"{int(a):02d}" for a in args])
    elif cmd == "zoom": zoom(sys.argv[2], *map(int, sys.argv[3:6]))
    else: grab()
