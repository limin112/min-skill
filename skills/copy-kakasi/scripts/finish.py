#!/usr/bin/env python3
"""H3 镜头 → 成片。在工程根目录跑。

  python3 finish.py grade [--only 03,22]   gen/NN.mp4 → 重采样回原镜头帧数 → 去油腻调色 → 1080p → graded/NN.mp4
  python3 finish.py cut [--allow-original] graded/ 按 edl 拼接 + ref/audio.wav + AI 标识 + 水印 + 歌词 → out/<片名>_复刻.mp4 + out/manifest.json
  python3 finish.py compare                上原片下复刻的对照版 → out/对照_上原片_下复刻.mp4

cut：有镜头没出片时默认停下；--allow-original 才用原片顶上（写进 manifest）。keep_orig 的镜头本来就用原片。
AI 标识（左下角）总会烧进成片，文字可用 project.json 的 ai_label 改，不能留空。水印 watermark 可选（右下角）。

去油腻（H3 的通病：皮肤发亮、高光发硬、饱和偏高、锐化过头）：
  1. 颜色向原片同一镜头靠：Lab 空间均值/标准差迁移（strength 0.7，留一点 H3 自己的光）
  2. 高光滚降：L > 0.72 压成软肩，皮肤上的油光点被抹平
  3. 轻微柔化（高斯 0.6px 混 40%），收一点过锐的纹理
  4. 放大到 1080p 后加时间域颗粒（noise alls=7），胶片感，也掩一点放大的软
成片用 crf 26 / slow / tune film：颗粒很难压，crf 16 要 1.3GB，26 约 40MB，肉眼看不出差别。
"""
import json, subprocess, sys
import numpy as np
import cv2
from common import ROOT, check_rights, font, project, edl, shots, nn, crop169, size_of, only

P = project()
W, H = P.get("size", [1024, 576])
OW, OH = P.get("out_size", [1920, 1080])
STRENGTH = P.get("grade_strength", 0.7)
GRAIN = P.get("grain", 7)


def ai_text():
    """AI 标识的文字：可以改，不能留空"""
    return P.get("ai_label") or ("AI 生成 · 仅供学习研究" if P.get("source_rights") == "study-only" else "AI 生成")


def read_frames(path, vf="", size=(W, H)):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-vf", f"{vf + ',' if vf else ''}scale={size[0]}:{size[1]}",
                          "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, size[1], size[0], 3)


def lab_stats(frames):
    lab = np.concatenate([cv2.cvtColor(f, cv2.COLOR_BGR2LAB).reshape(-1, 3) for f in frames[:: max(1, len(frames) // 8)]]).astype(np.float32)
    return lab.mean(0), lab.std(0) + 1e-3


def grade_frame(f, src, dst):
    lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab = lab * (1 - STRENGTH) + ((lab - src[0]) / src[1] * dst[1] + dst[0]) * STRENGTH
    L = np.clip(lab[..., 0] / 255, 0, 1); knee = 0.72
    lab[..., 0] = np.where(L > knee, knee + (1 - knee) * np.tanh((L - knee) / (1 - knee)) * 0.9, L) * 255
    out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return cv2.addWeighted(out, 0.6, cv2.GaussianBlur(out, (0, 0), 0.6), 0.4, 0)


def ref169(n):
    clip = ROOT / f"ref/{n}.mp4"; w, h = size_of(clip)
    return clip, crop169(w, h, shots().get(n, {}).get("cx", 0.5))


def grade(O):
    S = shots(); (ROOT / "graded").mkdir(exist_ok=True)
    for e in edl():
        n = nn(e); g = ROOT / f"gen/{n}.mp4"
        if (O and n not in O) or not g.exists(): continue
        allf = read_frames(g); N, L = e["frames"], len(allf)
        if S.get(n, {}).get("speed"):    # 指定播放速度：从开头按这个倍速取 N 帧（短镜头整段压缩会快进好几倍，动作太快）
            sp = S[n]["speed"]
            if N * sp > L: print(f"  ⚠ {n}: speed {sp} 要用 {N * sp:.0f} 帧，H3 只有 {L} 帧，结尾会定格，调小 speed", flush=True)
            fr = allf[[min(L - 1, round(i * sp)) for i in range(N)]]
        elif S.get(n, {}).get("first_only") or S.get(n, {}).get("take") == "head":
            fr = allf[:N]      # 只有首帧，或后半段有问题（例如开始张嘴说话）：取前 N 帧，不压缩时间
        else: fr = allf[[round(i * (L - 1) / max(1, N - 1)) for i in range(N)]]   # 首尾都钉住：整段均匀重采样，起止和原片对齐
        clip, c = ref169(n)
        src, dst = lab_stats(fr), lab_stats(read_frames(clip, c))
        p = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "24", "-i", "-",
                              "-vf", f"scale={OW}:{OH}:flags=lanczos,noise=alls={GRAIN}:allf=t,format=yuv420p", "-c:v", "libx264", "-crf", "15", "-preset", "medium",
                              str(ROOT / f"graded/{n}.mp4")], stdin=subprocess.PIPE)
        for f in fr: p.stdin.write(grade_frame(f, src, dst).tobytes())
        p.stdin.close(); p.wait()
        sp = S.get(n, {}).get("speed") or (1 if S.get(n, {}).get("first_only") or S.get(n, {}).get("take") == "head" else (L - 1) / max(1, N - 1))
        print(f"  {n}: {L} → {len(fr)} 帧 → graded/{n}.mp4（{sp:.1f} 倍速）" + ("  ⚠ 快进明显，动作激烈的话设 speed: 1.5" if sp > 3 else ""), flush=True)


def label_png(text, name, size=34, alpha=0.7):
    """白字 + 柔和阴影的 PNG（水印、对照版标签都用它；ffmpeg 的 drawtext 不一定编进去了）"""
    from PIL import Image, ImageDraw, ImageFilter
    fnt = font(size, bold=True)
    w, h = fnt.getbbox(text)[2] + 16, int(size * 1.65)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); ImageDraw.Draw(im).text((9, 9), text, font=fnt, fill=(0, 0, 0, 150))
    im = im.filter(ImageFilter.GaussianBlur(3)); ImageDraw.Draw(im).text((8, 6), text, font=fnt, fill=(255, 255, 255, 255))
    im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    out = ROOT / f"graded/_{name}.png"; im.save(out); return out


def out_path(): return ROOT / f"out/{P.get('title', 'fuke')}_复刻.mp4"


def cut():
    rights = check_rights()
    (ROOT / "out").mkdir(exist_ok=True); (ROOT / "graded").mkdir(exist_ok=True)
    E = edl(); lst, missing, kept = [], [], []; S = shots()
    gap = [nn(e) for e in E if not (ROOT / f"graded/{nn(e)}.mp4").exists() and not S.get(nn(e), {}).get("keep_orig")]
    if gap and "--allow-original" not in sys.argv:
        sys.exit(f"这些镜头还没出片：{', '.join(gap)}。先补上；要用原片顶着看整体，确认后加 --allow-original")
    for e in E:
        n = nn(e); f = ROOT / f"graded/{n}.mp4"
        if not f.exists():
            (kept if S.get(n, {}).get("keep_orig") else missing).append(n)
            f = ROOT / f"graded/_orig_{n}.mp4"; clip, c = ref169(n)
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(clip), "-vf", f"{c},scale={OW}:{OH}:flags=lanczos,format=yuv420p",
                            "-frames:v", str(e["frames"]), "-an", "-c:v", "libx264", "-crf", "15", str(f)], check=True)
        lst.append(f"file '{f}'\n")
    (ROOT / "graded/list.txt").write_text("".join(lst))
    total = sum(e["frames"] for e in E) / 24; fo = load_fade()
    inputs = ["-f", "concat", "-safe", "0", "-i", str(ROOT / "graded/list.txt"), "-i", str(ROOT / "ref/audio.wav")]
    inputs += ["-i", str(label_png(ai_text(), "ai_label", round(OH * 0.031)))]
    fc, cur, k = f"[0:v][2:v]overlay={round(OW * 0.023)}:H-h-{round(OH * 0.033)}[ai];", "ai", 3
    if P.get("watermark"):
        inputs += ["-i", str(label_png(P["watermark"], "watermark", round(OH * 0.031)))]
        fc += f"[{cur}][{k}:v]overlay=W-w-{round(OW * 0.023)}:H-h-{round(OH * 0.033)}[w];"; cur, k = "w", k + 1
    # 歌词（project.json 的 lyrics：[[起, 止, 文字], ...]，按成片时间）：画面下方居中，淡入淡出 0.25s
    # 图片输入要 -loop 1 -t 限时长，否则 ffmpeg 写完文件后不退出
    for i, (a, b, txt) in enumerate(P.get("lyrics", [])):
        inputs += ["-loop", "1", "-framerate", "24", "-t", f"{total:.2f}", "-i", str(label_png(txt, f"lyric_{i:02d}", round(OH * 0.036), 0.95))]
        fc += (f"[{k}:v]format=rgba,fade=t=in:st={a}:d=0.25:alpha=1,fade=t=out:st={b - 0.25}:d=0.25:alpha=1[l{i}];"
               f"[{cur}][l{i}]overlay=(W-w)/2:H-h-{round(OH * 0.075)}:enable='between(t,{a},{b})'[c{i}];"); cur, k = f"c{i}", k + 1
    fc += f"[{cur}]fade=t=out:st={total - fo:.2f}:d={fo - 0.03:.2f}[v]"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", "1:a",
                    "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-tune", "film", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k",
                    "-metadata", f"comment={ai_text()}",
                    "-shortest", "-movflags", "+faststart", str(out_path())], check=True)
    mb = out_path().stat().st_size / 1e6
    write_manifest(E, S, missing, kept, rights)
    print(f"→ {out_path().relative_to(ROOT)}（{total:.2f}s，{mb:.1f} MB）· out/manifest.json")
    if missing: print(f"⚠ 用原片顶着、原演员还在画面里的镜头：{', '.join(missing)}")
    if kept: print(f"· 本来就用原片的镜头（keep_orig）：{', '.join(kept)}")
    if rights == "study-only": print("· 原片权利是 study-only：成片只供学习研究，不要公开发布或商用")


def write_manifest(E, S, missing, kept, rights):
    """交付清单：每个镜头的画面从哪来、质检结果。汇报照这个写"""
    import h3_fl
    rows = []
    for e in E:
        n = nn(e); s = S.get(n, {}); qp = ROOT / f"gen/{n}.qa.json"
        qa = json.loads(qp.read_text()) if qp.exists() else None
        rows.append({"shot": n, "picture": "original" if n in missing or n in kept else "generated",
                     "first_frame": h3_fl.key(n, "a").parent.name, "last_frame": None if s.get("first_only") else h3_fl.key(n, "b").parent.name,
                     "frame_qa_failed": [t for t in "ab" if (ROOT / f"keys/repaint/{n}_{t}.qa_fail").exists()],
                     "video_qa": None if qa is None else {"ok": qa.get("ok"), "issues": qa.get("issues", [])}})
    (ROOT / "out/manifest.json").write_text(json.dumps({"title": P.get("title"), "source_rights": rights, "ai_label": ai_text(), "shots": rows}, ensure_ascii=False, indent=1))


def load_fade():
    return json.loads((ROOT / "ref/edl.json").read_text()).get("audio", {}).get("fade_out", 1.8)


def compare():
    """上：原片（每个镜头按自己的 cx 裁成同样的 16:9）；下：复刻成片。各 1280×720，带标签"""
    out = out_path()
    if not out.exists(): sys.exit("先 cut 出成片")
    tmp = ROOT / "graded/_cmp"; tmp.mkdir(exist_ok=True); lst = []
    for e in edl():
        n = nn(e); clip, c = ref169(n); f = tmp / f"{n}.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(clip), "-vf", f"{c},scale=1280:720,format=yuv420p", "-frames:v", str(e["frames"]),
                        "-an", "-c:v", "libx264", "-crf", "16", str(f)], check=True)
        lst.append(f"file '{f}'\n")
    (tmp / "list.txt").write_text("".join(lst))
    a, b = label_png("原片", "lab_a", 30, 0.85), label_png("复刻", "lab_b", 30, 0.85)
    fc = "[1:v]scale=1280:720[d];[0:v][2:v]overlay=24:18[t2];[d][3:v]overlay=24:18[d2];[t2][d2]vstack[v]"
    dst = ROOT / "out/对照_上原片_下复刻.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"), "-i", str(out), "-i", str(a), "-i", str(b),
                    "-filter_complex", fc, "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(dst)], check=True)
    print(f"→ {dst.relative_to(ROOT)}（{dst.stat().st_size / 1e6:.1f} MB）")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "grade": grade(only())
    elif cmd == "cut": cut()
    elif cmd == "compare": compare()
    else: sys.exit(__doc__)
