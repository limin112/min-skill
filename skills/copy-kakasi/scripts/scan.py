#!/usr/bin/env python3
"""拆原片：切镜头、读烧录歌词、找重复段落的对齐点。在工程根目录跑。

  python3 scan.py cuts [--th 0.3]                 原片场景检测 → ref/shots.txt（每行：起 止 秒）+ ref/shots.jpg 镜头总览
  python3 scan.py ocr --strip 845:110 [--fps 4]   读画面里烧录的歌词条（y:高，按原片像素）→ ref/lyrics.tsv（起 止 歌词）
  python3 scan.py align A0 A1 FROM TO             拿 [A0,A1] 这段音乐去 [FROM,TO] 范围里找重复出现的位置（副歌对副歌）→ 偏移秒数

为什么用 OCR 不用 whisper：whisper 对歌曲会幻听，MV 大多有烧录歌词，读画面更准。
ocr 依赖 macOS Vision（swift，系统自带）；别的系统没有这一步，让用户给歌词文本。
"""
import subprocess, sys, tempfile
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from common import ROOT, SKILL, font, ocr_ready, project, opt


def duration(v):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", v], capture_output=True, text=True).stdout)


def cuts():
    v = project()["source"]; th = opt("--th", "0.3")
    r = subprocess.run(["ffmpeg", "-nostdin", "-i", v, "-vf", f"scale=320:-1,select='gt(scene,{th})',metadata=print:file=-", "-an", "-f", "null", "-"],
                       capture_output=True, text=True).stdout
    t = [0.0] + [float(l.split("pts_time:")[1].split()[0]) for l in r.splitlines() if "pts_time:" in l] + [duration(v)]
    shots = [(a, b) for a, b in zip(t, t[1:]) if b - a >= 0.4]       # 闪白、叠化里的碎镜头不算
    (ROOT / "ref").mkdir(exist_ok=True)
    (ROOT / "ref/shots.txt").write_text("\n".join(f"{a:.2f} {b:.2f}" for a, b in shots) + "\n")
    W, H, cols = 320, 134, 6
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGB", (W * cols, (H + 22) * rows), "black"); fz = font(15)
    with tempfile.TemporaryDirectory() as d:
        for i, (a, b) in enumerate(shots):
            p = f"{d}/{i}.jpg"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{(a + b) / 2:.2f}", "-i", v, "-frames:v", "1", "-vf", f"scale={W}:{H}", p])
            c = Image.new("RGB", (W, H + 22), "black")
            if Path(p).exists(): c.paste(Image.open(p), (0, 22))
            ImageDraw.Draw(c).text((4, 2), f"#{i}  {int(a // 60)}:{a % 60:04.1f}  {b - a:.1f}s", fill="yellow", font=fz)
            sheet.paste(c, ((i % cols) * W, (i // cols) * (H + 22)))
    sheet.save(ROOT / "ref/shots.jpg", quality=85)
    print(f"{len(shots)} 个镜头 → ref/shots.txt、ref/shots.jpg")


def ocr():
    if not ocr_ready(): sys.exit("ocr 依赖 macOS Vision，这台机器用不了。让用户给歌词文本，写进 project.json 的 lyrics")
    if not opt("--strip"): sys.exit("要给歌词条的位置：--strip <y>:<高>（先截一帧量一下）")
    v = project()["source"]; y, h = opt("--strip").split(":"); fps = float(opt("--fps", "4"))
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", v, "-vf", f"fps={fps},crop=iw:{h}:0:{y}", f"{d}/%06d.png"], check=True)
        out = subprocess.run(["swift", str(SKILL / "scripts/ocr.swift"), d], capture_output=True, text=True, check=True).stdout
    # 同一句歌词每帧的识别结果会有小抖动（空格、形近字），相似度 > 0.6 且间隔 < 1 秒就并成一句，取出现最多的写法
    norm = lambda s: "".join(ch for ch in s if ch.isalnum())
    rows = []
    for line in out.splitlines():
        f, _, txt = line.partition("\t"); t = (int(f[:6]) - 1) / fps; txt = txt.strip()
        if not norm(txt): continue
        if rows and t - rows[-1][1] < 1 and SequenceMatcher(None, norm(rows[-1][2][0]), norm(txt)).ratio() > 0.6:
            rows[-1][1] = t + 1 / fps; rows[-1][2].append(txt)
        else: rows.append([t, t + 1 / fps, [txt]])
    rows = [(a, b, Counter(v).most_common(1)[0][0]) for a, b, v in rows]
    (ROOT / "ref/lyrics.tsv").write_text("".join(f"{a:.2f}\t{b:.2f}\t{t}\n" for a, b, t in rows))
    mm = lambda x: f"{int(x // 60)}:{x % 60:05.2f}"
    for a, b, t in rows: print(f"{mm(a)}–{mm(b)}  {t}")


def align(a0, a1, lo, hi):
    """频谱通量包络做互相关：同一首歌的两段副歌编曲一样，包络形状几乎重合"""
    sr, hop, n = 11025, 128, 1024
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", project()["source"], "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    S = np.log1p(np.abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n), axis=1)) * 10)
    flux = np.maximum(0, np.diff(S, axis=0)).sum(1); flux = (flux - flux.mean()) / flux.std(); fr = sr / hop
    A = flux[int(a0 * fr):int(a1 * fr)]
    best = max(((np.corrcoef(A, flux[int(t * fr):int(t * fr) + len(A)])[0, 1], t) for t in np.arange(lo, hi - (a1 - a0), 1 / fr)))
    print(f"[{a0}, {a1}] 在 {best[1]:.3f}s 再次出现（偏移 {best[1] - a0:.3f}s，相关 {best[0]:.3f}；0.6 以上基本可信，低于 0.5 多半没对上）")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "cuts": cuts()
    elif cmd == "ocr": ocr()
    elif cmd == "align": align(*map(float, sys.argv[2:6]))
    else: sys.exit(__doc__)
