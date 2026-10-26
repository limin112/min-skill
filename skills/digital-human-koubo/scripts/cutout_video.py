#!/usr/bin/env python3
"""把数字人视频里的人抠出来，输出带透明通道的视频（给「文字在人身后」TextBehind 用）。
用法：python3 cutout_video.py <输入.mp4> <输出.webm> [--from 秒] [--to 秒] [--feather 1.5] [--smooth 3] [--shrink 1] [--grow 0]
- --from / --to：只抠这一段（整条 1 分半的口播抠完要几分钟，只用 2–3 处的话按段抠快得多）。TextBehind 里把 cutoutFrom 设成同一个 --from。
- 逐帧用 macOS Vision 人像分割（同目录 personmask.swift，精细档；仅 macOS）
- --smooth N：相邻 N 帧取平均，压住边缘闪烁（默认 3）
- --shrink：遮罩往里收几像素，去掉边缘的背景灰边（默认 1）；--grow：往外扩（头发丝被吃掉时用，会带一点背景色）；--feather：边缘羽化（默认 1.5）
输出 VP9 + alpha 的 .webm（体积小，Remotion OffthreadVideo transparent 直接用）；要 ProRes 4444 就写 .mov。
另存一份 <输出>_mask.mp4（灰度遮罩，方便检查）。"""
import subprocess, sys, os, json, shutil
from pathlib import Path
a = sys.argv[1:]
if len(a) < 2: sys.exit(__doc__)
src, dst = Path(a[0]), Path(a[1])
opt = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
feather, smooth, grow, shrink = opt("--feather", 1.5), int(opt("--smooth", 3)), int(opt("--grow", 0)), int(opt("--shrink", 1))
t0, t1 = opt("--from", 0.0), opt("--to", 0.0)
seek = (["-ss", f"{t0:.3f}"] if t0 > 0 else []) + (["-to", f"{t1:.3f}"] if t1 > 0 else [])
HERE = Path(__file__).resolve().parent
PM = HERE / "bin/personmask"
if not PM.exists():
    sw = HERE / "personmask.swift"   # macOS Vision 人像分割，第一次用时本机编译
    if not sw.exists(): sys.exit("找不到 personmask.swift")
    PM.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["swiftc", "-O", "-swift-version", "5", str(sw), "-o", str(PM)], check=True)
info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", str(src)], capture_output=True, text=True).stdout)["streams"][0]
W, H, fps = info["width"], info["height"], info["r_frame_rate"]
mask = dst.with_name(dst.stem + "_mask.mp4")
# 1) 原视频 → BGRA 流 → personmask → 灰度遮罩流 → 平滑 / 扩边 / 羽化 → mask.mp4
dec = subprocess.Popen(["ffmpeg", "-loglevel", "error", *seek, "-i", str(src), "-f", "rawvideo", "-pix_fmt", "bgra", "-"], stdout=subprocess.PIPE)
pm = subprocess.Popen([str(PM), str(W), str(H), "person"], stdin=dec.stdout, stdout=subprocess.PIPE)
vf = ",".join(f for f in [f"tmix=frames={smooth}" if smooth > 1 else "", *(["dilation"] * grow), *(["erosion"] * shrink), f"gblur=sigma={feather}" if feather > 0 else "", "format=gray"] if f)
enc = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{W}x{H}", "-r", fps, "-i", "-", "-vf", vf, "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", str(mask)], stdin=pm.stdout)
dec.wait(); pm.wait()
if enc.returncode or not mask.exists(): sys.exit("遮罩生成失败")
# 2) 原视频 + 遮罩 → alphamerge → 透明视频
codec = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24", "-row-mt", "1", "-auto-alt-ref", "0"] if dst.suffix == ".webm" else ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"]
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *seek, "-i", str(src), "-i", str(mask), "-filter_complex", "[1:v]format=gray,scale=%d:%d[m];[0:v][m]alphamerge" % (W, H), "-an", *codec, str(dst)], check=True)
cov = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mask), "-vf", "fps=1,scale=64:-2,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
frac = sum(1 for b in cov if b > 128) / max(1, len(cov))
print(f"✓ {dst}（{W}×{H}，人像约占画面 {frac:.0%}）  遮罩：{mask}")
# 头顶以上 / 两侧留了多少背景：景深字要放在人身后，人把画面占满就看不见字
top_rows = [cov[i * 64:(i + 1) * 64] for i in range(len(cov) // 64)]
if frac > 0.6:
    print(f"⚠ 人像占了 {frac:.0%}，几乎没有背景，景深字会被人挡住。换中景素材（生成时提示词加 medium shot, leave headroom and background on both sides），或者改用 NumberSpike / TiltLine。")
