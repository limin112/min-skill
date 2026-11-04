#!/usr/bin/env python3
"""plan.json → 参考剪辑：ref/edl.json、ref/NN.mp4（逐镜头）、ref/audio.wav（剪好的歌）、ref/ref.mp4、ref/storyboard.jpg

在工程根目录跑：python3 build_ref.py
- 镜头时长按 24fps 累加取整分配帧数，整片不会漂；画面总长和音频总长打印出来，差超过 1 帧要回去改 plan。
- 每个镜头离原片切点至少 1 帧（否则会带进上一镜头的闪帧）。
- 切完再扫一遍镜头内部有没有暗切（场景分 > 0.2）和黑场闪帧，有就报出来，缩短或换起点。
"""
import json, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
from common import ROOT, check_rights, font, project, load

FPS, M = 24, 0.04


def main():
    check_rights()
    P = project(); plan = load("plan.json"); v = P["source"]
    shots = [tuple(map(float, l.split())) for l in (ROOT / "ref/shots.txt").read_text().split("\n") if l.strip()]
    edl, t, fprev, k, bad = [], 0.0, 0, 0, []
    for act in plan["acts"]:
        for i, a, d in act["shots"]:
            s, e = shots[i]
            if not (s + M - 0.005 <= a and a + d <= e - M + 0.005): bad.append(f"镜头 #{i} [{s}, {e}] 放不下 {a}+{d}")
            t += d; f = round(t * FPS); n = f - fprev; fprev = f
            edl.append(dict(n=k, act=act.get("act", ""), lyric=act.get("lyric", ""), shot=i, src_in=round(a, 3), frames=n, dur=round(n / FPS, 3))); k += 1
    if bad: sys.exit("\n".join(bad))
    au = plan["audio"]; segs = au["segments"]; xf = au.get("xfade", 0.06)
    total_a = sum(b - a for a, b in segs) - xf * (len(segs) - 1)
    print(f"画面 {fprev / FPS:.3f}s（{fprev} 帧） · 音频 {total_a:.3f}s" + ("  ⚠ 差超过 1 帧，回去改 plan.json" if abs(fprev / FPS - total_a) > 1 / FPS else ""))
    (ROOT / "ref").mkdir(exist_ok=True)
    crop = f"crop={P['src_crop']}," if P.get("src_crop") else ""
    for e in edl:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(e["src_in"]), "-i", v, "-frames:v", str(e["frames"]),
                        "-vf", f"{crop}setsar=1,fps={FPS}", "-an", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p",
                        str(ROOT / f"ref/{e['n']:02d}.mp4")], check=True)
    json.dump(dict(source=v, src_crop=P.get("src_crop", ""), audio=au, shots=edl), open(ROOT / "ref/edl.json", "w"), ensure_ascii=False, indent=1)

    # 歌：多段拼接，接口处短交叉淡化；限幅防削波（拼接处峰值常常超 1）
    fin, fout = au.get("fade_in", 0.2), au.get("fade_out", 1.8)
    end = min(total_a, fprev / FPS)          # 淡出在画面结束时收完
    fc = "".join(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS[s{j}];" for j, (a, b) in enumerate(segs))
    cur = "s0"
    for j in range(1, len(segs)):
        fc += f"[{cur}][s{j}]acrossfade=d={xf}:c1=tri:c2=tri[x{j}];"; cur = f"x{j}"
    fc += f"[{cur}]afade=t=in:d={fin},afade=t=out:st={end - fout:.3f}:d={fout},alimiter=limit=0.93:level=disabled[out]"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", v, "-filter_complex", fc, "-map", "[out]", "-ar", "48000", str(ROOT / "ref/audio.wav")], check=True)

    lst = ROOT / "ref/list.txt"; lst.write_text("".join(f"file '{e['n']:02d}.mp4'\n" for e in edl))
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(ROOT / "ref/audio.wav"),
                    "-vf", f"fade=t=out:st={fprev / FPS - fout:.2f}:d={fout - 0.03:.2f}", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(ROOT / "ref/ref.mp4")], check=True)

    for e in edl:   # 暗切
        r = subprocess.run(["ffmpeg", "-nostdin", "-i", str(ROOT / f"ref/{e['n']:02d}.mp4"), "-vf", "scale=320:-1,select='gt(scene,0.2)',metadata=print:file=-",
                            "-an", "-f", "null", "-"], capture_output=True, text=True).stdout
        hits = [l.split("pts_time:")[1].split()[0] for l in r.splitlines() if "pts_time:" in l]
        if hits: print(f"  ⚠ {e['n']:02d} 镜头内疑似暗切 @ {', '.join(hits)}s（缩短这一镜，或挪起点）")
        # 黑场闪帧：亮度掉到中位数一半以下（打斗、转场里常见，场景检测看不出来，成片里是一下黑闪）
        raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(ROOT / f"ref/{e['n']:02d}.mp4"), "-vf", "scale=64:36,format=gray",
                              "-f", "rawvideo", "-"], capture_output=True).stdout
        y = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64).mean((1, 2)); m = np.median(y)
        dips = [i / FPS for i, v in enumerate(y) if v < 0.5 * m and m > 6]
        if dips: print(f"  ⚠ {e['n']:02d} 镜头内有黑场 @ {dips[0]:.2f}–{dips[-1]:.2f}s（中位亮度 {m:.0f}）：挪起点躲开")

    fz = font(18)
    W, H, cols = 400, 168, 4; rows = (len(edl) + cols - 1) // cols
    sheet = Image.new("RGB", (W * cols, (H + 28) * rows), "black"); t = 0
    for e in edl:
        p = ROOT / f"ref/_sb.jpg"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(e["dur"] / 2), "-i", str(ROOT / f"ref/{e['n']:02d}.mp4"), "-frames:v", "1", "-vf", f"scale={W}:{H}", str(p)])
        c = Image.new("RGB", (W, H + 28), "black"); c.paste(Image.open(p), (0, 28))
        ImageDraw.Draw(c).text((4, 3), f"{e['n']:02d} {int(t // 60)}:{t % 60:04.1f} {e['dur']:.1f}s {e['lyric'][:12]}", fill="yellow", font=fz)
        sheet.paste(c, ((e["n"] % cols) * W, (e["n"] // cols) * (H + 28))); t += e["dur"]
    p.unlink(missing_ok=True)
    sheet.save(ROOT / "ref/storyboard.jpg", quality=88)
    print(f"{len(edl)} 个镜头 → ref/NN.mp4、ref/edl.json、ref/audio.wav、ref/ref.mp4、ref/storyboard.jpg")


if __name__ == "__main__":
    main()
